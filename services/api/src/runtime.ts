import {
  MockAgentModel,
  createBedrockAgentModel,
  createTitanEmbeddingModel,
  type AgentModel,
  type EmbeddingModel,
} from '@mutex-memory/agents';
import { createPool, seedDemoMemory } from '@mutex-memory/db';
import {
  DEMO_CASE_ID,
  readDemoCaseTrace,
  resetDemoCase,
  runDemo,
  seedDemoMemoryWithEmbeddingModel,
  type DemoCaseSnapshot,
  type DemoCaseTrace,
  type DemoMode,
  type DemoRunOptions,
  type DemoRunResult,
} from '@mutex-memory/demo';
import { z } from 'zod';
import { createDemoApi, type DemoApi } from './api.js';

type DatabasePool = ReturnType<typeof createPool>;

export interface CloudRuntimeResources {
  bedrockAgent: AgentModel;
  titanEmbedding: EmbeddingModel;
}

export interface RuntimeResources {
  pool: DatabasePool;
  mockAgent: AgentModel;
  getCloudResources(): CloudRuntimeResources;
}

export interface RuntimeOperations {
  resetDemoCase(pool: DatabasePool): Promise<DemoCaseSnapshot>;
  readDemoCaseTrace(
    pool: DatabasePool,
    caseId: unknown,
  ): Promise<DemoCaseTrace | null>;
  runDemo(
    pool: DatabasePool,
    agent: AgentModel,
    mode: DemoMode,
    options?: DemoRunOptions,
  ): Promise<DemoRunResult>;
  seedDemoMemory(pool: DatabasePool): Promise<{ episodeCount: number }>;
  seedDemoMemoryWithEmbeddingModel(
    pool: DatabasePool,
    embeddingModel: EmbeddingModel,
  ): Promise<{ episodeCount: number }>;
}

const defaultOperations: RuntimeOperations = {
  resetDemoCase,
  readDemoCaseTrace,
  runDemo,
  seedDemoMemory,
  seedDemoMemoryWithEmbeddingModel,
};

async function requireTrace(
  operations: RuntimeOperations,
  pool: DatabasePool,
): Promise<DemoCaseTrace> {
  const trace = await operations.readDemoCaseTrace(pool, DEMO_CASE_ID);
  if (!trace) {
    throw new Error('Canonical demo case is missing');
  }
  return trace;
}

export function createRuntimeApi(
  resources: RuntimeResources,
  operations: RuntimeOperations = defaultOperations,
): DemoApi {
  return createDemoApi({
    reset: async () => {
      await operations.resetDemoCase(resources.pool);
      return requireTrace(operations, resources.pool);
    },
    run: async (input) => {
      const result =
        input.agentMode === 'mock'
          ? await operations.runDemo(
              resources.pool,
              resources.mockAgent,
              input.mode,
            )
          : await (async () => {
              const cloud = resources.getCloudResources();
              return operations.runDemo(
                resources.pool,
                cloud.bedrockAgent,
                input.mode,
                { embeddingModel: cloud.titanEmbedding },
              );
            })();
      const trace = await requireTrace(operations, resources.pool);
      return {
        ...result,
        committedDecision: trace.committedDecision,
        outboxIntent: trace.outboxIntent,
      };
    },
    getCase: async (caseId) =>
      operations.readDemoCaseTrace(resources.pool, caseId),
    seedMemory: async (input) => {
      if (input.embeddingMode === 'fixture') {
        return operations.seedDemoMemory(resources.pool);
      }
      const cloud = resources.getCloudResources();
      return operations.seedDemoMemoryWithEmbeddingModel(
        resources.pool,
        cloud.titanEmbedding,
      );
    },
  });
}

const CloudEnvironmentSchema = z.object({
  AWS_REGION: z.string().min(1),
  BEDROCK_MODEL_ID: z.string().min(1),
});

let defaultApi: DemoApi | undefined;

export async function getDefaultApi(): Promise<DemoApi> {
  if (defaultApi) return defaultApi;

  let cloudResources: CloudRuntimeResources | undefined;
  const resources: RuntimeResources = {
    pool: createPool(),
    mockAgent: new MockAgentModel(),
    getCloudResources: () => {
      if (cloudResources) return cloudResources;
      const environment = CloudEnvironmentSchema.parse({
        AWS_REGION: process.env.AWS_REGION,
        BEDROCK_MODEL_ID: process.env.BEDROCK_MODEL_ID,
      });
      cloudResources = {
        bedrockAgent: createBedrockAgentModel({
          region: environment.AWS_REGION,
          modelId: environment.BEDROCK_MODEL_ID,
        }),
        titanEmbedding: createTitanEmbeddingModel({
          region: environment.AWS_REGION,
        }),
      };
      return cloudResources;
    },
  };
  defaultApi = createRuntimeApi(resources);
  return defaultApi;
}

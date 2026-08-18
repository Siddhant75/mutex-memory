import type { AgentModel, EmbeddingModel } from '@mutex-memory/agents';
import type { DemoRunResult } from '@mutex-memory/demo';
import { describe, expect, it } from 'vitest';
import {
  createRuntimeApi,
  type RuntimeOperations,
  type RuntimeResources,
} from '../src/runtime.js';

const CASE_ID = '20000000-0000-4000-8000-000000000001';
const CASE = {
  id: CASE_ID,
  orderId: 'ORDER-MUTEX-119',
  eventType: 'PACKAGE_LOST',
  status: 'OPEN' as const,
  version: 1,
  orderValue: 119,
  summary: 'Package was lost after carrier handoff.',
};
const TRACE = {
  case: CASE,
  committedDecision: null,
  outboxIntent: null,
};

function agent(): AgentModel {
  return {
    propose: async () => {
      throw new Error('Runtime selection test does not execute model inference');
    },
  };
}

function embedding(): EmbeddingModel {
  return {
    embed: async () => [1, ...Array<number>(511).fill(0)],
  };
}

function runResult(
  mode: 'safe' | 'unsafe',
  embeddingSource: 'FIXTURE' | 'MODEL',
): DemoRunResult {
  return {
    mode,
    embeddingSource,
    case: CASE,
    retrievedMemories: [],
    agentProposals: [],
    commitResults: [],
    unsafeActions: [],
    episodicMemory: null,
    timelineEvents: [],
  };
}

describe('createRuntimeApi', () => {
  it('uses Mock with fixture embeddings without loading cloud resources', async () => {
    const mockAgent = agent();
    const resources: RuntimeResources = {
      pool: {} as RuntimeResources['pool'],
      mockAgent,
      getCloudResources: () => {
        throw new Error('Cloud resources must stay lazy in mock mode');
      },
    };
    const operations: RuntimeOperations = {
      resetDemoCase: async () => CASE,
      readDemoCaseTrace: async () => TRACE,
      runDemo: async (_pool, selectedAgent, mode, options) => {
        if (selectedAgent !== mockAgent || options?.embeddingModel !== undefined) {
          throw new Error('Mock mode selected the wrong runtime resources');
        }
        return runResult(mode, 'FIXTURE');
      },
      seedDemoMemory: async () => ({ episodeCount: 10 }),
      seedDemoMemoryWithEmbeddingModel: async () => ({ episodeCount: 10 }),
    };

    const response = await createRuntimeApi(resources, operations).handle({
      method: 'POST',
      path: '/demo/run',
      body: JSON.stringify({ mode: 'unsafe', agentMode: 'mock' }),
    });

    expect(JSON.parse(response.body)).toMatchObject({
      data: {
        mode: 'unsafe',
        embeddingSource: 'FIXTURE',
        committedDecision: null,
        outboxIntent: null,
      },
    });
  });

  it('uses Bedrock with Titan for runs and Titan for model-backed seeding', async () => {
    const bedrockAgent = agent();
    const titanEmbedding = embedding();
    const resources: RuntimeResources = {
      pool: {} as RuntimeResources['pool'],
      mockAgent: agent(),
      getCloudResources: () => ({ bedrockAgent, titanEmbedding }),
    };
    const operations: RuntimeOperations = {
      resetDemoCase: async () => CASE,
      readDemoCaseTrace: async () => TRACE,
      runDemo: async (_pool, selectedAgent, mode, options) => {
        if (
          selectedAgent !== bedrockAgent ||
          options?.embeddingModel !== titanEmbedding
        ) {
          throw new Error('Cloud run did not select Bedrock and Titan together');
        }
        return runResult(mode, 'MODEL');
      },
      seedDemoMemory: async () => ({ episodeCount: 10 }),
      seedDemoMemoryWithEmbeddingModel: async (_pool, selectedEmbedding) => {
        if (selectedEmbedding !== titanEmbedding) {
          throw new Error('Titan seed selected the wrong embedding model');
        }
        return { episodeCount: 10 };
      },
    };
    const api = createRuntimeApi(resources, operations);

    const run = await api.handle({
      method: 'POST',
      path: '/demo/run',
      body: JSON.stringify({ mode: 'safe', agentMode: 'bedrock' }),
    });
    const seed = await api.handle({
      method: 'POST',
      path: '/demo/seed-memory',
      body: JSON.stringify({ embeddingMode: 'titan' }),
    });

    expect(JSON.parse(run.body)).toMatchObject({
      data: { mode: 'safe', embeddingSource: 'MODEL' },
    });
    expect(JSON.parse(seed.body)).toEqual({ data: { episodeCount: 10 } });
  });
});

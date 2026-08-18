import type { AgentModel, EmbeddingModel } from '@mutex-memory/agents';
import type {
  ActionProposal,
  AgentContext,
  DecisionCandidate,
} from '@mutex-memory/contracts';
import {
  DEMO_LOST_PACKAGE_QUERY_EMBEDDING,
  commitDecision,
  retrieveSimilarEpisodes,
  type CommitDecisionResult,
  type RetrievedMemoryEpisode,
} from '@mutex-memory/db';
import type { Pool } from 'pg';
import { readDemoCase, type DemoCaseSnapshot } from './demo-case.js';
import {
  createEpisodicMemoryDraft,
  persistEpisodicMemory,
  type StoredEpisodicMemory,
} from './episodic-memory.js';
import { renderDemoCaseForEmbedding } from './embedding-memory-flow.js';

export type DemoMode = 'safe' | 'unsafe';
export type DemoEmbeddingSource = 'FIXTURE' | 'MODEL';

export interface DemoRunOptions {
  embeddingModel?: EmbeddingModel;
}

export interface UnsafeDemoAction {
  proposalId: string;
  action: ActionProposal['action'];
  status: 'MOCK_ACCEPTED_UNSAFE';
}

export interface DemoTimelineEvent {
  type:
    | 'MEMORY_RETRIEVED'
    | 'PROPOSALS_READY'
    | 'COMMIT_COMPLETED'
    | 'UNSAFE_ACTIONS_ACCEPTED'
    | 'EPISODIC_MEMORY_STORED';
  detail: string;
}

export interface DemoRunResult {
  mode: DemoMode;
  embeddingSource: DemoEmbeddingSource;
  case: DemoCaseSnapshot;
  retrievedMemories: RetrievedMemoryEpisode[];
  agentProposals: ActionProposal[];
  commitResults: CommitDecisionResult[];
  unsafeActions: UnsafeDemoAction[];
  episodicMemory: StoredEpisodicMemory | null;
  timelineEvents: DemoTimelineEvent[];
}

function buildAgentContext(
  demoCase: DemoCaseSnapshot,
  memories: RetrievedMemoryEpisode[],
): AgentContext {
  if (demoCase.status !== 'OPEN') {
    throw new Error(`Demo case must be OPEN, received ${demoCase.status}`);
  }
  return {
    case: {
      id: demoCase.id,
      status: 'OPEN',
      version: demoCase.version,
      orderValue: demoCase.orderValue,
      eventType: demoCase.eventType,
      summary: demoCase.summary,
    },
    policy: {
      allowRefund: true,
      allowReplacement: true,
    },
    memories: memories.map((memory) => ({
      id: memory.id,
      summary: memory.summary,
      resolution: memory.resolution,
      outcome: memory.outcome,
    })),
  };
}

function toCandidate(proposal: ActionProposal): DecisionCandidate {
  return {
    candidateId: crypto.randomUUID(),
    caseId: proposal.caseId,
    proposalId: proposal.proposalId,
    action: proposal.action,
    actionGroup: 'PRIMARY_RESOLUTION',
    expectedCaseVersion: proposal.expectedCaseVersion,
    reasonCodes: proposal.reasonCodes,
    memoryIds: proposal.memoryIds,
  };
}

export async function runDemo(
  pool: Pool,
  model: AgentModel,
  mode: DemoMode,
  options: DemoRunOptions = {},
): Promise<DemoRunResult> {
  const openCase = await readDemoCase(pool);
  const queryEmbedding = options.embeddingModel
    ? await options.embeddingModel.embed(renderDemoCaseForEmbedding(openCase))
    : DEMO_LOST_PACKAGE_QUERY_EMBEDDING;
  const retrievedMemories = await retrieveSimilarEpisodes(
    pool,
    queryEmbedding,
  );
  const context = buildAgentContext(openCase, retrievedMemories);
  const agentProposals = await Promise.all([
    model.propose(context, 'REFUND_AGENT'),
    model.propose(context, 'REPLACEMENT_AGENT'),
  ]);
  const timelineEvents: DemoTimelineEvent[] = [
    {
      type: 'MEMORY_RETRIEVED',
      detail: `${retrievedMemories.length} historical episodes retrieved`,
    },
    { type: 'PROPOSALS_READY', detail: 'Refund and Replacement proposals ready' },
  ];

  if (mode === 'unsafe') {
    const unsafeActions: UnsafeDemoAction[] = agentProposals.map((proposal) => ({
      proposalId: proposal.proposalId,
      action: proposal.action,
      status: 'MOCK_ACCEPTED_UNSAFE',
    }));
    timelineEvents.push({
      type: 'UNSAFE_ACTIONS_ACCEPTED',
      detail: 'Both conflicting mock actions were accepted without the commit gate',
    });
    return {
      mode,
      embeddingSource: options.embeddingModel ? 'MODEL' : 'FIXTURE',
      case: await readDemoCase(pool),
      retrievedMemories,
      agentProposals,
      commitResults: [],
      unsafeActions,
      episodicMemory: null,
      timelineEvents,
    };
  }

  const embeddingSource: DemoEmbeddingSource = options.embeddingModel
    ? 'MODEL'
    : 'FIXTURE';
  const memoryDrafts = agentProposals.map((proposal) =>
    createEpisodicMemoryDraft(openCase, proposal, embeddingSource),
  );
  const memoryEmbeddings = options.embeddingModel
    ? await Promise.all(
        memoryDrafts.map(async (draft) =>
          options.embeddingModel?.embed(draft.embeddingText),
        ),
      )
    : memoryDrafts.map(() => DEMO_LOST_PACKAGE_QUERY_EMBEDDING);
  const commitResults = await Promise.all(
    agentProposals.map(async (proposal) => commitDecision(pool, toCandidate(proposal))),
  );
  const committedIndex = commitResults.findIndex(
    (result) => result.status === 'COMMITTED',
  );
  const winningDraft = memoryDrafts[committedIndex];
  const winningEmbedding = memoryEmbeddings[committedIndex];
  if (!winningDraft || !winningEmbedding) {
    throw new Error('Safe demo did not produce a committed memory candidate');
  }
  const episodicMemory = await persistEpisodicMemory(
    pool,
    winningDraft,
    winningEmbedding,
    embeddingSource,
  );
  timelineEvents.push({
    type: 'COMMIT_COMPLETED',
    detail: 'CockroachDB admitted one primary resolution and normalized the loser',
  });
  timelineEvents.push({
    type: 'EPISODIC_MEMORY_STORED',
    detail: 'The winning outcome was stored as retrievable episodic memory',
  });
  return {
    mode,
    embeddingSource: options.embeddingModel ? 'MODEL' : 'FIXTURE',
    case: await readDemoCase(pool),
    retrievedMemories,
    agentProposals,
    commitResults,
    unsafeActions: [],
    episodicMemory,
    timelineEvents,
  };
}

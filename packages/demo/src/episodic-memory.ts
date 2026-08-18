import type { ActionProposal, MemoryEpisode } from '@mutex-memory/contracts';
import { upsertMemoryEpisode } from '@mutex-memory/db';
import type { Pool } from 'pg';
import type {
  DemoCaseSnapshot,
} from './demo-case.js';
import type { DemoEmbeddingSource } from './demo-runner.js';
import { renderMemoryEpisodeForEmbedding } from './embedding-memory-flow.js';

export const DEMO_RESULT_MEMORY_EPISODE_ID =
  '50000000-0000-4000-8000-000000000001';

const RESULT_OUTCOME =
  'One primary resolution committed; the conflicting proposal became harmless.';

export interface EpisodicMemoryDraft {
  episode: Omit<MemoryEpisode, 'embedding'>;
  embeddingText: string;
  evidence: Omit<StoredEpisodicMemory, 'embeddingSource'>;
}

export interface StoredEpisodicMemory {
  id: string;
  caseId: string;
  summary: string;
  resolution: ActionProposal['action'];
  outcome: string;
  reasonCodes: string[];
  memoryIds: string[];
  embeddingSource: DemoEmbeddingSource;
}

export function createEpisodicMemoryDraft(
  demoCase: DemoCaseSnapshot,
  proposal: ActionProposal,
  embeddingSource: DemoEmbeddingSource,
): EpisodicMemoryDraft {
  const evidence = {
    id: DEMO_RESULT_MEMORY_EPISODE_ID,
    caseId: demoCase.id,
    summary: demoCase.summary,
    resolution: proposal.action,
    outcome: RESULT_OUTCOME,
    reasonCodes: proposal.reasonCodes,
    memoryIds: proposal.memoryIds,
  };
  const episode: Omit<MemoryEpisode, 'embedding'> = {
    id: evidence.id,
    caseId: evidence.caseId,
    summary: evidence.summary,
    resolution: evidence.resolution,
    outcome: evidence.outcome,
    metadata: {
      source: 'safe_demo_run',
      proposalId: proposal.proposalId,
      agentRole: proposal.agentRole,
      reasonCodes: proposal.reasonCodes,
      memoryIds: proposal.memoryIds,
      evidenceSummary: proposal.shortExplanation,
      embeddingSource,
    },
  };
  return {
    episode,
    embeddingText: renderMemoryEpisodeForEmbedding(episode),
    evidence,
  };
}

export async function persistEpisodicMemory(
  pool: Pool,
  draft: EpisodicMemoryDraft,
  embedding: number[],
  embeddingSource: DemoEmbeddingSource,
): Promise<StoredEpisodicMemory> {
  await upsertMemoryEpisode(pool, { ...draft.episode, embedding });
  return { ...draft.evidence, embeddingSource };
}

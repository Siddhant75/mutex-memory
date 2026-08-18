import type { EmbeddingModel } from '@mutex-memory/agents';
import type { MemoryEpisode } from '@mutex-memory/contracts';
import {
  DEMO_MEMORY_EPISODES,
  upsertMemoryEpisode,
} from '@mutex-memory/db';
import type { Pool } from 'pg';
import type { DemoCaseSnapshot } from './demo-case.js';

type EmbeddableEpisode = Pick<
  MemoryEpisode,
  'summary' | 'resolution' | 'outcome'
>;

export function renderMemoryEpisodeForEmbedding(
  episode: EmbeddableEpisode,
): string {
  return [
    `Situation: ${episode.summary}`,
    `Resolution: ${episode.resolution}`,
    `Outcome: ${episode.outcome}`,
  ].join('\n');
}

export function renderDemoCaseForEmbedding(demoCase: DemoCaseSnapshot): string {
  return [
    `Current case: ${demoCase.summary}`,
    `Event: ${demoCase.eventType}`,
    `Order value: ${demoCase.orderValue}`,
  ].join('\n');
}

export async function seedDemoMemoryWithEmbeddingModel(
  pool: Pool,
  embeddingModel: EmbeddingModel,
): Promise<{ episodeCount: number }> {
  for (const episode of DEMO_MEMORY_EPISODES) {
    const embedding = await embeddingModel.embed(
      renderMemoryEpisodeForEmbedding(episode),
    );
    await upsertMemoryEpisode(pool, { ...episode, embedding });
  }
  return { episodeCount: DEMO_MEMORY_EPISODES.length };
}

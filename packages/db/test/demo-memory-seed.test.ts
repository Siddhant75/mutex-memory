import { MemoryEpisodeSchema } from '@mutex-memory/contracts';
import { describe, expect, it } from 'vitest';
import { DEMO_MEMORY_EPISODES } from '../src/demo-memory-seed.js';

describe('DEMO_MEMORY_EPISODES', () => {
  it('contains exactly 10 unique schema-valid episodes', () => {
    const parsed = DEMO_MEMORY_EPISODES.map((episode) =>
      MemoryEpisodeSchema.parse(episode),
    );

    expect(parsed).toHaveLength(10);
    expect(new Set(parsed.map((episode) => episode.id)).size).toBe(10);
  });

  it('contains normalized 512-dimensional embeddings', () => {
    for (const episode of DEMO_MEMORY_EPISODES) {
      const magnitude = Math.sqrt(
        episode.embedding.reduce((sum, value) => sum + value ** 2, 0),
      );
      expect(episode.embedding).toHaveLength(512);
      expect(magnitude).toBeCloseTo(1, 12);
    }
  });
});

import { describe, expect, it } from 'vitest';
import { MemoryEpisodeSchema } from '../src/memory.js';

const validEpisode = {
  id: 'e3f3d2fc-706b-49ea-840c-f18635b30d7e',
  caseId: null,
  summary: 'Package was lost after carrier handoff.',
  resolution: 'REPLACEMENT',
  outcome: 'Replacement delivered successfully.',
  metadata: { carrierConfirmedLoss: true },
  embedding: [1, ...Array<number>(511).fill(0)],
};

describe('MemoryEpisodeSchema', () => {
  it('accepts an episode with exactly 512 finite embedding values', () => {
    expect(MemoryEpisodeSchema.parse(validEpisode)).toEqual(validEpisode);
  });

  it('rejects an episode whose embedding has only 511 values', () => {
    const result = MemoryEpisodeSchema.safeParse({
      ...validEpisode,
      embedding: [1, ...Array<number>(510).fill(0)],
    });

    expect(result.success).toBe(false);
  });
});

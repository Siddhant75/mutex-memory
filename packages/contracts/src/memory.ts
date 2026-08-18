import { z } from 'zod';

export const MemoryEpisodeSchema = z.object({
  id: z.string().uuid(),
  caseId: z.string().uuid().nullable(),
  summary: z.string().min(1),
  resolution: z.string().min(1),
  outcome: z.string().min(1),
  metadata: z.record(z.string(), z.unknown()),
  embedding: z.array(z.number().finite()).length(512),
});

export type MemoryEpisode = z.infer<typeof MemoryEpisodeSchema>;

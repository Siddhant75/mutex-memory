import { MemoryEpisodeSchema } from '@mutex-memory/contracts';
import type { Pool } from 'pg';

export interface RetrievedMemoryEpisode {
  id: string;
  caseId: string | null;
  summary: string;
  resolution: string;
  outcome: string;
  metadata: Record<string, unknown>;
  distance: number;
}

type MemoryEpisodeRow = {
  id: string;
  case_id: string | null;
  summary: string;
  resolution: string;
  outcome: string;
  metadata: Record<string, unknown>;
  distance: string | number;
};

function serializeVector(embedding: number[]): string {
  return `[${embedding.join(',')}]`;
}

export async function insertMemoryEpisode(
  pool: Pool,
  episodeInput: unknown,
): Promise<{ id: string }> {
  const episode = MemoryEpisodeSchema.parse(episodeInput);

  await pool.query(
    `INSERT INTO memory_episodes
     (id, case_id, summary, resolution, outcome, metadata, embedding)
     VALUES ($1, $2, $3, $4, $5, $6, $7::VECTOR)`,
    [
      episode.id,
      episode.caseId,
      episode.summary,
      episode.resolution,
      episode.outcome,
      episode.metadata,
      serializeVector(episode.embedding),
    ],
  );

  return { id: episode.id };
}

export async function upsertMemoryEpisode(
  pool: Pool,
  episodeInput: unknown,
): Promise<{ id: string }> {
  const episode = MemoryEpisodeSchema.parse(episodeInput);

  await pool.query(
    `INSERT INTO memory_episodes
     (id, case_id, summary, resolution, outcome, metadata, embedding)
     VALUES ($1, $2, $3, $4, $5, $6, $7::VECTOR)
     ON CONFLICT (id) DO UPDATE SET
       case_id = excluded.case_id,
       summary = excluded.summary,
       resolution = excluded.resolution,
       outcome = excluded.outcome,
       metadata = excluded.metadata,
       embedding = excluded.embedding`,
    [
      episode.id,
      episode.caseId,
      episode.summary,
      episode.resolution,
      episode.outcome,
      episode.metadata,
      serializeVector(episode.embedding),
    ],
  );

  return { id: episode.id };
}

export async function retrieveSimilarEpisodes(
  pool: Pool,
  embeddingInput: unknown,
): Promise<RetrievedMemoryEpisode[]> {
  const embedding = MemoryEpisodeSchema.shape.embedding.parse(embeddingInput);
  const vector = serializeVector(embedding);
  const result = await pool.query<MemoryEpisodeRow>(
    `SELECT id, case_id, summary, resolution, outcome, metadata,
            embedding <=> $1::VECTOR AS distance
     FROM memory_episodes
     ORDER BY embedding <=> $1::VECTOR
     LIMIT 3`,
    [vector],
  );

  return result.rows.map((row) => ({
    id: row.id,
    caseId: row.case_id,
    summary: row.summary,
    resolution: row.resolution,
    outcome: row.outcome,
    metadata: row.metadata,
    distance: Number(row.distance),
  }));
}

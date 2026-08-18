import {
  MockAgentModel,
  type EmbeddingModel,
} from '@mutex-memory/agents';
import {
  createPool,
  runMigrations,
  seedDemoMemory,
} from '@mutex-memory/db';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { resetDemoCase } from '../src/demo-case.js';
import { runDemo } from '../src/demo-runner.js';
import { seedDemoMemoryWithEmbeddingModel } from '../src/embedding-memory-flow.js';

function requireTestDatabaseUrl(): string {
  const connectionString = process.env.TEST_DATABASE_URL ?? process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error('TEST_DATABASE_URL or DATABASE_URL is required');
  }
  return connectionString;
}

class RecordingEmbeddingModel implements EmbeddingModel {
  readonly inputs: string[] = [];

  async embed(textInput: unknown): Promise<number[]> {
    const text = String(textInput);
    this.inputs.push(text);
    const embedding = Array<number>(512).fill(0);
    embedding[(this.inputs.length - 1) % 10] = 1;
    return embedding;
  }
}

const pool = createPool(requireTestDatabaseUrl());
const RESULT_EPISODE_ID = '50000000-0000-4000-8000-000000000001';

beforeAll(async () => runMigrations(pool), 60_000);
afterAll(async () => {
  await pool.query('DELETE FROM memory_episodes WHERE id = $1', [
    RESULT_EPISODE_ID,
  ]);
  await seedDemoMemory(pool);
  await pool.end();
}, 60_000);

describe('embedding-backed memory flow', () => {
  it('uses one model for historical seed embeddings and the live query', async () => {
    const embeddings = new RecordingEmbeddingModel();
    await seedDemoMemoryWithEmbeddingModel(pool, embeddings);
    await resetDemoCase(pool);

    const result = await runDemo(pool, new MockAgentModel(), 'safe', {
      embeddingModel: embeddings,
    });

    expect(embeddings.inputs).toHaveLength(13);
    expect(embeddings.inputs[0]).toContain('Situation:');
    expect(embeddings.inputs[10]).toContain('Current case:');
    expect(embeddings.inputs[11]).toContain('Resolution: REFUND');
    expect(embeddings.inputs[12]).toContain('Resolution: REPLACEMENT');
    expect(result.embeddingSource).toBe('MODEL');
    expect(result.episodicMemory?.embeddingSource).toBe('MODEL');
    expect(result.retrievedMemories).toHaveLength(3);
    expect(result.agentProposals[0]?.memoryIds).toEqual(
      result.retrievedMemories.map((memory) => memory.id),
    );
    expect(result.commitResults.map((commit) => commit.status).sort()).toEqual([
      'ALREADY_COMMITTED',
      'COMMITTED',
    ]);
  });

  it('does not commit when result-memory embedding fails', async () => {
    let calls = 0;
    const embeddings: EmbeddingModel = {
      embed: async () => {
        calls += 1;
        if (calls > 1) throw new Error('Titan unavailable');
        return [1, ...Array<number>(511).fill(0)];
      },
    };
    await resetDemoCase(pool);

    await expect(
      runDemo(pool, new MockAgentModel(), 'safe', {
        embeddingModel: embeddings,
      }),
    ).rejects.toThrow('Titan unavailable');

    const counts = await pool.query<{ decisions: string; outbox: string }>(
      `SELECT
         (SELECT count(*) FROM case_decisions WHERE case_id = $1) AS decisions,
         (SELECT count(*) FROM action_outbox WHERE case_id = $1) AS outbox`,
      ['20000000-0000-4000-8000-000000000001'],
    );
    expect(counts.rows[0]).toEqual({ decisions: '0', outbox: '0' });
  });
});

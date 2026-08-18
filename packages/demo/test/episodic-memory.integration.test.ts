import { MockAgentModel } from '@mutex-memory/agents';
import {
  createPool,
  runMigrations,
  seedDemoMemory,
} from '@mutex-memory/db';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { resetDemoCase } from '../src/demo-case.js';
import { runDemo } from '../src/demo-runner.js';

const RESULT_EPISODE_ID = '50000000-0000-4000-8000-000000000001';

function requireTestDatabaseUrl(): string {
  const connectionString = process.env.TEST_DATABASE_URL ?? process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error('TEST_DATABASE_URL or DATABASE_URL is required');
  }
  return connectionString;
}

const pool = createPool(requireTestDatabaseUrl());

async function deleteResultEpisode(): Promise<void> {
  await pool.query('DELETE FROM memory_episodes WHERE id = $1', [
    RESULT_EPISODE_ID,
  ]);
}

beforeAll(async () => {
  await runMigrations(pool);
  await seedDemoMemory(pool);
}, 60_000);
beforeEach(async () => {
  await resetDemoCase(pool);
  await deleteResultEpisode();
}, 30_000);
afterAll(async () => {
  await deleteResultEpisode();
  await pool.end();
}, 30_000);

describe('Safe episodic memory persistence', () => {
  it('stores the winning proposal with compact outcome and evidence', async () => {
    const result = await runDemo(pool, new MockAgentModel(), 'safe');
    const committedIndex = result.commitResults.findIndex(
      (commit) => commit.status === 'COMMITTED',
    );
    const winner = result.agentProposals[committedIndex];
    if (!winner) throw new Error('Safe run did not expose a winner');

    expect(result.episodicMemory).toEqual({
      id: RESULT_EPISODE_ID,
      caseId: result.case.id,
      summary: 'Package was lost after carrier handoff.',
      resolution: winner.action,
      outcome:
        'One primary resolution committed; the conflicting proposal became harmless.',
      reasonCodes: winner.reasonCodes,
      memoryIds: winner.memoryIds,
      embeddingSource: 'FIXTURE',
    });

    const stored = await pool.query<{
      case_id: string;
      resolution: string;
      metadata: Record<string, unknown>;
    }>(
      `SELECT case_id, resolution, metadata
       FROM memory_episodes WHERE id = $1`,
      [RESULT_EPISODE_ID],
    );
    expect(stored.rows).toHaveLength(1);
    expect(stored.rows[0]).toMatchObject({
      case_id: result.case.id,
      resolution: winner.action,
      metadata: {
        source: 'safe_demo_run',
        proposalId: winner.proposalId,
        agentRole: winner.agentRole,
        reasonCodes: winner.reasonCodes,
        memoryIds: winner.memoryIds,
        embeddingSource: 'FIXTURE',
      },
    });
  });

  it('leaves Unsafe mode without a resulting memory episode', async () => {
    const result = await runDemo(pool, new MockAgentModel(), 'unsafe');

    expect(result.episodicMemory).toBeNull();
    const stored = await pool.query<{ count: string }>(
      'SELECT count(*) AS count FROM memory_episodes WHERE id = $1',
      [RESULT_EPISODE_ID],
    );
    expect(stored.rows[0]?.count).toBe('0');
  });

  it('upserts one stable episode across repeated canonical Safe runs', async () => {
    await runDemo(pool, new MockAgentModel(), 'safe');
    await resetDemoCase(pool);
    await runDemo(pool, new MockAgentModel(), 'safe');

    const stored = await pool.query<{ count: string }>(
      'SELECT count(*) AS count FROM memory_episodes WHERE id = $1',
      [RESULT_EPISODE_ID],
    );
    expect(stored.rows[0]?.count).toBe('1');
  });
});

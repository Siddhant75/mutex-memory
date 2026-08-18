import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { MockAgentModel } from '@mutex-memory/agents';
import {
  createPool,
  runMigrations,
  seedDemoMemory,
} from '@mutex-memory/db';
import { resetDemoCase } from '../src/demo-case.js';
import { runDemo } from '../src/demo-runner.js';

function requireTestDatabaseUrl(): string {
  const connectionString = process.env.TEST_DATABASE_URL ?? process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error('TEST_DATABASE_URL or DATABASE_URL is required');
  }
  return connectionString;
}

const pool = createPool(requireTestDatabaseUrl());
const RESULT_EPISODE_ID = '50000000-0000-4000-8000-000000000001';

beforeAll(async () => {
  await runMigrations(pool);
  await seedDemoMemory(pool);
}, 60_000);
beforeEach(async () => resetDemoCase(pool), 30_000);
afterAll(async () => {
  await pool.query('DELETE FROM memory_episodes WHERE id = $1', [
    RESULT_EPISODE_ID,
  ]);
  await pool.end();
});

describe('runDemo', () => {
  it('shows two conflicting unsafe actions without durable decision writes', async () => {
    const result = await runDemo(pool, new MockAgentModel(), 'unsafe');

    expect(result.mode).toBe('unsafe');
    expect(result.retrievedMemories).toHaveLength(3);
    expect(result.agentProposals.map((proposal) => proposal.action)).toEqual([
      'REFUND',
      'REPLACEMENT',
    ]);
    expect(result.unsafeActions).toEqual([
      expect.objectContaining({ action: 'REFUND', status: 'MOCK_ACCEPTED_UNSAFE' }),
      expect.objectContaining({
        action: 'REPLACEMENT',
        status: 'MOCK_ACCEPTED_UNSAFE',
      }),
    ]);
    expect(result.commitResults).toEqual([]);
    expect(result.episodicMemory).toBeNull();

    const counts = await pool.query<{ decisions: string; outbox: string }>(
      `SELECT
         (SELECT count(*) FROM case_decisions WHERE case_id = $1) AS decisions,
         (SELECT count(*) FROM action_outbox WHERE case_id = $1) AS outbox`,
      [result.case.id],
    );
    expect(counts.rows[0]).toEqual({ decisions: '0', outbox: '0' });
  });

  it('commits exactly one safe resolution and normalizes the loser', async () => {
    const result = await runDemo(pool, new MockAgentModel(), 'safe');

    expect(result.mode).toBe('safe');
    expect(result.retrievedMemories).toHaveLength(3);
    expect(result.agentProposals).toHaveLength(2);
    expect(result.agentProposals[0]?.memoryIds).toEqual(
      result.retrievedMemories.map((memory) => memory.id),
    );
    expect(result.commitResults.map((commit) => commit.status).sort()).toEqual([
      'ALREADY_COMMITTED',
      'COMMITTED',
    ]);
    expect(result.unsafeActions).toEqual([]);

    const counts = await pool.query<{ decisions: string; outbox: string }>(
      `SELECT
         (SELECT count(*) FROM case_decisions WHERE case_id = $1) AS decisions,
         (SELECT count(*) FROM action_outbox WHERE case_id = $1) AS outbox`,
      [result.case.id],
    );
    expect(counts.rows[0]).toEqual({ decisions: '1', outbox: '1' });
    expect(result.timelineEvents.map((event) => event.type)).toEqual([
      'MEMORY_RETRIEVED',
      'PROPOSALS_READY',
      'COMMIT_COMPLETED',
      'EPISODIC_MEMORY_STORED',
    ]);
  });
});

import { MockAgentModel } from '@mutex-memory/agents';
import {
  createPool,
  runMigrations,
  seedDemoMemory,
} from '@mutex-memory/db';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { DEMO_CASE_ID, resetDemoCase } from '../src/demo-case.js';
import { runDemo } from '../src/demo-runner.js';
import { readDemoCaseTrace } from '../src/demo-trace.js';

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

describe('readDemoCaseTrace', () => {
  it('returns the reset case without decision or outbox evidence', async () => {
    const trace = await readDemoCaseTrace(pool, DEMO_CASE_ID);

    expect(trace).toEqual({
      case: {
        id: DEMO_CASE_ID,
        orderId: 'ORDER-MUTEX-119',
        eventType: 'PACKAGE_LOST',
        status: 'OPEN',
        version: 1,
        orderValue: 119,
        summary: 'Package was lost after carrier handoff.',
      },
      committedDecision: null,
      outboxIntent: null,
    });
  });

  it('returns the committed proposal evidence and its matching outbox intent', async () => {
    const run = await runDemo(pool, new MockAgentModel(), 'safe');
    const committedIndex = run.commitResults.findIndex(
      (result) => result.status === 'COMMITTED',
    );
    const committedProposal = run.agentProposals[committedIndex];
    if (!committedProposal) {
      throw new Error('Safe run did not expose its committed proposal');
    }

    const trace = await readDemoCaseTrace(pool, DEMO_CASE_ID);

    expect(trace?.case).toMatchObject({ status: 'DECIDED', version: 2 });
    expect(trace?.committedDecision).toMatchObject({
      proposalId: committedProposal.proposalId,
      action: committedProposal.action,
      reasonCodes: committedProposal.reasonCodes,
      memoryIds: committedProposal.memoryIds,
      expectedCaseVersion: 1,
      committedCaseVersion: 2,
    });
    expect(trace?.outboxIntent).toMatchObject({
      decisionId: trace?.committedDecision?.id,
      effectType:
        committedProposal.action === 'REFUND'
          ? 'ISSUE_REFUND'
          : 'CREATE_REPLACEMENT',
      status: 'PENDING',
    });
  });

  it('returns null for an unknown case', async () => {
    const trace = await readDemoCaseTrace(
      pool,
      '20000000-0000-4000-8000-000000000099',
    );

    expect(trace).toBeNull();
  });
});

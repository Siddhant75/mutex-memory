import { describe, expect, it } from 'vitest';
import { createFixtureDemoApiClient } from './fixture-api.js';

describe('createFixtureDemoApiClient', () => {
  it('resets to the canonical open lost-package case deterministically', async () => {
    const client = createFixtureDemoApiClient();

    const first = await client.reset();
    const second = await client.reset();

    expect(second).toEqual(first);
    expect(first).toMatchObject({
      case: {
        orderId: 'ORDER-MUTEX-119',
        eventType: 'PACKAGE_LOST',
        status: 'OPEN',
        version: 1,
      },
      committedDecision: null,
      outboxIntent: null,
    });
  });

  it('shows both conflicting actions and no durable evidence in Unsafe mode', async () => {
    const result = await createFixtureDemoApiClient().run({
      mode: 'unsafe',
      agentMode: 'mock',
    });

    expect(result.case.status).toBe('OPEN');
    expect(result.agentProposals.map((proposal) => proposal.action)).toEqual([
      'REFUND',
      'REPLACEMENT',
    ]);
    expect(result.unsafeActions).toHaveLength(2);
    expect(result.commitResults).toEqual([]);
    expect(result.committedDecision).toBeNull();
    expect(result.outboxIntent).toBeNull();
    expect(result.episodicMemory).toBeNull();
  });

  it('shows one winner, one harmless loser, and durable evidence in Safe mode', async () => {
    const result = await createFixtureDemoApiClient().run({
      mode: 'safe',
      agentMode: 'mock',
    });

    expect(result.case).toMatchObject({ status: 'DECIDED', version: 2 });
    expect(result.commitResults.map((commit) => commit.status)).toEqual([
      'COMMITTED',
      'ALREADY_COMMITTED',
    ]);
    expect(result.unsafeActions).toEqual([]);
    expect(result.committedDecision).toMatchObject({
      action: 'REFUND',
      expectedCaseVersion: 1,
      committedCaseVersion: 2,
    });
    expect(result.outboxIntent).toMatchObject({
      effectType: 'ISSUE_REFUND',
      status: 'PENDING',
    });
    expect(result.episodicMemory).toMatchObject({
      resolution: 'REFUND',
      embeddingSource: 'FIXTURE',
    });
  });
});

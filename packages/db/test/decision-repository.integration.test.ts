import type { DecisionCandidate, MemoryEpisode } from '@mutex-memory/contracts';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import {
  DEMO_MEMORY_EPISODES,
  seedDemoMemory,
} from '../src/demo-memory-seed.js';
import { commitDecision } from '../src/repositories/decision-repository.js';
import {
  insertMemoryEpisode,
  retrieveSimilarEpisodes,
} from '../src/repositories/memory-repository.js';
import {
  clearTestDatabase,
  createTestPool,
  resetTestDatabase,
} from './support/test-db.js';

const pool = createTestPool();

function candidateFor(
  caseId: string,
  overrides: Partial<DecisionCandidate> = {},
): DecisionCandidate {
  return {
    candidateId: crypto.randomUUID(),
    caseId,
    proposalId: crypto.randomUUID(),
    action: 'REFUND',
    actionGroup: 'PRIMARY_RESOLUTION',
    expectedCaseVersion: 1,
    reasonCodes: ['TEST'],
    memoryIds: [],
    ...overrides,
  };
}

async function insertCase(input: {
  caseId: string;
  status?: 'OPEN' | 'DECIDED';
  version?: number;
}): Promise<void> {
  await pool.query(
    `INSERT INTO cases (id, order_id, event_type, status, version, order_value)
     VALUES ($1, $2, 'PACKAGE_LOST', $3, $4, 119.00)`,
    [input.caseId, `order-${input.caseId}`, input.status ?? 'OPEN', input.version ?? 1],
  );
}

function embeddingAt(first: number, second = 0): number[] {
  return [first, second, ...Array<number>(510).fill(0)];
}

function memoryEpisodeFor(
  id: string,
  summary: string,
  embedding: number[],
): MemoryEpisode {
  return {
    id,
    caseId: null,
    summary,
    resolution: 'REPLACEMENT',
    outcome: 'Replacement delivered successfully.',
    metadata: { fixture: true },
    embedding,
  };
}

beforeAll(async () => resetTestDatabase(pool), 60_000);
beforeEach(async () => clearTestDatabase(pool), 30_000);
afterAll(async () => pool.end());

describe('correctness-kernel migration', () => {
  it('enforces one PRIMARY_RESOLUTION per case', async () => {
    const caseId = crypto.randomUUID();
    await insertCase({ caseId });

    await pool.query(
      `INSERT INTO case_decisions
       (id, case_id, action, action_group, expected_case_version, committed_case_version, reason_codes)
       VALUES ($1, $2, 'REFUND', 'PRIMARY_RESOLUTION', 1, 2, ARRAY['TEST'])`,
      [crypto.randomUUID(), caseId],
    );

    await expect(
      pool.query(
        `INSERT INTO case_decisions
         (id, case_id, action, action_group, expected_case_version, committed_case_version, reason_codes)
         VALUES ($1, $2, 'REPLACEMENT', 'PRIMARY_RESOLUTION', 1, 2, ARRAY['TEST'])`,
        [crypto.randomUUID(), caseId],
      ),
    ).rejects.toMatchObject({ code: '23505' });
  });
});

describe('vector-memory migration', () => {
  it('stores an episode with a 512-dimensional embedding', async () => {
    const episodeId = crypto.randomUUID();
    const embedding = `[1,${Array<number>(511).fill(0).join(',')}]`;

    await pool.query(
      `INSERT INTO memory_episodes
       (id, case_id, summary, resolution, outcome, metadata, embedding)
       VALUES ($1, NULL, $2, $3, $4, $5, $6::VECTOR)`,
      [
        episodeId,
        'Package was lost after carrier handoff.',
        'REPLACEMENT',
        'Replacement delivered successfully.',
        { carrierConfirmedLoss: true },
        embedding,
      ],
    );

    const stored = await pool.query<{ id: string; resolution: string }>(
      'SELECT id, resolution FROM memory_episodes WHERE id = $1',
      [episodeId],
    );
    expect(stored.rows).toEqual([{ id: episodeId, resolution: 'REPLACEMENT' }]);
  });

  it('rejects an episode whose embedding has only 3 dimensions', async () => {
    await expect(
      pool.query(
        `INSERT INTO memory_episodes
         (id, case_id, summary, resolution, outcome, metadata, embedding)
         VALUES ($1, NULL, $2, $3, $4, '{}'::JSONB, '[1,0,0]'::VECTOR)`,
        [
          crypto.randomUUID(),
          'Package was lost after carrier handoff.',
          'REFUND',
          'Customer was refunded.',
        ],
      ),
    ).rejects.toThrow(/vector.*512|512.*dimension/i);
  });

  it('exposes the named cosine vector index', async () => {
    const result = await pool.query<{ create_statement: string }>(
      'SHOW CREATE TABLE memory_episodes',
    );

    expect(result.rows[0]?.create_statement).toContain(
      'VECTOR INDEX memory_episodes_embedding_idx (embedding vector_cosine_ops)',
    );
  });
});

describe('memory repository', () => {
  it('persists one validated memory episode', async () => {
    const episode = memoryEpisodeFor(
      crypto.randomUUID(),
      'Carrier confirmed the package was lost.',
      embeddingAt(1),
    );

    const result = await insertMemoryEpisode(pool, episode);

    expect(result).toEqual({ id: episode.id });
    const stored = await pool.query<{
      id: string;
      summary: string;
      metadata: Record<string, unknown>;
    }>('SELECT id, summary, metadata FROM memory_episodes WHERE id = $1', [episode.id]);
    expect(stored.rows).toEqual([
      {
        id: episode.id,
        summary: episode.summary,
        metadata: { fixture: true },
      },
    ]);
  });

  it('returns the three nearest episodes in cosine-distance order', async () => {
    const exactId = crypto.randomUUID();
    const nearId = crypto.randomUUID();
    const orthogonalId = crypto.randomUUID();
    const oppositeId = crypto.randomUUID();
    await insertMemoryEpisode(
      pool,
      memoryEpisodeFor(exactId, 'Exact lost-package match.', embeddingAt(1)),
    );
    await insertMemoryEpisode(
      pool,
      memoryEpisodeFor(
        nearId,
        'Similar carrier-loss case.',
        embeddingAt(Math.SQRT1_2, Math.SQRT1_2),
      ),
    );
    await insertMemoryEpisode(
      pool,
      memoryEpisodeFor(orthogonalId, 'Unrelated delivery issue.', embeddingAt(0, 1)),
    );
    await insertMemoryEpisode(
      pool,
      memoryEpisodeFor(oppositeId, 'Opposite semantic direction.', embeddingAt(-1)),
    );

    const results = await retrieveSimilarEpisodes(pool, embeddingAt(1));

    expect(results.map((episode) => episode.id)).toEqual([
      exactId,
      nearId,
      orthogonalId,
    ]);
    expect(results).toHaveLength(3);
    expect(results[0]).not.toHaveProperty('embedding');
    expect(results[0]?.distance).toBeLessThan(results[1]?.distance ?? Infinity);
    expect(results[1]?.distance).toBeLessThan(results[2]?.distance ?? Infinity);
  });

  it('rejects a wrong-dimensional query before issuing SQL', async () => {
    await expect(retrieveSimilarEpisodes(pool, [1, 0, 0])).rejects.toMatchObject({
      name: 'ZodError',
    });
  });
});

describe('demo memory seed', () => {
  it('is idempotent and leaves exactly 10 historical episodes', async () => {
    await seedDemoMemory(pool);
    await seedDemoMemory(pool);

    const result = await pool.query<{ count: string; distinct_ids: string }>(
      `SELECT count(*) AS count, count(DISTINCT id) AS distinct_ids
       FROM memory_episodes
       WHERE id = ANY($1::UUID[])`,
      [DEMO_MEMORY_EPISODES.map((episode) => episode.id)],
    );
    expect(result.rows[0]).toEqual({ count: '10', distinct_ids: '10' });
  });
});

describe('commitDecision', () => {
  it('commits decision, increments case version, and creates one PENDING outbox row', async () => {
    const caseId = crypto.randomUUID();
    const candidate = candidateFor(caseId);
    await insertCase({ caseId });

    const result = await commitDecision(pool, candidate);

    expect(result).toMatchObject({
      status: 'COMMITTED',
      committedCaseVersion: 2,
      dbRetryCount: 0,
    });
    if (result.status !== 'COMMITTED') {
      throw new Error(`Expected COMMITTED, received ${result.status}`);
    }

    const storedCase = await pool.query<{ status: string; version: string }>(
      'SELECT status, version FROM cases WHERE id = $1',
      [caseId],
    );
    expect(storedCase.rows[0]).toEqual({ status: 'DECIDED', version: '2' });

    const storedDecision = await pool.query<{
      id: string;
      proposal_id: string;
      action: string;
      committed_case_version: string;
    }>(
      `SELECT id, proposal_id, action, committed_case_version
       FROM case_decisions WHERE case_id = $1`,
      [caseId],
    );
    expect(storedDecision.rows).toEqual([
      {
        id: result.decisionId,
        proposal_id: candidate.proposalId,
        action: 'REFUND',
        committed_case_version: '2',
      },
    ]);

    const storedOutbox = await pool.query<{
      decision_id: string;
      idempotency_key: string;
      effect_type: string;
      status: string;
    }>(
      `SELECT decision_id, idempotency_key, effect_type, status
       FROM action_outbox WHERE case_id = $1`,
      [caseId],
    );
    expect(storedOutbox.rows).toEqual([
      {
        decision_id: result.decisionId,
        idempotency_key: `primary-resolution:${caseId}:${candidate.candidateId}`,
        effect_type: 'ISSUE_REFUND',
        status: 'PENDING',
      },
    ]);
  });

  it('returns STALE_CASE_VERSION without writing when candidate version is old', async () => {
    const caseId = crypto.randomUUID();
    await insertCase({ caseId, version: 2 });

    const result = await commitDecision(pool, candidateFor(caseId));

    expect(result).toEqual({ status: 'STALE_CASE_VERSION', dbRetryCount: 0 });
    const writes = await pool.query<{ decisions: string; outbox: string }>(
      `SELECT
         (SELECT count(*) FROM case_decisions WHERE case_id = $1) AS decisions,
         (SELECT count(*) FROM action_outbox WHERE case_id = $1) AS outbox`,
      [caseId],
    );
    expect(writes.rows[0]).toEqual({ decisions: '0', outbox: '0' });
  });

  it('returns ALREADY_COMMITTED for a second primary resolution', async () => {
    const caseId = crypto.randomUUID();
    await insertCase({ caseId });
    const firstResult = await commitDecision(pool, candidateFor(caseId));
    if (firstResult.status !== 'COMMITTED') {
      throw new Error(`Expected COMMITTED, received ${firstResult.status}`);
    }

    const secondResult = await commitDecision(
      pool,
      candidateFor(caseId, { action: 'REPLACEMENT' }),
    );

    expect(secondResult).toEqual({
      status: 'ALREADY_COMMITTED',
      existingDecisionId: firstResult.decisionId,
      dbRetryCount: 0,
    });
    const writes = await pool.query<{ decisions: string; outbox: string }>(
      `SELECT
         (SELECT count(*) FROM case_decisions WHERE case_id = $1) AS decisions,
         (SELECT count(*) FROM action_outbox WHERE case_id = $1) AS outbox`,
      [caseId],
    );
    expect(writes.rows[0]).toEqual({ decisions: '1', outbox: '1' });
  });

  it('stores decision and outbox atomically', async () => {
    const collisionCaseId = crypto.randomUUID();
    const targetCaseId = crypto.randomUUID();
    const collisionDecisionId = crypto.randomUUID();
    const candidate = candidateFor(targetCaseId);
    const collidingKey = `primary-resolution:${targetCaseId}:${candidate.candidateId}`;
    await insertCase({ caseId: collisionCaseId });
    await insertCase({ caseId: targetCaseId });
    await pool.query(
      `INSERT INTO case_decisions
       (id, case_id, action, action_group, expected_case_version, committed_case_version, reason_codes)
       VALUES ($1, $2, 'REFUND', 'PRIMARY_RESOLUTION', 1, 2, ARRAY['COLLISION'])`,
      [collisionDecisionId, collisionCaseId],
    );
    await pool.query(
      `INSERT INTO action_outbox
       (id, case_id, decision_id, idempotency_key, effect_type, payload)
       VALUES ($1, $2, $3, $4, 'ISSUE_REFUND', '{}'::JSONB)`,
      [crypto.randomUUID(), collisionCaseId, collisionDecisionId, collidingKey],
    );

    await expect(commitDecision(pool, candidate)).rejects.toMatchObject({ code: '23505' });

    const targetDecisionCount = await pool.query<{ count: string }>(
      'SELECT count(*) FROM case_decisions WHERE case_id = $1',
      [targetCaseId],
    );
    expect(targetDecisionCount.rows[0]?.count).toBe('0');
    const targetCase = await pool.query<{ status: string; version: string }>(
      'SELECT status, version FROM cases WHERE id = $1',
      [targetCaseId],
    );
    expect(targetCase.rows[0]).toEqual({ status: 'OPEN', version: '1' });
  });

  it('normalizes 50 concurrent primary-resolution attempts to one winner', async () => {
    const caseId = crypto.randomUUID();
    const actions = ['REFUND', 'REPLACEMENT', 'MANUAL_REVIEW'] as const;
    await insertCase({ caseId });
    const candidates = Array.from({ length: 50 }, (_, index) =>
      candidateFor(caseId, { action: actions[index % actions.length]! }),
    );

    const results = await Promise.all(
      candidates.map(async (candidate) => commitDecision(pool, candidate)),
    );

    const counts = await pool.query<{ decisions: string; outbox: string }>(
      `SELECT
         (SELECT count(*) FROM case_decisions WHERE case_id = $1) AS decisions,
         (SELECT count(*) FROM action_outbox WHERE case_id = $1) AS outbox`,
      [caseId],
    );
    const caseResult = await pool.query<{ status: string; version: string }>(
      'SELECT status, version FROM cases WHERE id = $1',
      [caseId],
    );

    expect(Number(counts.rows[0]?.decisions)).toBe(1);
    expect(Number(counts.rows[0]?.outbox)).toBe(1);
    expect(caseResult.rows[0]?.status).toBe('DECIDED');
    expect(Number(caseResult.rows[0]?.version)).toBe(2);
    expect(results.filter((result) => result.status === 'COMMITTED')).toHaveLength(1);
    expect(
      results.filter((result) => result.status === 'ALREADY_COMMITTED'),
    ).toHaveLength(49);
  }, 30_000);
});

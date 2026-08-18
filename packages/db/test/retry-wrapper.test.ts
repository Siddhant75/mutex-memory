import type { Pool, PoolClient } from 'pg';
import { describe, expect, it, vi } from 'vitest';
import {
  TransactionRetryExhaustedError,
  TransactionRollbackError,
} from '../src/errors.js';
import { withSerializableRetry } from '../src/with-serializable-retry.js';

function createPoolDouble(): {
  pool: Pool;
  query: ReturnType<typeof vi.fn<(sql: string) => Promise<unknown>>>;
  release: ReturnType<typeof vi.fn<(error?: Error | boolean) => void>>;
} {
  const query = vi.fn<(sql: string) => Promise<unknown>>(async () => ({}));
  const release = vi.fn<(error?: Error | boolean) => void>();
  const client = { query, release } as unknown as PoolClient;
  const connect = vi.fn<() => Promise<PoolClient>>(async () => client);

  return {
    pool: { connect } as unknown as Pool,
    query,
    release,
  };
}

describe('withSerializableRetry', () => {
  it('retries SQLSTATE 40001 and returns the later result', async () => {
    const { pool, query, release } = createPoolDouble();
    let attempts = 0;

    const result = await withSerializableRetry(
      pool,
      async () => {
        attempts += 1;
        if (attempts === 1) {
          throw Object.assign(new Error('restart transaction'), { code: '40001' });
        }
        return 'committed';
      },
      { sleepMs: async () => undefined },
    );

    expect(result).toBe('committed');
    expect(attempts).toBe(2);
    expect(query.mock.calls.map(([sql]) => sql)).toEqual([
      'BEGIN',
      'ROLLBACK',
      'BEGIN',
      'COMMIT',
    ]);
    expect(release).toHaveBeenCalledOnce();
  });

  it('does not retry a non-40001 database error', async () => {
    const { pool, query, release } = createPoolDouble();
    const uniqueViolation = Object.assign(new Error('duplicate key'), { code: '23505' });
    let attempts = 0;

    await expect(
      withSerializableRetry(pool, async () => {
        attempts += 1;
        throw uniqueViolation;
      }),
    ).rejects.toBe(uniqueViolation);

    expect(attempts).toBe(1);
    expect(query.mock.calls.map(([sql]) => sql)).toEqual(['BEGIN', 'ROLLBACK']);
    expect(release).toHaveBeenCalledOnce();
  });

  it('throws TransactionRetryExhaustedError after five 40001 attempts', async () => {
    const { pool, query, release } = createPoolDouble();
    let attempts = 0;

    const result = withSerializableRetry(
      pool,
      async () => {
        attempts += 1;
        throw Object.assign(new Error(`restart ${attempts}`), { code: '40001' });
      },
      { sleepMs: async () => undefined },
    );

    await expect(result).rejects.toMatchObject({
      name: 'TransactionRetryExhaustedError',
      attempts: 5,
      cause: expect.objectContaining({ code: '40001' }),
    });
    await expect(result).rejects.toBeInstanceOf(TransactionRetryExhaustedError);
    expect(attempts).toBe(5);
    expect(query.mock.calls.filter(([sql]) => sql === 'BEGIN')).toHaveLength(5);
    expect(query.mock.calls.filter(([sql]) => sql === 'ROLLBACK')).toHaveLength(5);
    expect(query.mock.calls.filter(([sql]) => sql === 'COMMIT')).toHaveLength(0);
    expect(release).toHaveBeenCalledOnce();
  });

  it('evicts the client and stops retrying when ROLLBACK fails', async () => {
    const { pool, query, release } = createPoolDouble();
    const operationError = Object.assign(new Error('restart transaction'), {
      code: '40001',
    });
    const rollbackError = new Error('connection lost during rollback');
    query.mockResolvedValueOnce({});
    query.mockRejectedValueOnce(rollbackError);
    let attempts = 0;

    const result = withSerializableRetry(pool, async () => {
      attempts += 1;
      throw operationError;
    });

    await expect(result).rejects.toMatchObject({
      name: 'TransactionRollbackError',
      cause: rollbackError,
      operationError,
    });
    await expect(result).rejects.toBeInstanceOf(TransactionRollbackError);
    expect(attempts).toBe(1);
    expect(query.mock.calls.map(([sql]) => sql)).toEqual(['BEGIN', 'ROLLBACK']);
    expect(release).toHaveBeenCalledOnce();
    expect(release).toHaveBeenCalledWith(rollbackError);
  });
});

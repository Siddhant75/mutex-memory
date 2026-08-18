import type { Pool, PoolClient } from 'pg';
import {
  TransactionRetryExhaustedError,
  TransactionRollbackError,
} from './errors.js';

const RETRYABLE_SQLSTATE = '40001';

export interface SerializableRetryOptions {
  maxAttempts?: number;
  baseDelayMs?: number;
  maxDelayMs?: number;
  sleepMs?: (ms: number) => Promise<void>;
}

function sqlState(error: unknown): string | undefined {
  if (typeof error !== 'object' || error === null || !('code' in error)) {
    return undefined;
  }

  const code = error.code;
  return typeof code === 'string' ? code : undefined;
}

async function defaultSleep(ms: number): Promise<void> {
  await new Promise<void>((resolveSleep) => setTimeout(resolveSleep, ms));
}

function toError(error: unknown): Error {
  return error instanceof Error
    ? error
    : new Error('Unknown database client failure', { cause: error });
}

export async function withSerializableRetry<T>(
  pool: Pool,
  operation: (client: PoolClient, attempt: number) => Promise<T>,
  options: SerializableRetryOptions = {},
): Promise<T> {
  const maxAttempts = options.maxAttempts ?? 5;
  const baseDelayMs = options.baseDelayMs ?? 25;
  const maxDelayMs = options.maxDelayMs ?? 250;
  const sleepMs = options.sleepMs ?? defaultSleep;
  const client = await pool.connect();
  let releaseError: Error | undefined;

  try {
    for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
      let transactionBegan = false;

      try {
        await client.query('BEGIN');
        transactionBegan = true;
        const result = await operation(client, attempt);
        await client.query('COMMIT');
        return result;
      } catch (error) {
        if (transactionBegan) {
          try {
            await client.query('ROLLBACK');
          } catch (rollbackFailure) {
            const rollbackError = toError(rollbackFailure);
            releaseError = rollbackError;
            throw new TransactionRollbackError(error, rollbackError);
          }
        }

        if (sqlState(error) !== RETRYABLE_SQLSTATE) {
          throw error;
        }

        if (attempt === maxAttempts) {
          throw new TransactionRetryExhaustedError(attempt, error);
        }

        const exponentialDelay = Math.min(
          maxDelayMs,
          baseDelayMs * 2 ** (attempt - 1),
        );
        const jitteredDelay = Math.floor(Math.random() * (exponentialDelay + 1));
        await sleepMs(jitteredDelay);
      }
    }

    throw new Error('Transaction retry loop exited unexpectedly');
  } finally {
    if (releaseError) {
      client.release(releaseError);
    } else {
      client.release();
    }
  }
}

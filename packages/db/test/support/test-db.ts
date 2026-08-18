import { Pool } from 'pg';
import type { Pool as PgPool } from 'pg';
import { runMigrations } from '../../src/migrate.js';
import { withSerializableRetry } from '../../src/with-serializable-retry.js';

function requireTestDatabaseUrl(): string {
  const connectionString = process.env.TEST_DATABASE_URL ?? process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error('TEST_DATABASE_URL or DATABASE_URL is required for integration tests');
  }

  return connectionString;
}

export function createTestPool(): PgPool {
  return new Pool({ connectionString: requireTestDatabaseUrl(), max: 5 });
}

export async function resetTestDatabase(pool: PgPool): Promise<void> {
  await withSerializableRetry(pool, async (client) => {
    await client.query('DROP TABLE IF EXISTS memory_episodes');
    await client.query('DROP TABLE IF EXISTS action_outbox');
    await client.query('DROP TABLE IF EXISTS case_decisions');
    await client.query('DROP TABLE IF EXISTS cases');
    await runMigrations(client);
  });
}

export async function clearTestDatabase(pool: PgPool): Promise<void> {
  await withSerializableRetry(pool, async (client) => {
    await client.query('DELETE FROM memory_episodes');
    await client.query('DELETE FROM action_outbox');
    await client.query('DELETE FROM case_decisions');
    await client.query('DELETE FROM cases');
  });
}

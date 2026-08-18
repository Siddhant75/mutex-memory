import { readdir, readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { Pool } from 'pg';
import type { Pool as PgPool, PoolClient } from 'pg';

const defaultMigrationsDirectory = fileURLToPath(
  new URL('../migrations/', import.meta.url),
);

export async function runMigrations(
  pool: PgPool | PoolClient,
  migrationsDirectory = defaultMigrationsDirectory,
): Promise<void> {
  const migrationFiles = (await readdir(migrationsDirectory))
    .filter((fileName) => fileName.endsWith('.sql'))
    .sort((left, right) => left.localeCompare(right));

  for (const migrationFile of migrationFiles) {
    const sql = await readFile(resolve(migrationsDirectory, migrationFile), 'utf8');
    await pool.query(sql);
  }
}

export async function migrateFromEnvironment(): Promise<void> {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error('DATABASE_URL is required to run migrations');
  }

  const pool = new Pool({ connectionString, max: 5 });
  try {
    await runMigrations(pool);
  } finally {
    await pool.end();
  }
}

const entryPoint = process.argv[1];
if (entryPoint && import.meta.url === pathToFileURL(resolve(entryPoint)).href) {
  await migrateFromEnvironment();
}

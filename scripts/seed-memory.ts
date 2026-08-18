import { createPool } from '../packages/db/src/pool.js';
import { seedDemoMemory } from '../packages/db/src/demo-memory-seed.js';

function requireConnectionString(): string {
  const connectionString = process.env.DATABASE_URL ?? process.env.TEST_DATABASE_URL;
  if (!connectionString) {
    throw new Error('DATABASE_URL or TEST_DATABASE_URL is required');
  }
  return connectionString;
}

const pool = createPool(requireConnectionString());

try {
  const result = await seedDemoMemory(pool);
  console.log('Mutex Memory demo seed');
  console.log(`episodes=${result.episodeCount}`);
  console.log('PASS');
} catch (error) {
  console.error('Mutex Memory demo seed');
  console.error('FAIL');
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
} finally {
  await pool.end();
}

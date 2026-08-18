import type { DecisionCandidate } from '../packages/contracts/src/index.js';
import { runMigrations } from '../packages/db/src/migrate.js';
import { createPool } from '../packages/db/src/pool.js';
import { commitDecision } from '../packages/db/src/repositories/decision-repository.js';

const ATTEMPTS = 50;
const ACTIONS = ['REFUND', 'REPLACEMENT', 'MANUAL_REVIEW'] as const;

function requireConnectionString(): string {
  const connectionString = process.env.TEST_DATABASE_URL ?? process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error('TEST_DATABASE_URL or DATABASE_URL is required');
  }
  return connectionString;
}

async function runConcurrencyProof(): Promise<void> {
  const pool = createPool(requireConnectionString());
  const caseId = crypto.randomUUID();
  let caseInserted = false;

  try {
    await runMigrations(pool);
    await pool.query(
      `INSERT INTO cases (id, order_id, event_type, status, version, order_value)
       VALUES ($1, $2, 'PACKAGE_LOST', 'OPEN', 1, 119.00)`,
      [caseId, `concurrency-proof-${caseId}`],
    );
    caseInserted = true;

    const candidates: DecisionCandidate[] = Array.from(
      { length: ATTEMPTS },
      (_, index) => ({
        candidateId: crypto.randomUUID(),
        caseId,
        proposalId: crypto.randomUUID(),
        action: ACTIONS[index % ACTIONS.length]!,
        actionGroup: 'PRIMARY_RESOLUTION',
        expectedCaseVersion: 1,
        reasonCodes: ['CONCURRENCY_PROOF'],
        memoryIds: [],
      }),
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

    const committed = results.filter((result) => result.status === 'COMMITTED').length;
    const alreadyCommitted = results.filter(
      (result) => result.status === 'ALREADY_COMMITTED',
    ).length;
    const decisionsInDatabase = Number(counts.rows[0]?.decisions);
    const outboxRowsInDatabase = Number(counts.rows[0]?.outbox);
    const caseStatus = caseResult.rows[0]?.status;
    const caseVersion = Number(caseResult.rows[0]?.version);
    const passed =
      committed === 1 &&
      alreadyCommitted === ATTEMPTS - 1 &&
      decisionsInDatabase === 1 &&
      outboxRowsInDatabase === 1 &&
      caseStatus === 'DECIDED' &&
      caseVersion === 2;

    console.log('Mutex Memory concurrency proof');
    console.log(`attempts=${ATTEMPTS}`);
    console.log(`committed=${committed}`);
    console.log(`already_committed=${alreadyCommitted}`);
    console.log(`decisions_in_db=${decisionsInDatabase}`);
    console.log(`outbox_rows_in_db=${outboxRowsInDatabase}`);
    console.log(`case_status=${caseStatus ?? 'MISSING'}`);
    console.log(`case_version=${Number.isNaN(caseVersion) ? 'MISSING' : caseVersion}`);
    console.log(passed ? 'PASS' : 'FAIL');

    if (!passed) {
      process.exitCode = 1;
    }
  } finally {
    if (caseInserted) {
      await pool.query('DELETE FROM action_outbox WHERE case_id = $1', [caseId]);
      await pool.query('DELETE FROM case_decisions WHERE case_id = $1', [caseId]);
      await pool.query('DELETE FROM cases WHERE id = $1', [caseId]);
    }
    await pool.end();
  }
}

try {
  await runConcurrencyProof();
} catch (error) {
  console.error('Mutex Memory concurrency proof');
  console.error('FAIL');
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
}

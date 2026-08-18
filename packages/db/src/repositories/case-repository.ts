import { CaseStatusSchema, type CaseStatus } from '@mutex-memory/contracts';
import type { PoolClient } from 'pg';

export interface CaseRecord {
  id: string;
  status: CaseStatus;
  version: number;
}

type CaseRow = {
  id: string;
  status: string;
  version: string | number;
};

export async function findCaseById(
  client: PoolClient,
  caseId: string,
): Promise<CaseRecord | null> {
  const result = await client.query<CaseRow>(
    'SELECT id, status, version FROM cases WHERE id = $1',
    [caseId],
  );
  const row = result.rows[0];
  if (!row) {
    return null;
  }

  return {
    id: row.id,
    status: CaseStatusSchema.parse(row.status),
    version: Number(row.version),
  };
}

export async function markCaseDecided(
  client: PoolClient,
  caseId: string,
  expectedVersion: number,
  committedVersion: number,
): Promise<boolean> {
  const result = await client.query(
    `UPDATE cases
     SET status = 'DECIDED', version = $3, updated_at = now()
     WHERE id = $1 AND status = 'OPEN' AND version = $2`,
    [caseId, expectedVersion, committedVersion],
  );

  return result.rowCount === 1;
}

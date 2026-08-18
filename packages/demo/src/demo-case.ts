import { CaseStatusSchema, type CaseStatus } from '@mutex-memory/contracts';
import { withSerializableRetry } from '@mutex-memory/db';
import type { Pool } from 'pg';

export const DEMO_CASE_ID = '20000000-0000-4000-8000-000000000001';

export interface DemoCaseSnapshot {
  id: string;
  orderId: string;
  eventType: string;
  status: CaseStatus;
  version: number;
  orderValue: number;
  summary: string;
}

type DemoCaseRow = {
  id: string;
  order_id: string;
  event_type: string;
  status: string;
  version: string | number;
  order_value: string | number;
};

const DEMO_ORDER_ID = 'ORDER-MUTEX-119';
const DEMO_EVENT_TYPE = 'PACKAGE_LOST';
const DEMO_ORDER_VALUE = 119;
const DEMO_SUMMARY = 'Package was lost after carrier handoff.';

function toSnapshot(row: DemoCaseRow): DemoCaseSnapshot {
  return {
    id: row.id,
    orderId: row.order_id,
    eventType: row.event_type,
    status: CaseStatusSchema.parse(row.status),
    version: Number(row.version),
    orderValue: Number(row.order_value),
    summary: DEMO_SUMMARY,
  };
}

export async function readDemoCase(pool: Pool): Promise<DemoCaseSnapshot> {
  const result = await pool.query<DemoCaseRow>(
    `SELECT id, order_id, event_type, status, version, order_value
     FROM cases WHERE id = $1`,
    [DEMO_CASE_ID],
  );
  const row = result.rows[0];
  if (!row) {
    throw new Error('Canonical demo case has not been reset');
  }
  return toSnapshot(row);
}

export async function resetDemoCase(pool: Pool): Promise<DemoCaseSnapshot> {
  await withSerializableRetry(pool, async (client) => {
    await client.query('DELETE FROM action_outbox WHERE case_id = $1', [DEMO_CASE_ID]);
    await client.query('DELETE FROM case_decisions WHERE case_id = $1', [DEMO_CASE_ID]);
    await client.query(
      `INSERT INTO cases
       (id, order_id, event_type, status, version, order_value, customer_tier, carrier)
       VALUES ($1, $2, $3, 'OPEN', 1, $4, 'STANDARD', 'Northstar')
       ON CONFLICT (id) DO UPDATE SET
         order_id = excluded.order_id,
         event_type = excluded.event_type,
         status = 'OPEN',
         version = 1,
         order_value = excluded.order_value,
         customer_tier = excluded.customer_tier,
         carrier = excluded.carrier,
         updated_at = now()`,
      [DEMO_CASE_ID, DEMO_ORDER_ID, DEMO_EVENT_TYPE, DEMO_ORDER_VALUE],
    );
  });

  return readDemoCase(pool);
}

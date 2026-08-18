import {
  ActionTypeSchema,
  CaseStatusSchema,
  type CaseStatus,
  type DecisionCandidate,
} from '@mutex-memory/contracts';
import { withSerializableRetry } from '@mutex-memory/db';
import type { Pool } from 'pg';
import { z } from 'zod';
import { DEMO_CASE_ID, type DemoCaseSnapshot } from './demo-case.js';

const EffectTypeSchema = z.enum([
  'ISSUE_REFUND',
  'CREATE_REPLACEMENT',
  'OPEN_MANUAL_REVIEW',
]);

export interface CommittedDecisionEvidence {
  id: string;
  proposalId: string | null;
  action: DecisionCandidate['action'];
  reasonCodes: string[];
  memoryIds: string[];
  expectedCaseVersion: number;
  committedCaseVersion: number;
}

export interface OutboxIntentEvidence {
  id: string;
  decisionId: string;
  idempotencyKey: string;
  effectType: z.infer<typeof EffectTypeSchema>;
  status: string;
}

export interface DemoCaseTrace {
  case: DemoCaseSnapshot;
  committedDecision: CommittedDecisionEvidence | null;
  outboxIntent: OutboxIntentEvidence | null;
}

type CaseRow = {
  id: string;
  order_id: string;
  event_type: string;
  status: string;
  version: string | number;
  order_value: string | number;
};

type DecisionRow = {
  id: string;
  proposal_id: string | null;
  action: string;
  reason_codes: string[];
  memory_ids: string[];
  expected_case_version: string | number;
  committed_case_version: string | number;
};

type OutboxRow = {
  id: string;
  decision_id: string;
  idempotency_key: string;
  effect_type: string;
  status: string;
};

function caseSummary(caseId: string, eventType: string): string {
  return caseId === DEMO_CASE_ID
    ? 'Package was lost after carrier handoff.'
    : `Fulfillment exception: ${eventType}.`;
}

function toCaseSnapshot(row: CaseRow): DemoCaseSnapshot {
  const status: CaseStatus = CaseStatusSchema.parse(row.status);
  return {
    id: z.string().uuid().parse(row.id),
    orderId: row.order_id,
    eventType: row.event_type,
    status,
    version: z.coerce.number().int().positive().parse(row.version),
    orderValue: z.coerce.number().nonnegative().parse(row.order_value),
    summary: caseSummary(row.id, row.event_type),
  };
}

function toDecision(row: DecisionRow): CommittedDecisionEvidence {
  return {
    id: z.string().uuid().parse(row.id),
    proposalId: z.string().uuid().nullable().parse(row.proposal_id),
    action: ActionTypeSchema.parse(row.action),
    reasonCodes: z.array(z.string().min(1)).parse(row.reason_codes),
    memoryIds: z.array(z.string().uuid()).parse(row.memory_ids),
    expectedCaseVersion: z.coerce
      .number()
      .int()
      .positive()
      .parse(row.expected_case_version),
    committedCaseVersion: z.coerce
      .number()
      .int()
      .positive()
      .parse(row.committed_case_version),
  };
}

function toOutbox(row: OutboxRow): OutboxIntentEvidence {
  return {
    id: z.string().uuid().parse(row.id),
    decisionId: z.string().uuid().parse(row.decision_id),
    idempotencyKey: row.idempotency_key,
    effectType: EffectTypeSchema.parse(row.effect_type),
    status: z.string().min(1).parse(row.status),
  };
}

export async function readDemoCaseTrace(
  pool: Pool,
  caseIdInput: unknown,
): Promise<DemoCaseTrace | null> {
  const caseId = z.string().uuid().parse(caseIdInput);
  return withSerializableRetry(pool, async (client) => {
    const caseResult = await client.query<CaseRow>(
      `SELECT id, order_id, event_type, status, version, order_value
       FROM cases WHERE id = $1`,
      [caseId],
    );
    const caseRow = caseResult.rows[0];
    if (!caseRow) {
      return null;
    }

    const decisionResult = await client.query<DecisionRow>(
      `SELECT id, proposal_id, action, reason_codes, memory_ids,
              expected_case_version, committed_case_version
       FROM case_decisions
       WHERE case_id = $1 AND action_group = 'PRIMARY_RESOLUTION'`,
      [caseId],
    );
    const decisionRow = decisionResult.rows[0];
    const committedDecision = decisionRow ? toDecision(decisionRow) : null;
    let outboxIntent: OutboxIntentEvidence | null = null;

    if (committedDecision) {
      const outboxResult = await client.query<OutboxRow>(
        `SELECT id, decision_id, idempotency_key, effect_type, status
         FROM action_outbox
         WHERE case_id = $1 AND decision_id = $2`,
        [caseId, committedDecision.id],
      );
      const outboxRow = outboxResult.rows[0];
      outboxIntent = outboxRow ? toOutbox(outboxRow) : null;
    }

    return {
      case: toCaseSnapshot(caseRow),
      committedDecision,
      outboxIntent,
    };
  });
}

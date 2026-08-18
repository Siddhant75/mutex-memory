import {
  DecisionCandidateSchema,
  type DecisionCandidate,
} from '@mutex-memory/contracts';
import { evaluateCommitPolicy } from '@mutex-memory/domain';
import type { Pool, PoolClient } from 'pg';
import { CaseNotFoundError } from '../errors.js';
import { withSerializableRetry } from '../with-serializable-retry.js';
import { findCaseById, markCaseDecided } from './case-repository.js';

type EffectType = 'ISSUE_REFUND' | 'CREATE_REPLACEMENT' | 'OPEN_MANUAL_REVIEW';

export type CommitDecisionResult =
  | {
      status: 'COMMITTED';
      decisionId: string;
      outboxId: string;
      committedCaseVersion: number;
      dbRetryCount: number;
    }
  | {
      status: 'ALREADY_COMMITTED' | 'STALE_CASE_VERSION' | 'CASE_NOT_OPEN';
      existingDecisionId?: string;
      dbRetryCount: number;
    };

const EFFECT_BY_ACTION: Record<DecisionCandidate['action'], EffectType> = {
  REFUND: 'ISSUE_REFUND',
  REPLACEMENT: 'CREATE_REPLACEMENT',
  MANUAL_REVIEW: 'OPEN_MANUAL_REVIEW',
};

class SyntheticSerializationFailure extends Error {
  readonly code = '40001';

  constructor() {
    super('Case changed while committing the decision');
    this.name = 'SyntheticSerializationFailure';
  }
}

type ExistingDecisionRow = { id: string };

async function findExistingPrimaryDecision(
  client: PoolClient,
  caseId: string,
): Promise<string | undefined> {
  const result = await client.query<ExistingDecisionRow>(
    `SELECT id FROM case_decisions
     WHERE case_id = $1 AND action_group = 'PRIMARY_RESOLUTION'`,
    [caseId],
  );
  return result.rows[0]?.id;
}

async function readExistingPrimaryDecision(
  pool: Pool,
  caseId: string,
): Promise<string | undefined> {
  const result = await pool.query<ExistingDecisionRow>(
    `SELECT id FROM case_decisions
     WHERE case_id = $1 AND action_group = 'PRIMARY_RESOLUTION'`,
    [caseId],
  );
  return result.rows[0]?.id;
}

function isPrimaryResolutionConflict(error: unknown): boolean {
  if (typeof error !== 'object' || error === null) {
    return false;
  }

  const code = 'code' in error ? error.code : undefined;
  const constraint = 'constraint' in error ? error.constraint : undefined;
  return code === '23505' && constraint === 'one_action_group_per_case';
}

export async function commitDecision(
  pool: Pool,
  candidateInput: unknown,
): Promise<CommitDecisionResult> {
  const candidate = DecisionCandidateSchema.parse(candidateInput);
  const decisionId = crypto.randomUUID();
  const outboxId = crypto.randomUUID();
  const committedCaseVersion = candidate.expectedCaseVersion + 1;
  const idempotencyKey =
    `primary-resolution:${candidate.caseId}:${candidate.candidateId}`;
  const effectType = EFFECT_BY_ACTION[candidate.action];
  const payload = {
    action: candidate.action,
    candidateId: candidate.candidateId,
    caseId: candidate.caseId,
    decisionId,
  };
  let dbRetryCount = 0;

  try {
    return await withSerializableRetry(pool, async (client, attempt) => {
      dbRetryCount = attempt - 1;
      const existingDecisionId = await findExistingPrimaryDecision(
        client,
        candidate.caseId,
      );
      if (existingDecisionId) {
        return {
          status: 'ALREADY_COMMITTED',
          existingDecisionId,
          dbRetryCount,
        };
      }

      const caseRecord = await findCaseById(client, candidate.caseId);
      if (!caseRecord) {
        throw new CaseNotFoundError(candidate.caseId);
      }

      const policy = evaluateCommitPolicy({
        caseStatus: caseRecord.status,
        currentCaseVersion: caseRecord.version,
        candidate,
      });
      if (!policy.ok) {
        if (policy.code === 'MANUAL_REVIEW_REQUIRED') {
          throw new Error('Commit policy returned an unsupported manual-review result');
        }
        return { status: policy.code, dbRetryCount };
      }

      await client.query(
        `INSERT INTO case_decisions
         (id, case_id, proposal_id, action, action_group, expected_case_version,
          committed_case_version, reason_codes, memory_ids)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
        [
          decisionId,
          candidate.caseId,
          candidate.proposalId,
          candidate.action,
          candidate.actionGroup,
          candidate.expectedCaseVersion,
          committedCaseVersion,
          candidate.reasonCodes,
          candidate.memoryIds,
        ],
      );

      const caseUpdated = await markCaseDecided(
        client,
        candidate.caseId,
        candidate.expectedCaseVersion,
        committedCaseVersion,
      );
      if (!caseUpdated) {
        throw new SyntheticSerializationFailure();
      }

      await client.query(
        `INSERT INTO action_outbox
         (id, case_id, decision_id, idempotency_key, effect_type, payload, status)
         VALUES ($1, $2, $3, $4, $5, $6, 'PENDING')`,
        [
          outboxId,
          candidate.caseId,
          decisionId,
          idempotencyKey,
          effectType,
          payload,
        ],
      );

      return {
        status: 'COMMITTED',
        decisionId,
        outboxId,
        committedCaseVersion,
        dbRetryCount,
      };
    });
  } catch (error) {
    if (isPrimaryResolutionConflict(error)) {
      const existingDecisionId = await readExistingPrimaryDecision(
        pool,
        candidate.caseId,
      );
      if (existingDecisionId) {
        return {
          status: 'ALREADY_COMMITTED',
          existingDecisionId,
          dbRetryCount,
        };
      }
    }
    throw error;
  }
}

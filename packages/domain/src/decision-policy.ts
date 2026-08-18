import type { CaseStatus, DecisionCandidate } from '@mutex-memory/contracts';

export type CommitRejectionCode =
  | 'CASE_NOT_OPEN'
  | 'STALE_CASE_VERSION'
  | 'MANUAL_REVIEW_REQUIRED';

export type CommitPolicyResult =
  | { ok: true }
  | { ok: false; code: CommitRejectionCode };

export function evaluateCommitPolicy(input: {
  caseStatus: CaseStatus;
  currentCaseVersion: number;
  candidate: DecisionCandidate;
}): CommitPolicyResult {
  if (input.caseStatus !== 'OPEN') {
    return { ok: false, code: 'CASE_NOT_OPEN' };
  }

  if (input.candidate.expectedCaseVersion !== input.currentCaseVersion) {
    return { ok: false, code: 'STALE_CASE_VERSION' };
  }

  return { ok: true };
}

import { describe, expect, it } from 'vitest';
import { evaluateCommitPolicy } from '../src/decision-policy.js';

function candidate(action: 'REFUND' | 'REPLACEMENT' | 'MANUAL_REVIEW' = 'REFUND') {
  return {
    candidateId: '11111111-1111-4111-8111-111111111111',
    caseId: '22222222-2222-4222-8222-222222222222',
    proposalId: '33333333-3333-4333-8333-333333333333',
    action,
    actionGroup: 'PRIMARY_RESOLUTION' as const,
    expectedCaseVersion: 1,
    reasonCodes: ['TEST'],
    memoryIds: [],
  };
}

describe('evaluateCommitPolicy', () => {
  it('accepts a current candidate for an OPEN case', () => {
    expect(
      evaluateCommitPolicy({
        caseStatus: 'OPEN',
        currentCaseVersion: 1,
        candidate: candidate(),
      }),
    ).toEqual({ ok: true });
  });

  it('rejects a candidate whose expected version is stale', () => {
    expect(
      evaluateCommitPolicy({
        caseStatus: 'OPEN',
        currentCaseVersion: 2,
        candidate: candidate(),
      }),
    ).toEqual({ ok: false, code: 'STALE_CASE_VERSION' });
  });

  it('rejects a candidate after the case is DECIDED', () => {
    expect(
      evaluateCommitPolicy({
        caseStatus: 'DECIDED',
        currentCaseVersion: 1,
        candidate: candidate(),
      }),
    ).toEqual({ ok: false, code: 'CASE_NOT_OPEN' });
  });

  it('allows MANUAL_REVIEW as a primary resolution when version is current', () => {
    expect(
      evaluateCommitPolicy({
        caseStatus: 'OPEN',
        currentCaseVersion: 1,
        candidate: candidate('MANUAL_REVIEW'),
      }),
    ).toEqual({ ok: true });
  });
});

import {
  DemoRunTraceSchema,
  DemoTraceSchema,
  type DemoApiClient,
  type DemoRunTrace,
  type DemoTrace,
  type RunInput,
} from './api.js';

const CASE_ID = '20000000-0000-4000-8000-000000000001';
const REFUND_PROPOSAL_ID = '30000000-0000-4000-8000-000000000001';
const REPLACEMENT_PROPOSAL_ID = '30000000-0000-4000-8000-000000000002';
const DECISION_ID = '40000000-0000-4000-8000-000000000001';
const OUTBOX_ID = '40000000-0000-4000-8000-000000000002';
const RESULT_MEMORY_ID = '50000000-0000-4000-8000-000000000001';
const MEMORY_IDS = [
  '10000000-0000-4000-8000-000000000001',
  '10000000-0000-4000-8000-000000000002',
  '10000000-0000-4000-8000-000000000003',
];

const OPEN_CASE = {
  id: CASE_ID,
  orderId: 'ORDER-MUTEX-119',
  eventType: 'PACKAGE_LOST',
  status: 'OPEN',
  version: 1,
  orderValue: 119,
  summary: 'Package was lost after carrier handoff.',
} as const;

const MEMORIES = [
  {
    id: MEMORY_IDS[0],
    caseId: null,
    summary: 'Carrier confirmed a lost package after handoff for a standard-value order.',
    resolution: 'REPLACEMENT',
    outcome: 'Replacement arrived successfully within two days.',
    metadata: { fixture: true, carrier: 'Northstar', scenario: 'confirmed_loss' },
    distance: 0.041,
  },
  {
    id: MEMORY_IDS[1],
    caseId: null,
    summary: 'Carrier confirmed a lost package and the customer could not wait for replacement.',
    resolution: 'REFUND',
    outcome: 'Refund completed and the case closed without escalation.',
    metadata: { fixture: true, carrier: 'Northstar', scenario: 'confirmed_loss' },
    distance: 0.067,
  },
  {
    id: MEMORY_IDS[2],
    caseId: null,
    summary: 'High-value package was lost after carrier handoff with incomplete scan evidence.',
    resolution: 'MANUAL_REVIEW',
    outcome: 'Operations verified the carrier trace before approving a refund.',
    metadata: { fixture: true, scenario: 'high_value_loss', orderValue: 840 },
    distance: 0.118,
  },
] as const;

const PROPOSALS = [
  {
    proposalId: REFUND_PROPOSAL_ID,
    caseId: CASE_ID,
    agentRole: 'REFUND_AGENT',
    action: 'REFUND',
    reasonCodes: ['ROLE_REFUND', 'MEMORY_EVIDENCE_PRESENT'],
    memoryIds: MEMORY_IDS,
    expectedCaseVersion: 1,
    shortExplanation:
      'Refund Agent proposes a refund based on the current loss and retrieved outcomes.',
  },
  {
    proposalId: REPLACEMENT_PROPOSAL_ID,
    caseId: CASE_ID,
    agentRole: 'REPLACEMENT_AGENT',
    action: 'REPLACEMENT',
    reasonCodes: ['ROLE_REPLACEMENT', 'MEMORY_EVIDENCE_PRESENT'],
    memoryIds: MEMORY_IDS,
    expectedCaseVersion: 1,
    shortExplanation:
      'Replacement Agent proposes a replacement based on the current loss and retrieved outcomes.',
  },
] as const;

const BASE_TIMELINE = [
  {
    type: 'MEMORY_RETRIEVED',
    detail: '3 historical episodes retrieved',
  },
  {
    type: 'PROPOSALS_READY',
    detail: 'Refund and Replacement proposals ready',
  },
] as const;

function resetTrace(): DemoTrace {
  return DemoTraceSchema.parse({
    case: OPEN_CASE,
    committedDecision: null,
    outboxIntent: null,
  });
}

function unsafeTrace(): DemoRunTrace {
  return DemoRunTraceSchema.parse({
    ...resetTrace(),
    mode: 'unsafe',
    embeddingSource: 'FIXTURE',
    retrievedMemories: MEMORIES,
    agentProposals: PROPOSALS,
    commitResults: [],
    unsafeActions: PROPOSALS.map((proposal) => ({
      proposalId: proposal.proposalId,
      action: proposal.action,
      status: 'MOCK_ACCEPTED_UNSAFE',
    })),
    episodicMemory: null,
    timelineEvents: [
      ...BASE_TIMELINE,
      {
        type: 'UNSAFE_ACTIONS_ACCEPTED',
        detail: 'Both conflicting mock actions were accepted without the commit gate',
      },
    ],
  });
}

function safeTrace(): DemoRunTrace {
  return DemoRunTraceSchema.parse({
    case: { ...OPEN_CASE, status: 'DECIDED', version: 2 },
    mode: 'safe',
    embeddingSource: 'FIXTURE',
    retrievedMemories: MEMORIES,
    agentProposals: PROPOSALS,
    commitResults: [
      {
        status: 'COMMITTED',
        decisionId: DECISION_ID,
        outboxId: OUTBOX_ID,
        committedCaseVersion: 2,
        dbRetryCount: 0,
      },
      {
        status: 'ALREADY_COMMITTED',
        existingDecisionId: DECISION_ID,
        dbRetryCount: 1,
      },
    ],
    unsafeActions: [],
    episodicMemory: {
      id: RESULT_MEMORY_ID,
      caseId: CASE_ID,
      summary: OPEN_CASE.summary,
      resolution: 'REFUND',
      outcome: 'One primary resolution committed; the conflicting proposal became harmless.',
      reasonCodes: ['ROLE_REFUND', 'MEMORY_EVIDENCE_PRESENT'],
      memoryIds: MEMORY_IDS,
      embeddingSource: 'FIXTURE',
    },
    timelineEvents: [
      ...BASE_TIMELINE,
      {
        type: 'COMMIT_COMPLETED',
        detail: 'CockroachDB admitted one primary resolution and normalized the loser',
      },
      {
        type: 'EPISODIC_MEMORY_STORED',
        detail: 'The winning outcome was stored as retrievable episodic memory',
      },
    ],
    committedDecision: {
      id: DECISION_ID,
      proposalId: REFUND_PROPOSAL_ID,
      action: 'REFUND',
      reasonCodes: ['ROLE_REFUND', 'MEMORY_EVIDENCE_PRESENT'],
      memoryIds: MEMORY_IDS,
      expectedCaseVersion: 1,
      committedCaseVersion: 2,
    },
    outboxIntent: {
      id: OUTBOX_ID,
      decisionId: DECISION_ID,
      idempotencyKey: `primary-resolution:${CASE_ID}:${REFUND_PROPOSAL_ID}`,
      effectType: 'ISSUE_REFUND',
      status: 'PENDING',
    },
  });
}

export function createFixtureDemoApiClient(): DemoApiClient {
  return {
    reset: async () => structuredClone(resetTrace()),
    run: async (input: RunInput) =>
      structuredClone(input.mode === 'safe' ? safeTrace() : unsafeTrace()),
  };
}

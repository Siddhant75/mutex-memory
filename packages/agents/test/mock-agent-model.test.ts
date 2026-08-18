import { describe, expect, it } from 'vitest';
import { MockAgentModel } from '../src/mock-agent-model.js';

const context = {
  case: {
    id: '20000000-0000-4000-8000-000000000001',
    status: 'OPEN',
    version: 1,
    orderValue: 119,
    eventType: 'PACKAGE_LOST',
    summary: 'Package was lost after carrier handoff.',
  },
  policy: {
    allowRefund: true,
    allowReplacement: true,
  },
  memories: [
    {
      id: '10000000-0000-4000-8000-000000000001',
      summary: 'Carrier confirmed a similar package loss.',
      resolution: 'REPLACEMENT',
      outcome: 'Replacement arrived successfully.',
    },
    {
      id: '10000000-0000-4000-8000-000000000002',
      summary: 'A similar customer received a refund.',
      resolution: 'REFUND',
      outcome: 'Refund completed without escalation.',
    },
  ],
};

describe('MockAgentModel', () => {
  it('produces a refund proposal with version and memory evidence', async () => {
    const model = new MockAgentModel(
      () => '30000000-0000-4000-8000-000000000001',
    );

    const proposal = await model.propose(context, 'REFUND_AGENT');

    expect(proposal).toEqual({
      proposalId: '30000000-0000-4000-8000-000000000001',
      caseId: context.case.id,
      agentRole: 'REFUND_AGENT',
      action: 'REFUND',
      reasonCodes: ['ROLE_REFUND', 'MEMORY_EVIDENCE_PRESENT'],
      memoryIds: context.memories.map((memory) => memory.id),
      expectedCaseVersion: 1,
      shortExplanation:
        'Refund Agent proposes a refund based on the current loss and retrieved outcomes.',
    });
  });

  it('produces a conflicting replacement proposal from the same context', async () => {
    const model = new MockAgentModel(
      () => '30000000-0000-4000-8000-000000000002',
    );

    const proposal = await model.propose(context, 'REPLACEMENT_AGENT');

    expect(proposal).toMatchObject({
      proposalId: '30000000-0000-4000-8000-000000000002',
      caseId: context.case.id,
      agentRole: 'REPLACEMENT_AGENT',
      action: 'REPLACEMENT',
      memoryIds: context.memories.map((memory) => memory.id),
      expectedCaseVersion: 1,
    });
  });

  it('falls back to manual review when the role action is disabled', async () => {
    const model = new MockAgentModel(
      () => '30000000-0000-4000-8000-000000000003',
    );

    const proposal = await model.propose(
      {
        ...context,
        policy: { allowRefund: true, allowReplacement: false },
      },
      'REPLACEMENT_AGENT',
    );

    expect(proposal).toMatchObject({
      agentRole: 'REPLACEMENT_AGENT',
      action: 'MANUAL_REVIEW',
      reasonCodes: ['POLICY_REQUIRES_MANUAL_REVIEW'],
    });
  });
});

import {
  ActionProposalSchema,
  AgentContextSchema,
  AgentRoleSchema,
  type ActionProposal,
  type AgentRole,
} from '@mutex-memory/contracts';
import type { AgentModel } from './agent-model.js';

type IdFactory = () => string;

function roleActionAllowed(input: {
  role: AgentRole;
  allowRefund: boolean;
  allowReplacement: boolean;
}): boolean {
  return input.role === 'REFUND_AGENT'
    ? input.allowRefund
    : input.allowReplacement;
}

export class MockAgentModel implements AgentModel {
  constructor(private readonly createId: IdFactory = () => crypto.randomUUID()) {}

  async propose(contextInput: unknown, roleInput: unknown): Promise<ActionProposal> {
    const context = AgentContextSchema.parse(contextInput);
    const role = AgentRoleSchema.parse(roleInput);
    const allowed = roleActionAllowed({
      role,
      allowRefund: context.policy.allowRefund,
      allowReplacement: context.policy.allowReplacement,
    });
    const action = allowed
      ? role === 'REFUND_AGENT'
        ? 'REFUND'
        : 'REPLACEMENT'
      : 'MANUAL_REVIEW';
    const memoryIds = context.memories.map((memory) => memory.id);
    const reasonCodes = allowed
      ? [
          role === 'REFUND_AGENT' ? 'ROLE_REFUND' : 'ROLE_REPLACEMENT',
          ...(memoryIds.length > 0 ? ['MEMORY_EVIDENCE_PRESENT'] : []),
        ]
      : ['POLICY_REQUIRES_MANUAL_REVIEW'];
    const shortExplanation = allowed
      ? role === 'REFUND_AGENT'
        ? 'Refund Agent proposes a refund based on the current loss and retrieved outcomes.'
        : 'Replacement Agent proposes a replacement based on the current loss and retrieved outcomes.'
      : 'The requested role action is disabled by policy, so manual review is required.';

    return ActionProposalSchema.parse({
      proposalId: this.createId(),
      caseId: context.case.id,
      agentRole: role,
      action,
      reasonCodes,
      memoryIds,
      expectedCaseVersion: context.case.version,
      shortExplanation,
    });
  }
}

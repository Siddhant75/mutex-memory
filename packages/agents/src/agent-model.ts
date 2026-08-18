import type {
  ActionProposal,
  AgentContext,
  AgentRole,
} from '@mutex-memory/contracts';

export interface AgentModel {
  propose(contextInput: unknown, roleInput: unknown): Promise<ActionProposal>;
}

export type ValidatedAgentModel = {
  propose(context: AgentContext, role: AgentRole): Promise<ActionProposal>;
};

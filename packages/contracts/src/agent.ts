import { z } from 'zod';
import { ActionTypeSchema } from './decision.js';

export const AgentRoleSchema = z.enum(['REFUND_AGENT', 'REPLACEMENT_AGENT']);

export const RetrievedMemoryEvidenceSchema = z.object({
  id: z.string().uuid(),
  summary: z.string().min(1),
  resolution: z.string().min(1),
  outcome: z.string().min(1),
});

export const AgentContextSchema = z.object({
  case: z.object({
    id: z.string().uuid(),
    status: z.literal('OPEN'),
    version: z.number().int().positive(),
    orderValue: z.number().nonnegative(),
    eventType: z.string().min(1),
    summary: z.string().min(1),
  }),
  policy: z.object({
    allowRefund: z.boolean(),
    allowReplacement: z.boolean(),
  }),
  memories: z.array(RetrievedMemoryEvidenceSchema).max(3),
});

export const ActionProposalSchema = z.object({
  proposalId: z.string().uuid(),
  caseId: z.string().uuid(),
  agentRole: AgentRoleSchema,
  action: ActionTypeSchema,
  reasonCodes: z.array(z.string().min(1)).min(1).max(8),
  memoryIds: z.array(z.string().uuid()).max(3),
  expectedCaseVersion: z.number().int().positive(),
  shortExplanation: z.string().min(1).max(280),
});

export type AgentRole = z.infer<typeof AgentRoleSchema>;
export type AgentContext = z.infer<typeof AgentContextSchema>;
export type ActionProposal = z.infer<typeof ActionProposalSchema>;

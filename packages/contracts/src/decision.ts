import { z } from 'zod';

export const ActionTypeSchema = z.enum(['REFUND', 'REPLACEMENT', 'MANUAL_REVIEW']);
export const ActionGroupSchema = z.literal('PRIMARY_RESOLUTION');

export const DecisionCandidateSchema = z.object({
  candidateId: z.string().uuid(),
  caseId: z.string().uuid(),
  proposalId: z.string().uuid(),
  action: ActionTypeSchema,
  actionGroup: ActionGroupSchema,
  expectedCaseVersion: z.number().int().positive(),
  reasonCodes: z.array(z.string().min(1)).min(1).max(8),
  memoryIds: z.array(z.string().uuid()).max(10),
});

export type DecisionCandidate = z.infer<typeof DecisionCandidateSchema>;

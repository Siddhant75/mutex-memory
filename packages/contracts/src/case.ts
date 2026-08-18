import { z } from 'zod';

export const CaseStatusSchema = z.enum([
  'OPEN',
  'PROPOSING',
  'DECIDED',
  'EXECUTING',
  'RESOLVED',
  'MANUAL_REVIEW',
  'EFFECT_FAILED',
]);

export type CaseStatus = z.infer<typeof CaseStatusSchema>;

import { z } from 'zod';

const ActionSchema = z.enum(['REFUND', 'REPLACEMENT', 'MANUAL_REVIEW']);
const CaseStatusSchema = z.enum([
  'OPEN',
  'PROPOSING',
  'DECIDED',
  'EXECUTING',
  'RESOLVED',
  'MANUAL_REVIEW',
  'EFFECT_FAILED',
]);

const DemoCaseSchema = z
  .object({
    id: z.string().uuid(),
    orderId: z.string().min(1),
    eventType: z.string().min(1),
    status: CaseStatusSchema,
    version: z.number().int().positive(),
    orderValue: z.number().nonnegative(),
    summary: z.string().min(1),
  })
  .strict();

const CommittedDecisionSchema = z
  .object({
    id: z.string().uuid(),
    proposalId: z.string().uuid().nullable(),
    action: ActionSchema,
    reasonCodes: z.array(z.string().min(1)),
    memoryIds: z.array(z.string().uuid()),
    expectedCaseVersion: z.number().int().positive(),
    committedCaseVersion: z.number().int().positive(),
  })
  .strict();

const OutboxIntentSchema = z
  .object({
    id: z.string().uuid(),
    decisionId: z.string().uuid(),
    idempotencyKey: z.string().min(1),
    effectType: z.enum([
      'ISSUE_REFUND',
      'CREATE_REPLACEMENT',
      'OPEN_MANUAL_REVIEW',
    ]),
    status: z.string().min(1),
  })
  .strict();

export const DemoTraceSchema = z
  .object({
    case: DemoCaseSchema,
    committedDecision: CommittedDecisionSchema.nullable(),
    outboxIntent: OutboxIntentSchema.nullable(),
  })
  .strict();

const RetrievedMemorySchema = z
  .object({
    id: z.string().uuid(),
    caseId: z.string().uuid().nullable(),
    summary: z.string().min(1),
    resolution: z.string().min(1),
    outcome: z.string().min(1),
    metadata: z.record(z.string(), z.unknown()),
    distance: z.number().finite().nonnegative(),
  })
  .strict();

const AgentProposalSchema = z
  .object({
    proposalId: z.string().uuid(),
    caseId: z.string().uuid(),
    agentRole: z.enum(['REFUND_AGENT', 'REPLACEMENT_AGENT']),
    action: ActionSchema,
    reasonCodes: z.array(z.string().min(1)).min(1).max(8),
    memoryIds: z.array(z.string().uuid()).max(3),
    expectedCaseVersion: z.number().int().positive(),
    shortExplanation: z.string().min(1).max(280),
  })
  .strict();

const CommitResultSchema = z.discriminatedUnion('status', [
  z
    .object({
      status: z.literal('COMMITTED'),
      decisionId: z.string().uuid(),
      outboxId: z.string().uuid(),
      committedCaseVersion: z.number().int().positive(),
      dbRetryCount: z.number().int().nonnegative(),
    })
    .strict(),
  z
    .object({
      status: z.enum([
        'ALREADY_COMMITTED',
        'STALE_CASE_VERSION',
        'CASE_NOT_OPEN',
      ]),
      existingDecisionId: z.string().uuid().optional(),
      dbRetryCount: z.number().int().nonnegative(),
    })
    .strict(),
]);

const UnsafeActionSchema = z
  .object({
    proposalId: z.string().uuid(),
    action: ActionSchema,
    status: z.literal('MOCK_ACCEPTED_UNSAFE'),
  })
  .strict();

const EpisodicMemorySchema = z
  .object({
    id: z.string().uuid(),
    caseId: z.string().uuid(),
    summary: z.string().min(1),
    resolution: ActionSchema,
    outcome: z.string().min(1),
    reasonCodes: z.array(z.string().min(1)),
    memoryIds: z.array(z.string().uuid()),
    embeddingSource: z.enum(['FIXTURE', 'MODEL']),
  })
  .strict();

const TimelineEventSchema = z
  .object({
    type: z.enum([
      'MEMORY_RETRIEVED',
      'PROPOSALS_READY',
      'COMMIT_COMPLETED',
      'UNSAFE_ACTIONS_ACCEPTED',
      'EPISODIC_MEMORY_STORED',
    ]),
    detail: z.string().min(1),
  })
  .strict();

export const DemoRunTraceSchema = DemoTraceSchema.extend({
  mode: z.enum(['safe', 'unsafe']),
  embeddingSource: z.enum(['FIXTURE', 'MODEL']),
  retrievedMemories: z.array(RetrievedMemorySchema).max(3),
  agentProposals: z.array(AgentProposalSchema).max(2),
  commitResults: z.array(CommitResultSchema).max(2),
  unsafeActions: z.array(UnsafeActionSchema).max(2),
  episodicMemory: EpisodicMemorySchema.nullable(),
  timelineEvents: z.array(TimelineEventSchema).max(8),
}).strict();

const RunInputSchema = z
  .object({
    mode: z.enum(['safe', 'unsafe']),
    agentMode: z.enum(['mock', 'bedrock']),
  })
  .strict();

const ApiErrorEnvelopeSchema = z
  .object({
    error: z
      .object({
        code: z.string().min(1).max(80),
        message: z.string().min(1).max(240),
      })
      .strict(),
  })
  .strict();

export type AgentMode = z.infer<typeof RunInputSchema>['agentMode'];
export type DemoMode = z.infer<typeof RunInputSchema>['mode'];
export type DemoTrace = z.infer<typeof DemoTraceSchema>;
export type DemoRunTrace = z.infer<typeof DemoRunTraceSchema>;
export type RunInput = z.infer<typeof RunInputSchema>;

export class DemoApiError extends Error {
  readonly code: string;

  constructor(code: string, message: string) {
    super(message);
    this.name = 'DemoApiError';
    this.code = code;
  }
}

export type FetchImplementation = (
  input: RequestInfo | URL,
  init?: RequestInit,
) => Promise<Response>;

export interface DemoApiClient {
  reset(): Promise<DemoTrace>;
  run(input: RunInput): Promise<DemoRunTrace>;
}

export interface DemoApiClientOptions {
  baseUrl: string;
  fetchImpl?: FetchImplementation;
}

function invalidResponse(): DemoApiError {
  return new DemoApiError(
    'INVALID_API_RESPONSE',
    'The demo API returned an unexpected response.',
  );
}

export function createHttpDemoApiClient({
  baseUrl,
  fetchImpl = globalThis.fetch,
}: DemoApiClientOptions): DemoApiClient {
  const normalizedBaseUrl = baseUrl.replace(/\/+$/, '');

  async function request<T extends z.ZodType>(
    path: string,
    schema: T,
    init: RequestInit,
  ): Promise<z.infer<T>> {
    let response: Response;
    try {
      response = await fetchImpl(`${normalizedBaseUrl}${path}`, init);
    } catch {
      throw new DemoApiError('NETWORK_ERROR', 'Unable to reach the demo API.');
    }

    let payload: unknown;
    try {
      payload = await response.json();
    } catch {
      throw invalidResponse();
    }

    if (!response.ok) {
      const parsedError = ApiErrorEnvelopeSchema.safeParse(payload);
      if (!parsedError.success) throw invalidResponse();
      throw new DemoApiError(
        parsedError.data.error.code,
        parsedError.data.error.message,
      );
    }

    const envelope = z.object({ data: z.unknown() }).strict().safeParse(payload);
    if (!envelope.success) throw invalidResponse();
    const parsed = schema.safeParse(envelope.data.data);
    if (!parsed.success) throw invalidResponse();
    return parsed.data;
  }

  return {
    reset: () =>
      request('/demo/reset', DemoTraceSchema, {
        headers: { accept: 'application/json' },
        method: 'POST',
      }),
    run: (input) => {
      const parsedInput = RunInputSchema.parse(input);
      return request('/demo/run', DemoRunTraceSchema, {
        body: JSON.stringify(parsedInput),
        headers: {
          accept: 'application/json',
          'content-type': 'application/json',
        },
        method: 'POST',
      });
    },
  };
}

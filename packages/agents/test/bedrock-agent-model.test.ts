import { describe, expect, it } from 'vitest';
import {
  BedrockAgentModel,
  BedrockAgentResponseError,
  type BedrockConverseRequest,
} from '../src/bedrock-agent-model.js';

const context = {
  case: {
    id: '20000000-0000-4000-8000-000000000001',
    status: 'OPEN',
    version: 1,
    orderValue: 119,
    eventType: 'PACKAGE_LOST',
    summary: 'Package was lost after carrier handoff.',
  },
  policy: { allowRefund: true, allowReplacement: true },
  memories: [
    {
      id: '10000000-0000-4000-8000-000000000001',
      summary: 'Carrier confirmed a similar package loss.',
      resolution: 'REPLACEMENT',
      outcome: 'Replacement arrived successfully.',
    },
  ],
};

function textResponse(text: string): unknown {
  return { output: { message: { content: [{ text }] } } };
}

function queuedInvoker(responses: unknown[]): {
  invoke: (request: BedrockConverseRequest) => Promise<unknown>;
  requests: BedrockConverseRequest[];
} {
  const requests: BedrockConverseRequest[] = [];
  return {
    requests,
    invoke: async (request) => {
      requests.push(request);
      const response = responses.shift();
      if (response === undefined) {
        throw new Error('No queued Bedrock response');
      }
      return response;
    },
  };
}

describe('BedrockAgentModel', () => {
  it('builds trusted proposal fields around validated model JSON', async () => {
    const fake = queuedInvoker([
      textResponse(
        JSON.stringify({
          action: 'REFUND',
          reasonCodes: ['CARRIER_CONFIRMED_LOSS'],
          memoryIds: [context.memories[0]?.id],
          shortExplanation: 'A refund is appropriate for the confirmed loss.',
        }),
      ),
    ]);
    const model = new BedrockAgentModel({
      modelId: 'test-model',
      invoke: fake.invoke,
      createId: () => '30000000-0000-4000-8000-000000000001',
    });

    const proposal = await model.propose(context, 'REFUND_AGENT');

    expect(proposal).toEqual({
      proposalId: '30000000-0000-4000-8000-000000000001',
      caseId: context.case.id,
      agentRole: 'REFUND_AGENT',
      action: 'REFUND',
      reasonCodes: ['CARRIER_CONFIRMED_LOSS'],
      memoryIds: [context.memories[0]?.id],
      expectedCaseVersion: 1,
      shortExplanation: 'A refund is appropriate for the confirmed loss.',
    });
    expect(fake.requests).toHaveLength(1);
    expect(fake.requests[0]).toMatchObject({
      modelId: 'test-model',
      inferenceConfig: { maxTokens: 384, temperature: 0 },
    });
    expect(fake.requests[0]?.messages[0]?.content[0]?.text).toContain(
      context.memories[0]?.id,
    );
  });

  it('repairs one invalid response and accepts the corrected proposal', async () => {
    const fake = queuedInvoker([
      textResponse('not json'),
      textResponse(
        JSON.stringify({
          action: 'REPLACEMENT',
          reasonCodes: ['SIMILAR_REPLACEMENT_SUCCEEDED'],
          memoryIds: [context.memories[0]?.id],
          shortExplanation: 'A replacement matches the retrieved outcome.',
        }),
      ),
    ]);
    const model = new BedrockAgentModel({
      modelId: 'test-model',
      invoke: fake.invoke,
      createId: () => '30000000-0000-4000-8000-000000000002',
    });

    const proposal = await model.propose(context, 'REPLACEMENT_AGENT');

    expect(proposal.action).toBe('REPLACEMENT');
    expect(fake.requests).toHaveLength(2);
    expect(fake.requests[1]?.messages[0]?.content[0]?.text).toContain(
      'REPAIR REQUIRED',
    );
  });

  it('fails closed after two contract-invalid responses', async () => {
    const unknownMemoryId = '10000000-0000-4000-8000-000000000099';
    const invalid = textResponse(
      JSON.stringify({
        action: 'REFUND',
        reasonCodes: ['UNSUPPORTED_MEMORY'],
        memoryIds: [unknownMemoryId],
        shortExplanation: 'Uses memory that was not supplied.',
      }),
    );
    const fake = queuedInvoker([invalid, invalid]);
    const model = new BedrockAgentModel({
      modelId: 'test-model',
      invoke: fake.invoke,
    });

    await expect(model.propose(context, 'REFUND_AGENT')).rejects.toBeInstanceOf(
      BedrockAgentResponseError,
    );
    expect(fake.requests).toHaveLength(2);
  });
});

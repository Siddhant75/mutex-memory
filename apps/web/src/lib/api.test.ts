import { describe, expect, it, vi } from 'vitest';
import { createHttpDemoApiClient, DemoApiError } from './api.js';

const caseId = '20000000-0000-4000-8000-000000000001';

function caseTrace() {
  return {
    case: {
      id: caseId,
      orderId: 'ORDER-MUTEX-119',
      eventType: 'PACKAGE_LOST',
      status: 'OPEN',
      version: 1,
      orderValue: 119,
      summary: 'Package was lost after carrier handoff.',
    },
    committedDecision: null,
    outboxIntent: null,
  };
}

describe('DemoApiClient', () => {
  it('posts reset to the normalized API URL and validates the trace', async () => {
    const fetchImpl = vi.fn(async () =>
      Response.json({ data: caseTrace() }, { status: 200 }),
    );
    const client = createHttpDemoApiClient({
      baseUrl: 'https://demo.example.com/',
      fetchImpl,
    });

    await expect(client.reset()).resolves.toEqual(caseTrace());
    expect(fetchImpl).toHaveBeenCalledWith('https://demo.example.com/demo/reset', {
      headers: { accept: 'application/json' },
      method: 'POST',
    });
  });

  it('posts a strict run request and validates the complete run trace', async () => {
    const trace = {
      ...caseTrace(),
      mode: 'unsafe',
      embeddingSource: 'FIXTURE',
      retrievedMemories: [],
      agentProposals: [],
      commitResults: [],
      unsafeActions: [],
      episodicMemory: null,
      timelineEvents: [],
    };
    const fetchImpl = vi.fn(async () => Response.json({ data: trace }));
    const client = createHttpDemoApiClient({
      baseUrl: 'https://demo.example.com',
      fetchImpl,
    });

    await expect(
      client.run({ mode: 'unsafe', agentMode: 'mock' }),
    ).resolves.toEqual(trace);
    expect(fetchImpl).toHaveBeenCalledWith('https://demo.example.com/demo/run', {
      body: JSON.stringify({ mode: 'unsafe', agentMode: 'mock' }),
      headers: {
        accept: 'application/json',
        'content-type': 'application/json',
      },
      method: 'POST',
    });
  });

  it('fails closed when a successful response violates the API contract', async () => {
    const client = createHttpDemoApiClient({
      baseUrl: 'https://demo.example.com',
      fetchImpl: async () => Response.json({ data: { case: { id: 'not-a-uuid' } } }),
    });

    await expect(client.reset()).rejects.toMatchObject({
      code: 'INVALID_API_RESPONSE',
      message: 'The demo API returned an unexpected response.',
    });
  });

  it('preserves only the sanitized API error contract', async () => {
    const client = createHttpDemoApiClient({
      baseUrl: 'https://demo.example.com',
      fetchImpl: async () =>
        Response.json(
          { error: { code: 'INTERNAL_ERROR', message: 'The demo operation failed.' } },
          { status: 500 },
        ),
    });

    const error = await client.reset().catch((reason: unknown) => reason);
    expect(error).toBeInstanceOf(DemoApiError);
    expect(error).toMatchObject({
      code: 'INTERNAL_ERROR',
      message: 'The demo operation failed.',
    });
    expect(error).not.toHaveProperty('response');
  });

  it('normalizes network failures without exposing transport details', async () => {
    const client = createHttpDemoApiClient({
      baseUrl: 'https://demo.example.com',
      fetchImpl: async () => {
        throw new Error('getaddrinfo ENOTFOUND secret.internal');
      },
    });

    await expect(client.reset()).rejects.toMatchObject({
      code: 'NETWORK_ERROR',
      message: 'Unable to reach the demo API.',
    });
  });
});

import { describe, expect, it } from 'vitest';
import {
  createDemoApi,
  type ApiResponse,
  type DemoApiDependencies,
} from '../src/api.js';

const CASE_ID = '20000000-0000-4000-8000-000000000001';
const TRACE = {
  case: {
    id: CASE_ID,
    status: 'OPEN',
    version: 1,
  },
  committedDecision: null,
  outboxIntent: null,
};

function responseJson(response: ApiResponse): unknown {
  return JSON.parse(response.body) as unknown;
}

function dependencies(
  overrides: Partial<DemoApiDependencies> = {},
): DemoApiDependencies {
  return {
    reset: async () => TRACE,
    run: async (input) => ({ received: input }),
    getCase: async (caseId) => (caseId === CASE_ID ? TRACE : null),
    seedMemory: async (input) => ({ received: input, episodeCount: 10 }),
    ...overrides,
  };
}

describe('createDemoApi', () => {
  it('returns the reset trace from POST /demo/reset', async () => {
    const response = await createDemoApi(dependencies()).handle({
      method: 'POST',
      path: '/demo/reset',
      body: null,
    });

    expect(response).toEqual({
      statusCode: 200,
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ data: TRACE }),
    });
  });

  it('passes a strict Safe Bedrock request to the run operation', async () => {
    const response = await createDemoApi(dependencies()).handle({
      method: 'POST',
      path: '/demo/run',
      body: JSON.stringify({ mode: 'safe', agentMode: 'bedrock' }),
    });

    expect(response.statusCode).toBe(200);
    expect(responseJson(response)).toEqual({
      data: { received: { mode: 'safe', agentMode: 'bedrock' } },
    });
  });

  it('returns a requested case trace', async () => {
    const response = await createDemoApi(dependencies()).handle({
      method: 'GET',
      path: `/demo/cases/${CASE_ID}`,
      body: null,
    });

    expect(response.statusCode).toBe(200);
    expect(responseJson(response)).toEqual({ data: TRACE });
  });

  it('defaults seed-memory to fixture embeddings', async () => {
    const response = await createDemoApi(dependencies()).handle({
      method: 'POST',
      path: '/demo/seed-memory',
      body: null,
    });

    expect(response.statusCode).toBe(200);
    expect(responseJson(response)).toEqual({
      data: {
        received: { embeddingMode: 'fixture' },
        episodeCount: 10,
      },
    });
  });

  it('rejects malformed JSON', async () => {
    const response = await createDemoApi(dependencies()).handle({
      method: 'POST',
      path: '/demo/run',
      body: '{not-json',
    });

    expect(response.statusCode).toBe(400);
    expect(responseJson(response)).toEqual({
      error: { code: 'INVALID_JSON', message: 'Request body must be valid JSON.' },
    });
  });

  it('rejects invalid and extra run fields', async () => {
    const response = await createDemoApi(dependencies()).handle({
      method: 'POST',
      path: '/demo/run',
      body: JSON.stringify({ mode: 'fast', agentMode: 'mock', extra: true }),
    });

    expect(response.statusCode).toBe(400);
    expect(responseJson(response)).toEqual({
      error: {
        code: 'INVALID_REQUEST',
        message: 'Request body does not match the operation contract.',
      },
    });
  });

  it('returns 404 for an absent case and an unknown route', async () => {
    const api = createDemoApi(dependencies());
    const missingCase = await api.handle({
      method: 'GET',
      path: '/demo/cases/20000000-0000-4000-8000-000000000099',
      body: null,
    });
    const unknownRoute = await api.handle({
      method: 'GET',
      path: '/unknown',
      body: null,
    });

    expect(missingCase.statusCode).toBe(404);
    expect(unknownRoute.statusCode).toBe(404);
  });

  it('returns 405 when a known route uses the wrong method', async () => {
    const response = await createDemoApi(dependencies()).handle({
      method: 'GET',
      path: '/demo/reset',
      body: null,
    });

    expect(response.statusCode).toBe(405);
    expect(responseJson(response)).toEqual({
      error: { code: 'METHOD_NOT_ALLOWED', message: 'Method not allowed.' },
    });
  });

  it('sanitizes unexpected dependency failures', async () => {
    const api = createDemoApi(
      dependencies({
        reset: async () => {
          throw new Error('DATABASE_URL=postgresql://secret');
        },
      }),
    );

    const response = await api.handle({
      method: 'POST',
      path: '/demo/reset',
      body: null,
    });

    expect(response.statusCode).toBe(500);
    expect(response.body).toBe(
      '{"error":{"code":"INTERNAL_ERROR","message":"The demo operation failed."}}',
    );
    expect(response.body).not.toContain('secret');
  });
});

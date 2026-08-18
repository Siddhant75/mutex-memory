import { describe, expect, it } from 'vitest';
import { createDemoApi } from '../src/api.js';
import { createLambdaHandler } from '../src/lambda.js';

function event(input: {
  method: string;
  path: string;
  body?: string;
  isBase64Encoded?: boolean;
}): unknown {
  return {
    version: '2.0',
    routeKey: '$default',
    rawPath: input.path,
    rawQueryString: '',
    cookies: [],
    headers: { 'content-type': 'application/json' },
    queryStringParameters: {},
    requestContext: {
      accountId: 'anonymous',
      apiId: 'function-url',
      authentication: null,
      domainName: 'example.lambda-url.ap-south-1.on.aws',
      domainPrefix: 'example',
      http: {
        method: input.method,
        path: input.path,
        protocol: 'HTTP/1.1',
        sourceIp: '127.0.0.1',
        userAgent: 'vitest',
      },
      requestId: 'request-1',
      routeKey: '$default',
      stage: '$default',
      time: '18/Aug/2026:10:00:00 +0000',
      timeEpoch: 1_776_507_600_000,
    },
    body: input.body,
    isBase64Encoded: input.isBase64Encoded ?? false,
  };
}

function api() {
  return createDemoApi({
    reset: async () => ({ reset: true }),
    run: async (input) => ({ received: input }),
    getCase: async () => null,
    seedMemory: async (input) => ({ received: input, episodeCount: 10 }),
  });
}

describe('createLambdaHandler', () => {
  it('adapts a payload-v2 request to the real API router', async () => {
    const handler = createLambdaHandler(async () => api());

    const response = await handler(
      event({
        method: 'POST',
        path: '/demo/run',
        body: JSON.stringify({ mode: 'safe', agentMode: 'mock' }),
      }),
    );

    expect(response).toEqual({
      statusCode: 200,
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        data: { received: { mode: 'safe', agentMode: 'mock' } },
      }),
      isBase64Encoded: false,
    });
  });

  it('decodes a base64 request body before routing', async () => {
    const handler = createLambdaHandler(async () => api());
    const body = Buffer.from(
      JSON.stringify({ embeddingMode: 'titan' }),
      'utf8',
    ).toString('base64');

    const response = await handler(
      event({
        method: 'POST',
        path: '/demo/seed-memory',
        body,
        isBase64Encoded: true,
      }),
    );

    expect(JSON.parse(response.body)).toEqual({
      data: {
        received: { embeddingMode: 'titan' },
        episodeCount: 10,
      },
    });
  });

  it('returns a client error for an invalid Lambda event', async () => {
    const handler = createLambdaHandler(async () => api());

    const response = await handler({ version: '1.0' });

    expect(response.statusCode).toBe(400);
    expect(JSON.parse(response.body)).toEqual({
      error: {
        code: 'INVALID_LAMBDA_EVENT',
        message: 'Lambda event must use HTTP payload format 2.0.',
      },
    });
  });
});

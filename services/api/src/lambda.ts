import { z } from 'zod';
import type { ApiResponse, DemoApi } from './api.js';
import { getDefaultApi } from './runtime.js';

const LambdaHttpEventSchema = z
  .object({
    version: z.literal('2.0'),
    rawPath: z.string().min(1),
    requestContext: z
      .object({
        http: z
          .object({ method: z.string().min(1) })
          .passthrough(),
      })
      .passthrough(),
    body: z.string().optional(),
    isBase64Encoded: z.boolean().optional(),
  })
  .passthrough();

export interface LambdaHttpResponse extends ApiResponse {
  isBase64Encoded: false;
}

export type DemoApiProvider = () => Promise<DemoApi>;

function lambdaResponse(response: ApiResponse): LambdaHttpResponse {
  return { ...response, isBase64Encoded: false };
}

function invalidEventResponse(): LambdaHttpResponse {
  return lambdaResponse({
    statusCode: 400,
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      error: {
        code: 'INVALID_LAMBDA_EVENT',
        message: 'Lambda event must use HTTP payload format 2.0.',
      },
    }),
  });
}

export function createLambdaHandler(
  getApi: DemoApiProvider,
): (event: unknown) => Promise<LambdaHttpResponse> {
  return async (event) => {
    const parsed = LambdaHttpEventSchema.safeParse(event);
    if (!parsed.success) return invalidEventResponse();

    const encodedBody = parsed.data.body;
    const body =
      encodedBody === undefined
        ? null
        : parsed.data.isBase64Encoded === true
          ? Buffer.from(encodedBody, 'base64').toString('utf8')
          : encodedBody;
    const api = await getApi();
    const response = await api.handle({
      method: parsed.data.requestContext.http.method,
      path: parsed.data.rawPath,
      body,
    });
    return lambdaResponse(response);
  };
}

export const handler = createLambdaHandler(getDefaultApi);

import { z } from 'zod';

const RunRequestSchema = z
  .object({
    mode: z.enum(['safe', 'unsafe']),
    agentMode: z.enum(['mock', 'bedrock']),
  })
  .strict();

const SeedMemoryRequestSchema = z
  .object({
    embeddingMode: z.enum(['fixture', 'titan']).default('fixture'),
  })
  .strict();

const CaseIdSchema = z.string().uuid();

export type RunRequest = z.infer<typeof RunRequestSchema>;
export type SeedMemoryRequest = z.infer<typeof SeedMemoryRequestSchema>;

export interface DemoApiDependencies {
  reset(): Promise<unknown>;
  run(input: RunRequest): Promise<unknown>;
  getCase(caseId: string): Promise<unknown | null>;
  seedMemory(input: SeedMemoryRequest): Promise<unknown>;
}

export interface ApiRequest {
  method: string;
  path: string;
  body: string | null;
}

export interface ApiResponse {
  statusCode: number;
  headers: { 'content-type': 'application/json' };
  body: string;
}

export interface DemoApi {
  handle(request: ApiRequest): Promise<ApiResponse>;
}

type BodyParseResult =
  | { ok: true; value: unknown }
  | { ok: false; response: ApiResponse };

function json(statusCode: number, value: unknown): ApiResponse {
  return {
    statusCode,
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(value),
  };
}

function errorResponse(
  statusCode: number,
  code: string,
  message: string,
): ApiResponse {
  return json(statusCode, { error: { code, message } });
}

function parseBody(body: string | null): BodyParseResult {
  if (body === null || body.trim() === '') {
    return { ok: true, value: {} };
  }
  try {
    return { ok: true, value: JSON.parse(body) as unknown };
  } catch {
    return {
      ok: false,
      response: errorResponse(
        400,
        'INVALID_JSON',
        'Request body must be valid JSON.',
      ),
    };
  }
}

function invalidRequest(): ApiResponse {
  return errorResponse(
    400,
    'INVALID_REQUEST',
    'Request body does not match the operation contract.',
  );
}

function isKnownPath(path: string): boolean {
  return (
    path === '/demo/reset' ||
    path === '/demo/run' ||
    path === '/demo/seed-memory' ||
    path.startsWith('/demo/cases/')
  );
}

export function createDemoApi(dependencies: DemoApiDependencies): DemoApi {
  return {
    async handle(request): Promise<ApiResponse> {
      const method = request.method.toUpperCase();
      const caseMatch = /^\/demo\/cases\/([^/]+)$/.exec(request.path);

      if (method === 'POST' && request.path === '/demo/reset') {
        try {
          return json(200, { data: await dependencies.reset() });
        } catch {
          return errorResponse(
            500,
            'INTERNAL_ERROR',
            'The demo operation failed.',
          );
        }
      }

      if (method === 'POST' && request.path === '/demo/run') {
        const body = parseBody(request.body);
        if (!body.ok) return body.response;
        const input = RunRequestSchema.safeParse(body.value);
        if (!input.success) return invalidRequest();
        try {
          return json(200, { data: await dependencies.run(input.data) });
        } catch {
          return errorResponse(
            500,
            'INTERNAL_ERROR',
            'The demo operation failed.',
          );
        }
      }

      if (method === 'GET' && caseMatch) {
        const caseId = CaseIdSchema.safeParse(caseMatch[1]);
        if (!caseId.success) {
          return errorResponse(400, 'INVALID_CASE_ID', 'Case ID must be a UUID.');
        }
        try {
          const trace = await dependencies.getCase(caseId.data);
          return trace === null
            ? errorResponse(404, 'CASE_NOT_FOUND', 'Case not found.')
            : json(200, { data: trace });
        } catch {
          return errorResponse(
            500,
            'INTERNAL_ERROR',
            'The demo operation failed.',
          );
        }
      }

      if (method === 'POST' && request.path === '/demo/seed-memory') {
        const body = parseBody(request.body);
        if (!body.ok) return body.response;
        const input = SeedMemoryRequestSchema.safeParse(body.value);
        if (!input.success) return invalidRequest();
        try {
          return json(200, { data: await dependencies.seedMemory(input.data) });
        } catch {
          return errorResponse(
            500,
            'INTERNAL_ERROR',
            'The demo operation failed.',
          );
        }
      }

      return isKnownPath(request.path)
        ? errorResponse(405, 'METHOD_NOT_ALLOWED', 'Method not allowed.')
        : errorResponse(404, 'ROUTE_NOT_FOUND', 'Route not found.');
    },
  };
}

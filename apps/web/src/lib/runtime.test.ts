import { describe, expect, it, vi } from 'vitest';
import { resolveDemoRuntime, RuntimeConfigurationError } from './runtime.js';

describe('resolveDemoRuntime', () => {
  it('uses fixtures only for the exact true opt-in', async () => {
    const fetchImpl = vi.fn();
    const runtime = resolveDemoRuntime(
      { VITE_USE_FIXTURES: 'true' },
      fetchImpl,
    );

    expect(runtime.fixtureMode).toBe(true);
    await expect(runtime.client.reset()).resolves.toMatchObject({
      case: { orderId: 'ORDER-MUTEX-119' },
    });
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('does not silently treat other truthy-looking values as fixture mode', () => {
    expect(() =>
      resolveDemoRuntime({ VITE_USE_FIXTURES: 'TRUE' }),
    ).toThrow(RuntimeConfigurationError);
  });

  it('requires an API URL outside fixture mode', () => {
    expect(() => resolveDemoRuntime({ VITE_USE_FIXTURES: 'false' })).toThrow(
      'VITE_API_URL is required when fixture mode is disabled.',
    );
  });

  it('constructs the live HTTP client when an API URL is configured', async () => {
    const fetchImpl = vi.fn(async () =>
      Response.json({
        data: {
          case: {
            id: '20000000-0000-4000-8000-000000000001',
            orderId: 'ORDER-MUTEX-119',
            eventType: 'PACKAGE_LOST',
            status: 'OPEN',
            version: 1,
            orderValue: 119,
            summary: 'Package was lost after carrier handoff.',
          },
          committedDecision: null,
          outboxIntent: null,
        },
      }),
    );
    const runtime = resolveDemoRuntime(
      { VITE_API_URL: 'https://api.example.com', VITE_USE_FIXTURES: 'false' },
      fetchImpl,
    );

    expect(runtime.fixtureMode).toBe(false);
    await runtime.client.reset();
    expect(fetchImpl).toHaveBeenCalledOnce();
  });
});

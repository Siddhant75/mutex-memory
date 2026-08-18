import { act, renderHook } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { DemoApiClient, DemoTrace } from './lib/api.js';
import { createFixtureDemoApiClient } from './lib/fixture-api.js';
import { useDemoConsole } from './use-demo-console.js';

describe('useDemoConsole', () => {
  it('owns mode selection and runs the selected story', async () => {
    const client = createFixtureDemoApiClient();
    const { result } = renderHook(() => useDemoConsole(client));

    expect(result.current).toMatchObject({
      mode: 'safe',
      agentMode: 'mock',
      pendingOperation: null,
      trace: null,
      error: null,
    });

    act(() => {
      result.current.setMode('unsafe');
      result.current.setAgentMode('bedrock');
    });
    await act(async () => result.current.run());

    expect(result.current.trace).toMatchObject({
      mode: 'unsafe',
      committedDecision: null,
    });
    expect(result.current.error).toBeNull();
  });

  it('exposes reset as pending until the operation resolves', async () => {
    let resolveReset: ((trace: DemoTrace) => void) | undefined;
    const pendingReset = new Promise<DemoTrace>((resolve) => {
      resolveReset = resolve;
    });
    const fixture = createFixtureDemoApiClient();
    const client: DemoApiClient = {
      reset: vi.fn(() => pendingReset),
      run: fixture.run,
    };
    const { result } = renderHook(() => useDemoConsole(client));

    act(() => {
      void result.current.reset();
    });
    expect(result.current.pendingOperation).toBe('reset');

    const trace = await fixture.reset();
    await act(async () => resolveReset?.(trace));

    expect(result.current.pendingOperation).toBeNull();
    expect(result.current.trace).toEqual(trace);
  });

  it('keeps the last successful trace when a later operation fails', async () => {
    const fixture = createFixtureDemoApiClient();
    const run = vi
      .fn<DemoApiClient['run']>()
      .mockImplementationOnce(fixture.run)
      .mockRejectedValueOnce(new Error('database host and credentials'));
    const client: DemoApiClient = { reset: fixture.reset, run };
    const { result } = renderHook(() => useDemoConsole(client));

    await act(async () => result.current.run());
    const successfulTrace = result.current.trace;
    await act(async () => result.current.run());

    expect(result.current.trace).toBe(successfulTrace);
    expect(result.current.error).toMatchObject({
      code: 'UNEXPECTED_ERROR',
      message: 'The demo operation failed.',
    });
    expect(result.current.error?.message).not.toContain('database');
    expect(result.current.pendingOperation).toBeNull();
  });
});

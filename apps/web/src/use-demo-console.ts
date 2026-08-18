import { useCallback, useState } from 'react';
import {
  DemoApiError,
  type AgentMode,
  type DemoApiClient,
  type DemoMode,
  type DemoRunTrace,
  type DemoTrace,
} from './lib/api.js';

export type DemoConsoleTrace = DemoTrace | DemoRunTrace;
export type PendingOperation = 'reset' | 'run' | null;

function sanitizeError(error: unknown): DemoApiError {
  return error instanceof DemoApiError
    ? error
    : new DemoApiError('UNEXPECTED_ERROR', 'The demo operation failed.');
}

export function useDemoConsole(client: DemoApiClient) {
  const [mode, setMode] = useState<DemoMode>('safe');
  const [agentMode, setAgentMode] = useState<AgentMode>('mock');
  const [pendingOperation, setPendingOperation] =
    useState<PendingOperation>(null);
  const [trace, setTrace] = useState<DemoConsoleTrace | null>(null);
  const [error, setError] = useState<DemoApiError | null>(null);

  const reset = useCallback(async () => {
    setError(null);
    setPendingOperation('reset');
    try {
      setTrace(await client.reset());
    } catch (reason) {
      setError(sanitizeError(reason));
    } finally {
      setPendingOperation(null);
    }
  }, [client]);

  const run = useCallback(async () => {
    setError(null);
    setPendingOperation('run');
    try {
      setTrace(await client.run({ mode, agentMode }));
    } catch (reason) {
      setError(sanitizeError(reason));
    } finally {
      setPendingOperation(null);
    }
  }, [agentMode, client, mode]);

  return {
    mode,
    setMode,
    agentMode,
    setAgentMode,
    pendingOperation,
    trace,
    error,
    reset,
    run,
  };
}

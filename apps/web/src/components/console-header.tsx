import { Play, RotateCcw, ShieldCheck } from 'lucide-react';
import type { AgentMode, DemoMode } from '../lib/api.js';
import type { PendingOperation } from '../use-demo-console.js';

interface ConsoleHeaderProps {
  mode: DemoMode;
  agentMode: AgentMode;
  fixtureMode: boolean;
  pendingOperation: PendingOperation;
  onModeChange(mode: DemoMode): void;
  onAgentModeChange(mode: AgentMode): void;
  onReset(): Promise<void>;
  onRun(): Promise<void>;
}

export function ConsoleHeader({
  mode,
  agentMode,
  fixtureMode,
  pendingOperation,
  onModeChange,
  onAgentModeChange,
  onReset,
  onRun,
}: ConsoleHeaderProps) {
  const disabled = pendingOperation !== null;

  return (
    <header className="console-header">
      <div className="brand-lockup">
        <span className="brand-mark" aria-hidden="true">
          <ShieldCheck size={22} />
        </span>
        <div>
          <h1>Mutex Memory</h1>
          <p>Agentic decision admission console</p>
        </div>
      </div>

      <span className="runtime-badge">
        <span className="runtime-dot" aria-hidden="true" />
        {fixtureMode ? 'Fixture trace' : 'Live API'}
      </span>

      <div className="console-controls">
        <fieldset className="segmented-control" disabled={disabled}>
          <legend>Execution mode</legend>
          {(['safe', 'unsafe'] as const).map((value) => (
            <label key={value} data-active={mode === value}>
              <input
                type="radio"
                name="execution-mode"
                value={value}
                checked={mode === value}
                onChange={() => onModeChange(value)}
              />
              {value === 'safe' ? 'Safe' : 'Unsafe'}
            </label>
          ))}
        </fieldset>

        <fieldset className="segmented-control" disabled={disabled}>
          <legend>Agent runtime</legend>
          {(['mock', 'bedrock'] as const).map((value) => (
            <label key={value} data-active={agentMode === value}>
              <input
                type="radio"
                name="agent-mode"
                value={value}
                checked={agentMode === value}
                onChange={() => onAgentModeChange(value)}
              />
              {value === 'mock' ? 'Mock' : 'Bedrock'}
            </label>
          ))}
        </fieldset>

        <button
          className="button button-secondary"
          type="button"
          disabled={disabled}
          onClick={() => void onReset()}
        >
          <RotateCcw size={15} aria-hidden="true" />
          {pendingOperation === 'reset' ? 'Resetting…' : 'Reset case'}
        </button>
        <button
          className="button button-primary"
          type="button"
          disabled={disabled}
          onClick={() => void onRun()}
        >
          <Play size={15} fill="currentColor" aria-hidden="true" />
          {pendingOperation === 'run' ? 'Running…' : 'Run decision'}
        </button>
      </div>
    </header>
  );
}

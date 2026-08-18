import { AgentsPanel } from './components/agents-panel.js';
import { CasePanel } from './components/case-panel.js';
import { ConsoleHeader } from './components/console-header.js';
import { EvidencePanel } from './components/evidence-panel.js';
import { MemoryPanel } from './components/memory-panel.js';
import { ResultPanel } from './components/result-panel.js';
import { TimelinePanel } from './components/timeline-panel.js';
import type { DemoApiClient, DemoRunTrace, DemoTrace } from './lib/api.js';
import { useDemoConsole } from './use-demo-console.js';

const READY_CASE: DemoTrace['case'] = {
  id: '20000000-0000-4000-8000-000000000001',
  orderId: 'ORDER-MUTEX-119',
  eventType: 'PACKAGE_LOST',
  status: 'OPEN',
  version: 1,
  orderValue: 119,
  summary: 'Package was lost after carrier handoff.',
};

interface AppProps {
  client: DemoApiClient;
  fixtureMode?: boolean;
}

function asRunTrace(trace: DemoTrace | DemoRunTrace | null): DemoRunTrace | null {
  return trace && 'mode' in trace ? trace : null;
}

export function App({ client, fixtureMode = false }: AppProps) {
  const consoleState = useDemoConsole(client);
  const runTrace = asRunTrace(consoleState.trace);

  return (
    <div className="app-shell">
      <ConsoleHeader
        mode={consoleState.mode}
        agentMode={consoleState.agentMode}
        fixtureMode={fixtureMode}
        pendingOperation={consoleState.pendingOperation}
        onModeChange={consoleState.setMode}
        onAgentModeChange={consoleState.setAgentMode}
        onReset={consoleState.reset}
        onRun={consoleState.run}
      />

      <main>
        <div className="context-bar">
          <div>
            <span className="context-kicker">CockroachDB × AWS</span>
            <strong>Exactly-once decisions for competing agents</strong>
          </div>
          <p>Memory informs proposals. The database admits one durable action.</p>
        </div>

        {consoleState.mode === 'unsafe' && (
          <div className="unsafe-banner" role="status">
            <strong>DEMO-ONLY / UNSAFE</strong>
            <span>Commit admission is bypassed to expose the double-action failure.</span>
          </div>
        )}

        {consoleState.error && (
          <div className="error-banner" role="alert">
            <strong>{consoleState.error.code}</strong>
            <span>{consoleState.error.message}</span>
          </div>
        )}

        <div className="console-grid" aria-busy={consoleState.pendingOperation !== null}>
          <CasePanel demoCase={consoleState.trace?.case ?? READY_CASE} />
          <AgentsPanel trace={runTrace} />
          <MemoryPanel
            memories={runTrace?.retrievedMemories ?? []}
            embeddingSource={runTrace?.embeddingSource ?? null}
          />
          <ResultPanel trace={runTrace} />
          <EvidencePanel trace={consoleState.trace} />
          <TimelinePanel events={runTrace?.timelineEvents ?? []} />
        </div>
      </main>
    </div>
  );
}

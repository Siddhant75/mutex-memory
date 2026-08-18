import { Database } from 'lucide-react';
import type { DemoRunTrace, DemoTrace } from '../lib/api.js';

interface EvidencePanelProps {
  trace: DemoTrace | DemoRunTrace | null;
}

export function EvidencePanel({ trace }: EvidencePanelProps) {
  const runTrace = trace && 'mode' in trace ? trace : null;
  const unsafe = runTrace?.mode === 'unsafe';

  return (
    <section className="panel evidence-panel" aria-labelledby="evidence-heading">
      <div className="panel-heading">
        <div>
          <span className="eyebrow">Durable database record</span>
          <h2 id="evidence-heading">Decision evidence</h2>
        </div>
        <Database size={19} aria-hidden="true" />
      </div>
      {!trace?.committedDecision ? (
        <div className="empty-state evidence-empty">
          <strong>
            {unsafe ? 'Not committed in Unsafe mode' : 'No durable decision yet'}
          </strong>
          <span>
            {unsafe
              ? 'No decision or outbox row was written.'
              : 'Run Safe mode to create transactional evidence.'}
          </span>
        </div>
      ) : (
        <div className="evidence-grid">
          <div className="evidence-record">
            <span className="label">Committed decision</span>
            <strong>{trace.committedDecision.action}</strong>
            <code>{trace.committedDecision.id}</code>
            <span>
              v{trace.committedDecision.expectedCaseVersion} → v
              {trace.committedDecision.committedCaseVersion}
            </span>
          </div>
          <div className="evidence-record">
            <span className="label">Outbox intent</span>
            <strong>{trace.outboxIntent?.effectType ?? 'Missing intent'}</strong>
            <code>{trace.outboxIntent?.id ?? '—'}</code>
            <span>{trace.outboxIntent?.status ?? 'UNKNOWN'}</span>
          </div>
          <div className="evidence-record memory-record">
            <span className="label">Resulting memory</span>
            <strong>
              {runTrace?.episodicMemory
                ? 'Episodic memory stored'
                : 'Memory evidence unavailable'}
            </strong>
            <code>{runTrace?.episodicMemory?.id ?? '—'}</code>
            <span>{runTrace?.episodicMemory?.embeddingSource ?? '—'}</span>
          </div>
        </div>
      )}
    </section>
  );
}

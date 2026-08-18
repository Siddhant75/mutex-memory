import { GitCommitHorizontal } from 'lucide-react';
import type { DemoRunTrace } from '../lib/api.js';

interface ResultPanelProps {
  trace: DemoRunTrace | null;
}

export function ResultPanel({ trace }: ResultPanelProps) {
  const isUnsafe = trace?.mode === 'unsafe';
  const outcomes = isUnsafe ? trace.unsafeActions : trace?.commitResults ?? [];

  return (
    <section className="panel result-panel" aria-labelledby="result-heading">
      <div className="panel-heading">
        <div>
          <span className="eyebrow">Serializable gate</span>
          <h2 id="result-heading">Commit result</h2>
        </div>
        <GitCommitHorizontal size={19} aria-hidden="true" />
      </div>
      {!trace ? (
        <p className="empty-state">Awaiting a Safe or Unsafe run.</p>
      ) : (
        <>
          <div className={`result-callout ${isUnsafe ? 'unsafe' : 'safe'}`}>
            <strong>
              {isUnsafe
                ? 'Both conflicting actions accepted'
                : 'Primary resolution admitted'}
            </strong>
            <p>
              {isUnsafe
                ? 'The demo bypassed the database commit gate.'
                : 'CockroachDB committed one winner and normalized the loser.'}
            </p>
          </div>
          <ol className="outcome-list">
            {outcomes.map((outcome, index) => (
              <li key={`${outcome.status}-${index}`}>
                <span>Agent 0{index + 1}</span>
                <strong className={`status-${outcome.status.toLowerCase()}`}>
                  {outcome.status}
                </strong>
              </li>
            ))}
          </ol>
        </>
      )}
    </section>
  );
}

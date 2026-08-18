import { Bot } from 'lucide-react';
import type { DemoRunTrace } from '../lib/api.js';

interface AgentsPanelProps {
  trace: DemoRunTrace | null;
}

const READY_AGENTS = [
  { role: 'Refund Agent', action: 'REFUND' },
  { role: 'Replacement Agent', action: 'REPLACEMENT' },
] as const;

export function AgentsPanel({ trace }: AgentsPanelProps) {
  const proposals = trace?.agentProposals;

  return (
    <section className="panel agents-panel" aria-labelledby="agents-heading">
      <div className="panel-heading">
        <div>
          <span className="eyebrow">Concurrent proposals</span>
          <h2 id="agents-heading">Agents</h2>
        </div>
        <Bot size={19} aria-hidden="true" />
      </div>
      <div className="agent-list">
        {(proposals ?? READY_AGENTS).map((proposal, index) => {
          const role =
            'agentRole' in proposal
              ? proposal.agentRole === 'REFUND_AGENT'
                ? 'Refund Agent'
                : 'Replacement Agent'
              : proposal.role;
          const status =
            trace?.unsafeActions[index]?.status ??
            trace?.commitResults[index]?.status ??
            'READY';
          return (
            <article className="agent-row" key={role}>
              <span className="agent-index">0{index + 1}</span>
              <div className="agent-copy">
                <h3>{role}</h3>
                <p>
                  {'shortExplanation' in proposal
                    ? proposal.shortExplanation
                    : `Prepared to propose ${proposal.action.toLowerCase()}.`}
                </p>
              </div>
              <div className="agent-outcome">
                <strong>{proposal.action}</strong>
                <span className={`status-chip status-${status.toLowerCase()}`}>
                  {status}
                </span>
              </div>
            </article>
          );
        })}
      </div>
    </section>
  );
}

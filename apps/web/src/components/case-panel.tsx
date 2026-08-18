import { Box } from 'lucide-react';
import type { DemoTrace } from '../lib/api.js';

interface CasePanelProps {
  demoCase: DemoTrace['case'];
}

export function CasePanel({ demoCase }: CasePanelProps) {
  return (
    <section className="panel case-panel" aria-labelledby="case-heading">
      <div className="panel-heading">
        <div>
          <span className="eyebrow">Input state</span>
          <h2 id="case-heading">Current case</h2>
        </div>
        <Box size={19} aria-hidden="true" />
      </div>
      <div className="case-identity">
        <div>
          <span className="label">Order</span>
          <strong>{demoCase.orderId}</strong>
        </div>
        <span className={`status-chip status-${demoCase.status.toLowerCase()}`}>
          {demoCase.status}
        </span>
      </div>
      <p className="case-summary">{demoCase.summary}</p>
      <dl className="metric-row">
        <div>
          <dt>Event</dt>
          <dd>{demoCase.eventType}</dd>
        </div>
        <div>
          <dt>Order value</dt>
          <dd>${demoCase.orderValue.toFixed(2)}</dd>
        </div>
        <div>
          <dt>Case version</dt>
          <dd>Version {demoCase.version}</dd>
        </div>
      </dl>
    </section>
  );
}

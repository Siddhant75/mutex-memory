import { ListChecks } from 'lucide-react';
import type { DemoRunTrace } from '../lib/api.js';

interface TimelinePanelProps {
  events: DemoRunTrace['timelineEvents'];
}

export function TimelinePanel({ events }: TimelinePanelProps) {
  return (
    <section className="panel timeline-panel" aria-labelledby="timeline-heading">
      <div className="panel-heading">
        <div>
          <span className="eyebrow">Operation trace</span>
          <h2 id="timeline-heading">Timeline</h2>
        </div>
        <ListChecks size={19} aria-hidden="true" />
      </div>
      {events.length === 0 ? (
        <p className="empty-state">The run trace will appear here.</p>
      ) : (
        <ol className="timeline-list">
          {events.map((event, index) => (
            <li key={`${event.type}-${index}`}>
              <span className="timeline-marker" aria-hidden="true" />
              <div>
                <strong>{event.type.replaceAll('_', ' ')}</strong>
                <p>{event.detail}</p>
              </div>
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}

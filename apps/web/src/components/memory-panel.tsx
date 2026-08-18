import { BrainCircuit } from 'lucide-react';
import type { DemoRunTrace } from '../lib/api.js';

interface MemoryPanelProps {
  memories: DemoRunTrace['retrievedMemories'];
  embeddingSource: DemoRunTrace['embeddingSource'] | null;
}

export function MemoryPanel({ memories, embeddingSource }: MemoryPanelProps) {
  return (
    <section className="panel memory-panel" aria-labelledby="memory-heading">
      <div className="panel-heading">
        <div>
          <span className="eyebrow">Vector evidence</span>
          <h2 id="memory-heading">Retrieved memory</h2>
        </div>
        <BrainCircuit size={19} aria-hidden="true" />
      </div>
      <div className="panel-meta">
        <span>{memories.length || '—'} episodes</span>
        <span>{embeddingSource ?? 'Awaiting query'}</span>
      </div>
      {memories.length === 0 ? (
        <p className="empty-state">Run the decision to retrieve similar outcomes.</p>
      ) : (
        <ol className="memory-list">
          {memories.map((memory, index) => (
            <li key={memory.id}>
              <div className="memory-rank">0{index + 1}</div>
              <div className="memory-copy">
                <div className="memory-title">
                  <strong>{memory.resolution}</strong>
                  <span>{(memory.distance * 100).toFixed(1)} distance</span>
                </div>
                <p>{memory.summary}</p>
                <small>{memory.outcome}</small>
              </div>
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}

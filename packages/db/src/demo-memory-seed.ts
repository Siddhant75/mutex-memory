import type { MemoryEpisode } from '@mutex-memory/contracts';
import type { Pool } from 'pg';
import { upsertMemoryEpisode } from './repositories/memory-repository.js';

const SEMANTIC_FEATURES = [
  'lost',
  'carrierConfirmed',
  'refund',
  'replacement',
  'highValue',
  'damaged',
  'delayed',
  'addressIssue',
  'manualReview',
  'successfulOutcome',
] as const;

type SemanticFeature = (typeof SEMANTIC_FEATURES)[number];
type FeatureWeights = Partial<Record<SemanticFeature, number>>;

function normalizedFixtureEmbedding(weights: FeatureWeights): number[] {
  const embedding = Array<number>(512).fill(0);
  for (const [index, feature] of SEMANTIC_FEATURES.entries()) {
    const weight = weights[feature];
    if (weight !== undefined) {
      embedding[index] = weight;
    }
  }

  const magnitude = Math.sqrt(
    embedding.reduce((sum, value) => sum + value ** 2, 0),
  );
  if (magnitude === 0) {
    throw new Error('Fixture embedding requires at least one semantic feature');
  }
  return embedding.map((value) => value / magnitude);
}

export const DEMO_LOST_PACKAGE_QUERY_EMBEDDING = normalizedFixtureEmbedding({
  lost: 3,
  carrierConfirmed: 2,
  refund: 1,
  replacement: 1,
});

export const DEMO_MEMORY_EPISODES: readonly MemoryEpisode[] = [
  {
    id: '10000000-0000-4000-8000-000000000001',
    caseId: null,
    summary: 'Carrier confirmed a lost package after handoff for a standard-value order.',
    resolution: 'REPLACEMENT',
    outcome: 'Replacement arrived successfully within two days.',
    metadata: { fixture: true, carrier: 'Northstar', scenario: 'confirmed_loss' },
    embedding: normalizedFixtureEmbedding({
      lost: 3,
      carrierConfirmed: 2,
      replacement: 2,
      successfulOutcome: 1,
    }),
  },
  {
    id: '10000000-0000-4000-8000-000000000002',
    caseId: null,
    summary: 'Carrier confirmed a lost package and the customer could not wait for replacement.',
    resolution: 'REFUND',
    outcome: 'Refund completed and the case closed without escalation.',
    metadata: { fixture: true, carrier: 'Northstar', scenario: 'confirmed_loss' },
    embedding: normalizedFixtureEmbedding({
      lost: 3,
      carrierConfirmed: 2,
      refund: 2,
      successfulOutcome: 1,
    }),
  },
  {
    id: '10000000-0000-4000-8000-000000000003',
    caseId: null,
    summary: 'High-value package was lost after carrier handoff with incomplete scan evidence.',
    resolution: 'MANUAL_REVIEW',
    outcome: 'Operations verified the carrier trace before approving a refund.',
    metadata: { fixture: true, scenario: 'high_value_loss', orderValue: 840 },
    embedding: normalizedFixtureEmbedding({
      lost: 3,
      highValue: 2,
      manualReview: 2,
    }),
  },
  {
    id: '10000000-0000-4000-8000-000000000004',
    caseId: null,
    summary: 'Package arrived with severe product damage documented by the customer.',
    resolution: 'REPLACEMENT',
    outcome: 'Replacement arrived undamaged and customer satisfaction recovered.',
    metadata: { fixture: true, scenario: 'damaged_delivery' },
    embedding: normalizedFixtureEmbedding({
      damaged: 3,
      replacement: 2,
      successfulOutcome: 1,
    }),
  },
  {
    id: '10000000-0000-4000-8000-000000000005',
    caseId: null,
    summary: 'Shipment was delayed for four days but continued receiving carrier scans.',
    resolution: 'REPLACEMENT',
    outcome: 'Original shipment arrived before replacement dispatch and the duplicate was cancelled.',
    metadata: { fixture: true, scenario: 'active_delay' },
    embedding: normalizedFixtureEmbedding({ delayed: 3, replacement: 1 }),
  },
  {
    id: '10000000-0000-4000-8000-000000000006',
    caseId: null,
    summary: 'Carrier scan stalled after handoff and trace later confirmed package loss.',
    resolution: 'REFUND',
    outcome: 'Customer received a prompt refund after trace confirmation.',
    metadata: { fixture: true, scenario: 'stalled_scan' },
    embedding: normalizedFixtureEmbedding({
      lost: 2,
      carrierConfirmed: 2,
      delayed: 1,
      refund: 2,
      successfulOutcome: 1,
    }),
  },
  {
    id: '10000000-0000-4000-8000-000000000007',
    caseId: null,
    summary: 'Priority customer reported a confirmed lost package needed for an event.',
    resolution: 'REPLACEMENT',
    outcome: 'Expedited replacement arrived before the customer event.',
    metadata: { fixture: true, scenario: 'priority_loss', customerTier: 'GOLD' },
    embedding: normalizedFixtureEmbedding({
      lost: 3,
      carrierConfirmed: 2,
      replacement: 3,
      successfulOutcome: 2,
    }),
  },
  {
    id: '10000000-0000-4000-8000-000000000008',
    caseId: null,
    summary: 'Delivery was marked complete but recipient disputed the address and possession.',
    resolution: 'MANUAL_REVIEW',
    outcome: 'Address evidence identified a neighboring building and the package was recovered.',
    metadata: { fixture: true, scenario: 'address_dispute' },
    embedding: normalizedFixtureEmbedding({ addressIssue: 3, manualReview: 2 }),
  },
  {
    id: '10000000-0000-4000-8000-000000000009',
    caseId: null,
    summary: 'Low-value order was damaged and replacement inventory was unavailable.',
    resolution: 'REFUND',
    outcome: 'Refund completed immediately with no further customer contact.',
    metadata: { fixture: true, scenario: 'damaged_no_inventory' },
    embedding: normalizedFixtureEmbedding({
      damaged: 3,
      refund: 2,
      successfulOutcome: 1,
    }),
  },
  {
    id: '10000000-0000-4000-8000-000000000010',
    caseId: null,
    summary: 'High-value shipment remained delayed with contradictory carrier location scans.',
    resolution: 'MANUAL_REVIEW',
    outcome: 'Operations prevented a duplicate payout while the carrier investigation completed.',
    metadata: { fixture: true, scenario: 'contradictory_scans', orderValue: 1290 },
    embedding: normalizedFixtureEmbedding({
      highValue: 2,
      delayed: 2,
      manualReview: 3,
    }),
  },
];

export async function seedDemoMemory(pool: Pool): Promise<{ episodeCount: number }> {
  for (const episode of DEMO_MEMORY_EPISODES) {
    await upsertMemoryEpisode(pool, episode);
  }
  return { episodeCount: DEMO_MEMORY_EPISODES.length };
}

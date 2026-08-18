CREATE TABLE IF NOT EXISTS cases (
  id UUID PRIMARY KEY,
  order_id STRING NOT NULL,
  event_type STRING NOT NULL,
  status STRING NOT NULL,
  version INT8 NOT NULL DEFAULT 1 CHECK (version > 0),
  customer_tier STRING NULL,
  order_value DECIMAL(18,2) NOT NULL CHECK (order_value >= 0),
  carrier STRING NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS case_decisions (
  id UUID PRIMARY KEY,
  case_id UUID NOT NULL REFERENCES cases(id),
  proposal_id UUID NULL,
  action STRING NOT NULL,
  action_group STRING NOT NULL,
  expected_case_version INT8 NOT NULL,
  committed_case_version INT8 NOT NULL,
  reason_codes STRING[] NOT NULL,
  memory_ids UUID[] NOT NULL DEFAULT ARRAY[]::UUID[],
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT one_action_group_per_case UNIQUE (case_id, action_group)
);

CREATE TABLE IF NOT EXISTS action_outbox (
  id UUID PRIMARY KEY,
  case_id UUID NOT NULL REFERENCES cases(id),
  decision_id UUID NOT NULL REFERENCES case_decisions(id),
  idempotency_key STRING NOT NULL UNIQUE,
  effect_type STRING NOT NULL,
  payload JSONB NOT NULL,
  status STRING NOT NULL DEFAULT 'PENDING',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  published_at TIMESTAMPTZ NULL
);

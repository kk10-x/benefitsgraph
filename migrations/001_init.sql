-- Core schema for BenefitsGraph

CREATE TABLE insurers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL UNIQUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- One policy per employer plan. `rules` holds the versioned policy DSL (see src/rules).
CREATE TABLE policies (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  insurer_id UUID NOT NULL REFERENCES insurers(id),
  employer_name TEXT NOT NULL,
  plan_name TEXT NOT NULL,
  version INT NOT NULL DEFAULT 1,
  rules JSONB NOT NULL,
  effective_from DATE NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (employer_name, plan_name, version)
);

CREATE TABLE employees (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  external_id TEXT NOT NULL UNIQUE,
  full_name TEXT NOT NULL,
  policy_id UUID NOT NULL REFERENCES policies(id),
  enrolled_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  waiting_period_ends_at DATE NOT NULL
);

CREATE TABLE claims (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id UUID NOT NULL REFERENCES employees(id),
  claim_type TEXT NOT NULL,
  billed_amount_paise BIGINT NOT NULL CHECK (billed_amount_paise >= 0),
  provider_ref TEXT,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'partial', 'denied')),
  approved_amount_paise BIGINT,
  reason_codes TEXT[] NOT NULL DEFAULT '{}',
  idempotency_key TEXT NOT NULL UNIQUE,
  submitted_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  adjudicated_at TIMESTAMPTZ
);

CREATE INDEX idx_claims_employee_id ON claims(employee_id);

-- Append-only audit trail for every claim state transition.
CREATE TABLE audit_log (
  id BIGSERIAL PRIMARY KEY,
  claim_id UUID NOT NULL REFERENCES claims(id),
  event TEXT NOT NULL,
  detail JSONB NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_audit_log_claim_id ON audit_log(claim_id);

CREATE EXTENSION IF NOT EXISTS pgcrypto;

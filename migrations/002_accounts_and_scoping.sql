-- Ephemeral API accounts (guest sandboxes) + per-account data scoping.

CREATE TABLE accounts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  api_key_hash TEXT NOT NULL UNIQUE,
  label TEXT NOT NULL DEFAULT 'guest',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_seen_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_accounts_last_seen ON accounts(last_seen_at);

-- Scope enrolments to the account that created them, so each guest gets an
-- isolated sandbox and two guests can both use the same example external_id.
ALTER TABLE employees ADD COLUMN account_id UUID REFERENCES accounts(id) ON DELETE CASCADE;
ALTER TABLE employees DROP CONSTRAINT IF EXISTS employees_external_id_key;
ALTER TABLE employees ADD CONSTRAINT employees_account_external_id_key UNIQUE (account_id, external_id);

-- Scope claims too, and cascade deletes so pruning an account wipes all its data.
ALTER TABLE claims ADD COLUMN account_id UUID REFERENCES accounts(id) ON DELETE CASCADE;
ALTER TABLE claims DROP CONSTRAINT IF EXISTS claims_idempotency_key_key;
ALTER TABLE claims ADD CONSTRAINT claims_account_idempotency_key UNIQUE (account_id, idempotency_key);
ALTER TABLE claims DROP CONSTRAINT IF EXISTS claims_employee_id_fkey;
ALTER TABLE claims ADD CONSTRAINT claims_employee_id_fkey
  FOREIGN KEY (employee_id) REFERENCES employees(id) ON DELETE CASCADE;

ALTER TABLE audit_log DROP CONSTRAINT IF EXISTS audit_log_claim_id_fkey;
ALTER TABLE audit_log ADD CONSTRAINT audit_log_claim_id_fkey
  FOREIGN KEY (claim_id) REFERENCES claims(id) ON DELETE CASCADE;

-- Enforce "every row belongs to an account" in the schema, not just in app code.
-- Postgres treats NULLs as distinct in UNIQUE constraints, so an unscoped row would
-- both bypass the uniqueness rules above and be invisible to every scoped query.
-- Rows predating scoping can never be read under the new model, so they are removed
-- rather than left as unreachable orphans (deleting claims cascades to audit_log).
DELETE FROM claims WHERE account_id IS NULL;
DELETE FROM employees WHERE account_id IS NULL;
ALTER TABLE claims ALTER COLUMN account_id SET NOT NULL;
ALTER TABLE employees ALTER COLUMN account_id SET NOT NULL;

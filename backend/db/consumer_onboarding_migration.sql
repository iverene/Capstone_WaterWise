-- Consumer first-login onboarding
--
-- Adds the flag the consumer portal uses to decide whether the first-login
-- onboarding screen still has to be shown.
--
-- Grandfathering: the column is added with DEFAULT TRUE so every existing
-- resident is treated as already onboarded and is not interrupted on their
-- next login. The default is then flipped to FALSE so accounts created after
-- this migration start with onboarding pending.
--
-- Idempotent: ADD COLUMN IF NOT EXISTS is a no-op on re-run, and
-- ALTER COLUMN ... SET DEFAULT never rewrites existing rows. Re-running this
-- file will not reset a consumer who already completed onboarding.

BEGIN;

ALTER TABLE consumers
  ADD COLUMN IF NOT EXISTS onboarding_completed BOOLEAN NOT NULL DEFAULT TRUE;

ALTER TABLE consumers
  ALTER COLUMN onboarding_completed SET DEFAULT FALSE;

COMMIT;

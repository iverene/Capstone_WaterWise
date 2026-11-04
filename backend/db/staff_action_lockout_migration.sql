-- Keep Super Admin step-up password failures separate from normal login failures.
-- Run this once in the Supabase SQL Editor for existing installations.
ALTER TABLE admins
  ADD COLUMN IF NOT EXISTS staff_action_failed_attempts INTEGER NOT NULL DEFAULT 0;

ALTER TABLE admins
  ADD COLUMN IF NOT EXISTS staff_action_locked_until TIMESTAMPTZ;

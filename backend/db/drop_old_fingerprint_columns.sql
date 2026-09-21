-- Drop the old single-column device_fingerprint_hash from account tables.
-- The user_device_sessions junction table is now the sole source of truth.
-- Run this AFTER multi_device_migration.sql has been executed and verified.

ALTER TABLE admins DROP COLUMN IF EXISTS device_fingerprint_hash;
ALTER TABLE consumers DROP COLUMN IF EXISTS device_fingerprint_hash;
ALTER TABLE meter_readers DROP COLUMN IF EXISTS device_fingerprint_hash;

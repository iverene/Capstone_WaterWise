-- Add device_fingerprint_hash column to all account tables
ALTER TABLE admins ADD COLUMN IF NOT EXISTS device_fingerprint_hash VARCHAR(64);
ALTER TABLE consumers ADD COLUMN IF NOT EXISTS device_fingerprint_hash VARCHAR(64);
ALTER TABLE meter_readers ADD COLUMN IF NOT EXISTS device_fingerprint_hash VARCHAR(64);

-- Supports resident notification retrieval from the account creation time
-- onward. Existing notification rows are preserved.
BEGIN;

CREATE INDEX IF NOT EXISTS notifications_consumer_created_at_idx
ON notifications (consumer_id, created_at DESC);

COMMIT;

-- Test-only seed for consumer_id = 1.
-- Creates three completed historical months plus an October 1 latest reading:
--   Jul 23: 50 -> 62 = 12 m3
--   Aug 23: 62 -> 79 = 17 m3
--   Sep 23: 79 -> 99 = 20 m3
--   Oct 1 : 99 -> 100 = 1 m3
--
-- The three-month average used by the replacement rules is:
--   (12 + 17 + 20) / 3 = 16.33, rounded up to 17 m3.
--
-- This script refuses to run if the consumer or any target month is missing or
-- already has a reading. It does not delete or overwrite existing data.

BEGIN;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM consumers WHERE id = 1
  ) THEN
    RAISE EXCEPTION 'Test seed stopped: consumer_id 1 does not exist.';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM consumption
    WHERE consumer_id = 1
      AND reading_date IN (
        DATE '2026-07-23',
        DATE '2026-08-23',
        DATE '2026-09-23',
        DATE '2026-10-01'
      )
  ) THEN
    RAISE EXCEPTION
      'Test seed stopped: consumer_id 1 already has one or more target readings.';
  END IF;
END
$$;

INSERT INTO consumption (
  consumer_id,
  reading_date,
  previous_reading,
  present_reading,
  consumption,
  reading_source,
  carried_consumption,
  prior_usage_basis,
  new_baseline,
  meter_incident_id,
  idempotency_key
)
VALUES
  (1, DATE '2026-07-23', 50, 62, 12, 'actual', 0, NULL, NULL, NULL, 'test-consumer-1-2026-07-23'),
  (1, DATE '2026-08-23', 62, 79, 17, 'actual', 0, NULL, NULL, NULL, 'test-consumer-1-2026-08-23'),
  (1, DATE '2026-09-23', 79, 99, 20, 'actual', 0, NULL, NULL, NULL, 'test-consumer-1-2026-09-23'),
  (1, DATE '2026-10-01', 99, 100, 1, 'actual', 0, NULL, NULL, NULL, 'test-consumer-1-2026-10-01');

COMMIT;

SELECT
  id,
  consumer_id,
  reading_date,
  previous_reading,
  present_reading,
  consumption,
  reading_source
FROM consumption
WHERE consumer_id = 1
  AND reading_date IN (
    DATE '2026-07-23',
    DATE '2026-08-23',
    DATE '2026-09-23',
    DATE '2026-10-01'
  )
ORDER BY reading_date;

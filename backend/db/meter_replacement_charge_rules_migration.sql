-- Replacement charge-basis values used by the server-side meter incident
-- calculation:
--   previous_consumption  same-day replacement
--   minimum_charge        replacement 1-15 days after the latest reading
--   three_month_average   replacement from day 16 onward
-- Existing incident rows remain valid.

ALTER TABLE meter_incidents
  DROP CONSTRAINT IF EXISTS meter_incidents_prior_usage_basis_check;

ALTER TABLE meter_incidents
  ADD CONSTRAINT meter_incidents_prior_usage_basis_check
  CHECK (prior_usage_basis IN (
    'final_reading',
    'reported',
    'average',
    'previous_consumption',
    'previous_reading_fallback',
    'zero_carry',
    'minimum_charge',
    'three_month_average'
  ));

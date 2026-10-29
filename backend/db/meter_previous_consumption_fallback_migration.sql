-- Meter incidents now carry the consumer's latest completed consumption when
-- the old meter closing value is unchanged or below its previous reading.
-- Existing basis values remain valid for historical records.

ALTER TABLE meter_incidents
  DROP CONSTRAINT IF EXISTS meter_incidents_prior_usage_basis_check;

ALTER TABLE meter_incidents
  ADD CONSTRAINT meter_incidents_prior_usage_basis_check
  CHECK (prior_usage_basis IN (
    'final_reading',
    'reported',
    'average',
    'previous_consumption'
  ));

-- Removes obsolete AI anomaly cache entries and narrows the shared cache to
-- the prediction and recommendation features that remain active.
BEGIN;

DELETE FROM ai_consumption_cache
WHERE result_type = 'anomaly';

ALTER TABLE ai_consumption_cache
DROP CONSTRAINT IF EXISTS ai_consumption_cache_result_type_check;

ALTER TABLE ai_consumption_cache
ADD CONSTRAINT ai_consumption_cache_result_type_check
CHECK (result_type IN ('prediction', 'recommendation'));

COMMIT;

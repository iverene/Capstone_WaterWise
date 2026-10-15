-- TIERED WATER RATE MIGRATION
-- Applies the Sucol tiered schedule from image/image.png:
--   Minimum (5) P270 | Excess 6-15 P17 | Excess 16-25 P20 | Excess 26-50 P23 | Excess 51+ P25
-- Run AFTER migration.sql + system_settings_migration.sql. Idempotent, safe to re-run.
-- Existing bills are NOT recalculated; only new readings use the tiers.

-- 1. Drop the retired flat rate, then seed tier settings.
DELETE FROM system_settings WHERE setting_key = 'rate_per_cubic_meter';

INSERT INTO system_settings (setting_key, setting_value, description) VALUES
  ('minimum_charge', 270.00, 'Flat charge covering the first minimum_m3 cubic meters'),
  ('minimum_m3', 5.00, 'Cubic meters covered by the minimum charge'),
  ('rate_6_15', 17.00, 'Per-m3 rate for consumption 6-15'),
  ('rate_16_25', 20.00, 'Per-m3 rate for consumption 16-25'),
  ('rate_26_50', 23.00, 'Per-m3 rate for consumption 26-50'),
  ('rate_51_up', 25.00, 'Per-m3 rate for consumption 51 and up')
ON CONFLICT (setting_key) DO NOTHING;

-- 2. Pure tier calculator shared by billing paths.
CREATE OR REPLACE FUNCTION compute_water_bill(p_consumption NUMERIC)
RETURNS NUMERIC(10,2)
LANGUAGE plpgsql
IMMUTABLE
AS $$
DECLARE
  v_remaining NUMERIC(10,2) := GREATEST(COALESCE(p_consumption, 0), 0);
  v_total NUMERIC(10,2) := 270.00;
  v_min NUMERIC(10,2) := 5;
  v_r1 NUMERIC(10,2) := 17.00;
  v_r2 NUMERIC(10,2) := 20.00;
  v_r3 NUMERIC(10,2) := 23.00;
  v_r4 NUMERIC(10,2) := 25.00;
BEGIN
  SELECT setting_value INTO v_min FROM public.system_settings WHERE setting_key = 'minimum_m3';
  IF v_min IS NULL OR v_min < 0 THEN v_min := 5; END IF;
  IF v_remaining <= v_min THEN
    SELECT setting_value INTO v_total FROM public.system_settings WHERE setting_key = 'minimum_charge';
    IF v_total IS NULL OR v_total < 0 THEN v_total := 270.00; END IF;
    RETURN ROUND(v_total, 2);
  END IF;

  SELECT setting_value INTO v_total FROM public.system_settings WHERE setting_key = 'minimum_charge';
  IF v_total IS NULL OR v_total < 0 THEN v_total := 270.00; END IF;
  SELECT setting_value INTO v_r1 FROM public.system_settings WHERE setting_key = 'rate_6_15';
  IF v_r1 IS NULL OR v_r1 < 0 THEN v_r1 := 17.00; END IF;
  SELECT setting_value INTO v_r2 FROM public.system_settings WHERE setting_key = 'rate_16_25';
  IF v_r2 IS NULL OR v_r2 < 0 THEN v_r2 := 20.00; END IF;
  SELECT setting_value INTO v_r3 FROM public.system_settings WHERE setting_key = 'rate_26_50';
  IF v_r3 IS NULL OR v_r3 < 0 THEN v_r3 := 23.00; END IF;
  SELECT setting_value INTO v_r4 FROM public.system_settings WHERE setting_key = 'rate_51_up';
  IF v_r4 IS NULL OR v_r4 < 0 THEN v_r4 := 25.00; END IF;

  v_remaining := v_remaining - v_min;
  v_total := v_total + LEAST(v_remaining, 10) * v_r1;
  v_remaining := v_remaining - LEAST(v_remaining, 10);
  v_total := v_total + LEAST(v_remaining, 10) * v_r2;
  v_remaining := v_remaining - LEAST(v_remaining, 10);
  v_total := v_total + LEAST(v_remaining, 25) * v_r3;
  v_remaining := v_remaining - LEAST(v_remaining, 25);
  v_total := v_total + v_remaining * v_r4;
  RETURN ROUND(v_total, 2);
END;
$$;

REVOKE ALL ON FUNCTION compute_water_bill(NUMERIC) FROM PUBLIC;
REVOKE ALL ON FUNCTION compute_water_bill(NUMERIC) FROM anon;
REVOKE ALL ON FUNCTION compute_water_bill(NUMERIC) FROM authenticated;
GRANT EXECUTE ON FUNCTION compute_water_bill(NUMERIC) TO service_role;

-- 3. Point the consumption->billing trigger function at the tiers.
--    Re-create with the same signature so existing grants stay valid.
CREATE OR REPLACE FUNCTION record_consumption_and_billing(
    p_consumer_id INTEGER,
    p_present_reading NUMERIC,
    p_initial_previous_reading NUMERIC,
    p_idempotency_key TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_consumer consumers%ROWTYPE;
    v_latest consumption%ROWTYPE;
    v_reading consumption%ROWTYPE;
    v_billing billing%ROWTYPE;
    v_previous NUMERIC(10,2);
    v_total NUMERIC(10,2);
    v_reading_date DATE := (CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Manila')::DATE;
BEGIN
    IF p_consumer_id IS NULL OR p_present_reading IS NULL OR NULLIF(TRIM(p_idempotency_key), '') IS NULL THEN
        RAISE EXCEPTION 'Consumer, present reading, and request key are required.';
    END IF;
    IF p_present_reading < 0 OR (p_initial_previous_reading IS NOT NULL AND p_initial_previous_reading < 0) THEN
        RAISE EXCEPTION 'Meter readings must be non-negative numbers.';
    END IF;

    PERFORM pg_advisory_xact_lock(p_consumer_id);

    SELECT * INTO v_consumer FROM consumers WHERE id = p_consumer_id;
    IF NOT FOUND THEN RAISE EXCEPTION 'Consumer account not found.' USING ERRCODE = '23503'; END IF;
    IF COALESCE(v_consumer.status, 'active') <> 'active' THEN
        RAISE EXCEPTION 'Readings cannot be recorded for an inactive consumer.';
    END IF;
    IF v_consumer.purok_no IS NULL THEN
        RAISE EXCEPTION 'Assign the consumer to a purok before recording a reading.';
    END IF;

    SELECT * INTO v_reading
    FROM consumption
    WHERE idempotency_key = p_idempotency_key;
    IF FOUND THEN
        IF v_reading.consumer_id <> p_consumer_id
           OR v_reading.reading_date <> v_reading_date
           OR v_reading.present_reading <> ROUND(p_present_reading, 2) THEN
            RAISE EXCEPTION 'This reading request key was already used for different details.';
        END IF;
        SELECT * INTO v_billing FROM billing WHERE consumption_id = v_reading.id;
        RETURN jsonb_build_object(
            'id', v_reading.id,
            'consumer_id', v_reading.consumer_id,
            'reading_date', v_reading.reading_date,
            'previous_reading', v_reading.previous_reading,
            'present_reading', v_reading.present_reading,
            'consumption', v_reading.consumption,
            'created_at', v_reading.created_at,
            'billing', to_jsonb(v_billing)
        );
    END IF;

    IF EXISTS (
        SELECT 1 FROM consumption
        WHERE consumer_id = p_consumer_id
          AND EXTRACT(YEAR FROM reading_date) = EXTRACT(YEAR FROM v_reading_date)
          AND EXTRACT(MONTH FROM reading_date) = EXTRACT(MONTH FROM v_reading_date)
    ) THEN
        RAISE EXCEPTION 'This consumer already has a consumption reading for the selected month.' USING ERRCODE = '23505';
    END IF;

    SELECT * INTO v_latest
    FROM consumption
    WHERE consumer_id = p_consumer_id
    ORDER BY reading_date DESC, id DESC
    LIMIT 1;

    IF FOUND THEN
        IF p_initial_previous_reading IS NOT NULL THEN
            RAISE EXCEPTION 'An initial previous reading may only be supplied for a consumer with no previous record.';
        END IF;
        IF v_reading_date <= v_latest.reading_date THEN
            RAISE EXCEPTION 'A reading has already been recorded for this consumer today or later.';
        END IF;
        v_previous := v_latest.present_reading;
    ELSE
        IF p_initial_previous_reading IS NULL THEN
            RAISE EXCEPTION 'Enter the previous logbook reading for this consumer''s first digital record.';
        END IF;
        v_previous := p_initial_previous_reading;
    END IF;

    IF p_present_reading < v_previous THEN
        RAISE EXCEPTION 'Present reading cannot be lower than the previous reading.';
    END IF;

    INSERT INTO consumption (consumer_id, reading_date, previous_reading, present_reading, idempotency_key)
    VALUES (p_consumer_id, v_reading_date, v_previous, p_present_reading, p_idempotency_key)
    RETURNING * INTO v_reading;

    -- Tiered billing: existing bills retain their totals.
    v_total := compute_water_bill(v_reading.consumption);
    INSERT INTO billing (
        consumption_id, user_id, billing_date, due_date, total_bill,
        remaining_balance, status
    ) VALUES (
        v_reading.id, p_consumer_id, v_reading_date,
        (date_trunc('month', v_reading_date) + INTERVAL '1 month - 1 day')::DATE,
        v_total, v_total, 'Unpaid'
    ) RETURNING * INTO v_billing;

    RETURN jsonb_build_object(
        'id', v_reading.id,
        'consumer_id', v_reading.consumer_id,
        'reading_date', v_reading.reading_date,
        'previous_reading', v_reading.previous_reading,
        'present_reading', v_reading.present_reading,
        'consumption', v_reading.consumption,
        'created_at', v_reading.created_at,
        'billing', to_jsonb(v_billing)
    );
END;
$$;

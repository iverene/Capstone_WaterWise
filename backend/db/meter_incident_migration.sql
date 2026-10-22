-- ============================================================================
-- Meter replacement / reset + average-based billing
--
-- Run in the Supabase SQL Editor against STAGING first, then production.
-- Requires: full_setup_migration.sql (consumption, billing, system_settings).
--
-- This migration:
--   1. seeds the average-billing settings
--   2. creates meter_incidents (admin pre-authorization + field discovery)
--   3. adds reading provenance to consumption
--   4. converts consumption.consumption from a generated column to a stored one
--   5. replaces record_consumption_and_billing with an incident-aware version
-- ============================================================================

BEGIN;

-- ---------------------------------------------------------------------------
-- 1. Settings
-- ---------------------------------------------------------------------------
INSERT INTO system_settings (setting_key, setting_value, description) VALUES
  ('average_window_months', 3, 'Number of actual readings used for the average billing basis.'),
  ('incident_authorization_days', 30, 'Days a meter incident authorization stays valid.')
ON CONFLICT (setting_key) DO NOTHING;

-- ---------------------------------------------------------------------------
-- 2. Meter incidents
--
-- status        lifecycle of the incident authorization
-- review_status review state of an incident declared in the field
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS meter_incidents (
    id                SERIAL PRIMARY KEY,
    consumer_id       INTEGER NOT NULL REFERENCES consumers (id) ON DELETE CASCADE,
    incident_type     TEXT NOT NULL DEFAULT 'replacement'
                      CHECK (incident_type IN ('replacement', 'reset', 'defective')),
    effective_date    DATE NOT NULL DEFAULT CURRENT_DATE,

    old_meter_serial  TEXT,
    old_final_reading NUMERIC(10,2) CHECK (old_final_reading IS NULL OR old_final_reading >= 0),

    prior_usage       NUMERIC(10,2) NOT NULL CHECK (prior_usage >= 0),
    prior_usage_basis TEXT NOT NULL
                      CHECK (prior_usage_basis IN ('final_reading', 'reported', 'average')),
    average_window    INTEGER,
    average_value     NUMERIC(10,2),

    new_meter_serial  TEXT,
    new_baseline      NUMERIC(10,2) NOT NULL DEFAULT 0 CHECK (new_baseline >= 0),

    status            TEXT NOT NULL DEFAULT 'pending'
                      CHECK (status IN ('pending', 'authorized', 'consumed', 'rejected', 'expired')),
    review_status     TEXT NOT NULL DEFAULT 'pending'
                      CHECK (review_status IN ('pending', 'approved', 'rejected')),
    source            TEXT NOT NULL CHECK (source IN ('admin', 'meter_reader')),

    recorded_by_id    INTEGER NOT NULL,
    recorded_by_role  TEXT NOT NULL,
    approved_by_id    INTEGER,
    approved_at       TIMESTAMPTZ,
    rejected_reason   TEXT,
    expires_at        TIMESTAMPTZ,
    notes             TEXT,
    idempotency_key   TEXT,
    created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_meter_incidents_idempotency
ON meter_incidents (idempotency_key)
WHERE idempotency_key IS NOT NULL;

-- Only one open (not yet applied) incident per consumer.
CREATE UNIQUE INDEX IF NOT EXISTS idx_meter_incidents_one_open
ON meter_incidents (consumer_id)
WHERE status IN ('pending', 'authorized');

CREATE INDEX IF NOT EXISTS idx_meter_incidents_consumer
ON meter_incidents (consumer_id, effective_date DESC);

CREATE INDEX IF NOT EXISTS idx_meter_incidents_review
ON meter_incidents (review_status, status);

-- ---------------------------------------------------------------------------
-- 3. Consumption provenance
-- ---------------------------------------------------------------------------
ALTER TABLE consumption
  ADD COLUMN IF NOT EXISTS reading_source      TEXT NOT NULL DEFAULT 'actual',
  ADD COLUMN IF NOT EXISTS carried_consumption NUMERIC(10,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS prior_usage_basis   TEXT,
  ADD COLUMN IF NOT EXISTS new_baseline        NUMERIC(10,2),
  ADD COLUMN IF NOT EXISTS meter_incident_id   INTEGER;

-- The FK is added separately so re-running the migration is safe.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'consumption_meter_incident_id_fkey'
  ) THEN
    ALTER TABLE consumption
      ADD CONSTRAINT consumption_meter_incident_id_fkey
      FOREIGN KEY (meter_incident_id) REFERENCES meter_incidents (id) ON DELETE SET NULL;
  END IF;
END $$;

ALTER TABLE consumption DROP CONSTRAINT IF EXISTS consumption_reading_source_check;
ALTER TABLE consumption
  ADD CONSTRAINT consumption_reading_source_check
  CHECK (reading_source IN ('actual', 'estimated', 'incident'));

ALTER TABLE consumption DROP CONSTRAINT IF EXISTS consumption_carried_check;
ALTER TABLE consumption
  ADD CONSTRAINT consumption_carried_check CHECK (carried_consumption >= 0);

-- An incident can fund at most one consumption record.
CREATE UNIQUE INDEX IF NOT EXISTS idx_consumption_meter_incident
ON consumption (meter_incident_id)
WHERE meter_incident_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_consumption_reading_source
ON consumption (reading_source);

-- ---------------------------------------------------------------------------
-- 4. Convert the generated consumption column to a stored column
-- ---------------------------------------------------------------------------
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'consumption'
      AND column_name = 'consumption'
      AND is_generated = 'ALWAYS'
  ) THEN
    ALTER TABLE consumption ADD COLUMN IF NOT EXISTS consumption_stored NUMERIC(10,2);

    UPDATE consumption
       SET consumption_stored = ROUND(present_reading - previous_reading, 2)
     WHERE consumption_stored IS NULL;

    ALTER TABLE consumption DROP COLUMN consumption;
    ALTER TABLE consumption RENAME COLUMN consumption_stored TO consumption;
    ALTER TABLE consumption ALTER COLUMN consumption SET NOT NULL;
  END IF;
END $$;

ALTER TABLE consumption DROP CONSTRAINT IF EXISTS consumption_non_negative;
ALTER TABLE consumption
  ADD CONSTRAINT consumption_non_negative CHECK (consumption >= 0);

-- ---------------------------------------------------------------------------
-- 5. Incident-aware billing function
-- ---------------------------------------------------------------------------
DROP FUNCTION IF EXISTS record_consumption_and_billing(INTEGER, NUMERIC, NUMERIC, TEXT);

CREATE OR REPLACE FUNCTION record_consumption_and_billing(
    p_consumer_id INTEGER,
    p_present_reading NUMERIC,
    p_initial_previous_reading NUMERIC,
    p_idempotency_key TEXT,
    p_reading_source TEXT DEFAULT 'actual',
    p_estimate_value NUMERIC DEFAULT NULL,
    p_incident JSONB DEFAULT NULL
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
    v_incident meter_incidents%ROWTYPE;
    v_previous NUMERIC(10,2);
    v_present NUMERIC(10,2);
    v_consumption NUMERIC(10,2);
    v_carried NUMERIC(10,2) := 0;
    v_total NUMERIC(10,2);
    v_incident_prior NUMERIC(10,2);
    v_incident_baseline NUMERIC(10,2);
    v_incident_auto BOOLEAN := false;
    v_average NUMERIC(10,2);
    v_force_zero BOOLEAN := false;
    v_estimated BOOLEAN := false;
    v_reading_date DATE := (CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Manila')::DATE;
BEGIN
    IF p_consumer_id IS NULL
       OR NULLIF(TRIM(p_idempotency_key), '') IS NULL THEN
        RAISE EXCEPTION 'Consumer and request key are required.';
    END IF;

    IF p_reading_source NOT IN ('actual', 'estimated') THEN
        RAISE EXCEPTION 'Unsupported reading source.';
    END IF;

    IF p_reading_source = 'actual' AND p_present_reading IS NULL THEN
        RAISE EXCEPTION 'Present reading is required.';
    END IF;

    IF (p_present_reading IS NOT NULL AND p_present_reading < 0)
       OR (p_initial_previous_reading IS NOT NULL AND p_initial_previous_reading < 0) THEN
        RAISE EXCEPTION 'Meter readings must be non-negative numbers.';
    END IF;

    -- Serialize readings for the same consumer, including simultaneous first records.
    PERFORM pg_advisory_xact_lock(p_consumer_id);

    SELECT * INTO v_consumer FROM consumers WHERE id = p_consumer_id;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Consumer account not found.' USING ERRCODE = '23503';
    END IF;
    IF COALESCE(v_consumer.status, 'active') <> 'active' THEN
        RAISE EXCEPTION 'Readings cannot be recorded for an inactive consumer.';
    END IF;
    IF v_consumer.purok_no IS NULL THEN
        RAISE EXCEPTION 'Assign the consumer to a purok before recording a reading.';
    END IF;

    -- Idempotent replay.
    SELECT * INTO v_reading
    FROM consumption
    WHERE idempotency_key = p_idempotency_key;

    IF FOUND THEN
        IF v_reading.consumer_id <> p_consumer_id
           OR v_reading.reading_date <> v_reading_date
           OR (
                p_present_reading IS NOT NULL
                AND v_reading.present_reading <> ROUND(p_present_reading, 2)
              ) THEN
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
            'reading_source', v_reading.reading_source,
            'carried_consumption', v_reading.carried_consumption,
            'meter_incident_id', v_reading.meter_incident_id,
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
        RAISE EXCEPTION 'This consumer already has a consumption reading for the selected month.'
            USING ERRCODE = '23505';
    END IF;

    SELECT * INTO v_latest
    FROM consumption
    WHERE consumer_id = p_consumer_id
    ORDER BY reading_date DESC, id DESC
    LIMIT 1;

    -- Resolve the incident (existing authorization or a field declaration).
    IF p_incident IS NOT NULL AND p_incident ? 'id' THEN
        SELECT * INTO v_incident
        FROM meter_incidents
        WHERE id = (p_incident->>'id')::INTEGER
        FOR UPDATE;

        IF NOT FOUND
           OR v_incident.consumer_id <> p_consumer_id
           OR v_incident.status NOT IN ('pending', 'authorized')
           OR v_incident.review_status = 'rejected'
           -- Only unreviewed incidents expire. An approved incident stays valid
           -- until a reading consumes it, however late that visit happens.
           OR (v_incident.expires_at IS NOT NULL
               AND v_incident.review_status = 'pending'
               AND v_incident.expires_at < now()) THEN
            RAISE EXCEPTION 'Meter incident is not valid for this consumer.';
        END IF;
    ELSIF p_incident IS NOT NULL THEN
        IF NULLIF(p_incident->>'priorUsage', '') IS NULL THEN
            RAISE EXCEPTION 'Prior usage is required for a meter incident.';
        END IF;

        IF EXISTS (
            SELECT 1 FROM meter_incidents
            WHERE consumer_id = p_consumer_id
              AND status IN ('pending', 'authorized')
              AND review_status <> 'rejected'
        ) THEN
            RAISE EXCEPTION 'This consumer already has an open meter incident. Use it before logging another.'
                USING ERRCODE = '23505';
        END IF;

        v_incident_prior := ROUND((p_incident->>'priorUsage')::NUMERIC, 2);
        v_incident_baseline := ROUND(
            COALESCE(NULLIF(p_incident->>'newBaseline', '')::NUMERIC, 0), 2);

        -- The field discovery path is auto-approved only when the reader accepts
        -- the system average unchanged and the new meter starts at zero.
        v_incident_auto := COALESCE((p_incident->>'autoAuthorize')::BOOLEAN, false)
            AND v_incident_baseline = 0
            AND ROUND(COALESCE(NULLIF(p_incident->>'averageValue', '')::NUMERIC, -1), 2)
                = v_incident_prior;

        INSERT INTO meter_incidents (
            consumer_id, incident_type, effective_date, old_meter_serial,
            old_final_reading, prior_usage, prior_usage_basis, average_window,
            average_value, new_meter_serial, new_baseline, status, review_status,
            source, recorded_by_id, recorded_by_role, expires_at, notes,
            idempotency_key
        ) VALUES (
            p_consumer_id,
            COALESCE(NULLIF(p_incident->>'incidentType', ''), 'replacement'),
            COALESCE(NULLIF(p_incident->>'effectiveDate', '')::DATE, CURRENT_DATE),
            NULLIF(p_incident->>'oldMeterSerial', ''),
            NULLIF(p_incident->>'oldFinalReading', '')::NUMERIC,
            v_incident_prior,
            COALESCE(NULLIF(p_incident->>'priorUsageBasis', ''), 'average'),
            NULLIF(p_incident->>'averageWindow', '')::INTEGER,
            NULLIF(p_incident->>'averageValue', '')::NUMERIC,
            NULLIF(p_incident->>'newMeterSerial', ''),
            v_incident_baseline,
            CASE WHEN v_incident_auto THEN 'authorized' ELSE 'pending' END,
            CASE WHEN v_incident_auto THEN 'approved' ELSE 'pending' END,
            'meter_reader',
            (p_incident->>'recordedById')::INTEGER,
            COALESCE(NULLIF(p_incident->>'recordedByRole', ''), 'meter-reader'),
            now() + (COALESCE(NULLIF(p_incident->>'authorizationDays', '')::INTEGER, 30)
                     * INTERVAL '1 day'),
            NULLIF(p_incident->>'notes', ''),
            NULLIF(p_incident->>'idempotencyKey', '')
        )
        RETURNING * INTO v_incident;
    END IF;

    -- The average is resolved by the API (never by the browser) and only bills a
    -- meter change that measured nothing at all. forceZero lets the reader refuse
    -- the estimate when the household really used no water.
    IF p_incident IS NOT NULL THEN
        v_average := NULLIF(p_incident->>'averageFallback', '')::NUMERIC;
        v_force_zero := COALESCE((p_incident->>'forceZero')::BOOLEAN, false);
    END IF;

    v_present := p_present_reading;

    -- Resolve the previous value used for the audit chain.
    IF v_latest.id IS NULL THEN
        IF v_incident.id IS NOT NULL THEN
            v_previous := v_incident.new_baseline;
        ELSE
            IF p_initial_previous_reading IS NULL THEN
                RAISE EXCEPTION 'Enter the previous logbook reading for this consumer''s first digital record.';
            END IF;
            v_previous := p_initial_previous_reading;
        END IF;
    ELSE
        IF p_initial_previous_reading IS NOT NULL THEN
            RAISE EXCEPTION 'An initial previous reading may only be supplied for a consumer with no previous record.';
        END IF;
        IF v_reading_date <= v_latest.reading_date THEN
            RAISE EXCEPTION 'A reading has already been recorded for this consumer today or later.';
        END IF;
        v_previous := v_latest.present_reading;
    END IF;

    IF v_incident.id IS NOT NULL THEN
        IF p_present_reading IS NULL THEN
            RAISE EXCEPTION 'The new meter''s present reading is required for a meter incident.';
        END IF;
        IF p_present_reading < v_incident.new_baseline THEN
            RAISE EXCEPTION 'Present reading cannot be lower than the new meter baseline.';
        END IF;
        -- A defective-meter report only flags the hardware. It becomes billable
        -- once the reader updates it with the replacement reading and baseline.
        IF v_incident.incident_type = 'defective' THEN
            RAISE EXCEPTION 'This incident only records a defective meter. Update it with the replacement details before applying it to a reading.';
        END IF;
        v_carried := v_incident.prior_usage;
        -- A carry that came from the system average is only an estimate, so the
        -- reader can refuse it when the household really used nothing.
        IF v_force_zero AND v_incident.prior_usage_basis = 'average' THEN
            v_carried := 0;
        END IF;
        v_consumption := ROUND(
            v_carried + (p_present_reading - v_incident.new_baseline), 2);
        -- The whole gap measured nothing: the old meter never moved and the new
        -- one still shows its baseline. Billing 0 m3 would silently forgive a
        -- dead meter, so the resident's own average is used instead. The reading
        -- itself is never rewritten: only the billed consumption is estimated.
        IF NOT v_force_zero
           AND v_consumption = 0
           AND v_average IS NOT NULL
           AND v_average > 0 THEN
            v_consumption := ROUND(v_average, 2);
            v_carried := v_consumption;
            v_estimated := true;
        END IF;
    ELSIF p_reading_source = 'estimated' THEN
        IF v_latest.id IS NULL THEN
            RAISE EXCEPTION 'An estimated reading requires at least one prior actual reading.';
        END IF;
        IF p_estimate_value IS NULL OR p_estimate_value <= 0 THEN
            RAISE EXCEPTION 'An estimate value is required for an estimated reading.';
        END IF;
        v_present := v_previous + ROUND(p_estimate_value, 2);
        v_consumption := ROUND(p_estimate_value, 2);
    ELSE
        IF p_present_reading < v_previous THEN
            RAISE EXCEPTION 'Meter reading is below the previous baseline; a meter incident is required.'
                USING ERRCODE = '23514', HINT = 'METER_RESET_REQUIRED';
        END IF;
        v_consumption := ROUND(p_present_reading - v_previous, 2);
    END IF;

    IF v_consumption < 0 THEN
        RAISE EXCEPTION 'The computed consumption would be negative. Review the incident details.';
    END IF;

    INSERT INTO consumption (
        consumer_id, reading_date, previous_reading, present_reading,
        consumption, reading_source, carried_consumption, prior_usage_basis,
        new_baseline, meter_incident_id, idempotency_key
    ) VALUES (
        p_consumer_id, v_reading_date, v_previous, v_present,
        v_consumption,
        CASE WHEN v_incident.id IS NOT NULL THEN 'incident' ELSE p_reading_source END,
        v_carried,
        CASE WHEN v_estimated THEN 'average' ELSE v_incident.prior_usage_basis END,
        v_incident.new_baseline,
        v_incident.id, p_idempotency_key
    )
    RETURNING * INTO v_reading;

    IF v_incident.id IS NOT NULL THEN
        UPDATE meter_incidents
           SET status = 'consumed',
               -- An estimated volume is not a measurement, so it goes back to the
               -- admin even when the incident was already approved. That review is
               -- what releases the payment hold.
               review_status = CASE WHEN v_estimated THEN 'pending' ELSE review_status END,
               approved_by_id = CASE WHEN v_estimated THEN NULL ELSE approved_by_id END,
               approved_at = CASE WHEN v_estimated THEN NULL ELSE approved_at END,
               notes = CASE
                         WHEN v_estimated THEN CONCAT_WS(
                             E'\n', NULLIF(notes, ''),
                             'Billed ' || ROUND(v_consumption, 2)
                             || ' m3 estimated from the system average: the meter change measured no usage.')
                         WHEN v_force_zero THEN CONCAT_WS(
                             E'\n', NULLIF(notes, ''),
                             'The reader confirmed no usage; the system average was not applied.')
                         ELSE notes
                       END,
               updated_at = now()
         WHERE id = v_incident.id
        RETURNING * INTO v_incident;
    END IF;

    v_total := compute_water_bill(v_reading.consumption);

    INSERT INTO billing (
        consumption_id, user_id, billing_date, due_date, total_bill,
        remaining_balance, status
    ) VALUES (
        v_reading.id, p_consumer_id, v_reading_date,
        (date_trunc('month', v_reading_date) + INTERVAL '1 month - 1 day')::DATE,
        v_total, v_total, 'Unpaid'
    )
    RETURNING * INTO v_billing;

    RETURN jsonb_build_object(
        'id', v_reading.id,
        'consumer_id', v_reading.consumer_id,
        'reading_date', v_reading.reading_date,
        'previous_reading', v_reading.previous_reading,
        'present_reading', v_reading.present_reading,
        'consumption', v_reading.consumption,
        'reading_source', v_reading.reading_source,
        'carried_consumption', v_reading.carried_consumption,
        'meter_incident_id', v_reading.meter_incident_id,
        'created_at', v_reading.created_at,
        'billing', to_jsonb(v_billing),
        'incident', CASE WHEN v_incident.id IS NULL THEN NULL ELSE to_jsonb(v_incident) END
    );
END;
$$;

REVOKE ALL ON FUNCTION record_consumption_and_billing(INTEGER, NUMERIC, NUMERIC, TEXT, TEXT, NUMERIC, JSONB) FROM PUBLIC;
REVOKE ALL ON FUNCTION record_consumption_and_billing(INTEGER, NUMERIC, NUMERIC, TEXT, TEXT, NUMERIC, JSONB) FROM anon;
REVOKE ALL ON FUNCTION record_consumption_and_billing(INTEGER, NUMERIC, NUMERIC, TEXT, TEXT, NUMERIC, JSONB) FROM authenticated;
GRANT EXECUTE ON FUNCTION record_consumption_and_billing(INTEGER, NUMERIC, NUMERIC, TEXT, TEXT, NUMERIC, JSONB) TO service_role;

-- ---------------------------------------------------------------------------
-- 6. Payment hold for unreviewed field incidents
--
-- This is the database backstop for the API-level hold: a resident with a
-- field-declared incident that still needs review cannot pay ANY bill.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION prevent_payment_on_held_meter_incident()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_consumer_id INTEGER;
BEGIN
    SELECT user_id INTO v_consumer_id FROM billing WHERE id = NEW.billing_id;
    IF v_consumer_id IS NULL THEN
        RETURN NEW;
    END IF;

    IF EXISTS (
        SELECT 1
        FROM meter_incidents
        WHERE consumer_id = v_consumer_id
          AND review_status = 'pending'
          AND status IN ('pending', 'authorized', 'consumed')
    ) THEN
        RAISE EXCEPTION 'This bill is on hold until the meter incident is reviewed.'
            USING ERRCODE = '23514', HINT = 'METER_INCIDENT_HOLD';
    END IF;

    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_prevent_payment_on_held_incident ON payments;
CREATE TRIGGER trg_prevent_payment_on_held_incident
BEFORE INSERT ON payments
FOR EACH ROW EXECUTE FUNCTION prevent_payment_on_held_meter_incident();

COMMIT;

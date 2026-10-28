-- Incremental update for opt-in average carry during a meter replacement.
-- Replaces only record_consumption_and_billing; it does not rerun schema setup.
-- Remove the obsolete overload that accepts p_reading_date; the API does not
-- send that argument, so PostgREST cannot choose between both signatures.
DROP FUNCTION IF EXISTS public.record_consumption_and_billing(
    INTEGER, NUMERIC, NUMERIC, TEXT, DATE, TEXT, NUMERIC, JSONB
);

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
    v_previous_auto_billing_setting TEXT;
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

    -- The average is resolved by the API (never by the browser). forceZero
    -- records the reader's choice not to carry it into this meter-change reading.
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
        -- A carry from the system average is optional and follows the reader's
        -- explicit selection in the portal.
        IF v_force_zero AND v_incident.prior_usage_basis = 'average' THEN
            v_carried := 0;
        ELSIF NOT v_force_zero AND v_incident.prior_usage_basis = 'average' THEN
            -- The reader explicitly selected the average carry in the portal.
            v_estimated := true;
        ELSIF NOT v_force_zero
           AND v_incident.prior_usage = 0
           AND v_average IS NOT NULL
           AND v_average > 0 THEN
            -- For a measured zero on the old meter, the selected average is
            -- carried in addition to whatever the new meter measured.
            v_carried := ROUND(v_average, 2);
            v_estimated := true;
        END IF;
        v_consumption := ROUND(
            v_carried + (p_present_reading - v_incident.new_baseline), 2);
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

    -- The RPC creates billing itself. Keep the auto-billing trigger from inserting a duplicate.
    v_previous_auto_billing_setting := current_setting('waterwise.skip_auto_billing', true);
    PERFORM set_config('waterwise.skip_auto_billing', 'on', true);
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
    PERFORM set_config('waterwise.skip_auto_billing', COALESCE(v_previous_auto_billing_setting, ''), true);

    IF v_incident.id IS NOT NULL THEN
        UPDATE meter_incidents
           SET status = 'consumed',
               -- Review metadata stays approved for compatibility; estimates do
               -- not create a payment hold in the inventory workflow.
               review_status = 'approved',
               notes = CASE
                         WHEN v_estimated THEN CONCAT_WS(
                             E'\n', NULLIF(notes, ''),
                             'Billed ' || ROUND(v_consumption, 2)
                             || ' m3 with the system average carried from the old meter.')
                         WHEN v_force_zero THEN CONCAT_WS(
                             E'\n', NULLIF(notes, ''),
                             'The reader chose not to apply the system average.')
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
        (date_trunc('month', v_reading_date) + INTERVAL '1 month 9 days')::DATE,
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

NOTIFY pgrst, 'reload schema';

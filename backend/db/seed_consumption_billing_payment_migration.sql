-- Seed raw consumption, billing, and payment history for the seeded consumers.
-- Run this in the Supabase SQL Editor AFTER
-- seed_consumer_raw_data_migration.sql.
--
-- Ano ang ginagawa:
--   - 6 months ng reading history bawat consumer (kasama ang current month),
--     tuloy-tuloy ang previous -> present chaining.
--   - billing = compute_water_bill(consumption) (tiered schedule:
--     Minimum (5) P270 | Excess 6-15 P17 | Excess 16-25 P20 | Excess 26-50 P23 | Excess 51+ P25),
--     due date = end of billing month.
--   - payments na halo: Paid / Partially Paid / Unpaid (deterministic kada
--     consumer+buwan, para may laman ang lahat ng dashboard states).
--   - GCash payments ay may reference number; Cash ay exact tendered.
--
-- Ligtas itong i-run nang paulit-ulit (nilalaktawan ang existing rows sa
-- pamamagitan ng idempotency_key at consumption_id checks).

DO $$
DECLARE
  c RECORD;
  m INT;
  n_months INT := 6;
  reading_d DATE;
  prev_r NUMERIC(10,2);
  use_r NUMERIC(10,2);
  pres_r NUMERIC(10,2);
  bill_total NUMERIC(10,2);
  due_d DATE;
  cons_id INT;
  bill_id INT;
  pay_exists INT;
  pay_total NUMERIC(10,2);
  pay_remaining NUMERIC(10,2);
  pay_status VARCHAR(30);
  pay_method TEXT;
  pay_ref TEXT;
  pay_pattern INT;
BEGIN
  FOR c IN SELECT id FROM consumers ORDER BY id LOOP
    -- Panimulang previous reading (naiiba bawat consumer).
    prev_r := (100 + ((c.id * 7) % 50))::NUMERIC(10,2);

    FOR m IN 0..(n_months - 1) LOOP
      reading_d := (date_trunc('month', CURRENT_DATE) - ((n_months - 1 - m) || ' months')::interval)::DATE;
      use_r := (8 + ((c.id + m * 3) % 12) + CASE WHEN (c.id + m) % 4 = 0 THEN 5 ELSE 0 END)::NUMERIC(10,2);
      pres_r := prev_r + use_r;

      -- 1. Consumption reading (idempotent sa idempotency_key).
      INSERT INTO consumption (consumer_id, reading_date, previous_reading, present_reading, idempotency_key)
      VALUES (c.id, reading_d, prev_r, pres_r, 'seed-cons-' || c.id || '-m' || m)
      ON CONFLICT DO NOTHING;

      SELECT id INTO cons_id FROM consumption
      WHERE idempotency_key = 'seed-cons-' || c.id || '-m' || m;

      -- 2. Billing para sa reading na ito (laktawan kung existing na).
      SELECT id INTO bill_id FROM billing WHERE consumption_id = cons_id;

      IF bill_id IS NULL THEN
        bill_total := compute_water_bill(use_r);
        due_d := (date_trunc('month', reading_d) + INTERVAL '1 month - 1 day')::DATE;

        -- Halo ng Paid / Partially Paid / Unpaid para may laman ang lahat ng states.
        pay_pattern := (c.id + m) % 4;
        IF pay_pattern <= 1 THEN
          pay_total := bill_total;
          pay_remaining := 0;
          pay_status := 'Paid';
        ELSIF pay_pattern = 2 THEN
          pay_total := ROUND(bill_total / 2, 2);
          pay_remaining := ROUND(bill_total - pay_total, 2);
          pay_status := 'Partially Paid';
        ELSE
          pay_total := 0;
          pay_remaining := bill_total;
          pay_status := 'Unpaid';
        END IF;

        INSERT INTO billing (consumption_id, user_id, billing_date, due_date, total_bill, remaining_balance, status)
        VALUES (cons_id, c.id, reading_d, due_d, bill_total, pay_remaining, pay_status)
        RETURNING id INTO bill_id;

        -- 3. Payment row (kung hindi Unpaid).
        IF pay_status <> 'Unpaid' THEN
          IF (c.id + m) % 2 = 0 THEN
            pay_method := 'Cash';
            pay_ref := NULL;
          ELSE
            pay_method := 'GCash';
            pay_ref := 'GCASH-SEED-' || c.id || '-' || m;
          END IF;

          SELECT count(*) INTO pay_exists FROM payments
          WHERE idempotency_key = 'seed-pay-' || c.id || '-m' || m;

          IF pay_exists = 0 THEN
            INSERT INTO payments (billing_id, total_paid, amount_tendered, change_given, remaining_balance, payment_date, payment_method, reference_number, idempotency_key)
            VALUES (bill_id, pay_total, pay_total, 0, pay_remaining, reading_d + 5, pay_method, pay_ref, 'seed-pay-' || c.id || '-m' || m);
          END IF;
        END IF;
      END IF;

      bill_id := NULL;
      prev_r := pres_r;
    END LOOP;
  END LOOP;
END
$$;

-- Verify: dapat 300 readings (50 x 6), 300 bills, at halo ng payment states.
SELECT count(*) AS total_readings FROM consumption WHERE idempotency_key LIKE 'seed-cons-%';
SELECT count(*) AS total_bills FROM billing WHERE user_id IN (SELECT id FROM consumers);
SELECT status, count(*) AS bills FROM billing GROUP BY status ORDER BY status;
SELECT payment_method, count(*) AS payments FROM payments WHERE idempotency_key LIKE 'seed-pay-%' GROUP BY payment_method ORDER BY payment_method;

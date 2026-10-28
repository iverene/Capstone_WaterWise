-- Applies the fixed billing policy without changing historical billing rows.
-- Every new bill is due on the 10th day of the month after its billing date.
BEGIN;

CREATE OR REPLACE FUNCTION set_billing_due_date_to_next_month_tenth()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
    NEW.due_date := (
        date_trunc('month', NEW.billing_date) + INTERVAL '1 month 9 days'
    )::DATE;
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_billing_due_date_policy ON billing;
CREATE TRIGGER trg_billing_due_date_policy
BEFORE INSERT ON billing
FOR EACH ROW
EXECUTE FUNCTION set_billing_due_date_to_next_month_tenth();

-- Keep the status notification aligned with the manually confirmed
-- disconnection state used by the application.
CREATE OR REPLACE FUNCTION generate_consumer_status_notification()
RETURNS TRIGGER AS $$
BEGIN
    IF NEW.status IS DISTINCT FROM OLD.status THEN
        INSERT INTO notifications (
            consumer_id, announcement_type, notification_type, priority,
            title, announcement_date, message, action_path, event_key
        ) VALUES (
            NEW.id,
            'Account Alert',
            'account_status_changed',
            CASE WHEN NEW.status IN ('inactive', 'disconnected') THEN 'critical' ELSE 'high' END,
            CASE
                WHEN NEW.status = 'disconnected' THEN 'Water service disconnected'
                WHEN NEW.status = 'inactive' THEN 'Account deactivated'
                ELSE 'Account activated'
            END,
            (CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Manila')::DATE,
            CASE
                WHEN NEW.status = 'disconnected'
                    THEN 'Your water service has been disconnected after administrative confirmation. You may still review your bills and payments. Contact the water district office for assistance.'
                WHEN NEW.status = 'inactive'
                    THEN 'Your WaterWise account has been deactivated. Contact the water district office if you need assistance.'
                ELSE 'Your WaterWise account is active again. You may now sign in and use the consumer portal.'
            END,
            '/consumer/profile-details',
            format('account-status:%s:%s:%s', NEW.id, NEW.status, txid_current())
        );
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

COMMIT;

-- Enforce alphabetic resident names on new/changed values while preserving
-- existing legacy names that contain digits when those fields are untouched.
CREATE OR REPLACE FUNCTION enforce_consumer_name_letters()
RETURNS TRIGGER AS $$
DECLARE
    name_field TEXT;
    name_value TEXT;
BEGIN
    FOREACH name_field IN ARRAY ARRAY['first_name', 'middle_name', 'last_name'] LOOP
        IF TG_OP = 'INSERT' OR
           (name_field = 'first_name' AND NEW.first_name IS DISTINCT FROM OLD.first_name) OR
           (name_field = 'middle_name' AND NEW.middle_name IS DISTINCT FROM OLD.middle_name) OR
           (name_field = 'last_name' AND NEW.last_name IS DISTINCT FROM OLD.last_name) THEN
            name_value := regexp_replace(btrim(COALESCE(to_jsonb(NEW)->>name_field, '')), '\s+', ' ', 'g');
            IF name_value <> '' AND name_value !~ '^[[:alpha:]]+([ ''’‐-][[:alpha:]]+)*$' THEN
                RAISE EXCEPTION 'Names may contain letters, spaces, hyphens, and apostrophes only.'
                    USING ERRCODE = '23514';
            END IF;
        END IF;
    END LOOP;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_consumer_0_name_letters ON consumers;
CREATE TRIGGER trg_consumer_0_name_letters
BEFORE INSERT OR UPDATE OF first_name, middle_name, last_name ON consumers
FOR EACH ROW EXECUTE FUNCTION enforce_consumer_name_letters();

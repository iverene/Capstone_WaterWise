-- Consumer contact numbers: store the local 09xxxxxxxxx form
--
-- The API used to normalise every contact number to E.164 (+639xxxxxxxxx)
-- before saving it. The office and the residents both read and write numbers
-- as 09xxxxxxxxx, so the stored value now keeps that form instead and the
-- plus-prefixed value is only accepted on input for backwards compatibility.
--
-- This migration rewrites the rows saved by the old code:
--   +639171234567  ->  09171234567
--
-- Idempotent: after the rewrite no row matches '+639%', so re-running the
-- file updates nothing.

BEGIN;

UPDATE consumers
SET contact_number = '0' || substring(contact_number FROM 4)
WHERE contact_number LIKE '+639%'
  AND char_length(contact_number) = 13;

COMMIT;

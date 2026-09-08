-- Seed the initial admin and super-admin accounts.
-- Run this in the Supabase SQL Editor AFTER migration.sql
-- (plus fingerprint/system_settings/inactivity migrations).
--
-- BAGO I-RUN: palitan ang USERNAME at EMAIL placeholders sa ibaba
-- (ang password hashes ay nagawa na — huwag nang palitan),
-- tapos i-run ang buong file nang isang beses.
--
-- Naka-embed na ang passwords:
--   admin      -> Admin@12345
--   superadmin -> Super@12345
-- Pagkatapos mag-login, PALITAN AGAD ang passwords sa Admin Settings.
--
-- ---------------------------------------------------------------------------
-- STEP 1: palitan ang 4 placeholders sa ibaba:
--   'ADMIN_USERNAME_HERE'      -> hal. 'admin'
--   'ADMIN_EMAIL_HERE'         -> hal. 'admin@example.com' (lowercase)
--   'SUPERADMIN_USERNAME_HERE' -> hal. 'superadmin'
--   'SUPERADMIN_EMAIL_HERE'    -> hal. 'superadmin@example.com' (lowercase)
-- ---------------------------------------------------------------------------
--
-- STEP 2: i-run ang buong file sa Supabase SQL Editor.
-- Ligtas itong i-run nang paulit-ulit (ON CONFLICT DO NOTHING).

INSERT INTO admins (username, email, password, role, status)
VALUES (
    'admin01',
    '23-14944@g.batstate-u.edu.ph',
    '$2b$10$0Ch.8IMJHZzCRwB8mIuSA.8nmHnDnZ8UjFTeY2KRzdz4L.pVSZdx6',
    'admin',
    'active'
)
ON CONFLICT (email) DO NOTHING;

INSERT INTO admins (username, email, password, role, status)
VALUES (
    'superadmin01',
    'zednanreh1423@gmail.com',
    '$2b$10$DCImzYemfX4JR2Hg/DyFbuSGcV2Wfus4b9zQP/dYRL7hZ7UUvR0Oy',
    'super-admin',
    'active'
)
ON CONFLICT (email) DO NOTHING;

-- Verify: dapat 2 rows ang lumabas sa ibaba.
SELECT id, username, email, role, status, created_at
FROM admins
ORDER BY id;

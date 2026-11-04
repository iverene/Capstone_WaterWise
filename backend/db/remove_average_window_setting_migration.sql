-- The average billing basis uses a fixed three-reading window in application
-- code. Remove the obsolete system setting from existing installations.
DELETE FROM system_settings
WHERE setting_key = 'average_window_months';

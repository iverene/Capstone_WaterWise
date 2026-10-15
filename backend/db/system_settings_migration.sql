-- SYSTEM SETTINGS TABLE
-- Stores the tiered water schedule (see image/image.png).
-- Only accessible by super-admin via API; all changes require OTP verification.

CREATE TABLE IF NOT EXISTS system_settings (
    id SERIAL PRIMARY KEY,
    setting_key VARCHAR(100) NOT NULL UNIQUE,
    setting_value NUMERIC(12, 2) NOT NULL,
    description TEXT,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

-- Drop the retired flat rate on upgrades; fresh installs never get it.
DELETE FROM system_settings WHERE setting_key = 'rate_per_cubic_meter';

-- Seed the tiered schedule from image/image.png:
-- Minimum (5) P270 | Excess 6-15 P17 | Excess 16-25 P20 | Excess 26-50 P23 | Excess 51+ P25
INSERT INTO system_settings (setting_key, setting_value, description) VALUES
  ('minimum_charge', 270.00, 'Flat charge covering the first minimum_m3 cubic meters'),
  ('minimum_m3', 5.00, 'Cubic meters covered by the minimum charge'),
  ('rate_6_15', 17.00, 'Per-m3 rate for consumption 6-15'),
  ('rate_16_25', 20.00, 'Per-m3 rate for consumption 16-25'),
  ('rate_26_50', 23.00, 'Per-m3 rate for consumption 26-50'),
  ('rate_51_up', 25.00, 'Per-m3 rate for consumption 51 and up')
ON CONFLICT (setting_key) DO NOTHING;

-- Index for fast key lookups
CREATE INDEX IF NOT EXISTS idx_system_settings_key ON system_settings (setting_key);

-- RLS
ALTER TABLE public.system_settings ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.system_settings FROM anon, authenticated;

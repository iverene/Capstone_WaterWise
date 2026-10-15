// Tiered water billing matching image/image.png.
export const TIER_DEFAULTS = {
  minimumCharge: 270,
  minimumM3: 5,
  rate6_15: 17,
  rate16_25: 20,
  rate26_50: 23,
  rate51Up: 25,
};

export function computeTieredBill(consumption, rates = TIER_DEFAULTS) {
  const used = Math.max(Number(consumption) || 0, 0);
  const minimumCharge = Number(rates.minimumCharge ?? TIER_DEFAULTS.minimumCharge);
  const minimumM3 = Number(rates.minimumM3 ?? TIER_DEFAULTS.minimumM3);
  if (used <= minimumM3) return Number(minimumCharge.toFixed(2));
  let remaining = used - minimumM3;
  let total = minimumCharge;
  const take = (cap, rate) => {
    const chunk = Math.min(remaining, cap);
    remaining -= chunk;
    total += chunk * rate;
  };
  take(10, Number(rates.rate6_15 ?? 17));
  take(10, Number(rates.rate16_25 ?? 20));
  take(25, Number(rates.rate26_50 ?? 23));
  take(Infinity, Number(rates.rate51Up ?? 25));
  return Number(total.toFixed(2));
}

export function breakdownTieredBill(consumption, rates = TIER_DEFAULTS) {
  const used = Math.max(Number(consumption) || 0, 0);
  const minimumM3 = Number(rates.minimumM3 ?? TIER_DEFAULTS.minimumM3);
  const minimumCharge = Number(rates.minimumCharge ?? TIER_DEFAULTS.minimumCharge);
  const lines = [{ label: `Minimum (${minimumM3} m³)`, amount: minimumCharge }];
  if (used <= minimumM3) return lines;
  let remaining = used - minimumM3;
  [
    { label: "Excess 6-15", cap: 10, rate: Number(rates.rate6_15 ?? 17) },
    { label: "Excess 16-25", cap: 10, rate: Number(rates.rate16_25 ?? 20) },
    { label: "Excess 26-50", cap: 25, rate: Number(rates.rate26_50 ?? 23) },
    { label: "Excess 51 & up", cap: Infinity, rate: Number(rates.rate51Up ?? 25) },
  ].forEach(({ label, cap, rate }) => {
    if (remaining <= 0) return;
    const chunk = Math.min(remaining, cap);
    remaining -= chunk;
    if (chunk > 0) lines.push({ label: `${label} (${chunk} × ₱${rate})`, amount: Number((chunk * rate).toFixed(2)) });
  });
  return lines;
}

export function tierRatesFromSettings(settings, fallback = TIER_DEFAULTS) {
  const byKey = {};
  (Array.isArray(settings) ? settings : []).forEach((s) => {
    byKey[s.setting_key] = Number(s.setting_value);
  });
  const pick = (key, field) =>
    Number.isFinite(byKey[key]) && byKey[key] >= 0 ? byKey[key] : fallback[field];
  return {
    minimumCharge: pick("minimum_charge", "minimumCharge"),
    minimumM3: pick("minimum_m3", "minimumM3"),
    rate6_15: pick("rate_6_15", "rate6_15"),
    rate16_25: pick("rate_16_25", "rate16_25"),
    rate26_50: pick("rate_26_50", "rate26_50"),
    rate51Up: pick("rate_51_up", "rate51Up"),
  };
}

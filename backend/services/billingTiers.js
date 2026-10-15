// Tiered water billing matching image/image.png:
// Minimum (5) P270 | Excess 6-15 P17 | Excess 16-25 P20 | Excess 26-50 P23 | Excess 51+ P25
import { getSystemSetting } from "../models/systemSettingsModels.js";

export const TIER_DEFAULTS = {
  minimumCharge: 270,
  minimumM3: 5,
  rate6_15: 17,
  rate16_25: 20,
  rate26_50: 23,
  rate51Up: 25,
};

const toPositiveNumber = (value, fallback) => {
  const number = Number(value);
  return Number.isFinite(number) && number >= 0 ? number : fallback;
};

export async function getTieredRates() {
  const keys = [
    ["minimum_charge", "minimumCharge"],
    ["minimum_m3", "minimumM3"],
    ["rate_6_15", "rate6_15"],
    ["rate_16_25", "rate16_25"],
    ["rate_26_50", "rate26_50"],
    ["rate_51_up", "rate51Up"],
  ];
  const rates = { ...TIER_DEFAULTS };
  await Promise.all(
    keys.map(async ([key, field]) => {
      try {
        const setting = await getSystemSetting(key);
        rates[field] = toPositiveNumber(setting?.setting_value, TIER_DEFAULTS[field]);
      } catch {
        // Missing key -> default keeps working.
      }
    }),
  );
  return rates;
}

export function computeTieredBill(consumption, rates = TIER_DEFAULTS) {
  const used = Math.max(Number(consumption) || 0, 0);
  const minimumCharge = toPositiveNumber(rates.minimumCharge, TIER_DEFAULTS.minimumCharge);
  const minimumM3 = toPositiveNumber(rates.minimumM3, TIER_DEFAULTS.minimumM3);
  const r1 = toPositiveNumber(rates.rate6_15, TIER_DEFAULTS.rate6_15);
  const r2 = toPositiveNumber(rates.rate16_25, TIER_DEFAULTS.rate16_25);
  const r3 = toPositiveNumber(rates.rate26_50, TIER_DEFAULTS.rate26_50);
  const r4 = toPositiveNumber(rates.rate51Up, TIER_DEFAULTS.rate51Up);

  if (used <= minimumM3) return Number(minimumCharge.toFixed(2));

  let remaining = used - minimumM3;
  let total = minimumCharge;
  const take = (cap) => {
    const chunk = Math.min(remaining, cap);
    remaining -= chunk;
    return chunk;
  };
  total += take(10) * r1;
  total += take(10) * r2;
  total += take(25) * r3;
  total += remaining * r4;
  return Number(total.toFixed(2));
}

export function breakdownTieredBill(consumption, rates = TIER_DEFAULTS) {
  const used = Math.max(Number(consumption) || 0, 0);
  const minimumM3 = toPositiveNumber(rates.minimumM3, TIER_DEFAULTS.minimumM3);
  const lines = [
    { label: `Minimum (${minimumM3} m³)`, m3: Math.min(used, minimumM3), amount: toPositiveNumber(rates.minimumCharge, TIER_DEFAULTS.minimumCharge) },
  ];
  if (used <= minimumM3) return lines;
  let remaining = used - minimumM3;
  const tiers = [
    { label: "Excess 6-15", cap: 10, rate: rates.rate6_15 },
    { label: "Excess 16-25", cap: 10, rate: rates.rate16_25 },
    { label: "Excess 26-50", cap: 25, rate: rates.rate26_50 },
    { label: "Excess 51 & up", cap: Infinity, rate: rates.rate51Up },
  ];
  tiers.forEach(({ label, cap, rate }) => {
    if (remaining <= 0) return;
    const chunk = Math.min(remaining, cap);
    remaining -= chunk;
    lines.push({ label: `${label} (${chunk} m³ × ₱${rate})`, m3: chunk, amount: Number((chunk * rate).toFixed(2)) });
  });
  return lines;
}

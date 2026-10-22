import { expireMeterIncidents } from "../models/meterIncidentModels.js";

const DEFAULT_INTERVAL_MS = 60 * 60 * 1000; // hourly

const runSweep = async () => {
  try {
    const result = await expireMeterIncidents();
    if (result.expired > 0) {
      console.log(`Expired ${result.expired} meter incident authorization(s).`);
    }
  } catch (error) {
    console.warn("Meter incident expiry sweep failed:", error.message);
  }
};

export function startMeterIncidentExpiryScheduler() {
  const configured = Number(process.env.METER_INCIDENT_EXPIRY_INTERVAL_MS);
  const interval = Number.isFinite(configured) && configured >= 60_000
    ? configured
    : DEFAULT_INTERVAL_MS;

  runSweep();
  const timer = setInterval(runSweep, interval);
  timer.unref?.();
  return () => clearInterval(timer);
}

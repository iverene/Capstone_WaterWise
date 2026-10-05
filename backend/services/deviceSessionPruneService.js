import { deleteExpiredDeviceFingerprints } from "../models/deviceFingerprintModels.js";

const DEFAULT_PRUNE_INTERVAL_MS = 24 * 60 * 60 * 1000;
const MIN_PRUNE_INTERVAL_MS = 60 * 60 * 1000;

export function startDeviceSessionPruneScheduler() {
  const configuredInterval = Number(process.env.DEVICE_SESSION_PRUNE_INTERVAL_MS);
  const intervalMs = Number.isFinite(configuredInterval) && configuredInterval >= MIN_PRUNE_INTERVAL_MS
    ? configuredInterval
    : DEFAULT_PRUNE_INTERVAL_MS;
  let isRunning = false;

  const run = async () => {
    if (isRunning) return;
    isRunning = true;
    try {
      const pruned = await deleteExpiredDeviceFingerprints();
      console.log(`Device sessions pruned ${pruned} expired row(s).`);
    } catch (error) {
      console.error("Device session pruning failed:", error.message);
    } finally {
      isRunning = false;
    }
  };

  void run();
  const timer = setInterval(run, intervalMs);
  timer.unref?.();
  return () => clearInterval(timer);
}

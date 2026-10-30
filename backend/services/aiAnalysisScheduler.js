import { acquireRedisLock, redis } from "../config/redis.js";
import { generateAllPredictionsService } from "./predictionServices.js";
import { generateAllRecommendationsService } from "./recommendationServices.js";

const MANILA_UTC_OFFSET_MS = 8 * 60 * 60 * 1000;
const SCHEDULED_HOURS = [0, 12, 16];
const LOCK_KEY = "waterwise:ai-analysis:scheduled-run";
const LOCK_TTL_SECONDS = 3 * 60 * 60;

export function getNextAiAnalysisRun(now = new Date()) {
  const nowMs = now.getTime();
  const manilaNow = new Date(nowMs + MANILA_UTC_OFFSET_MS);
  const year = manilaNow.getUTCFullYear();
  const month = manilaNow.getUTCMonth();
  const day = manilaNow.getUTCDate();

  for (let dayOffset = 0; dayOffset <= 7; dayOffset += 1) {
    for (const hour of SCHEDULED_HOURS) {
      const candidateMs = Date.UTC(
        year,
        month,
        day + dayOffset,
        hour - 8,
        0,
        0,
        0,
      );
      if (candidateMs > nowMs) return new Date(candidateMs);
    }
  }

  throw new Error("Unable to calculate the next AI analysis schedule.");
}

export async function runScheduledAiAnalysis() {
  let releaseLock = async () => {};

  if (redis) {
    const acquiredRelease = await acquireRedisLock(LOCK_KEY, LOCK_TTL_SECONDS);
    if (!acquiredRelease) {
      return { skipped: true, reason: "Another backend instance owns the AI analysis lock." };
    }
    releaseLock = acquiredRelease;
  }

  try {
    const predictionResults = await generateAllPredictionsService();
    const recommendationResults = await generateAllRecommendationsService();
    return {
      skipped: false,
      predictions: predictionResults,
      recommendations: recommendationResults,
    };
  } finally {
    await releaseLock();
  }
}

export function startAiAnalysisScheduler() {
  if (process.env.AI_ANALYSIS_SCHEDULER_ENABLED === "false") {
    console.log("Scheduled AI analysis is disabled.");
    return () => {};
  }

  let stopped = false;
  let timer = null;
  let isRunning = false;

  const scheduleNext = () => {
    if (stopped) return;
    const nextRun = getNextAiAnalysisRun();
    const delayMs = Math.max(1, nextRun.getTime() - Date.now());
    console.log(
      `Next scheduled AI analysis: ${nextRun.toLocaleString("en-PH", { timeZone: "Asia/Manila" })} Asia/Manila.`,
    );

    timer = setTimeout(async () => {
      if (!isRunning) {
        isRunning = true;
        try {
          const result = await runScheduledAiAnalysis();
          if (result.skipped) {
            console.log(`Scheduled AI analysis skipped: ${result.reason}`);
          } else {
            console.log("Scheduled AI prediction and recommendation analysis completed.");
          }
        } catch (error) {
          console.error("Scheduled AI analysis failed:", error.message);
        } finally {
          isRunning = false;
        }
      }
      scheduleNext();
    }, delayMs);
    timer.unref?.();
  };

  scheduleNext();
  return () => {
    stopped = true;
    if (timer) clearTimeout(timer);
  };
}

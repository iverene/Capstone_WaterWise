const STORAGE_PREFIX = "waterwise:analytics-baseline-dismissed:";
// Builds before this change recorded "already shown" here; those keys are stale
// because the toast now returns until the admin dismisses it.
const LEGACY_PREFIX = "waterwise:analytics-baseline-warning:";

/**
 * The baseline toast follows the admin across predictive/prescriptive visits:
 * it hides when they leave the section and returns when they come back, so only
 * an explicit dismissal is remembered for the rest of the session.
 */
export function hasDismissedAnalyticsBaselineWarning(section) {
  try {
    return window.sessionStorage.getItem(`${STORAGE_PREFIX}${section}`) === "1";
  } catch {
    return false;
  }
}

export function markAnalyticsBaselineWarningDismissed(section) {
  try {
    window.sessionStorage.setItem(`${STORAGE_PREFIX}${section}`, "1");
  } catch {
    // Storage can be unavailable; the dismissal lasts for this page visit only.
  }
}

export function clearAnalyticsBaselineWarningSession() {
  try {
    for (let index = window.sessionStorage.length - 1; index >= 0; index -= 1) {
      const key = window.sessionStorage.key(index);
      if (key?.startsWith(STORAGE_PREFIX) || key?.startsWith(LEGACY_PREFIX)) {
        window.sessionStorage.removeItem(key);
      }
    }
  } catch {
    // Ignore storage failures during logout.
  }
}

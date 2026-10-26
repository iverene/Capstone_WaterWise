const STORAGE_PREFIX = "waterwise:analytics-baseline-warning:";

export function hasShownAnalyticsBaselineWarning(section) {
  try {
    return window.sessionStorage.getItem(`${STORAGE_PREFIX}${section}`) === "1";
  } catch {
    return false;
  }
}

export function markAnalyticsBaselineWarningShown(section) {
  try {
    window.sessionStorage.setItem(`${STORAGE_PREFIX}${section}`, "1");
  } catch {
    // Storage can be unavailable; the warning still displays for this visit.
  }
}

export function clearAnalyticsBaselineWarningSession() {
  try {
    for (let index = window.sessionStorage.length - 1; index >= 0; index -= 1) {
      const key = window.sessionStorage.key(index);
      if (key?.startsWith(STORAGE_PREFIX)) window.sessionStorage.removeItem(key);
    }
  } catch {
    // Ignore storage failures during logout.
  }
}

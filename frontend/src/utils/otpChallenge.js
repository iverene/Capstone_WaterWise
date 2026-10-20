import { getStoredAccount } from "../services/authToken";

// The verification challenge is a signed token that carries its own expiry.
// Reading it lets the page stop offering a code the server will already
// reject, instead of letting the administrator run into an error.
//
// The payload is only read for its `exp` claim; the signature is verified by
// the server, so nothing here is a security decision.
export function isChallengeExpired(challengeToken) {
  try {
    const payload = JSON.parse(
      atob(
        String(challengeToken)
          .split(".")[1]
          .replace(/-/g, "+")
          .replace(/_/g, "/"),
      ),
    );
    if (!payload?.exp) return false;
    return payload.exp * 1000 <= Date.now();
  } catch {
    return false;
  }
}

const STORAGE_PREFIX = "waterwise:otp-challenge:";

// A challenge has to outlive the request that created it. Requesting a code
// is itself a mutation, and the app remounts its route tree whenever data
// changes, which would wipe the challenge straight out of React state. The
// challenge is therefore kept in session storage, scoped per purpose, so the
// flow can pick it up again after the remount.
export function saveOtpChallenge(scope, challenge) {
  try {
    const accountId = getStoredAccount()?.id ?? null;
    window.sessionStorage.setItem(
      `${STORAGE_PREFIX}${scope}`,
      JSON.stringify({ ...challenge, accountId }),
    );
  } catch {
    // Storage may be disabled; the flow still works without it.
  }
}

// A saved challenge belongs to the account that requested it. Never restore
// another account's challenge (same-tab login switching).
export function loadOtpChallenge(scope) {
  try {
    const raw = window.sessionStorage.getItem(`${STORAGE_PREFIX}${scope}`);
    if (!raw) return null;
    const saved = JSON.parse(raw);
    if (!saved?.challengeToken) return null;
    const accountId = getStoredAccount()?.id ?? null;
    if ((saved.accountId ?? null) !== accountId) return null;
    if (isChallengeExpired(saved.challengeToken)) return null;
    return saved;
  } catch {
    return null;
  }
}

export function clearOtpChallenge(scope) {
  try {
    window.sessionStorage.removeItem(`${STORAGE_PREFIX}${scope}`);
  } catch {
    // Ignore.
  }
}

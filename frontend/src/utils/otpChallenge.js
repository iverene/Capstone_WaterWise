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

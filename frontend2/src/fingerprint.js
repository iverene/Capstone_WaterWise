// Copied (not imported) from frontend/src/utils/deviceFingerprint.js so
// frontend2 stays deletable with zero coupling to frontend/.
// Rotation/resize-stable signals only; hashed to 32 hex chars.
function getFingerprintComponents() {
  return [
    navigator.userAgent || "",
    navigator.language || "",
    navigator.platform || "",
    Intl.DateTimeFormat().resolvedOptions().timeZone || "",
    String(navigator.hardwareConcurrency || 0),
    String(navigator.maxTouchPoints || 0),
  ].join("|");
}

function fallbackHash(str) {
  let h1 = 0xdeadbeef;
  let h2 = 0x41c6ce57;
  for (let i = 0; i < str.length; i += 1) {
    const ch = str.charCodeAt(i);
    h1 = Math.imul(h1 ^ ch, 2654435761);
    h2 = Math.imul(h2 ^ ch, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return (h2 >>> 0).toString(16).padStart(8, "0") + (h1 >>> 0).toString(16).padStart(8, "0");
}

async function hashString(str) {
  try {
    if (window.crypto?.subtle?.digest) {
      const data = new TextEncoder().encode(str);
      const hashBuffer = await window.crypto.subtle.digest("SHA-256", data);
      return Array.from(new Uint8Array(hashBuffer))
        .map((b) => b.toString(16).padStart(2, "0"))
        .join("");
    }
  } catch {
    // Fall through to the non-crypto hash below.
  }
  return fallbackHash(`waterwise:${str}`);
}

export async function getDeviceFingerprint() {
  const hash = await hashString(getFingerprintComponents());
  return hash.slice(0, 32);
}

function getFingerprintComponents() {
  return [
    navigator.userAgent || "",
    navigator.language || "",
    String(screen.width || 0),
    String(screen.height || 0),
    String(screen.colorDepth || 0),
    String(screen.pixelDepth || 0),
    Intl.DateTimeFormat().resolvedOptions().timeZone || "",
    String(navigator.hardwareConcurrency || 0),
    String(navigator.maxTouchPoints || 0),
  ].join("|");
}

async function hashString(str) {
  const encoder = new TextEncoder();
  const data = encoder.encode(str);
  const hashBuffer = await crypto.subtle.digest("SHA-256", data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");
}

export async function getDeviceFingerprint() {
  const components = getFingerprintComponents();
  const hash = await hashString(components);
  return hash.slice(0, 32);
}

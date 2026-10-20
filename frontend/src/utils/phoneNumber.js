// Contact numbers are stored in E.164 form (+639xxxxxxxxx) so the backend can
// validate them unambiguously, but the portal shows and edits them in the
// local 09xxxxxxxxx form that residents actually recognise. The backend
// re-normalises whatever we send, so this only affects presentation.
export function toLocalMobileNumber(value) {
  const raw = String(value ?? "").trim().replace(/[\s()-]/g, "");
  if (/^\+639\d{9}$/.test(raw)) {
    return `09${raw.slice(4)}`;
  }
  return String(value ?? "").replace(/\D/g, "").slice(0, 11);
}

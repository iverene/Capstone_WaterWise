// Client-side email check.
//
// The server is the authority (validator.isEmail with a required TLD), but
// this mirrors it closely enough that a bad address is reported before the
// request is sent: a real host with a TLD, no spaces, and no empty or
// hyphen-edged labels.
//
// The TLD is NOT limited to .com. The office itself uses .edu.ph addresses
// and .ph / .gov.ph are common for residents, so any 2+ letter TLD is fine.
const EMAIL_PATTERN =
  /^[^\s@]+@[A-Za-z0-9](?:[A-Za-z0-9-]*[A-Za-z0-9])?(?:\.[A-Za-z0-9](?:[A-Za-z0-9-]*[A-Za-z0-9])?)*\.[A-Za-z]{2,}$/;

// The column is VARCHAR(255) in the database, so a longer address would come
// back as a database error instead of a validation message.
const MAX_EMAIL_LENGTH = 255;

export function isValidEmail(value) {
  const email = String(value ?? "").trim();
  if (email.length === 0 || email.length > MAX_EMAIL_LENGTH) return false;
  return EMAIL_PATTERN.test(email);
}

import { resolve4, resolve6, resolveMx } from "node:dns/promises";
import { domainToASCII } from "node:url";

const DNS_MISSING_CODES = new Set(["ENODATA", "ENOTFOUND", "ENOTIMP"]);

const domainError = (message, statusCode = 400) => {
  const error = new TypeError(message);
  error.statusCode = statusCode;
  return error;
};

/** Verify that an email domain has MX records or the address records used by implicit MX. */
export async function verifyEmailDomain(email) {
  const rawDomain = String(email).trim().split("@").at(-1) ?? "";
  const domain = domainToASCII(rawDomain).toLowerCase();
  if (!domain) throw domainError("The email address has an invalid domain.");

  let mxError;
  try {
    const mailServers = await resolveMx(domain);
    if (mailServers.length > 0) return;
  } catch (error) {
    mxError = error;
  }

  if (mxError && !DNS_MISSING_CODES.has(mxError.code)) {
    throw domainError("The email domain could not be verified right now. Please try again.", 503);
  }

  const addressResults = await Promise.allSettled([resolve4(domain), resolve6(domain)]);
  if (addressResults.some((result) => result.status === "fulfilled" && result.value.length > 0)) return;
  if (addressResults.some((result) => result.status === "rejected" && !DNS_MISSING_CODES.has(result.reason?.code))) {
    throw domainError("The email domain could not be verified right now. Please try again.", 503);
  }
  throw domainError("The email domain does not exist or is not configured to receive email.");
}

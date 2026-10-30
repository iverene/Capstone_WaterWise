import assert from "node:assert/strict";
import test from "node:test";
import {
  readDeviceToken,
  trustedDeviceCookieOptions,
} from "../models/trustedDeviceModels.js";

function request({ cookie = "", secure = false, forwardedProto = "" } = {}) {
  return {
    secure,
    protocol: secure ? "https" : "http",
    get(name) {
      const header = name.toLowerCase();
      if (header === "cookie") return cookie;
      if (header === "x-forwarded-proto") return forwardedProto;
      return undefined;
    },
  };
}

test("trusted-device cookie is first-party on proxied HTTPS", () => {
  const options = trustedDeviceCookieOptions(
    "admin",
    request({ forwardedProto: "https" }),
  );

  assert.equal(options.httpOnly, true);
  assert.equal(options.secure, true);
  assert.equal(options.sameSite, "lax");
  assert.equal(options.path, "/");
  assert.equal("partitioned" in options, false);
  assert.ok(options.maxAge > 0);
});

test("trusted-device cookie remains usable through the local HTTP proxy", () => {
  const options = trustedDeviceCookieOptions("admin", request());

  assert.equal(options.secure, false);
  assert.equal(options.sameSite, "lax");
  assert.equal("partitioned" in options, false);
});

test("trusted-device token is read only from the HttpOnly cookie channel", () => {
  const req = request({ cookie: "other=value; waterwise_admin_device=trusted-token" });
  const originalGet = req.get;
  req.get = (name) => name.toLowerCase() === "x-trusted-device"
    ? "header-token"
    : originalGet(name);

  assert.equal(readDeviceToken(req), "trusted-token");
  assert.equal(readDeviceToken(request()), "");
});

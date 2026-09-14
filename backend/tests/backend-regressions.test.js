import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { test } from "node:test";
import { SourceTextModule, SyntheticModule } from "node:vm";

// Load business logic with isolated dependencies: no .env or external services.
async function loadModule(path, dependencies) {
  const module = new SourceTextModule(await readFile(new URL(path, import.meta.url), "utf8"));
  await module.link((specifier) => {
    assert.ok(Object.hasOwn(dependencies, specifier), `Unexpected dependency: ${specifier}`);
    const exports = dependencies[specifier];
    return new SyntheticModule(Object.keys(exports), function () {
      for (const [name, value] of Object.entries(exports)) this.setExport(name, value);
    });
  });
  await module.evaluate();
  return module.namespace;
}

test("continuous activity persists at the throttle interval and retries failed writes", async () => {
  const writes = [];
  let fail = false;
  const service = await loadModule("../services/sessionActivityService.js", {
    "../config/supabase.js": { supabase: { from: () => ({
      update: (row) => ({ eq: async () => {
        writes.push(row.last_activity_at);
        return { error: fail ? new Error("Unavailable") : null };
      } }),
    }) } },
    "../config/redis.js": { redis: null, readCache: async () => null, writeCache: async () => true },
  });
  const start = 1_000_000;
  for (const offset of [0, 20_000, 40_000, 60_000, 80_000, 120_000]) {
    await service.touchSessionActivity("consumer", 1, start + offset);
  }
  assert.deepEqual(writes, [0, 60_000, 120_000].map((offset) => new Date(start + offset).toISOString()));
  fail = true;
  await service.touchSessionActivity("consumer", 1, start + 180_000);
  fail = false;
  await service.touchSessionActivity("consumer", 1, start + 180_001);
  assert.equal(writes.length, 5);
  await service.clearSessionActivity("consumer", 1);
  await service.touchSessionActivity("consumer", 1, start + 180_002);
  assert.equal(writes.length, 6);
});

test("payments reject impossible dates and amounts rounded to zero before database access", async () => {
  let databaseCalls = 0;
  const payment = await loadModule("../models/paymentModels.js", {
    "node:crypto": { randomUUID },
    "../config/supabase.js": { supabase: { from: () => {
      databaseCalls++;
      throw new Error("Database boundary reached");
    } } },
  });
  for (const overrides of [
    { paymentDate: "2026-02-30" },
    { paymentDate: "2025-02-29" },
    { paymentDate: "2026-04-31" },
    { totalPaid: 0.001 },
    { amountTendered: 0.001 },
  ]) {
    await assert.rejects(payment.createPayment({ billingId: 1, totalPaid: 10, ...overrides }),
      (error) => error.statusCode === 400);
  }
  assert.equal(databaseCalls, 0);
  await assert.rejects(payment.createPayment({ billingId: 1, totalPaid: 0.01, paymentDate: "2024-02-29" }),
    /Database boundary reached/);
  assert.equal(databaseCalls, 1);
});

test("missing settings and database failures receive distinct HTTP responses", async () => {
  let result = { data: null, error: null };
  const model = await loadModule("../models/systemSettingsModels.js", {
    "../config/supabase.js": { supabase: { from: () => ({
      select: () => ({ eq: () => ({ maybeSingle: async () => result }) }),
    }) } },
  });
  const controller = await loadModule("../controllers/systemSettingsControllers.js", {
    "../models/systemSettingsModels.js": model,
  });
  const req = { params: { key: "missing" }, body: { value: 15 }, user: { id: 1 } };
  const res = { status(code) { this.statusCode = code; return this; }, json(body) { this.body = body; return this; } };
  const originalError = console.error;
  console.error = () => {};
  try {
    for (const handler of [controller.getSystemSettingByKey, controller.updateSystemSettingByKey]) {
      result = { data: null, error: null };
      await handler(req, res);
      assert.equal(res.statusCode, 404);
      result = { data: null, error: new Error("Database unavailable") };
      await handler(req, res);
      assert.equal(res.statusCode, 500);
    }
    result = { data: { setting_key: "rate_per_cubic_meter", setting_value: 15 }, error: null };
    await controller.getSystemSettingByKey(req, res);
    assert.equal(res.statusCode, 200);
    assert.equal(res.body.data.setting_value, 15);
  } finally {
    console.error = originalError;
  }
});

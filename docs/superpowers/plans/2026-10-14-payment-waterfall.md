# Flexible-Amount Waterfall Payment Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Record any positive admin-tendered amount as an oldest-to-newest waterfall producing one payment row per bill touched.

**Architecture:** New atomic Postgres `record_payment_waterfall` + `POST /api/payments/allocate` (admin-only); relax two old full-pay blocks on the legacy single-bill path; simplify `PaymentForm` to total-outstanding + preview and `PaymentProcessingPage` to a single allocate call.

**Tech Stack:** Node.js Express 5, Supabase Postgres (service-role RPC), React 19 + Vite frontend.

## Global Constraints

- Admin-only payment writes stay: `authorizeRoles("admin")` on all `POST /payments*`.
- Cash: `amountTendered >= amountApplied`, `change = tendered - applied`.
- GCash: `amountTendered == amountApplied <= totalOutstanding` + reference required (max 100 chars).
- Payment date stays Manila-today read-only `YYYY-MM-DD`.
- One idempotency key per whole allocation (max 200 chars), retry returns prior allocation.
- Billing status rule: `remaining_balance = 0 → Paid` else `Partially Paid`.
- No consumer self-pay, no credit carry-over, no disconnection-rule change.

---

### Task 1: Waterfall SQL function migration

**Files:**
- Create: `backend/db/payment_waterfall_migration.sql`
- Modify: `backend/db/migration.sql:502-678` (append `DROP FUNCTION IF EXISTS record_payment_waterfall` + copy of new function for fresh installs)
- Test: Supabase SQL Editor manual run

**Interfaces:**
- Consumes: `billing`, `payments`, `notifications` tables as defined in `migration.sql`.
- Produces: `record_payment_waterfall(p_consumer_id INTEGER, p_applied NUMERIC, p_amount_tendered NUMERIC, p_payment_date DATE, p_payment_method TEXT, p_reference_number TEXT, p_idempotency_key TEXT) RETURNS JSONB` with shape `{ payments: [...], billings: [...], total_applied, change_given }`.

- [ ] **Step 1: Write the migration file**

Create `backend/db/payment_waterfall_migration.sql` with this exact content:

```sql
DROP FUNCTION IF EXISTS record_payment_waterfall(INTEGER, NUMERIC, NUMERIC, DATE, TEXT, TEXT, TEXT);

CREATE OR REPLACE FUNCTION record_payment_waterfall(
    p_consumer_id INTEGER,
    p_applied NUMERIC,
    p_amount_tendered NUMERIC,
    p_payment_date DATE,
    p_payment_method TEXT,
    p_reference_number TEXT,
    p_idempotency_key TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_bill RECORD;
    v_left NUMERIC(10,2) := ROUND(p_applied, 2);
    v_slice NUMERIC(10,2);
    v_next_balance NUMERIC(10,2);
    v_next_status VARCHAR(30);
    v_payment payments%ROWTYPE;
    v_updated billing%ROWTYPE;
    v_payments JSONB := '[]'::JSONB;
    v_billings JSONB := '[]'::JSONB;
    v_existing payments%ROWTYPE;
BEGIN
    IF p_applied IS NULL OR ROUND(p_applied, 2) <= 0 THEN
        RAISE EXCEPTION 'Payment amount must be greater than zero.';
    END IF;
    IF p_amount_tendered IS NULL OR ROUND(p_amount_tendered, 2) <= 0 THEN
        RAISE EXCEPTION 'Amount received must be greater than zero.';
    END IF;
    IF p_payment_method NOT IN ('Cash', 'GCash') THEN
        RAISE EXCEPTION 'Unsupported payment method.';
    END IF;
    IF p_payment_date IS NULL THEN
        RAISE EXCEPTION 'Payment date is required.';
    END IF;
    IF p_payment_method <> 'Cash' AND NULLIF(TRIM(COALESCE(p_reference_number, '')), '') IS NULL THEN
        RAISE EXCEPTION 'An electronic payment reference number is required.';
    END IF;
    IF p_payment_method = 'Cash' AND ROUND(p_amount_tendered, 2) < ROUND(p_applied, 2) THEN
        RAISE EXCEPTION 'Cash received cannot be lower than the amount applied.';
    END IF;
    IF p_payment_method <> 'Cash' AND ROUND(p_amount_tendered, 2) <> ROUND(p_applied, 2) THEN
        RAISE EXCEPTION 'Electronic payment must equal the amount applied.';
    END IF;
    IF p_idempotency_key IS NULL OR TRIM(p_idempotency_key) = '' OR CHAR_LENGTH(TRIM(p_idempotency_key)) > 200 THEN
        RAISE EXCEPTION 'A valid payment idempotency key is required.';
    END IF;

    SELECT * INTO v_existing FROM payments WHERE idempotency_key LIKE TRIM(p_idempotency_key) || ':%' LIMIT 1;
    IF FOUND THEN
        SELECT jsonb_agg(to_jsonb(p) - 'idempotency_key') INTO v_payments FROM payments p WHERE p.idempotency_key LIKE TRIM(p_idempotency_key) || '%';
        RETURN jsonb_build_object('payments', COALESCE(v_payments, '[]'::JSONB), 'replayed', true);
    END IF;

    FOR v_bill IN SELECT * FROM billing WHERE user_id = p_consumer_id AND remaining_balance > 0 ORDER BY billing_date ASC, id ASC FOR UPDATE LOOP
        EXIT WHEN v_left <= 0;
        v_slice := LEAST(ROUND(v_bill.remaining_balance, 2), v_left);
        v_next_balance := ROUND(v_bill.remaining_balance - v_slice, 2);
        v_next_status := CASE WHEN v_next_balance = 0 THEN 'Paid' ELSE 'Partially Paid' END;

        INSERT INTO payments (billing_id, total_paid, amount_tendered, change_given, remaining_balance, payment_date, payment_method, reference_number, idempotency_key)
        VALUES (v_bill.id, v_slice, v_slice, 0.00, v_next_balance, p_payment_date, p_payment_method, NULLIF(TRIM(COALESCE(p_reference_number, '')), ''), TRIM(p_idempotency_key) || ':' || v_bill.id)
        RETURNING * INTO v_payment;

        UPDATE billing SET remaining_balance = v_next_balance, status = v_next_status, updated_at = NOW() WHERE id = v_bill.id RETURNING * INTO v_updated;

        INSERT INTO notifications (consumer_id, announcement_type, notification_type, priority, title, announcement_date, message, billing_id, payment_id, action_path, event_key)
        VALUES (v_bill.user_id, 'Payment Alert', 'payment_received', CASE WHEN v_next_balance = 0 THEN 'normal' ELSE 'high' END,
            CASE WHEN v_next_balance = 0 THEN 'Payment received' ELSE 'Partial payment received' END,
            (CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Manila')::DATE,
            CASE WHEN v_next_balance = 0 THEN format('We received your payment of PHP %s for bill #%s. This bill is now fully paid.', v_slice, v_bill.id)
                 ELSE format('We received your payment of PHP %s for bill #%s. Remaining balance: PHP %s.', v_slice, v_bill.id, v_next_balance) END,
            v_bill.id, v_payment.id, '/consumer/billing-ledger', format('payment-received:%s', v_payment.id))
        ON CONFLICT (event_key) DO NOTHING;

        v_payments := v_payments || jsonb_build_array((to_jsonb(v_payment) - 'idempotency_key'));
        v_billings := v_billings || jsonb_build_array(to_jsonb(v_updated));
        v_left := ROUND(v_left - v_slice, 2);
    END LOOP;

    IF v_payments = '[]'::JSONB THEN
        RAISE EXCEPTION 'No outstanding bills for this resident.';
    END IF;

    RETURN jsonb_build_object(
        'payments', v_payments,
        'billings', v_billings,
        'total_applied', (SELECT COALESCE(SUM((x->>'total_paid')::NUMERIC), 0) FROM jsonb_array_elements(v_payments) x),
        'change_given', CASE WHEN p_payment_method = 'Cash' THEN ROUND(p_amount_tendered - p_applied, 2) ELSE 0.00 END,
        'replayed', false
    );
END;
$$;

REVOKE ALL ON FUNCTION record_payment_waterfall(INTEGER, NUMERIC, NUMERIC, DATE, TEXT, TEXT, TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION record_payment_waterfall(INTEGER, NUMERIC, NUMERIC, DATE, TEXT, TEXT, TEXT) FROM anon;
REVOKE ALL ON FUNCTION record_payment_waterfall(INTEGER, NUMERIC, NUMERIC, DATE, TEXT, TEXT, TEXT) FROM authenticated;
GRANT EXECUTE ON FUNCTION record_payment_waterfall(INTEGER, NUMERIC, NUMERIC, DATE, TEXT, TEXT, TEXT) TO service_role;
```

- [ ] **Step 2: Verify SQL parses (no live DB needed)**

Run: `node --check backend/server.js`
Expected: PASS (exit 0; proves no JS breakage from this docs-only step).

- [ ] **Step 3: Apply in Supabase + verify 750 example**

Run in Supabase SQL Editor: paste the file content, then with a test consumer having Sept 500 + Oct 500 outstanding run `SELECT record_payment_waterfall(<consumerId>, 750, 750, CURRENT_DATE, 'Cash', NULL, 'manual-test-750');`
Expected: PASS with 2 payment objects (500 Paid, 250 Partially) — delete test rows afterwards or use a throwaway consumer.

- [ ] **Step 4: Commit**

```bash
git add backend/db/payment_waterfall_migration.sql
git commit -m "feat: add record_payment_waterfall SQL migration"
```

### Task 2: Backend model — relax old blocks + add waterfall

**Files:**
- Modify: `backend/models/paymentModels.js:136-169`
- Test: `node --check backend/models/paymentModels.js`

**Interfaces:**
- Consumes: `record_payment_waterfall` RPC from Task 1.
- Produces: `export async function createWaterfallPayment({ consumerId, totalApplied, amount, amountTendered, paymentDate, paymentMethod, referenceNumber, idempotencyKey })` returning `{ payments, billings, totalApplied, changeGiven, replayed }`.

- [ ] **Step 1: Delete the two old full-pay blocks**

In `backend/models/paymentModels.js` delete exactly these two `if` blocks (keep oldest-first check below them):

```js
    if (
      targetBilling.status === "Partially Paid" &&
      paymentAmount < Number(targetBilling.remaining_balance)
    ) {
      throw createError(
        "This bill already has a partial payment. The next payment must settle the full remaining balance.",
        400,
      );
    }
    if (
      String(targetBilling.billing_date).slice(0, 7) !== currentManilaMonth() &&
      paymentAmount < Number(targetBilling.remaining_balance)
    ) {
      throw createError(
        "Bills from previous months must be paid in full. Partial payments are allowed only for the current month's bill.",
        400,
      );
    }
```

Also delete the matching guard inside `record_payment_transaction` SQL mirror check in `backend/db/migration.sql:587-590` (keep `p_amount > remaining` guard). If `currentManilaMonth` becomes unused after deletion, delete `const currentManilaMonth = ...` lines 62-71 too.

- [ ] **Step 2: Run syntax check**

Run: `node --check backend/models/paymentModels.js`
Expected: PASS.

- [ ] **Step 3: Append waterfall model function**

Append to `backend/models/paymentModels.js`:

```js
export async function createWaterfallPayment({
  consumerId,
  totalApplied,
  amount,
  amountTendered,
  paymentDate,
  paymentMethod,
  referenceNumber,
  idempotencyKey,
}) {
  const userId = parsePositiveId(consumerId, "consumer ID");
  const applied = parsePaymentAmount(totalApplied ?? amount);
  const tendered = parsePaymentAmount(amountTendered ?? applied);
  const normalizedDate = parsePaymentDate(paymentDate);
  const normalizedMethod = parsePaymentMethod(paymentMethod);
  const normalizedReference = parseOptionalReference(referenceNumber);
  const normalizedKey = String(idempotencyKey ?? randomUUID()).trim();
  if (!normalizedKey || normalizedKey.length > 200) {
    throw createError("A valid payment idempotency key is required.");
  }
  if (normalizedMethod !== "Cash" && !normalizedReference) {
    throw createError("An electronic payment reference number is required.");
  }
  if (normalizedMethod === "Cash" && tendered < applied) {
    throw createError("Cash received cannot be lower than the amount applied.");
  }
  if (normalizedMethod !== "Cash" && tendered !== applied) {
    throw createError("Electronic payment must equal the amount applied.");
  }
  const { data: outstanding, error: outError } = await supabase
    .from("billing")
    .select("remaining_balance")
    .eq("user_id", userId)
    .gt("remaining_balance", 0);
  if (outError) throw createError(`Failed to load outstanding balance: ${outError.message}`, 500);
  const totalOutstanding = Number(
    (outstanding ?? []).reduce((t, b) => t + Number(b.remaining_balance || 0), 0).toFixed(2),
  );
  if (totalOutstanding <= 0) throw createError("No outstanding bills for this resident.", 409);
  if (normalizedMethod !== "Cash" && applied > totalOutstanding) throw createError("Electronic payments cannot exceed the total outstanding balance.", 400);
  const cappedApplied = Math.min(applied, totalOutstanding);
  const { data, error } = await supabase.rpc("record_payment_waterfall", {
    p_amount_tendered: tendered,
    p_applied: cappedApplied,
    p_consumer_id: userId,
    p_idempotency_key: normalizedKey,
    p_payment_date: normalizedDate,
    p_payment_method: normalizedMethod,
    p_reference_number: normalizedReference,
  });
  if (error) throw createError(error.message || "Failed to record payment.", paymentErrorStatus(error.message || ""));
  return { ...data, changeGiven: Number(data?.change_given ?? Math.max(tendered - cappedApplied, 0)), totalApplied: Number(data?.total_applied ?? cappedApplied) };
}
```

Note: cash overpay is allowed at RPC input because `tendered` may exceed `applied`; `applied` itself is capped to total.

- [ ] **Step 4: Run syntax check**

Run: `node --check backend/models/paymentModels.js`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add backend/models/paymentModels.js backend/db/migration.sql
git commit -m "feat: relax single-bill blocks and add waterfall model"
```

### Task 3: Controller + route for allocate

**Files:**
- Modify: `backend/controllers/paymentControllers.js:1-27`
- Modify: `backend/routes/paymentRoutes.js:1-28`
- Test: `node --check backend/controllers/paymentControllers.js backend/routes/paymentRoutes.js`

**Interfaces:**
- Consumes: `createWaterfallPayment` from Task 2.
- Produces: `POST /api/payments/allocate` → `{ success: true, message, data }`.

- [ ] **Step 1: Add controller handler**

In `backend/controllers/paymentControllers.js` extend the import to include `createWaterfallPayment` and append:

```js
export async function allocatePayment(req, res) {
  try {
    return res.status(201).json({
      success: true,
      message: "Payment allocated oldest to newest.",
      data: await createWaterfallPayment(req.body ?? {}),
    });
  } catch (error) {
    return sendError(res, error, "Failed to allocate payment.");
  }
}
```

- [ ] **Step 2: Add route before `/:id`**

In `backend/routes/paymentRoutes.js` import `allocatePayment` and insert before `router.get("/:id", ...)`:

```js
router.post("/allocate", authorizeRoles("admin"), allocatePayment);
```

Route order must be: `GET /`, `GET /consumer/:consumerId`, `GET /billing/:billingId`, `POST /allocate`, `POST /`, `GET /:id` — otherwise Express matches `allocate` as `:id`.

- [ ] **Step 3: Run checks**

Run: `node --check backend/controllers/paymentControllers.js; node --check backend/routes/paymentRoutes.js`
Expected: PASS both.

- [ ] **Step 4: Smoke test with dev server**

Run: `cd backend; npm start` then `curl -X POST http://127.0.0.1:5000/api/payments/allocate -H "Authorization: Bearer <admin-jwt>" -H "Content-Type: application/json" -d "{\"consumerId\":1,\"totalApplied\":1,\"paymentMethod\":\"Cash\"}"`
Expected: 409 `No outstanding bills` or 200 allocation — either proves routing + auth works (not 404 route-missing).

- [ ] **Step 5: Commit**

```bash
git add backend/controllers/paymentControllers.js backend/routes/paymentRoutes.js
git commit -m "feat: add POST /payments/allocate endpoint"
```

### Task 4: Frontend API service

**Files:**
- Modify: `frontend/src/services/paymentAPI.js:71-86`
- Test: `cd frontend && npm run lint`

**Interfaces:**
- Consumes: `POST /api/payments/allocate` from Task 3.
- Produces: `recordWaterfallPayment(payload)` returning `{ payments: NormalizedPayment[], billings, totalApplied, changeGiven }`.

- [ ] **Step 1: Add service function**

Append to `frontend/src/services/paymentAPI.js`:

```js
export async function recordWaterfallPayment(payload, options = {}) {
  const response = await apiClient.post("/payments/allocate", {
    consumerId: Number(payload.consumerId),
    amountTendered: Number(payload.amountTendered ?? payload.totalApplied),
    idempotencyKey: payload.idempotencyKey,
    paymentDate: payload.paymentDate,
    paymentMethod: payload.paymentMethod,
    referenceNumber: payload.referenceNumber || null,
    totalApplied: Number(payload.totalApplied ?? payload.amount),
  }, options);
  const result = response.data?.data ?? {};
  const raws = Array.isArray(result.payments) ? result.payments : [];
  return {
    billings: result.billings ?? [],
    changeGiven: Number(result.changeGiven ?? result.change_given ?? 0),
    payments: raws.map(normalizePaymentRecord),
    replayed: Boolean(result.replayed),
    totalApplied: Number(result.totalApplied ?? result.total_applied ?? 0),
  };
}
```

- [ ] **Step 2: Lint**

Run: `cd frontend; npm run lint`
Expected: PASS (no new lint errors in `paymentAPI.js`).

- [ ] **Step 3: Commit**

```bash
git add frontend/src/services/paymentAPI.js
git commit -m "feat: add waterfall payment API client"
```

### Task 5: PaymentForm — any-amount + preview

**Files:**
- Modify: `frontend/src/components/PaymentForm.jsx:34-264,415-538`
- Test: `cd frontend && npm run lint`

**Interfaces:**
- Consumes: `billingRecords` (normalized, `outstandingBalance`, `raw.billing_date`, `raw.user_id`), `recordWaterfallPayment` indirectly via `onSubmit` payload `{ consumerId, totalApplied, amountTendered, ... }`.
- Produces: `onSubmit` payload with `consumerId` + `totalApplied` + preview allocations array.

- [ ] **Step 1: Replace scope/balance logic**

Replace `balance`/`amountApplied` block (lines ~148-166) with:

```jsx
const residentBillsSorted = residentBills; // already oldest-first sorted above
const totalOutstanding = Number(residentBillsSorted.reduce((t, b) => t + Number(b.outstandingBalance || 0), 0).toFixed(2));
const balance = totalOutstanding;
const amountReceived = Number(form.amountReceived) || 0;
const amountApplied = Math.min(amountReceived, totalOutstanding);
const changeGiven = form.paymentMethod === "Cash" ? Math.max(amountReceived - amountApplied, 0) : 0;
const remainingBalance = Math.max(totalOutstanding - amountApplied, 0);
const previewAllocations = (() => {
  let left = amountApplied;
  return residentBillsSorted.map((b) => {
    const slice = Math.min(Number(b.outstandingBalance || 0), left);
    left = Math.max(left - slice, 0);
    return { id: b.id, period: b.billingPeriod, invoice: b.invoiceNumber, outstanding: Number(b.outstandingBalance || 0), slice, leftAfter: Math.max(Number(b.outstandingBalance || 0) - slice, 0) };
  }).filter((a) => a.slice > 0);
})();
```

- [ ] **Step 2: Replace validation**

Replace the `validate()` branches for `paymentScope`/current-month/partial (lines ~229-251) with:

```js
} else if (form.paymentMethod !== "Cash" && Number(form.amountReceived) > totalOutstanding) {
  nextErrors.amountReceived = "Electronic payments cannot exceed the total outstanding balance.";
}
```

Delete `selectedBillIsCurrentMonth` and `selectedBillHasPartialPayment` consts and their hint paragraph; replace hint with `` `${residentBills.length} outstanding bill(s) · Total ${currency(totalOutstanding)} · Any amount pays oldest first` ``.

- [ ] **Step 3: Replace coverage radio + confirm payload**

Delete the `Payment coverage` fieldset (oldest/all radios) and `Other outstanding bills` static list; render `previewAllocations` list instead (period, invoice, `slice` applied, `leftAfter`). In `confirmPayment`, send:

```js
const saved = await onSubmit({
  ...form,
  consumerId: Number(selectedBilling?.raw?.user_id ?? residentBills[0]?.raw?.user_id),
  totalApplied: amountApplied,
  amountReceived,
  amountTendered: amountReceived,
  idempotencyKey: idempotencyKeyRef.current,
  paymentStatus: amountApplied >= totalOutstanding ? "Paid" : "Partially Paid",
  remainingBalance,
  changeGiven,
  allocations: previewAllocations,
});
```

- [ ] **Step 4: Lint**

Run: `cd frontend; npm run lint`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/components/PaymentForm.jsx
git commit -m "feat: flexible-amount form with waterfall preview"
```

### Task 6: Page + modal — single allocate call

**Files:**
- Modify: `frontend/src/pages/PaymentProcessingPage.jsx:124-221`
- Modify: `frontend/src/components/PaymentModal.jsx:58-128`
- Test: `cd frontend && npm run build`

**Interfaces:**
- Consumes: `recordWaterfallPayment` from Task 4, `previewAllocations` from Task 5.
- Produces: success object `{ paymentCount, totalApplied, payments }` shown in modal.

- [ ] **Step 1: Replace N-loop with single call**

Replace the `targetBillings` + `for` loop in `recordPayment` (lines ~136-182) with:

```js
const consumerId = Number(billing.raw?.user_id);
const { payments: apiPayments, totalApplied } = await recordWaterfallPayment({
  amountTendered: Number(payment.amountTendered ?? payment.totalApplied),
  consumerId,
  idempotencyKey: payment.idempotencyKey,
  paymentDate: payment.paymentDate,
  paymentMethod: payment.paymentMethod,
  referenceNumber: payment.referenceNumber,
  totalApplied: Number(payment.totalApplied),
});
const savedPayments = apiPayments.map((p, i) => {
  const target = billingRecords.find((r) => r.id === p.billingId) ?? billing;
  return { ...p, address: target.address, amountDue: p.amountPaid, billingId: p.billingId, consumerName: target.consumerName, currentReading: target.currentReading, invoiceNumber: target.invoiceNumber, name: target.consumerName, paymentStatus: p.paymentStatus, previousReading: target.previousReading, remainingBalance: p.remainingBalance };
});
```

Keep the existing `setPayments`, `closePaymentModal`, `fetchBillingHistory`, toast blocks unchanged. Return `{ ...savedPayments[0], amountPaid: totalApplied, paymentCount: savedPayments.length, payments: savedPayments }`.

- [ ] **Step 2: Update success copy**

In `PaymentModal.jsx` change `The transaction is in the payment ledger...` fallback and amounts to use `completedPayment.amountPaid` (now total applied) — already does; change subtitle for `paymentCount > 1` to `` `${completedPayment.paymentCount} bills were paid oldest to newest (waterfall).` ``.

- [ ] **Step 3: Build**

Run: `cd frontend; npm run build`
Expected: PASS (dist built, no errors).

- [ ] **Step 4: Commit**

```bash
git add frontend/src/pages/PaymentProcessingPage.jsx frontend/src/components/PaymentModal.jsx
git commit -m "feat: single-call waterfall payment processing"
```

### Task 7: Docs + end-to-end verification

**Files:**
- Modify: `README.md:492-506` (Payment Rules section)
- Test: manual + `npm run lint` / `npm run build` / `npm start`

**Interfaces:**
- Consumes: all tasks above.
- Produces: updated README + verified 750-peso scenario.

- [ ] **Step 1: Update README Payment Rules**

Replace rules 2-6 with:

```md
1. The payment applies oldest outstanding bill first, cascading any remainder to the next bills.
2. Any positive amount is accepted; repeated partials are allowed.
3. One tender creates one payment row per bill touched (e.g. 750 vs 500+500 → 500 Paid + 250 Partially Paid, 250 left).
4. Cash tendered may exceed the total; excess returns as change. GCash payments must equal the applied amount, cannot exceed the total, and require a reference number.
5. Payment date is read-only Manila today. Idempotency keys cover the whole allocation.
```

- [ ] **Step 2: End-to-end check**

Run: `cd backend; npm start` + `cd frontend; npm run dev`, create/verify a consumer with two 500 bills, record 750 cash, confirm Sept Paid + Oct remaining 250 and two payment rows.
Expected: PASS — ledger shows 500 + 250, billing shows 250 left.

- [ ] **Step 3: Final checks + commit**

Run: `cd frontend; npm run lint; npm run build`
Expected: PASS both. Then:

```bash
git add README.md
git commit -m "docs: update payment rules for waterfall"
```

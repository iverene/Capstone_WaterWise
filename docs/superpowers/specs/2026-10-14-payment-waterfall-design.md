# Flexible-Amount Waterfall Payment — Design (2026-10-14)

## Goal
Allow admin to record any positive amount for a consumer. Amount cascades oldest bill → newest.
Example: Sept 500 + Oct 500 = 1000 due, tender 750 → Sept Paid (500 row), Oct Partially Paid (250 paid, 250 remaining).

Decisions confirmed: admin-only, split payment rows per bill touched, cash change + block e-pay over total, any positive amount allowed with repeated partials.

## Scope
In: backend allocate endpoint + atomic SQL, relax old single-bill blocks, frontend form simplification, receipt/modal update, migration doc.
Out: consumer self-pay, credit/advance balance, rate changes, disconnection rule changes, SMS/email delivery.

## Architecture
- Keep `POST /api/payments` (single-bill, `billingId`) for backward compat, but remove two blocks:
  1. `paymentModels.js` past-month full-pay check (~L145-153).
  2. `paymentModels.js` + `record_payment_transaction` settle-partial-in-full check (~L136-144, SQL L587-590).
  Oldest-first check stays for single-bill path.
- Add `POST /api/payments/allocate` (`consumerId`, `amountTendered`/`amount`, `paymentMethod`, `referenceNumber`, `paymentDate`, `idempotencyKey`). Admin-only via existing `authorizeRoles("admin")` in `paymentRoutes.js`.
- New SQL `record_payment_waterfall(p_consumer_id, p_amount_tendered, p_applied, p_payment_date, p_payment_method, p_reference, p_idempotency_key)`:
  - Locks `billing WHERE user_id=X AND remaining_balance>0 ORDER BY billing_date,id FOR UPDATE`.
  - Loops, inserts one `payments` row per bill with `total_paid=p_slice`, updates `billing.remaining_balance/status`.
  - Idempotency: if key exists, verify same consumer/applied/method, return prior allocation JSON; else proceed.
  - Single transaction; concurrent pays serialize on row locks.
  - Notifications: one `payment_received`/`partial` row per bill touched (same pattern as existing function).

## Components
1. **DB migration** `backend/db/payment_waterfall_migration.sql`: new function + grants to `service_role` only (mirror existing revokes).
2. **`paymentModels.js`**: add `createWaterfallPayment()` with parsers reused (`parsePositiveId`, `parsePaymentAmount`, `parsePaymentDate`, `parsePaymentMethod`, `parseOptionalReference`); validates cash `tendered>=applied`, GCash `tendered==applied` + reference, `applied<=totalOutstanding` (GCash hard, cash allows tendered>total with change).
3. **`paymentControllers.js` + `paymentRoutes.js`**: `allocatePayment` handler + `router.post("/allocate", authorizeRoles("admin"), allocatePayment)` before `/:id` route.
4. **Frontend `PaymentForm.jsx`**: remove `paymentScope` oldest/all radio, remove `selectedBillIsCurrentMonth`/`selectedBillHasPartialPayment` error branches; compute `totalOutstanding`, `amountApplied=min(tendered,total)`, `change`, `remainingAfter`; add allocation preview (oldest→newest slice list); keep Manila-today date, Cash/GCash + reference, `Pay full balance` sets tendered=total.
5. **`PaymentProcessingPage.jsx:recordPayment`**: single `allocate` call (no N-loop); success object `{paymentCount, totalApplied, allocations}`; refresh billings; toast `N bills touched`.
6. **`PaymentModal.jsx` / `PaymentReceiptModal`**: show transaction count + allocation breakdown when `paymentCount>1`; single receipt view stays for `count==1`.

## Data flow
1. Admin selects resident (oldest bill preselected for display only).
2. Enters tendered amount, method, reference, date (read-only Manila today).
3. Frontend previews allocation locally for UX; backend is source of truth.
4. `POST /allocate` → SQL waterfall → returns `{payments:[...], billings:[...], totalApplied, changeGiven}`.
5. Frontend refreshes `fetchBillingHistory`, SSE `data-change` clears cache (no new cache work).

Cash 750 vs 1000 due → applied 750, change 0. Cash 1200 vs 1000 → applied 1000, change 200. GCash 1200 vs 1000 → 400 `Electronic payments cannot exceed the total outstanding balance.`

## Error handling
- `amount<=0` → 400 `Payment amount must be greater than zero.` (min 0.01 after rounding).
- Unknown consumer / no outstanding → 404 / 409 `No outstanding bills for this resident.`
- GCash without reference → 400; GCash tendered≠applied → 400; Cash tendered<applied → 400.
- Retry same idempotency key + same payload → return prior allocation; different payload → 400 `already used for different payment details`.
- Partial failure impossible (single transaction); frontend shows backend message via existing error + toast path.

## Status & flagged accounts
- Billing `status`: `Paid` when `remaining_balance=0` else `Partially Paid`; `Unpaid` only when untouched.
- Flagged (`>=3 bills with remaining_balance>0`) unchanged — Oct 250 remainder still counts. No disconnection logic change.

## Testing
- SQL: 750→500+250, exact 1000→both Paid, 100 partial→oldest 400 left + repeat partial allowed, cash overpay change, GCash overpay rejected, idempotent retry same result, concurrent lock sanity.
- Backend: validation matrix (method/reference/amount/date/idempotency), old single-bill path still oldest-first.
- Frontend: preview math (applied/change/remaining), `Pay full balance`, allocation list order, success modal counts.
- Manual: `npm start` syntax, `npm run lint/build`, one resident with 2 bills end-to-end.

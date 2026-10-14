# WaterWise — Sucol Water System

WaterWise is a full-stack water consumption, billing, payment, and account-management system for administrators, meter readers, and consumers. It records monthly meter readings, creates billing records, delivers notifications, tracks payments, and provides AI-assisted consumption analysis.

## Main Features

### Administrator

- View consumption, billing, payment, and resident KPIs.
- Create and update consumer accounts using any complete, valid email domain.
- View consumer meter readings through the administrator read-only endpoint.
- Manage persistent community events and announcements. Creating or changing an event automatically synchronizes a system-wide consumer notification.
- Review one grouped row per resident in Readings, Billing, and Payments, then open resident-specific record details.
- Process the oldest outstanding bill first or settle every outstanding bill from oldest to newest.
- Review residents with three or more outstanding monthly bills from the Flagged Accounts workspace.
- Confirm account disconnection only after the backend revalidates the resident's outstanding bills.
- View consumption predictions, anomaly detection, recommendations, analytics, and reports.
- Use email OTP two-factor authentication before entering the admin portal.
- Review the administrator username and manage email and security options from Admin Profile Management.
- Change the administrator password using registered-email OTP only.
- Change the administrator email after verifying the current email.
- Trust a verified administrator browser so later logins can skip OTP after the password is validated. Trust lasts 7 days for Super Admins and 15 days for regular Admins.
- Review and revoke individual trusted devices, or revoke all other trusted devices, from Profile Security.
- Change a resident password after verifying a single-use OTP sent to the acting administrator's registered email. Other resident profile changes do not require OTP.
- Super Admins can create regular Admin and Meter Reader accounts with temporary passwords from Profile Management.
- Super Admins can browse the Admin and Meter Reader directories two accounts per page.
- Super Admins can manage system-wide settings (e.g., water rate per cubic meter) through an OTP-gated settings page at `/admin/settings`. Accessing settings requires email OTP verification; editing the rate requires a second OTP.

### Meter Reader

- View consumers and their latest readings.
- Record one consumption reading per consumer per month.
- Calculate consumption from previous and present meter values.
- Trigger billing and consumer notifications after a successful reading.
- Change the signed-in password using the current password or email OTP.
- Change the registered email after verifying an OTP sent to the current email.

### Consumer

- View current balances, billing history, consumption summaries, and graphs.
- View profile information and announcements.
- Receive targeted and system-wide notifications.
- Receive new, updated, and cancelled community-event notices through the notification feed.
- Mark notifications as read.
- Review payment and billing information.
- Change the signed-in password using the current password or email OTP.

## Technology Stack

| Layer | Technology |
| --- | --- |
| Frontend | React 19, Vite, Axios, Tailwind CSS, Recharts |
| Backend | Node.js, Express 5 |
| Database | PostgreSQL through Supabase |
| Authentication | bcrypt password hashing, backend-issued JWTs, email OTP, hashed trusted-device tokens |
| Email | Brevo Transactional Email API |
| Shared server cache | Upstash Redis |
| AI | Google Gemini |

## Mobile-First UI

The frontend is designed mobile-first with responsive breakpoints:

- **Font scaling:** Eyebrow labels use `text-[10px]` on mobile, headings scale from `text-2xl` to `text-3xl`, descriptions use reduced sizes via `descriptionClassName`.
- **Buttons:** Minimum height `min-h-10` on mobile, scaling to `min-h-12` on desktop.
- **OTP input:** Auto-verify on 6-digit completion with success animation. Toast notifications for rate-limit warnings instead of inline text.
- **Offline banner:** Shows under the header for meter-readers with pending reading count; other roles see a generic offline message.
- **Search + filter animation:** On RecordConsumptionPage, mobile search expands on focus and hides the filter button (300ms transition). Collapses on blur, click-outside, or Escape.
- **Notifications:** Infinite scroll with IntersectionObserver on NotificationPage; paginated announcements on AnnouncementPage.
- **Sticky header:** `bg-white/90 backdrop-blur-md` on mobile for readability while scrolling.

## Portal Data Caching and Realtime Refresh

WaterWise caches authenticated GET responses for the Admin/Super Admin, Meter Reader, and Consumer portals. The cache prevents page navigation and existing refresh intervals from repeatedly querying the API and database when the underlying data has not changed.

### Cache behavior

1. The first GET request loads data from the Express API and stores the successful response in browser `sessionStorage`.
2. Later requests for the same endpoint in the same browser-tab session are served from the cache.
3. Identical GET requests made at the same time are deduplicated into one network request.
4. A successful `POST`, `PUT`, `PATCH`, or `DELETE` request publishes an authenticated server-sent event through `GET /api/changes/stream`.
5. Connected portals receive the event, clear their API cache, and reload the currently displayed portal data.
6. The stream includes a change version. After a temporary disconnection, the frontend compares versions and refreshes if an event was missed.
7. Logging out or switching accounts removes cached API responses.

Scheduled billing reminders also publish a change event when they create notifications. Downloads and blob responses are intentionally excluded from API caching. The Meter Reader's existing IndexedDB context cache, offline reading outbox, and synchronization workflow remain separate and continue to support offline field work.

### Scope and isolation

Every cache entry includes the authenticated role and account ID:

```text
waterwise-api-cache:admin:1:/consumption/history/monthly?
waterwise-api-cache:consumer:25:/billing/consumer/25?
waterwise-api-cache:meter-reader:4:/consumption/readings/contexts?
```

The cache is **per browser-tab session**, not a device-wide or system-wide shared cache:

- Navigation and page refreshes in the same tab reuse cached data.
- A different tab, browser, private window, laptop, or phone maintains a separate cache and performs its own initial request.
- Closing the browser-tab session normally removes its `sessionStorage` cache.
- Browser caches are never used as an authorization mechanism; every uncached API request still requires the JWT and backend role/ownership checks.

### Shared admin consumption cache

The Express backend also uses Upstash Redis as a shared cache for admin consumption data. Unlike browser `sessionStorage`, this cache is reused across browsers, devices, and backend instances. It covers the admin readings table, rankings, overall monthly and yearly history, all-purok comparisons, and per-purok graphs.

Admin consumption entries use an eight-hour fallback TTL. After a meter reading is successfully written through WaterWise, the backend immediately deletes the affected shared admin keys. The next admin request queries Supabase once, stores the fresh result in Redis, and later requests reuse it. Invalidation is targeted: shared aggregates and the affected purok are refreshed without removing unrelated data.

Consumer-specific consumption history and meter-reader recording contexts are intentionally not stored in Redis; those requests query Supabase directly. If Redis is unavailable, admin endpoints also fall back to Supabase instead of failing. Direct database changes made outside the WaterWise backend do not trigger immediate invalidation and become visible after the fallback TTL unless a separate database webhook is configured.

Relevant backend files:

- `backend/config/redis.js`
- `backend/services/consumptionCache.js`
- `backend/controllers/consumptionControllers.js`

The server-sent-event subscriber list and change version remain held in one backend process, so a horizontally scaled deployment must use shared pub/sub to distribute browser invalidation events across all instances.

### Verify caching in development

1. Sign in and open DevTools **Network > Fetch/XHR**.
2. Open a portal page and confirm its initial `/api/...` GET requests.
3. Clear the Network list, navigate away, and return to the same page.
4. Confirm the data renders without repeating the cached GET requests. `/api/changes/stream` remaining pending is expected because it is the live event connection.
5. Open DevTools **Application > Session Storage** and confirm keys beginning with `waterwise-api-cache:`.
6. Create or update data from another authenticated portal. Confirm the first portal receives the event and performs fresh GET requests.
7. Log out and confirm all `waterwise-api-cache:` entries are removed.

Relevant implementation files:

- `frontend/src/services/apiClient.js`
- `frontend/src/services/apiCache.js`
- `frontend/src/services/dataChangeStream.js`
- `frontend/src/services/authToken.js`
- `backend/routes/changeEventRoutes.js`
- `backend/services/changeEventService.js`

## Project Structure

```text
Capstone_WaterWise/
├── backend/
│   ├── config/
│   ├── controllers/
│   ├── db/
│   │   ├── migration.sql
│   │   └── system_settings_migration.sql
│   ├── middleware/
│   ├── models/
│   ├── routes/
│   ├── services/
│   ├── server.js
│   └── package.json
├── frontend/
│   ├── public/
│   ├── src/
│   │   ├── components/
│   │   ├── pages/
│   │   └── services/
│   ├── vite.config.js
│   └── package.json
└── README.md
```

## Prerequisites

- Node.js 20 or later
- npm
- A Supabase project
- A Brevo account, API key, and verified transactional sender
- An Upstash Redis database with REST credentials
- A Google Gemini API key for AI features

## Database Setup

1. Open the Supabase SQL Editor.
2. Open [`backend/db/migration.sql`](backend/db/migration.sql).
3. Run the SQL against the intended Supabase project.
4. Confirm that the tables, indexes, triggers, and database functions were created.

Core tables include:

- `admins`
- `consumers`
- `meter_readers`
- `consumption`
- `billing`
- `payments`
- `notifications`
- `notification_reads`
- `events`
- `generated_reports`
- `ai_consumption_cache`
- `admin_trusted_devices`
- `consumer_push_subscriptions`
- `notification_push_jobs`
- `password_reset_request_limits`
- `system_settings`

The migration adds `admins.role` with `admin` and `super-admin` values. When upgrading an existing database with no Super Admin, the oldest existing administrator is promoted automatically. That account must sign out and sign in again after the migration so its new role is included in the JWT.

The `admin_trusted_devices` table stores only SHA-256 hashes of random browser tokens. It records the owning administrator, role, user agent, creation time, last use, expiration, and revocation time. Run the latest migration before enabling trusted-device login; the backend does not create this table automatically.

The `system_settings` table stores configurable system-wide settings such as the water rate per cubic meter. It is seeded with a default rate of ₱15.00/m³. Only the Super Admin can read or modify settings through the API, and all write operations require OTP verification. Run `backend/db/system_settings_migration.sql` to add this table.

Web Push uses `consumer_push_subscriptions` for browser delivery endpoints and `notification_push_jobs` as a queue populated by a database trigger whenever a notification is inserted or materially updated. Generate a VAPID key pair once with `npm run generate-vapid-keys` inside `backend`, then set `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, and a `VAPID_SUBJECT` such as `mailto:admin@example.com` in the backend environment. Never expose the private key to the frontend.

The frontend includes `frontend/vercel.json`, which rewrites direct application paths such as `/consumer/home` to `index.html`. Keep the Vercel project Root Directory set to `frontend` so notification clicks and browser refreshes resolve through React Router.

The `events` table stores the event title, resident information, date, time, location, categories, status, creator, and audit timestamps. Row Level Security is enabled, direct `anon` and `authenticated` table access is revoked, and the Express backend accesses it with the server-only Supabase service-role key.

The `sync_event_notification` database trigger maintains one system-wide notification per event using the stable `community-event:<event-id>` key. Existing events are backfilled when the migration is run. Updating or cancelling an event updates its notification and clears prior read records so consumers see the change as unread. Deleting an event also removes its related notification.

## Environment Configuration

Create `backend/.env`:

```env
PORT=5000
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_KEY=your-supabase-key
SUPABASE_SERVICE_ROLE_KEY=your-supabase-service-role-key
JWT_SECRET=use-a-long-random-secret-with-at-least-32-characters
GEMINI_API_KEY=your-gemini-api-key
BREVO_API_KEY=xkeysib-your-brevo-api-key
BREVO_FROM_EMAIL=your-verified-sender@example.com
BREVO_FROM_NAME=Sucol Water System
UPSTASH_REDIS_REST_URL=https://your-database.upstash.io
UPSTASH_REDIS_REST_TOKEN=your-upstash-rest-token
# Optional; minimum 60000 ms. Defaults to six hours.
NOTIFICATION_REMINDER_INTERVAL_MS=21600000
```

`BREVO_FROM_EMAIL` must be an active, verified sender in the Brevo account associated with `BREVO_API_KEY`. Password recovery, admin login, staff-action, resident password-change, and email-change codes use the Brevo Transactional Email API. For better deliverability, authenticate a sender domain with DKIM and DMARC.

Upstash credentials are server-only. When they are absent or Redis is temporarily unavailable, WaterWise bypasses the shared cache and queries Supabase directly.

The frontend uses `/api` by default. An optional `frontend/.env` can override its API address:

```env
VITE_API_URL=/api
```

During local development, Vite proxies `/api` to the backend. `WATERWISE_API_TARGET` can override the proxy target when starting Vite:

```powershell
$env:WATERWISE_API_TARGET="http://127.0.0.1:5000"
npm run dev
```

Never expose the Supabase service-role key, JWT secret, Brevo API key, Upstash REST token, or Gemini API key through frontend environment variables.

## Installation and Development

Install and start the backend:

```powershell
cd backend
npm install
npm run dev
```

In another terminal, install and start the frontend:

```powershell
cd frontend
npm install
npm run dev
```

Open `http://localhost:5173`. The backend uses `http://127.0.0.1:5000` unless `PORT` is changed.

For testing from another device on the same network, start Vite with host access and open the computer's private address, for example `http://192.168.1.87:5173`. In development, the backend accepts Vite port `5173` from RFC 1918 private addresses (`10.x.x.x`, `172.16-31.x.x`, and `192.168.x.x`). Production CORS remains restricted to configured frontend origins.

## Authentication and Account Security

### Standard login

Consumers and meter readers submit their username/email and password to `POST /api/auth/login`. After successful authentication, the frontend stores the JWT and account data in tab-scoped `sessionStorage`. Access tokens expire by role: four hours for Consumers, two hours for Meter Readers, one hour for Admins, and 30 minutes for Super Admins.

Protected requests include:

```http
Authorization: Bearer <token>
X-Device-Fingerprint: <browser-fingerprint-hash>
```

### Administrator OTP and trusted-device login

Administrators use two-step authentication:

1. The administrator submits a valid username/email and password.
2. The backend validates the credentials but does not issue an access token yet.
3. Brevo sends a six-digit OTP to the registered administrator email.
4. The administrator verifies the OTP through `POST /api/auth/admin/verify-login-otp`.
5. Successful OTP verification creates the admin JWT and a random trusted-device token in an `HttpOnly` browser cookie.

Admin login codes expire after 5 minutes, allow up to five incorrect attempts, and cannot be reused after successful verification.

On later logins, the backend still validates the administrator password first. If the browser presents an active trusted-device cookie belonging to the same administrator and role, the backend skips only the OTP step and issues the normal role-based access JWT. Admin access tokens expire after one hour and Super Admin access tokens after 30 minutes. A regular Admin browser remains trusted for 15 days; a Super Admin browser remains trusted for 7 days.

The browser stores the raw random token only in an `HttpOnly` cookie. The database stores only its SHA-256 hash. Production cookies use `Secure` and `SameSite=None` for the deployed cross-origin frontend/backend configuration. Frontend API requests therefore use credentials, and backend CORS allows credentialed requests only from approved origins.

Admin Profile Management contains one **Profile security** section with **Trusted devices**, **Change password**, and **Change email** controls. The device view shows the platform, browser, last-used time, expiry, and current device. Administrators can revoke one device or all other devices. A revoked or expired browser must complete OTP again on its next login. Revocation removes trusted-browser status; it does not cancel an access JWT that was already issued for the current role-based session. Explicit sign-out ends only the JWT/session and keeps the browser trusted, so the next sign-in on the same browser can skip OTP until expiry, manual revoke, or password change. Changing or resetting an administrator password revokes every trusted device for that account.

### Forgot-password OTP flow

1. The user opens **Forgot password?** and enters the registered email.
2. The backend sends a six-digit OTP through Brevo Transactional Email.
3. The user verifies the OTP.
4. Only verified users can open the new-password step.
5. The reset session becomes invalid after the password is changed.

The forgot-password form checks the backend account database before sending an OTP and reports when an email is not registered. This avoids consuming an email request for an unknown account, but intentionally allows account-email discovery; request throttling must remain enabled to reduce automated enumeration and email abuse.

### Change password while signed in

The desktop account actions are hidden by default and appear after clicking the profile/account identity. Administrators and consumers open their dedicated profile pages for password and email security controls. Meter readers retain the account-menu password option.

The password dialog offers two verification methods:

- **Current password:** verify the existing password before saving a different strong password.
- **Email OTP:** send a code to the email already registered to the authenticated account, verify it, then create a new password.

Users cannot redirect the signed-in OTP to another email address.

For administrators, the Profile Management password action uses **Email OTP only**; the current-password method is intentionally unavailable.

### Administrator-managed resident passwords

Regular Admins and Super Admins can optionally assign a new password while editing a resident:

1. The administrator enters a strong new password in **Edit resident**.
2. The backend sends a six-digit OTP to the acting administrator's registered email.
3. The OTP challenge is bound to the acting administrator and selected resident.
4. Successful verification creates a single-use authorization valid for five minutes.
5. The consumer update accepts the password only when that authorization matches the same administrator and resident.

The OTP expires after 5 minutes and allows up to five incorrect attempts. Updating the resident's name, username, email, contact number, purok, or account status does not request OTP when the optional password field is blank.

### Consumer email change

Consumers can select **Change email** from the **Account security** section of their Household Profile page. WaterWise first sends an OTP to the current registered email. After successful verification, the consumer can enter a different complete email address. Codes expire after 5 minutes and allow up to five incorrect attempts.

If the consumer cannot remember or access the current email, the self-service change cannot continue. The consumer must visit the Sucol Water System office so staff can verify their identity and update the account safely.

### Password requirements

New passwords require at least eight characters with:

- One uppercase letter
- One lowercase letter
- One number
- One symbol

Successful password changes clear temporary login lockouts.

## Role-Based Access

| Role | Main Permissions |
| --- | --- |
| `admin` | Manage residents, OTP-protected resident password changes, grouped readings and billing records, oldest-first payments, flagged accounts, confirmed disconnections, events, announcements, analytics, reports, and personal trusted devices |
| `super-admin` | All normal admin operations plus exclusive Admin and Meter Reader account creation, and system-wide settings management (OTP-gated) |
| `meter-reader` | View reading information and record consumption |
| `consumer` | View personal usage, billing, profile, payments, announcements, and notifications |

Frontend route guards improve navigation safety, but every protected backend endpoint must still enforce authentication and role authorization.

### Staff account creation

Only a signed-in `super-admin` sees the **Create staff account** section in Admin Profile Management. The Super Admin selects Admin or Meter Reader, enters a username and complete email, and creates a strong temporary password. New Admin accounts always receive the regular `admin` role and cannot create other staff accounts.

Admin Profile Management also contains a Super Admin-only Staff Directory with separate Admin and Meter Reader lists. Each list displays two accounts per page and uses previous/next controls for additional records. The Create Staff and Staff Directory panels use matching desktop heights. The Super Admin can update a regular Admin or Meter Reader's email or assign a new temporary password. Super Admin accounts are protected from these staff-management changes, while normal administrators cannot view the directory or use its management endpoints.

Creating an Admin or Meter Reader and changing a regular Admin or Meter Reader email/password require an additional single-use email OTP sent to the signed-in Super Admin's registered email. Each verified authorization is bound to the selected action (and target account for updates), expires after five minutes, and cannot be reused for another staff-management request.

The same staff-action OTP mechanism also gates access to system settings. The Super Admin verifies email OTP to unlock the settings page, then verifies a second OTP to save any changes to system-wide settings such as the water rate per cubic meter.

The backend independently restricts `POST /api/admins` and `POST /api/meter-readers` to `super-admin`. Hiding the form from normal admins is only a UI measure; direct API requests from normal admins return `403 Forbidden`.

## Main Authentication Endpoints

| Method | Endpoint | Purpose |
| --- | --- | --- |
| `POST` | `/api/auth/login` | Validate account credentials and start admin OTP when required |
| `POST` | `/api/auth/admin/verify-login-otp` | Verify admin login OTP and issue the admin session |
| `GET` | `/api/auth/admin/trusted-devices` | List the signed-in administrator's active trusted devices |
| `DELETE` | `/api/auth/admin/trusted-devices/:deviceId` | Revoke one trusted device owned by the signed-in administrator |
| `DELETE` | `/api/auth/admin/trusted-devices/others` | Revoke all trusted devices except the current browser |
| `POST` | `/api/auth/admin/consumer-password/otp` | Send an administrator OTP for one resident password change |
| `POST` | `/api/auth/admin/consumer-password/verify` | Verify the OTP and issue a single-use resident password authorization |
| `GET` | `/api/auth/me` | Return the authenticated account |
| `POST` | `/api/auth/forgot-password` | Send a password-recovery OTP |
| `POST` | `/api/auth/verify-reset-otp` | Verify a password-recovery or authenticated email OTP |
| `POST` | `/api/auth/reset-password` | Save a new password after OTP verification |
| `POST` | `/api/auth/change-password` | Change password using the current password |
| `POST` | `/api/auth/change-password/email-otp` | Send an OTP to the signed-in account email |
| `POST` | `/api/auth/consumer/change-email/otp` | Send an email-change OTP to the consumer's current email |
| `POST` | `/api/auth/consumer/change-email/verify` | Verify the current-email OTP |
| `POST` | `/api/auth/consumer/change-email` | Save the new consumer email after verification |
| `POST` | `/api/auth/admin/change-email/otp` | Send an admin email-change OTP to the current email |
| `POST` | `/api/auth/admin/change-email/verify` | Verify the administrator's current-email OTP |
| `POST` | `/api/auth/admin/change-email` | Save the new administrator email after verification |
| `POST` | `/api/auth/admin/staff-action/otp` | Send OTP for staff actions (manage-staff, manage-system-settings) |
| `POST` | `/api/auth/admin/staff-action/verify` | Verify staff-action OTP and issue authorization token |
| `GET` | `/api/system-settings` | List all system settings (Super Admin only) |
| `GET` | `/api/system-settings/:key` | Get a system setting by key (Super Admin only) |
| `PATCH` | `/api/system-settings/:key` | Update a system setting by key (Super Admin only, requires staff-action authorization) |
| `POST` | `/api/auth/logout` | Clear device fingerprint hash from DB and end session |

## Main API Groups

| Base Route | Purpose |
| --- | --- |
| `/api/auth` | Authentication, OTP, session, and password security |
| `/api/admins` | Administrator operations |
| `/api/consumers` | Consumer accounts, profiles, status changes, and confirmed flagged-account disconnection |
| `/api/meter-readers` | Meter-reader accounts and operations |
| `/api/consumption` | Meter readings and usage |
| `/api/billing` | Billing records and balances |
| `/api/payments` | Payment processing and history |
| `/api/notifications` | Announcements and notification state |
| `/api/events` | Admin-only persistent community-event CRUD and automatic consumer-notification synchronization |
| `/api/consumption/prediction` | AI consumption predictions |
| `/api/anomaly` | AI anomaly detection |
| `/api/recommendation` | AI recommendations |
| `/api/reports` | Report previews, snapshots, and PDF downloads |
| `/api/system-settings` | System-wide settings management (Super Admin only, OTP-gated) |

## Reading and Billing Workflow

```text
Meter reader records a reading
             ↓
Backend validates role, values, and monthly limit
             ↓
Consumption row is inserted
             ↓
Consumption = present reading - previous reading
             ↓
Billing row and consumer notification are created
             ↓
Dashboards and AI cache detect the updated data
```

- A consumer can have only one accepted reading for a given month.
- Payment-backed consumption records are protected from silent mutation.
- Notifications may target one consumer or be system-wide.
- Notification read state is stored separately for each consumer.

## Community Events and Consumer Notifications

Event management is persistent and available only to authenticated Admin and Super Admin accounts:

| Method | Endpoint | Purpose |
| --- | --- | --- |
| `GET` | `/api/events` | List scheduled and cancelled events |
| `GET` | `/api/events/:id` | Retrieve one event |
| `POST` | `/api/events` | Create an event |
| `PUT` | `/api/events/:id` | Update or cancel an event |
| `DELETE` | `/api/events/:id` | Delete an event and its synchronized notification |

The frontend event service calls these endpoints instead of keeping events in browser memory. Database validation enforces required text, valid `YYYY-MM-DD` dates, 24-hour `HH:MM` times, category limits, and supported event statuses.

Event notification flow:

```text
Admin creates or updates an event
              ↓
Authenticated /api/events endpoint validates and saves it
              ↓
Supabase trigger creates or updates one global notification
              ↓
Consumers receive it in the notification feed and Announcements page
```

These are in-app notifications. Event email and SMS delivery are not included.

## Administrator Record Views

The main administrator tables group records by resident to avoid repeating the same account for every month:

- **Readings:** shows Account, Name, Purok, and **View readings**. The resident modal lists Reading Date, Previous, Current, Status, and **View record**. The full record remains printable and downloadable.
- **Billing:** shows Name, Purok, overall bill count/amount, and **View all billings**. The resident modal lists Billing Period, Reading Date, Consumption, Total Bill, Balance, and Status.
- **Payments:** shows one row per resident with the outstanding bill count, oldest unpaid bill, total balance, and **Record payment**.
- **Flagged Accounts:** shows one row per resident with at least three outstanding monthly bills, including the oldest period, total outstanding balance, account state, and payment/disconnection actions.

Search and table filters operate at the grouped resident level. Detail modals retain the individual monthly records.

## Payment Rules

WaterWise enforces payment order in both the frontend and backend:

1. The payment applies oldest outstanding bill first, cascading any remainder to the next bills.
2. Any positive amount is accepted; repeated partials are allowed.
3. One tender creates one payment row per bill touched (e.g. 750 vs 500+500 → 500 Paid + 250 Partially Paid, 250 left).
4. Cash tendered may exceed the total; excess returns as change. GCash payments must equal the applied amount, cannot exceed the total, and require a reference number.
5. Payment date is read-only Manila today. Idempotency keys cover the whole allocation.

The relevant payment endpoint is POST /api/payments/allocate. Direct API calls are subject to the same waterfall rules above. Legacy POST /api/payments (single-bill, billingId) remains for backward compat.

## Flagged Accounts and Disconnection

- A resident is flagged when three or more monthly bills have a remaining balance. Unpaid and partially paid bills both count while their balance is greater than zero.
- The notification scheduler creates a one-time critical `disconnection_warning` notification for a newly eligible resident. It runs when the backend starts and then at the configured reminder interval.
- Flagging does **not** automatically deactivate an account.
- An administrator must review the account and select **Confirm disconnection**.
- `POST /api/consumers/:id/disconnect` rechecks that the resident still has at least three outstanding bills, creates the critical warning if it does not already exist, and then changes the consumer status to `inactive`.
- The existing consumer-status database trigger creates an additional account-status notification when the account is deactivated or reactivated.
- Inactive consumers cannot create a new login session. Reactivation remains an administrator action through resident account management.

Disconnection notifications are currently in-app notifications. Email and SMS disconnection delivery are not included.

## Production Checks

Run frontend lint and production build:

```powershell
cd frontend
npm run lint
npm run build
```

Check backend JavaScript syntax or start the production server:

```powershell
cd backend
npm start
```

## Recent Changes

### Security Fixes

- **Removed plaintext password fallback** — `authModels.js` now rejects non-bcrypt passwords instead of silently accepting them.
- **Fixed password hash leakage** — `resetAccountPassword` returns `boolean` instead of the full account object with `previousPassword` hash.
- **Push subscription endpoint validation** — `pushSubscriptionModels.js` now validates that push subscription endpoints are from recognized push services (Google, Apple, Mozilla, Amazon). Invalid endpoints are rejected.
- **Notification deletion guard** — Notifications can only be deleted after being marked as read. Both backend (`notificationModels.js`) and frontend (`AppLayout.jsx`) enforce this rule.

### Bug Fixes

- **Null guard on ConsumerHome name split** — `ConsumerHome.jsx` now falls back to "Resident" if `account.name` is null or undefined, preventing a crash on render.
- **Toast hook inconsistency** — `AdminSettingsPage.jsx` now uses the correct `const toast = useToast()` pattern instead of the broken `const { toast } = useToast()` destructuring.
- **Missing isOpen prop on OTP modal** — `ConsumerManagementPage.jsx` password-change OTP modal now uses `isOpen={Boolean(passwordChallenge)}` with optional chaining for the description, matching the standard Modal pattern.
- **Offline sync blocks on first failure** — `offlineMeterReadings.js` now skips server-rejected records and continues syncing the remaining queue instead of breaking on the first failure. A warning toast shows how many readings still need to sync.
- **Unhandled JSON.parse in apiClient** — `apiClient.js` `apiRequest` now catches invalid JSON in `options.body` instead of throwing an unhandled `SyntaxError`.
- **Hardcoded rate in frontend** — `RecordConsumptionPage.jsx` now fetches the water rate from `system_settings` API on mount instead of using a hardcoded `* 15` multiplier. Falls back to 15 if the fetch fails.
- **Hardcoded rate in backend** — Removed unused `RATE_PER_CUBIC_METER = 15` constant from `billingModels.js`. The rate is already fetched via `getRatePerCubicMeter()`.
- **Push toggle page reload** — Added `/api/notifications/push/subscriptions` and `/api/notifications/push/subscriptions/current` to `ignoredChangePaths` in `server.js`. Push subscription changes no longer trigger SSE `data-change` events that cause the entire page to remount.

### UX Improvements

- **Push notification toggle** — Toggle in Consumer Profile now flips instantly with CSS animation. API call runs in background without blocking the UI. No toast on success; only shows error toast on failure.
- **Push notification prompt** — Shortened the first-open push notification description: "Get bill reminders and service alerts even when the app is closed."

## Troubleshooting

### OTP email is not received

- Confirm `BREVO_API_KEY` is a valid Brevo API v3 key.
- Confirm `BREVO_FROM_EMAIL` is an active, verified sender in the same Brevo account.
- Confirm the sender domain's DKIM and DMARC status when inbox placement is poor.
- Check spam or junk folders.
- Confirm the account contains the intended valid email address.
- Review the backend response and Brevo transactional activity logs.

### Admin credentials are accepted but portal access is not granted

This is expected until the emailed OTP is verified. The admin access token is issued only after the second authentication step succeeds.

### Login redirects back to `/login`

- Confirm `accessToken` and `user` exist in browser `sessionStorage`.
- Confirm the returned role is `admin`, `meter-reader`, or `consumer`.
- Verify the system clock so JWT expiry checks remain accurate.
- Confirm protected requests include the Bearer token.

### Frontend cannot connect to the backend

- Confirm the backend is running on port `5000`.
- Confirm Vite is proxying `/api` to the correct backend address.
- Keep `VITE_API_URL=/api` when using the development proxy.
- If the frontend is opened through a private LAN address, use Vite port `5173` and restart the backend after changing CORS settings.

## Security Notes

- Never commit `.env` files or production secrets.
- Password hashing, JWT generation, OTP validation, and authorization belong to the backend.
- Email OTP challenges are short-lived and bound to the account's current password state.
- Trusted-device cookies contain random secrets, use `HttpOnly`, and are validated against hashed, expiring, revocable database records.
- Resident password authorization is required only when a consumer update contains `password`; it is bound to the acting administrator and target resident and is single-use.
- The frontend must never create an authenticated session before the backend returns a valid access token.
- Validate ownership and role permissions on every protected endpoint.
- Supabase Row Level Security blocks direct browser access to protected tables; database operations must pass through the authenticated Express backend using the server-only service-role key.
- Device fingerprint binding prevents cross-device token theft by verifying browser properties on every API request.

## Device Fingerprint Security

WaterWise implements device fingerprint binding to prevent JWT access token theft across devices. If an attacker steals an access token, they cannot use it from a different device or browser.

### How it works

1. **Client generates a fingerprint** from browser properties (userAgent, screen size, timezone, hardware concurrency, touch points, language).
2. **Fingerprint is regenerated on every request** — not cached in `sessionStorage`.
3. **Fingerprint is sent** as the `X-Device-Fingerprint` request header with every API call.
4. **Server hashes the fingerprint** (SHA-256) and compares it with the stored hash in the database.
5. **Match** → request allowed. **Mismatch** → 401 "Session device mismatch".

### Login flow

```text
Client sends fingerprint in X-Device-Fingerprint header
                    ↓
Server hashes the fingerprint (SHA-256)
                    ↓
Server stores hash in user's DB row (device_fingerprint_hash column)
                    ↓
Server returns JWT (no fingerprint in JWT payload)
```

### API request flow

```text
Client regenerates fingerprint from browser properties
                    ↓
Client sends fingerprint in X-Device-Fingerprint header
                    ↓
Server reads JWT → gets userId, role
                    ↓
Server queries DB → gets stored device_fingerprint_hash
                    ↓
Server hashes incoming fingerprint → compares with stored hash
                    ↓
Match → allow | Mismatch → 401
```

### What is blocked

| Scenario | Result |
| --- | --- |
| Same Chrome, different tab | ✅ Works (same browser properties) |
| Chrome → Edge (same device) | ❌ Blocked (different `userAgent`) |
| Desktop → Mobile | ❌ Blocked (different screen, hardware) |
| Different computer | ❌ Blocked (different everything) |
| Copy JWT only to another device | ❌ Blocked (fingerprint mismatch) |

### Logout fingerprint revocation

When a user logs out, the `device_fingerprint_hash` is cleared from the database. This ensures the fingerprint cannot be reused after logout. For admins, logout does not revoke the trusted-device cookie/DB row, so the same browser can still skip OTP on its next sign-in.

```text
Frontend calls POST /api/auth/logout
                    ↓
Server clears device_fingerprint_hash from DB
                    ↓
Frontend clears JWT from sessionStorage
```

### Database migration

Run this SQL in Supabase SQL Editor to add the fingerprint column:

```sql
ALTER TABLE admins ADD COLUMN IF NOT EXISTS device_fingerprint_hash VARCHAR(64);
ALTER TABLE consumers ADD COLUMN IF NOT EXISTS device_fingerprint_hash VARCHAR(64);
ALTER TABLE meter_readers ADD COLUMN IF NOT EXISTS device_fingerprint_hash VARCHAR(64);
```

### Relevant files

| File | Purpose |
| --- | --- |
| `frontend/src/utils/deviceFingerprint.js` | Fingerprint generation from browser properties |
| `frontend/src/services/apiClient.js` | Attaches `X-Device-Fingerprint` header to all requests |
| `backend/controllers/authControllers.js` | Stores fingerprint hash on login, clears on logout |
| `backend/middleware/authMiddleware.js` | Verifies fingerprint hash against DB on every request |
| `backend/routes/authRoutes.js` | `POST /api/auth/logout` endpoint |
| `backend/db/fingerprint_migration.sql` | Database migration to add fingerprint column |

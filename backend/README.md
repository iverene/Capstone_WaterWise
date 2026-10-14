# WaterWise Backend

Node.js + Express 5 backend for the WaterWise water utility management system.

## Setup

```bash
npm install
```

Create `.env` file (see `.env.example` or main README for required variables).

## Development

```bash
npm run dev
```

Server runs on `http://127.0.0.1:5000` by default.

## Production

```bash
npm start
```

## Project Structure

```text
backend/
├── config/           # Environment and Supabase configuration
├── controllers/      # Route handlers (auth, billing, consumption, etc.)
├── db/               # SQL migrations
├── middleware/        # Authentication and authorization middleware
├── models/           # Database query functions
├── routes/           # Express route definitions
├── scripts/          # Utility scripts (VAPID key generation)
├── services/         # Business logic (email, caching, AI)
├── server.js         # Express app entry point
└── package.json
```

## Authentication

### JWT Access Tokens

- Issued on successful login
- Contains `role` and `sub` (user ID) claims
- Expires based on role (access token): Consumer (10m), Meter Reader (8h), Admin (10m), Super Admin (10m)
- Verified on every protected request

### Device Fingerprint Binding

WaterWise binds JWT access tokens to the device that logged in. If a token is stolen, it cannot be used from a different device or browser.

**How it works:**

1. Client generates a fingerprint from browser properties (userAgent, screen, timezone, etc.)
2. Fingerprint is sent as `X-Device-Fingerprint` header on every request
3. Server hashes the fingerprint (SHA-256) and stores it in the `user_device_sessions` junction table on login (one row per device, multiple devices allowed)
4. On each request, server compares the incoming fingerprint hash with the stored device sessions (fail-closed on expiry via `expires_at`)
5. Mismatch → 401 "Session device mismatch"

**Files:**

| File | Purpose |
| --- | --- |
| `models/deviceFingerprintModels.js` | `addDeviceFingerprint()`, `hasDeviceFingerprint()`, `touchDeviceFingerprint()`, `removeDeviceFingerprint()` |
| `middleware/authMiddleware.js` | Verifies fingerprint hash against `user_device_sessions` on every request |
| `routes/authRoutes.js` | `POST /api/auth/logout` clears device session from DB |

**Logout:**

`POST /api/auth/logout` removes the device session row from `user_device_sessions`, revoking the fingerprint.

### Admin OTP + Trusted Device

1. Admin submits username/email + password
2. Backend sends OTP to registered email
3. Admin verifies OTP → JWT + trusted-device cookie issued
4. Future logins skip OTP if trusted-device cookie is valid

### Password Security

- bcrypt hashing with salt
- OTP-based password reset and change
- Account lockout enforced in JS (`models/authModels.js`) using `LOGIN_MAX_ATTEMPTS` / `LOGIN_LOCKOUT_MINUTES` from `.env` (defaults: 5 attempts, 3 minute lockout)

### Staff Action OTP

Super Admins can perform sensitive actions (manage staff accounts, manage system settings) through a shared OTP verification flow:

1. Frontend calls `POST /api/auth/admin/staff-action/otp` with the action name
2. Backend sends a six-digit OTP to the Super Admin's registered email
3. Frontend calls `POST /api/auth/admin/staff-action/verify` with the OTP
4. Backend returns a short-lived authorization token bound to the action
5. The token is used in the subsequent request's `X-Staff-Authorization` header

Supported actions: `manage-staff`, `create-admin`, `create-meter-reader`, `update-admin`, `update-meter-reader`, `manage-system-settings`.

## API Endpoints

### Authentication

| Method | Endpoint | Auth | Purpose |
| --- | --- | --- | --- |
| `POST` | `/api/auth/login` | No | Login (starts admin OTP if needed) |
| `POST` | `/api/auth/admin/verify-login-otp` | No | Verify admin OTP → JWT |
| `POST` | `/api/auth/admin/resend-login-otp` | No | Resend admin OTP |
| `POST` | `/api/auth/logout` | Yes | Clear fingerprint, end session |
| `GET` | `/api/auth/me` | Yes | Get current user |
| `POST` | `/api/auth/forgot-password` | No | Send password reset OTP |
| `POST` | `/api/auth/verify-reset-otp` | No | Verify reset OTP |
| `POST` | `/api/auth/reset-password` | No | Set new password |
| `POST` | `/api/auth/change-password` | Yes | Change password (current password) |
| `POST` | `/api/auth/change-password/email-otp` | Yes | Send OTP for password change |

### Staff Action OTP

| Method | Endpoint | Auth | Purpose |
| --- | --- | --- | --- |
| `POST` | `/api/auth/admin/staff-action/otp` | Super Admin | Send OTP for staff management or system settings |
| `POST` | `/api/auth/admin/staff-action/verify` | Super Admin | Verify staff-action OTP and issue authorization token |

### System Settings

| Method | Endpoint | Auth | Purpose |
| --- | --- | --- | --- |
| `GET` | `/api/system-settings` | Super Admin | List all system settings |
| `GET` | `/api/system-settings/:key` | Super Admin | Get a setting by key |
| `PATCH` | `/api/system-settings/:key` | Super Admin + staff-action auth | Update a setting by key |

### Admin Trusted Devices

| Method | Endpoint | Purpose |
| --- | --- | --- |
| `GET` | `/api/auth/admin/trusted-devices` | List trusted devices |
| `DELETE` | `/api/auth/admin/trusted-devices/:deviceId` | Revoke one device |
| `DELETE` | `/api/auth/admin/trusted-devices/others` | Revoke all other devices |

### Other Groups

| Base Route | Purpose |
| --- | --- |
| `/api/admins` | Admin management (Super Admin only) |
| `/api/consumers` | Consumer accounts and profiles |
| `/api/meter-readers` | Meter reader accounts |
| `/api/consumption` | Meter readings and usage |
| `/api/billing` | Billing records |
| `/api/payments` | Payment processing |
| `/api/notifications` | Notifications |
| `/api/events` | Community events |
| `/api/consumption/prediction` | AI predictions |
| `/api/anomaly` | AI anomaly detection |
| `/api/recommendation` | AI recommendations |
| `/api/reports` | Report generation |
| `/api/system-settings` | System-wide settings (Super Admin only) |

## Database

Run migrations from `db/` folder in Supabase SQL Editor:

- `full_setup_migration.sql` — consolidated one-shot setup (recommended for fresh installs). Schema only, in order:
  1. Base schema (`migration.sql`)
  2. `system_settings` table + default rate
  3. Inactivity (`last_activity_at`)
  4. Multi-device `user_device_sessions` junction table (fresh-create + conditional legacy migrate)
  5. Device session expiry (`expires_at`)
- Individual files (`migration.sql`, `system_settings_migration.sql`, `inactivity_migration.sql`, `multi_device_migration.sql`, `device_session_expiry_migration.sql`, etc.) — kept for reference / upgrading existing installs.
- Seed files (`seed_*.sql`) — run separately after schema setup when test accounts are needed.

## Recent Changes

### Security Fixes

- **Removed plaintext password fallback** — `authModels.js` now rejects non-bcrypt passwords instead of silently accepting them.
- **Fixed password hash leakage** — `resetAccountPassword` returns `boolean` instead of the full account object with `previousPassword` hash.
- **Push subscription endpoint validation** — `pushSubscriptionModels.js` now validates that push subscription endpoints are from recognized push services (Google FCM, Apple, Mozilla, Amazon). Invalid endpoints are rejected before storing.
- **Notification deletion guard** — `notificationModels.js` now joins with `notification_reads` and only deletes notifications that have `read_at` set. Unread notifications cannot be deleted.

### Bug Fixes

- **Hardcoded rate removed** — Removed unused `RATE_PER_CUBIC_METER = 15` constant from `billingModels.js`. The rate is already fetched via `getRatePerCubicMeter()`.
- **Push subscription page reload** — `server.js` now ignores push subscription endpoints in `ignoredChangePaths`. Push subscription changes no longer trigger SSE `data-change` events that cause the frontend to remount.

### Relevant Files

| File | Changes |
| --- | --- |
| `models/authModels.js` | Removed plaintext fallback, fixed hash leakage |
| `models/billingModels.js` | Removed hardcoded `RATE_PER_CUBIC_METER` constant |
| `models/pushSubscriptionModels.js` | Added push service endpoint URL validation |
| `models/notificationModels.js` | Added read-status check before deleting notifications |
| `server.js` | Added push endpoints to `ignoredChangePaths` |

## Environment Variables

| Variable | Required | Purpose |
| --- | --- | --- |
| `PORT` | No | Server port (default: 5000) |
| `SUPABASE_URL` | Yes | Supabase project URL |
| `SUPABASE_KEY` | Yes | Supabase anon key |
| `SUPABASE_SERVICE_ROLE_KEY` | Yes | Supabase service role key |
| `JWT_SECRET` | Yes | JWT signing secret (min 32 chars) |
| `GEMINI_API_KEY` | Yes | Google Gemini API key |
| `BREVO_API_KEY` | Yes | Brevo email API key |
| `BREVO_FROM_EMAIL` | Yes | Verified sender email |
| `BREVO_FROM_NAME` | No | Sender name |
| `BREVO_TEMPLATE_PASSWORD_RESET` | No | Brevo hosted template ID for password reset OTP (falls back to local `templates/passwordResetOtp.html` when unset) |
| `BREVO_TEMPLATE_ADMIN_LOGIN` | No | Brevo hosted template ID for admin sign-in OTP (falls back to inline HTML when unset) |
| `BREVO_TEMPLATE_STAFF_ACTION` | No | Brevo hosted template ID for staff action OTP (falls back to inline HTML when unset) |
| `BREVO_TEMPLATE_CONSUMER_PASSWORD` | No | Brevo hosted template ID for resident password-change OTP (falls back to inline HTML when unset) |
| `BREVO_TEMPLATE_EMAIL_CHANGE` | No | Brevo hosted template ID for email-change OTP (falls back to inline HTML when unset) |
| `UPSTASH_REDIS_REST_URL` | No | Redis cache URL |
| `UPSTASH_REDIS_REST_TOKEN` | No | Redis cache token |
| `VAPID_PUBLIC_KEY` | No | Web push public key |
| `VAPID_PRIVATE_KEY` | No | Web push private key |
| `VAPID_SUBJECT` | No | Web push contact email |

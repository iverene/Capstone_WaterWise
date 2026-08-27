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
- Expires based on role: Consumer (4h), Meter Reader (2h), Admin (1h), Super Admin (30min)
- Verified on every protected request

### Device Fingerprint Binding

WaterWise binds JWT access tokens to the device that logged in. If a token is stolen, it cannot be used from a different device or browser.

**How it works:**

1. Client generates a fingerprint from browser properties (userAgent, screen, timezone, etc.)
2. Fingerprint is sent as `X-Device-Fingerprint` header on every request
3. Server hashes the fingerprint (SHA-256) and stores it in the user's DB row on login
4. On each request, server compares the incoming fingerprint hash with the stored hash
5. Mismatch → 401 "Session device mismatch"

**Files:**

| File | Purpose |
| --- | --- |
| `controllers/authControllers.js` | `hashFingerprint()`, `storeDeviceFingerprint()`, `getStoredFingerprintHash()` |
| `middleware/authMiddleware.js` | Verifies fingerprint hash against DB on every request |
| `routes/authRoutes.js` | `POST /api/auth/logout` clears fingerprint from DB |

**Logout:**

`POST /api/auth/logout` clears the `device_fingerprint_hash` from the database, revoking the fingerprint.

### Admin OTP + Trusted Device

1. Admin submits username/email + password
2. Backend sends OTP to registered email
3. Admin verifies OTP → JWT + trusted-device cookie issued
4. Future logins skip OTP if trusted-device cookie is valid

### Password Security

- bcrypt hashing with salt
- OTP-based password reset and change
- Account lockout after 5 failed attempts (5 minute cooldown)

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

1. `migration.sql` — main schema
2. `fingerprint_migration.sql` — adds `device_fingerprint_hash` column
3. `system_settings_migration.sql` — adds `system_settings` table with default water rate

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
| `UPSTASH_REDIS_REST_URL` | No | Redis cache URL |
| `UPSTASH_REDIS_REST_TOKEN` | No | Redis cache token |
| `VAPID_PUBLIC_KEY` | No | Web push public key |
| `VAPID_PRIVATE_KEY` | No | Web push private key |
| `VAPID_SUBJECT` | No | Web push contact email |

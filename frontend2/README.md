# WaterWise rate-limit dashboard (frontend2) — standalone, deletable

Tiny admin-only monitor for `RATE_LIMIT_GLOBAL_MAX` / `RATE_LIMIT_AUTH_MAX`.
Zero coupling to `frontend/`: files were copied, never imported.

The global limiter counts all API requests. The auth limiter counts only failed
client auth responses, so successful login and OTP verification do not consume
the auth allowance. The dashboard raises an alert after
`RATE_LIMIT_ALERT_BLOCKED_THRESHOLD` blocked requests since backend restart
(default: 10). Set that variable in the backend environment to change it.

Authenticated requests also have a per-account window: consumers default to
300 requests and staff accounts (admin, super-admin, and meter-reader) default
to 1,000 requests per 10 minutes. Configure these with
`RATE_LIMIT_CONSUMER_MAX` and `RATE_LIMIT_STAFF_MAX`.

## Run (local try-out)

```powershell
cd frontend2
npm install
npm run dev
```

Open http://localhost:5174 — sign in with a **super-admin**
account (includes the OTP step; admin accounts are rejected). Stats poll every 5s.
Backend must run on http://127.0.0.1:5000 (or set
`WATERWISE_API_TARGET` env when starting vite).

Production (Vercel, same as the main frontend): set
`VITE_API_URL=https://<render-backend>` in the Vercel project
Environment Variables (no backend URL lives in this repo).
The dashboard origin must be in backend `ALLOWED_ORIGINS`.

Counters reset on backend restart (memory-only limiter).

## Delete

```powershell
Remove-Item -Recurse -Force frontend2
```

Then remove backend additions:
- delete `backend/routes/rateLimitRoutes.js`
- drop its 1 mount line in `backend/server.js`
- optional: revert the stats export in `backend/middleware/rateLimit.js`
  (harmless to keep — no route means no exposure)

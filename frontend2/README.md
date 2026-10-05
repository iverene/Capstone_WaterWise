# WaterWise rate-limit dashboard (frontend2) — standalone, deletable

Tiny admin-only monitor for `RATE_LIMIT_GLOBAL_MAX` / `RATE_LIMIT_AUTH_MAX`.
Zero coupling to `frontend/`: files were copied, never imported.

## Run (local try-out)

```powershell
cd frontend2
npm install
npm run dev
```

Open http://localhost:5174 — sign in with an **admin / super-admin**
account (includes the OTP step). Stats poll every 5s.
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

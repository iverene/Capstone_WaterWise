# Meter-reader session persistence

The meter-reader identity is stored in `localStorage.waterwiseMeterReaderSession`.
It contains no token or password. The backend's HttpOnly `waterwise_session`
cookie authenticates online requests. Missing identity can be recovered through
`GET /api/auth/me` when the cookie is valid. Cached offline identity never extends
the backend JWT expiry.

The backend defaults to eight hours for meter readers. An explicit hosting
environment value overrides this default; set `JWT_EXPIRES_METER_READER=8h` on
the deployed backend. Local `.env` files are ignored by Git.

## Deployment and acceptance check

1. Deploy both the frontend and backend from the commit containing these changes.
   For the frontend, build from `frontend` with `npm run build` and publish `dist`.
   A backend-only deployment cannot update the JavaScript loaded by the PWA.
2. Confirm the deployed frontend build/commit, then reopen or reload the PWA
   online so it receives the new bundle. Do not clear site data or IndexedDB;
   that can erase unsynced meter readings.
3. Fresh-login on one device without logging the same account into another device.
   The existing account fingerprint binding allows the latest device to replace
   the previous fingerprint.
4. Check that Local Storage contains `waterwiseMeterReaderSession` and the login
   response sets the session cookie with `Max-Age=28800`.
5. Open a new tab, or swipe the Android PWA away in Recent Apps and reopen its icon.
   With a valid cookie, `/api/auth/me` must return 200 and restore the workspace.
6. Repeat after more than two hours but before eight hours from login. After eight
   hours, an online protected request must require login again.

`npm run build` verifies the production app and service-worker build.

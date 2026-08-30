# WaterWise Frontend

React 19 + Vite 8 frontend for the WaterWise water utility management system.

## Setup

```bash
npm install
```

## Development

```bash
npm run dev
```

Frontend runs on `http://localhost:5173` by default. Vite proxies `/api` to the backend at `http://127.0.0.1:5000`.

To use a custom backend address:

```powershell
$env:WATERWISE_API_TARGET="http://192.168.1.100:5000"
npm run dev
```

## Production

```bash
npm run build
npm run lint
```

## Project Structure

```text
frontend/
├── public/             # Static assets
├── src/
│   ├── components/     # Reusable UI components
│   ├── pages/          # Route-level page components
│   ├── services/       # API clients, caching, push notifications
│   └── utils/          # Device fingerprint, helpers
├── vite.config.js
├── vercel.json
└── package.json
```

## Recent Changes

### Security Fixes

- **Push subscription validation** — `pushNotifications.js` validates subscription data before sending to backend. Only recognized push service endpoints are accepted.
- **Notification deletion guard** — `AppLayout.jsx` checks `isRead` status before allowing notification selection or deletion. Unread notifications cannot be selected or deleted.

### Bug Fixes

- **Null guard on ConsumerHome name split** — `ConsumerHome.jsx` falls back to "Resident" if `account.name` is null or undefined, preventing a crash.
- **Toast hook inconsistency** — `AdminSettingsPage.jsx` uses `const toast = useToast()` instead of `const { toast } = useToast()`.
- **Missing isOpen prop on OTP modal** — `ConsumerManagementPage.jsx` password-change OTP modal uses `isOpen={Boolean(condition)}` with optional chaining for the description.
- **Offline sync blocks on first failure** — `offlineMeterReadings.js` continues syncing remaining records even when server rejects one. Warning toast shows `result.remaining > 0` count.
- **Unhandled JSON.parse in apiClient** — `apiClient.js` catches invalid JSON in `options.body` instead of throwing an unhandled error.
- **Hardcoded rate** — `RecordConsumptionPage.jsx` now fetches rate from `system_settings` API on mount. Falls back to 15 on failure.
- **Push toggle page reload** — Push subscription endpoints excluded from SSE change stream triggering. Toggle no longer causes page remount.

### UX Improvements

- **Push notification toggle** — Instant CSS animation on toggle. API call runs in background. No toast on success; error toast only on failure.
- **Push notification prompt** — Shortened description: "Get bill reminders and service alerts even when the app is closed."

### Relevant Files

| File | Changes |
| --- | --- |
| `pages/ConsumerHome.jsx` | Null guard on name split |
| `pages/AdminSettingsPage.jsx` | Fixed toast hook |
| `pages/ConsumerManagementPage.jsx` | Fixed OTP modal isOpen prop |
| `pages/ConsumerProfile.jsx` | Push toggle instant animation |
| `pages/RecordConsumptionPage.jsx` | Dynamic rate fetch, sync warning toast |
| `services/apiClient.js` | Safe JSON.parse in apiRequest |
| `services/offlineMeterReadings.js` | Sync continues on server rejection |
| `components/AppLayout.jsx` | Notification read-status guard, shortened push prompt |

## Expanding the ESLint configuration

If you are developing a production application, we recommend using TypeScript with type-aware lint rules enabled. Check out the [TS template](https://github.com/vitejs/vite/tree/main/packages/create-vite/template-react-ts) for information on how to integrate TypeScript and [`typescript-eslint`](https://typescript-eslint.io) in your project.

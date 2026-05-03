# LendIQ Web App

A **Next.js 14 (App Router)** web companion to the LendIQ mobile app. Shares the same `/api/v1/*` backend.

## Architecture

```
src/
├── app/              # App Router pages
│   ├── (auth)/       # Login + Passcode (un-authenticated)
│   └── (app)/        # Dashboard, Loans, Customers, etc. (authenticated)
├── components/       # UI primitives + layout shell
├── lib/              # api client, auth, loan classifier, theme tokens
├── providers/        # ThemeProvider, AuthProvider
└── hooks/            # useAuth, useRequireAuth
```

## Local dev

```bash
cd /app/webapp
yarn install
yarn dev         # http://localhost:3002
```

The dev server proxies `/api/*` → `http://localhost:8001/api/*` (the FastAPI backend). Inside the Emergent preview container, the backend runs on 8001 locally.

## Production deploy

The easiest path is **Vercel** (free tier):

```bash
# from /app/webapp
npx vercel
```

Set `NEXT_PUBLIC_APP_NAME` if you want a custom brand. For the API base URL, set the runtime env var `LENDIQ_API_ORIGIN` pointing at your backend (e.g. `https://api.lendiq.app`). The rewrite in `next.config.mjs` will use that origin.

## Auth flow

This webapp implements the same 2-step server-driven passcode flow as the mobile app:

1. Enter mobile → `GET /api/v1/auth/has-passcode?mobile=…`
2. If has_passcode → Passcode screen → `POST /api/v1/auth/passcode-login`
3. If no passcode → OTP → `POST /api/v1/auth/verify-otp` → Create passcode.

JWT TTL: 30 days. Rate limit: 5 wrong passcodes → 5-min lockout (server-enforced).

No biometric; passcode is the only auth method.

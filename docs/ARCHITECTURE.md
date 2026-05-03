# LendIQ Architecture Overview

> Updated 2026-05-03. Passcode auth has been fully removed; OTP is the single sign-in method across every surface.

## 🗺️ Bird’s-eye diagram

```
┌────────────────────────┐        ┌────────────────────────┐
│  Mobile (Expo / RN)   │        │   Web (Next.js 14)    │
│  /app/frontend        │        │   /app/webapp         │
│   - expo-router       │        │   - App Router        │
│   - SecureStore JWT   │        │   - localStorage JWT  │
│   - OTP-only auth     │        │   - OTP-only auth     │
└───────┬────────────────┘        └───────┬────────────────┘
        │                                │
        │   HTTPS /api/v1/*              │ HTTPS /api/v1/* (via Next rewrite)
        │                                │
───────┼─────────────────────────────────┼────────────────
        │                                │
  ┌────┴─────────────────────────────────┴───────┐
  │                   FastAPI backend                    │
  │                   /app/backend/server.py (port 8001) │
  │                                                      │
  │  • OTP + JWT auth        • Dashboard stats           │
  │  • Clients + Risk        • Loans + Schedule         │
  │  • Notifications         • AI Assistant (Emergent)  │
  │  • Applications → Loans  • Statement analysis       │
  │  • PDF reports           • CIBIL sim                 │
  └─────────────────────┬───────────────────────┘
                          │
                          │ Motor (async)
                          ▼
              ┌────────────────────┐
              │     MongoDB       │
              │   test_database   │
              └────────┬─────────┘
                       │
                       │ (read-mostly in dev)
                       ▼
              ┌───────────────────────────┐
              │ Spring Boot skeleton  │ (optional)
              │ /app/backend-spring   │
              │ (port 8080)           │
              │ OTP + clients + loans │
              └───────────────────────────┘
```

## 🔐 Authentication (cross-platform, identical logic)

1. User types mobile.
2. `POST /auth/send-otp` → backend stores record in `otps` collection: `{ mobile, otp, purpose, created_at, expires_at }`.
3. User types OTP.
4. `POST /auth/verify-otp` → backend validates, burns OTP, upserts `users` row, issues JWT (`subject = user_id`, ttl 30 d, HS256).
5. Client persists JWT:
   * Web — `localStorage["lendiq_token"]`
   * Mobile — `SecureStore["jwt"]`
6. All subsequent requests send `Authorization: Bearer <jwt>`.
7. Token expiry → `GET /auth/me` returns 401 → auth provider clears the token and bounces the user to `/login`.

## 🖥️ Runtime topology

| Component | Dir | Port | Host | Process manager |
|---|---|---|---|---|
| FastAPI backend | `/app/backend` | 8001 | Emergent container | supervisor (`backend`) |
| Expo mobile (dev) | `/app/frontend` | 3000 | Emergent container | supervisor (`expo`) |
| Next.js web (dev) | `/app/webapp` | 3002 | Emergent container | manual `yarn dev` |
| Next.js web (prod) | — | 443 | Vercel | Vercel |
| MongoDB | — | 27017 | Emergent container | supervisor |
| Spring Boot skeleton | `/app/backend-spring` | 8080 | Dev box (optional) | `mvn spring-boot:run` |

Kubernetes ingress rule: `/api/*` → port 8001. The Next.js dev + prod builds use a `rewrites()` block in `next.config.mjs` to proxy `/api/*` to `$LENDIQ_API_ORIGIN` (eliminating CORS).

## 📊 Shared risk classifier

Risk is determined **server-side only** — the apps just render what the backend says. The canonical logic lives in `/app/backend/server.py::_classify_loan_risk`:

| Unpaid EMIs | Oldest unpaid month | Classification |
|---|---|---|
| 0 | — | `on_track` (🟢) |
| 1 | current calendar month | `overdue_mild` (🟡) |
| ≥ 1 | past calendar month | `overdue_high` (🔴) |
| ≥ 2 | — | `overdue_high` (🔴) |

Roll-up per client is done by `_summarize_client_risk`, which scopes loans by `funded_by == lenderId` and matches by `client_id` / `borrower.mobile` / `borrower.name` (for legacy seed data).

## 📁 MongoDB collection contract

| Collection | Purpose |
|---|---|
| `users` | Lender accounts (`user_id`, `mobile`, `name`, `role`) |
| `otps` | Active OTPs (`mobile`, `scope`, `otp`, `expires_at`) |
| `clients` | KYC’d borrowers scoped per lender |
| `applications` | Pending / approved / rejected applications |
| `loans` | Funded loans; `funded_by` links to user_id |
| `repayments` | Per-EMI ledger (mirror of loan.repayment_schedule) |
| `notifications` | Lender inbox |
| `audit_logs` | Mutation ledger |

## 📦 Deployment surfaces

| Surface | Today | Tomorrow |
|---|---|---|
| Web | Vercel → `lendiq-web-delta.vercel.app` | Custom domain + Vercel analytics |
| Mobile | Expo Go + Emergent preview | EAS Build → Play Store / App Store |
| Backend | FastAPI on Emergent preview | Two options: (a) keep FastAPI, scale horizontally; (b) grow `/app/backend-spring` to parity and cut over module-by-module |
| DB | Single Mongo on preview | Mongo Atlas replicated cluster |

## ✅ What the OTP refactor guarantees

* **No mixed flows**: every app has exactly one sign-in path (mobile → OTP). No fallback to passcode, no biometric.
* **No client-side secret material**: nothing to re-verify / re-lock locally — the JWT is the single source of truth.
* **Identical logic on Web + Mobile**: both consume the same `/auth/send-otp` + `/auth/verify-otp`, store the JWT, and attach it to subsequent calls.
* **Deprecated routes removed**: `has-passcode`, `passcode-login`, `set-passcode`, `verify-passcode`, `reset-passcode` now return 404.

## 📝 Changelog of this iteration (2026-05-03)

1. FastAPI: stripped 5 passcode endpoints + rate-limiter + DB fields.
2. Webapp: rewrote `AuthProvider`, `LoginInner`, `(app)/layout.tsx`, `page.tsx`; deleted the `/passcode` route.
3. Mobile: rewrote `src/auth.tsx`, `app/_layout.tsx`, `app/index.tsx`; deleted `passcode.tsx`, `settings/security.tsx`, `src/passcode.ts`.
4. Spring Boot skeleton: added `/app/backend-spring` with OTP + clients + loans endpoints.
5. Vercel: deployed web app (`https://lendiq-web-delta.vercel.app`) with OTP-only flow.
6. Docs: BACKEND_API.md, WEBAPP_SETUP.md, MOBILE_APP_SETUP.md, ARCHITECTURE.md.

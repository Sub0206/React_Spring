# LendIQ Web Console — Setup Guide

> Next.js 14 (App Router) + Tailwind CSS desktop-first console. Lives under `/app/webapp`. **OTP-only** auth (30-day JWT). Talks to the FastAPI backend via Next.js rewrites so CORS is never an issue.

## 📦 Stack

| Layer | Choice |
|---|---|
| Framework | Next.js 14 App Router |
| Language | TypeScript 5 |
| Styling | Tailwind CSS 3 + CSS variables for theming |
| State | React context (`AuthProvider`, `ThemeProvider`) |
| Icons | lucide-react |
| Charts | recharts (dashboard) |
| API layer | Native `fetch` + thin helper in `src/lib/api.ts` |

## 🗂️ Project layout

```
webapp
├── src
│   ├── app
│   │   ├── layout.tsx              # root providers (Auth, Theme)
│   │   ├── page.tsx                # /  → redirect to /login or /dashboard
│   │   ├── login/                  # OTP-only login (mobile → OTP → JWT)
│   │   └── (app)/                  # authenticated shell
│   │       ├── layout.tsx          # Sidebar + Topbar
│   │       ├── dashboard/
│   │       ├── loans/
│   │       │   ├── page.tsx        # loans table + filter chips
│   │       │   ├── new/            # create new loan + risk modal
│   │       │   └── [id]/           # schedule + Mark Paid / Reschedule
│   │       ├── customers/
│   │       ├── notifications/
│   │       └── settings/
│   ├── components/                 # Sidebar, Topbar, StatusBadge, UI primitives
│   ├── lib/                        # api.ts, auth.ts, loanStatus.ts
│   └── providers/                  # AuthProvider, ThemeProvider
├── next.config.mjs                 # /api/* rewrite → LENDIQ_API_ORIGIN/api/*
├── tailwind.config.ts
├── vercel.json
└── package.json
```

## 🚀 Run locally

```bash
cd /app/webapp
yarn install

# Dev (port 3002)
yarn dev

# Production build (proves the deploy is healthy)
yarn build
yarn start
```

Dev server lives at `http://localhost:3002`. All `/api/*` requests are rewritten to `$LENDIQ_API_ORIGIN/api/*` — by default `http://localhost:8001` so the FastAPI backend answers.

## ⚙️ Environment variables

| Key | Default | Purpose |
|---|---|---|
| `LENDIQ_API_ORIGIN` | `http://localhost:8001` | Server-side rewrite target for `/api/*` |
| `NEXT_PUBLIC_LENDIQ_API_ORIGIN` | (falls back to above) | Optional client-side override |
| `NEXT_PUBLIC_APP_NAME` | `LendIQ` | Shown in login header |

Local copy lives at `/app/webapp/.env.local`. A template for prod is at `.env.production.example`.

## 🤖 Auth flow (OTP-only)

1. User enters **mobile** → Webapp POSTs `/api/v1/auth/send-otp`.
2. Backend returns `demo_otp` in DEV mode (banner shown in UI).
3. User enters the 6-digit OTP → Webapp POSTs `/api/v1/auth/verify-otp`.
4. Backend issues a 30-day JWT.
5. Token is kept in `localStorage.key = "lendiq_token"` and attached as `Authorization: Bearer` on every API call (see `src/lib/api.ts`).
6. `AuthProvider` bootstraps `GET /auth/me` on first load; if it fails, token is cleared and the user lands on `/login`.

There is no passcode, no biometric, no in-app session lock.

## 🎨 Theming

* Three modes: `light`, `dark`, `system` (see `ThemeProvider`).
* Palette is expressed as CSS variables (`--bg`, `--primary`, `--risk-high`, …) in `globals.css` and consumed by Tailwind via `bg-bg`, `text-risk-high`, etc.
* `tailwind.config.ts` maps those variables into named Tailwind tokens.

## 🧪 Seed data for screenshots

The script `/app/webapp/scripts/seed_test_scenarios.py` inserts 5 deterministic clients + loans so a reviewer can verify:

| # | Client | Expected chip |
|---|---|---|
| 1 | Test Mild Overdue | 🟡 OVERDUE (MILD) |
| 2 | Test High Risk | 🔴 AT RISK |
| 3 | Test Loan Warning | 🟡 OVERDUE + Modal MILD |
| 4 | Test High Risk Loan | 🔴 Modal HIGH |
| 5 | Test Clean Client | 🟢 ON TRACK / COMPLETED |

Run: `python3 /app/webapp/scripts/seed_test_scenarios.py`

## ☁️ Vercel deployment

The app is deployed at **`https://lendiq-web-delta.vercel.app`** via `/app/webapp/DEPLOY.md`.

1. **`vercel link --project=lendiq-web`** (once).
2. **Env vars** on the Vercel dashboard:
   - `LENDIQ_API_ORIGIN = https://lending-hub-63.preview.emergentagent.com`
   - `NEXT_PUBLIC_APP_NAME = LendIQ`
3. **`vercel --prod`** to push a new release.

See `DEPLOY.md` for the three deploy paths (CLI / GitHub / zip).

## 🧹 Troubleshooting

| Symptom | Fix |
|---|---|
| 401 on every API call | `LENDIQ_API_ORIGIN` isn’t set on Vercel; check dashboard → Settings → Env Vars |
| Login “OTP not found” | OTP expired (5 min) — click Resend OTP |
| Stuck on loading spinner | Stale localStorage token; open DevTools → Application → Local storage → delete `lendiq_token` |
| Build fails with `recharts not found` | Use **`yarn install`** not `npm install` — `vercel.json` enforces yarn |

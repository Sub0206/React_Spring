# LendIQ Web — Vercel Deploy Guide

The Next.js 14 desktop console under `/app/webapp` is fully Vercel-ready.
You have **three** ways to ship it — pick the one that matches your workflow.

---

## Pre-flight checklist (once)

1. Your FastAPI backend is reachable from the public internet over HTTPS.
   For Emergent preview, that is usually:
   ```
   https://lending-hub-63.preview.emergentagent.com
   ```
2. The backend has CORS configured to allow `https://*.vercel.app` **OR**
   you keep using the built-in Next.js `/api/*` rewrites (default, no CORS
   needed because requests come from the same origin server-side).
3. You have a [Vercel](https://vercel.com/signup) account. Free tier is fine.

---

## Option A — 1-click deploy via GitHub (recommended)

1. Create a new GitHub repo (public or private) and push the `/app/webapp`
   directory as its project root. Example:
   ```bash
   cd /app/webapp
   git init && git add -A && git commit -m "LendIQ web — initial"
   git branch -M main
   git remote add origin git@github.com:<your-org>/lendiq-web.git
   git push -u origin main
   ```
2. Go to https://vercel.com/new and pick that repo.
3. **Framework Preset**: Next.js (auto-detected).
   **Root Directory**: `.` (the repo is already the webapp).
   **Build Command**: `yarn build` (pre-filled from `vercel.json`).
   **Output Directory**: `.next` (pre-filled).
4. Under **Environment Variables**, add:
   | Key | Value | Environment |
   |-----|-------|-------------|
   | `LENDIQ_API_ORIGIN` | `https://lending-hub-63.preview.emergentagent.com` | Production + Preview |
   | `NEXT_PUBLIC_APP_NAME` | `LendIQ` | All |
5. Click **Deploy**. First build takes ~1 min. Vercel will hand you a URL like
   `https://lendiq-web.vercel.app`.

---

## Option B — Vercel CLI (if you prefer terminal)

```bash
# 1. Install the Vercel CLI (once)
npm i -g vercel@latest

# 2. Login (opens browser the first time)
vercel login

# 3. Deploy a preview
cd /app/webapp
vercel --yes

# 4. Promote that build to production
vercel --prod --yes
```

When prompted, add the env var `LENDIQ_API_ORIGIN` (or run
`vercel env add LENDIQ_API_ORIGIN production` and paste the backend URL).

---

## Option C — Drag-and-drop zip (no GitHub, no CLI)

1. Build locally:
   ```bash
   cd /app/webapp && yarn install && yarn build
   ```
2. Zip `/app/webapp` (excluding `node_modules` and `.next/cache`).
3. Go to https://vercel.com/import/zip, drag the zip, set the same env
   vars as Option A.

---

## Verifying the deploy

After the first deployment succeeds:

1. Visit `https://<your-project>.vercel.app/login`.
2. Sign in with the seeded demo user:
   - Mobile: `9876543210`
   - Passcode: `5678`
3. You should land on **Dashboard**. Navigate through:
   - `/dashboard` — Total Funded, Portfolio Health (On Track / Overdue / At Risk / Completed)
   - `/loans` — 38 loans table with risk badges and filter chips
   - `/loans/[id]` — schedule with **Mark Paid** + **Reschedule** on every unpaid past-due row
   - `/loans/new` — risk-warning modal fires for borrowers in AT RISK / OVERDUE state
   - `/customers` — colour-coded risk badges per client
   - `/notifications` — empty-state + mark-all-read

---

## Troubleshooting

**“Unauthorized” on every call?**
`LENDIQ_API_ORIGIN` isn't set or points to a URL without the `/api` routes.
Inspect your deployed `next.config.mjs` output — the rewrite destination must
resolve to a running FastAPI process with `/api/v1/*` mounted.

**Build fails with `Module not found: recharts`?**
Make sure `yarn install` (not `npm install`) was the install command — Vercel
will pick that up from `vercel.json`.

**Dark-mode icon toggle doesn't persist?**
Vercel-hosted builds are stateless by design; the theme is kept in
`localStorage` on the user's browser, so this is client-side only. It works
out-of-the-box once the first user toggles it in their session.

---

_Last updated: Jun 2026_

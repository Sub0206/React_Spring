# LendIQ Mobile App — Setup Guide

> Expo SDK 54 + Expo Router 4 (file-based). Lives under `/app/frontend`. **OTP-only** auth (30-day JWT). Same backend as the web app.

## 📦 Stack

| Layer | Choice |
|---|---|
| SDK | Expo 54 |
| Router | expo-router (file-based, `/app` folder) |
| Language | TypeScript 5 |
| State | React context + `expo-secure-store` for JWT |
| UI primitives | Custom (`src/ui`, `src/themeContext`) |
| Navigation | Stack (via expo-router) + bottom tab group |
| Icons | `@expo/vector-icons` (Ionicons) |
| I18n | Custom (`src/i18n.tsx`) — ready for Hindi |

## 🗂️ Project layout

```
frontend
├── app/                            # expo-router routes (one file = one screen)
│   ├── _layout.tsx                 # root Providers + AuthGate
│   ├── index.tsx                   # OTP-only login screen (mobile → OTP)
│   ├── onboarding.tsx
│   ├── (tabs)/                     # bottom tabs: dashboard, loans, clients, profile
│   ├── loan/[id].tsx               # loan detail + schedule + Mark Paid / Reschedule
│   ├── client/add.tsx
│   ├── loan-new/[clientId].tsx     # new loan flow with Risk Warning Modal
│   ├── settings/                   # appearance, audit, help, language
│   └── assistant.tsx               # LendIQ AI (Emergent LLM key)
├── src
│   ├── auth.tsx                    # AuthProvider (OTP-only)
│   ├── api.ts                      # fetch wrapper + JWT attach
│   ├── theme.ts, themeContext.tsx  # light/dark/system theming
│   ├── loanStatus.ts               # shared risk classification
│   └── i18n.tsx
├── app.json
├── package.json
└── .env                            # EXPO_PUBLIC_BACKEND_URL, EXPO_PACKAGER_* (DO NOT EDIT)
```

## 🚀 Run locally

```bash
cd /app/frontend
yarn install

# Dev (emulator / Expo Go / web preview — port 3000)
yarn start            # same as: expo start --tunnel --port 3000

# Scan the QR with the Expo Go app, or press:
#   w  → open in web browser (web preview on Emergent)
#   i  → iOS simulator
#   a  → Android emulator
```

Supervisor keeps the dev server alive in the Emergent container:
```bash
sudo supervisorctl status expo
sudo supervisorctl restart expo
```

## 🤖 Auth flow (OTP-only)

1. User enters **mobile** (+ name if signing up) on `index.tsx`.
2. App POSTs `/auth/send-otp` → backend returns `demo_otp` in DEV.
3. User enters 6-digit OTP → `/auth/verify-otp`.
4. JWT is stored in **SecureStore** (`EXPO_SECURE_STORE_JWT_KEY`).
5. `_layout.tsx > AuthGate` watches `useAuth().user`:
   - If user **and** we’re on `/` or `/onboarding` → `router.replace("/(tabs)/dashboard")`
   - If no user **and** we’re on a protected route → `router.replace("/")`
6. JWT expiry = 30 days. Expired token → `/auth/me` 401 → AuthGate bounces user back to `/`.

No passcode. No biometric. No re-lock on app resume.

## ⚙️ Environment variables

Stored in `/app/frontend/.env` (**DO NOT EDIT** `EXPO_PACKAGER_PROXY_URL` or `EXPO_PACKAGER_HOSTNAME` — those drive the Emergent preview).

| Key | Purpose |
|---|---|
| `EXPO_PUBLIC_BACKEND_URL` | Base URL the app talks to at runtime (Emergent preview URL) |
| `EXPO_TUNNEL_SUBDOMAIN` | Ngrok tunnel for Expo Go |
| `EXPO_PACKAGER_PROXY_URL` | Emergent-managed, DO NOT MODIFY |
| `EXPO_PACKAGER_HOSTNAME` | Emergent-managed, DO NOT MODIFY |

## 🎨 Theming & i18n

* `ThemeProvider` → `{ scheme: 'light' | 'dark' | 'system', resolved }`
* `Colors` (src/theme.ts) expose semantic tokens (`Colors.primary`, `Colors.riskHigh`, `Colors.riskMild`)
* `useThemedStyles(factory)` memoises `StyleSheet.create(factory())` per theme.
* Risk chip colours **mirror** the web app and the backend classifier for cross-platform consistency.

## 🧪 Testing the P0 scenarios on the device

The same seed script used for the web app produces the 5 scenario clients that the mobile app will pick up automatically (they share a Mongo DB):
```bash
python3 /app/webapp/scripts/seed_test_scenarios.py
```
Then open the **Customers** tab in the mobile app — the colour-coded risk badges should match the Web console.

## 🏗️ Building for production (outside the container)

```bash
# Login to Expo once
npx expo login

# Configure EAS build profiles
npx eas build:configure

# Android (AAB for Play Store)
npx eas build --profile production --platform android

# iOS (IPA — requires Apple Dev account)
npx eas build --profile production --platform ios
```

## 🧹 Troubleshooting

| Symptom | Fix |
|---|---|
| QR code says `ngrok tunnel took too long to connect` | `sudo supervisorctl restart expo` — ngrok sometimes drops during long sessions. |
| `Cannot find module ‘../src/passcode’` | You’ve got a stale bundler cache. `sudo supervisorctl restart expo` + rebundle. |
| `EXPO_PUBLIC_BACKEND_URL is undefined` | Check `/app/frontend/.env`, restart expo. |
| “Invalid OTP” after 5 min idle | OTPs expire in 5 minutes. Tap **Resend OTP**. |

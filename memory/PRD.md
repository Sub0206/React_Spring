# Smart Lending App (Lendify) — PRD

## Overview
Mobile lending app (Expo React Native + FastAPI + MongoDB) for **Lenders** to onboard clients with full KYC, evaluate risk with AI, and fund loans.

## Target User
Individual / professional lenders managing their own client book.

## Key Features
1. **Lender Authentication** — Mobile + OTP (sign up captures name; sign in needs only mobile). Google OAuth also supported. All OTPs are mocked (returned in API response via `demo_otp`).
2. **Client Management** — Add clients with 4-step KYC onboarding:
   - Basic details (name + mobile)
   - **Aadhaar KYC** — enter Aadhaar → OTP sent (mocked) → OTP verified in same screen → returns registered name
   - **PAN KYC** — enter PAN → verified with deterministic name + DOB + entity (no OTP)
   - **Client mobile OTP** — verifies client can be reached
   - Search clients by name / mobile / PAN
3. **Client Detail** — Hero avatar, masked KYC cards with registered names, **Loan Tracks** list + "New Loan" CTA. If no loans exist, auto-redirects to the New Loan flow.
4. **New Loan Flow (6 steps)**:
   - Review client → Loan amount / purpose / term / rate → Upload bank statement (3 / 6 / 12-month pills, PDF/image upload) → **AI-powered bank statement analysis** (credit/debit/bounce chart, bounce_risk with green/yellow/red traffic light) → Optional **CIBIL check** (AI-generated score 300-900 with band color) → **Summary** with overall weighted risk gauge + one-tap download for both reports.
5. **Dashboard** — Total funded, expected returns, pending/active loans, default rate, 6-month disbursement chart.
6. **Loan Applications Queue** — Filter by status; each app shows AI credit score badge.
7. **Application Detail + AI Credit Scoring** — Claude Sonnet 4.5 assessment: score (300-850), risk tier, reasoning, factor breakdown. Actions: Approve, Reject, Fund.
8. **Active Loans + Repayments** — Loan cards with progress bar, repayment schedule, "mark paid" per month.
9. **Notifications** (stack route via dashboard bell) and **Transactions history** on Profile.

## AI Integration (Emergent LLM Key — Claude Sonnet 4.5)
- Credit scoring for loan applications
- Bank statement bounce-risk analysis (per-client simulated statement)
- CIBIL credit report generation
- All with deterministic fallback scorers

## KYC Mock APIs
- Aadhaar — 12-digit + Verhoeff checksum; OTP flow; name deterministic from Aadhaar hash
- PAN — `AAAAA9999A` regex + entity decode; name + DOB deterministic from PAN hash

## API Surface (iteration 3)
Auth: `POST /api/auth/send-otp`, `POST /api/auth/verify-otp`, `POST /api/auth/google`, `GET /api/auth/me`
Clients: `POST /api/clients/verify-aadhaar | verify-pan | aadhaar-send-otp | aadhaar-verify-otp | send-otp | verify-otp`, `POST /api/clients` (create), `GET /api/clients?q=`, `GET/DELETE /api/clients/{id}`, `GET /api/clients/{id}/loans`
Loan Apps: `POST /api/loan-apps/analyze-statement`, `POST /api/loan-apps/check-cibil`, `POST /api/loan-apps/create`
Legacy applications & loans: `/api/applications`, `/api/loans`, `/api/dashboard`, `/api/notifications`, `/api/transactions`

## Tech Stack
- Backend: FastAPI, Motor, PyJWT, bcrypt, httpx, emergentintegrations
- Frontend: Expo SDK 54, expo-router, AsyncStorage, expo-document-picker, @expo/vector-icons
- Design: Fintech playful — #3A86FF / #FF9F1C / #06D6A0 / #EF476F / #8338EC

## Test Credentials
See `/app/memory/test_credentials.md` (mobile+OTP flow with mocked demo_otp).

## Business Enhancement Ideas
- **Auto-Fund Rules** — lenders set thresholds (AI score ≥ X, CIBIL ≥ Y, bounces ≤ Z) to auto-fund matching new loans → drives capital deployment velocity.
- **Real KYC providers** — plug Karza / Surepass behind the same mock endpoints.
- **Real SMS** — drop Twilio/MSG91 behind `send-otp` when ready.
- **PDF bank statement parsing** — OCR + transaction extraction pipeline to replace simulated statements.

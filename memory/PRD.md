# Smart Lending App (Lendify) — PRD

## Overview
Mobile lending app (Expo React Native + FastAPI + MongoDB) for **Lenders** to onboard clients with full KYC, run AI-driven risk analysis, and disburse loans with EMI repayment tracking. Lenders choose from 3 subscription plans.

## Target User
Individual / professional lenders managing their own client book.

## Subscription Plans (mock payment gateway)
- **Starter Loan** — ₹2,999 / mo (up to 10 clients, basic KYC)
- **Smart Credit** — ₹4,999 / mo (up to 50, AI credit scoring) ← most popular
- **Prime Elite** — ₹6,999 / mo (unlimited, CIBIL, priority support)
- Payment methods: UPI QR, Card form, PhonePe, Google Pay (all simulated)

## Key Features
1. **Lender Auth (Mobile + OTP)** — signup captures name; login by mobile only. New signups redirect to `/subscribe`. Google OAuth also supported. All OTPs mocked (`demo_otp` in response).
2. **Client Management — 5-step onboarding** (Basic → Address → Aadhaar OTP → PAN → Client mobile OTP)
   - Structured address: line1, line2, city, state, pincode
   - Aadhaar verification with OTP in same screen → returns registered name
   - PAN verification → returns name, DOB, entity type
   - Search clients by name/mobile/PAN
3. **Client Detail** — avatar hero, KYC cards, address card, rejection banner if rejected, loan tracks list, "New Loan" CTA (auto-redirects when no loans exist)
4. **New Loan Flow (5 steps)** — Review (simple "Continue") → Upload statement (3/6/12mo pill, PDF/image) → **AI bank statement analysis** (credit/debit chart + bounce traffic light green/yellow/red + downloadable report) → Optional **CIBIL check** (AI score 300-900 + band color + downloadable report) → **Summary** with Approve (green) / Reject (red) actions
5. **Approve Loan Flow** (`/loan-approve/[clientId]`) — Calculator-keypad amount input, term in months, optional interest rate (0 = interest-free), live EMI preview, proof image via camera or gallery, one-tap "Approve & Disburse" → creates funded loan with full repayment schedule
6. **Reject Flow** — modal for reason → tints client ORANGE in Clients list with "Reason: …" inline + shows rejection banner on Client Detail
7. **Active Loans** — progress bars, repayment schedule, per-month "Mark paid" (rate hidden when 0)
8. **Dashboard analytics** — total funded, expected returns, default rate, 6-month disbursement chart
9. **Notifications** (stack route via bell) + **Transactions history** on Profile

## EMI Calculation
- `rate == 0` → `EMI = principal / months` (interest-free equal split)
- `rate > 0` → standard amortization: `EMI = P · r · (1+r)^n / ((1+r)^n − 1)`

## AI Integration (Emergent LLM Key · Claude Sonnet 4.5)
- Loan credit scoring
- Bank statement bounce-risk analysis
- CIBIL credit report generation
- All with deterministic fallback scorers

## Mock KYC
- Aadhaar: 12-digit + Verhoeff checksum; OTP; name from hash
- PAN: `AAAAA9999A` regex + entity decode; name + DOB from hash
- Proof image upload via expo-image-picker (camera or gallery)

## API Surface (iteration 4)
- Auth: `/api/auth/send-otp`, `/verify-otp`, `/google`, `/me`
- Subscriptions: `/api/subscriptions/plans`, `/subscribe`, `/me`
- Clients: `/api/clients`, `/{id}`, `/{id}/loans`, `/verify-aadhaar`, `/verify-pan`, `/aadhaar-send-otp`, `/aadhaar-verify-otp`, `/send-otp`, `/verify-otp`
- Loan apps: `/api/loan-apps/analyze-statement`, `/check-cibil`, `/approve`, `/reject`, `/create`
- Legacy: `/api/applications`, `/api/loans`, `/api/dashboard`, `/api/notifications`, `/api/transactions`

## Tech Stack
- Backend: FastAPI, Motor, PyJWT, bcrypt, httpx, emergentintegrations
- Frontend: Expo SDK 54, expo-router, AsyncStorage, expo-document-picker, expo-image-picker, @expo/vector-icons

## Test Credentials
See `/app/memory/test_credentials.md`.

## Business Enhancement Ideas
- Auto-fund rules (AI+CIBIL thresholds)
- Real KYC (Karza/Surepass), real SMS (Twilio/MSG91), real payments (Razorpay/Stripe)
- PDF report generation with e-signatures
- Borrower self-service portal (view EMI due dates, pay via UPI)

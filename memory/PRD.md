# Smart Lending App (Lendify) — PRD

## Overview
Mobile lending app (Expo React Native + FastAPI + MongoDB) for **Lenders** to review, AI-score, and fund borrower loan requests.

## Target User
Individual / professional lenders (P2P lending reviewers).

## Key Features
1. **Authentication** — Email/password JWT + Emergent-managed Google OAuth (both on one screen).
2. **Dashboard** — Analytics: total funded, expected returns, active loans, pending requests, default rate, 6-month disbursement chart.
3. **Loan Applications Queue** — Filter by status (pending/approved/rejected/funded). AI-scored cards with borrower avatar, amount, risk badge.
4. **Application Detail + AI Credit Scoring** — Borrower profile, AI score (300-850), risk (low/medium/high), recommendation, reasoning, factor breakdown. Actions: Approve, Reject, Fund.
5. **Active Loans** — Loan cards with progress bar, monthly payment, total repayment tracking.
6. **Loan Detail** — Full repayment schedule, "mark paid" action per month.
7. **Transactions** — Disbursement + repayment history on Profile tab.
8. **Notifications** — In-app alerts for approvals, fundings, repayments. Mark-one/all read.
9. **Profile** — User info, transaction history, settings, logout.

## AI Integration
- **Provider**: Emergent LLM (Anthropic Claude Sonnet 4.5) via `emergentintegrations` library
- **Purpose**: Credit risk scoring from borrower profile + loan request
- **Output**: score (300-850), risk tier, recommendation, reasoning, 3-5 factors
- **Fallback**: Deterministic scorer if LLM fails (DTI, defaults, credit history, employment)

## Tech Stack
- **Backend**: FastAPI, Motor (MongoDB async), PyJWT, bcrypt, httpx, emergentintegrations
- **Frontend**: Expo SDK 54, expo-router, React Native, AsyncStorage, @expo/vector-icons
- **Design**: Playful fintech — primary #3A86FF, success #06D6A0, secondary #FF9F1C, danger #EF476F

## API Surface
- `POST /api/auth/register` / `POST /api/auth/login` / `POST /api/auth/google` / `GET /api/auth/me`
- `GET /api/applications?status=` / `GET /api/applications/{id}` / `POST /api/applications/{id}/score|approve|reject|fund`
- `GET /api/loans` / `GET /api/loans/{id}` / `POST /api/loans/{id}/repay/{month}`
- `GET /api/transactions`
- `GET /api/notifications` / `POST /api/notifications/{id}/read` / `POST /api/notifications/read-all`
- `GET /api/dashboard`

## Demo Data
10 seeded loan applications with varied risk profiles (seeded on first startup).

## Test Credentials
See `/app/memory/test_credentials.md`.

## Next Enhancements (Business Moat)
- **Auto-fund rules** (revenue/retention): "Auto-fund any AI-scored loan >= 720 under $10k" — increases capital deployment velocity.
- Portfolio diversification suggestions.
- Borrower KYC + document upload.
- Real-time repayment webhooks / email reminders.

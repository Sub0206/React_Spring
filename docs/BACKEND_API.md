# LendIQ Backend API Reference

> **Auth model**: OTP-only (2026-05-03). Passcode endpoints & DB fields have been deleted. JWT is valid for **30 days** and the only mechanism to re-authenticate is to request a fresh OTP.

**Base URL**

| Environment | URL |
|---|---|
| Local / Docker | `http://localhost:8001/api/v1` |
| Emergent preview | `https://lending-hub-63.preview.emergentagent.com/api/v1` |
| Spring skeleton | `http://localhost:8080/api/v1` |

All responses are JSON. Errors return HTTP 4xx/5xx with `{ "detail": "..." }`.

---

## 1. Authentication

### `POST /auth/send-otp`
Send a 6-digit OTP to the mobile. OTP is stored in DB for 5 min.

**Request**
```json
{ "mobile": "9876543210", "purpose": "login", "name": "Optional, signup only" }
```
- `purpose`: one of `login` | `signup`
- `name`: required only when `purpose === "signup"`

**200 Response**
```json
{
  "ok": true,
  "mobile": "9876543210",
  "demo_otp": "123456",
  "message": "OTP sent (mock). Valid 5 minutes."
}
```
> `demo_otp` is returned only in DEV / mock mode so testers don’t need a real SMS gateway. Remove the key in production.

**Errors**: `400` invalid mobile, `429` rate-limit, `500` SMS gateway failure.

---

### `POST /auth/verify-otp`
Exchange mobile + OTP for a signed JWT.

**Request**
```json
{ "mobile": "9876543210", "otp": "123456" }
```

**200 Response**
```json
{
  "access_token": "eyJhbGciOiJIUzI1NiJ9...",
  "user": {
    "user_id": "user_77a19af2901f",
    "mobile": "9876543210",
    "name": "Demo Lender",
    "email": null,
    "picture": null,
    "role": "lender",
    "subscription_plan": null,
    "subscription_status": "active"
  },
  "has_passcode": false
}
```
> `has_passcode` is a **deprecated** field kept for backwards compatibility. It is always `false`.

**Errors**: `400` OTP expired/missing, `401` wrong OTP.

---

### `GET /auth/me`   🔒
Returns the user behind the bearer token.

**Header**: `Authorization: Bearer <jwt>`

**200 Response** — same `user` object shape as `verify-otp`.  
**401** if token invalid/expired.

---

### `POST /auth/google`
Emergent OAuth exchange endpoint (web preview only). Input: `{ session_id }`. Output: identical to `verify-otp`.

---

## 2. Clients

All endpoints require `Authorization: Bearer <jwt>`.

### `GET /clients`
List the authenticated lender’s verified clients, with roll-up risk fields:
```json
[
  {
    "client_id": "cli_seed_006",
    "lender_id": "user_77a19af2901f",
    "name": "Rahul Desai",
    "mobile": "9810000007",
    "pan": "ABCDE0007R",
    "risk_kind": "overdue_high",
    "risk_overdue_count": 2,
    "risk_overdue_amount": 15200.0
  }
]
```

**`risk_kind`** ∈ { `on_track`, `overdue_mild`, `overdue_high` } — matches the UI’s green/yellow/red chips.

### `GET /clients/{client_id}/risk-summary`
Detailed risk breakdown, used by the **New-Loan Warning Modal**:
```json
{
  "kind": "overdue_high",
  "overdue_count": 2,
  "overdue_amount": 15200.0,
  "active_loan_count": 1,
  "late_payments": 0,
  "missed_months": ["Mar 2026", "Apr 2026"],
  "missed_months_count": 2,
  "overdue_loans": [
    { "loan_id": "loan_seed_l7_xxx", "kind": "overdue_high", "overdue_count": 2, "overdue_amount": 15200.0 }
  ]
}
```

---

## 3. Loans

### `GET /loans`
List the authenticated lender’s funded loans (`funded_by == userId`). Response array items follow the **Loan** schema — see `/app/backend/server.py` (class `Loan`) for the full shape. Key fields:
- `loan_id`, `status` (`active` | `completed` | `defaulted`)
- `principal`, `emi_amount`, `term_months`
- `repayment_schedule[]` with `{ month, due_date, amount, status: "upcoming"|"paid", paid_at, was_late }`
- `borrower { name, mobile, ... }`

### `GET /loans/{loan_id}`
Same as above for a single loan, plus authorization check.

### `POST /loans/{loan_id}/pay/{month}`
Mark the month’s EMI as paid (server-side). Returns the updated `Loan`. **Only allowed if the EMI is unpaid AND not in the future month**. Useful for the UI “Mark Paid” button.

### `POST /loans/{loan_id}/reschedule`
Reschedule an unpaid EMI.
```json
{ "month": 3, "new_due_date": "2026-06-15" }
```

---

## 4. Dashboard

### `GET /dashboard`
Live stats for the authenticated lender.
```json
{
  "total_funded": 1390000.0,
  "active_loans": 18,
  "overdue_count": 20,
  "overdue_amount": 204000.0,
  "current_month_disbursed": 106000.0,
  "current_month_repaid": 42000.0,
  "inflow_chart": [ { "label": "Feb 2026", "amount": 84000 }, { "label": "Mar 2026", "amount": 91500 } ],
  "outflow_chart": [ { "label": "Feb 2026", "amount": 120000 }, { "label": "Mar 2026", "amount": 95000 } ],
  "portfolio_health": {
    "on_track": 4,
    "overdue": 8,
    "at_risk": 6,
    "completed": 4,
    "defaulted": 1
  }
}
```

---

## 5. Notifications

### `GET /notifications`
List authenticated user’s notifications (newest first).

### `POST /notifications/mark-all-read`
Sets `read: true` on every notification for the current user.

### `POST /notifications/{notification_id}/read`
Mark a single one as read.

---

## 6. Deprecated / Removed

| Endpoint | Status |
|---|---|
| `GET /auth/has-passcode` | ❌ Removed 2026-05-03 |
| `POST /auth/passcode-login` | ❌ Removed 2026-05-03 |
| `POST /auth/set-passcode` | ❌ Removed 2026-05-03 |
| `POST /auth/verify-passcode` | ❌ Removed 2026-05-03 |
| `POST /auth/reset-passcode` | ❌ Removed 2026-05-03 |

Any client still hitting these paths now gets a 404.

---

## 7. Rate limits

| Endpoint | Limit | Notes |
|---|---|---|
| `POST /auth/send-otp` | 1 per 30 s per mobile | DB-backed (lookup on `otps` collection) |
| `POST /auth/verify-otp` | No explicit limit — OTP expires in 5 min anyway | Future work: per-mobile wrong-OTP counter |

---

## 8. Demo credentials

Seed user present in the demo DB:
* **mobile**: `9876543210`
* **demo OTPs** are surfaced in the `demo_otp` response field (mock mode).

---

Last updated: 2026-05-03 · backend version: FastAPI 0.110 / Python 3.11 (port 8001) · Spring Boot 3.3.5 (port 8080).

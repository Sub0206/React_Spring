"""
Iteration 27 regression test — OTP-only auth refactor, passcode removal.

Tests against the live Emergent preview backend (FastAPI on port 8001, exposed
via REACT_APP_BACKEND_URL / EXPO_PUBLIC_BACKEND_URL in frontend/.env).
"""

from __future__ import annotations

import json
import re
import sys
from pathlib import Path
from typing import Any

import requests

# ----- Resolve BASE URL from frontend/.env (do not hardcode) ----------------
ENV_PATH = Path("/app/frontend/.env")
BASE_URL = None
for line in ENV_PATH.read_text().splitlines():
    line = line.strip()
    if line.startswith("EXPO_PUBLIC_BACKEND_URL="):
        BASE_URL = line.split("=", 1)[1].strip().strip('"').strip("'")
        break
    if line.startswith("REACT_APP_BACKEND_URL="):
        BASE_URL = line.split("=", 1)[1].strip().strip('"').strip("'")
        break
assert BASE_URL, "Could not determine backend URL from frontend/.env"
API = f"{BASE_URL}/api/v1"

MOBILE = "9876543210"

# ----- tiny reporter --------------------------------------------------------
results: list[tuple[str, bool, str]] = []


def record(name: str, ok: bool, detail: str = "") -> None:
    results.append((name, ok, detail))
    flag = "PASS" if ok else "FAIL"
    print(f"[{flag}] {name}  {detail}")


def short(x: Any, n: int = 260) -> str:
    try:
        s = json.dumps(x, default=str)
    except Exception:
        s = str(x)
    return s if len(s) <= n else s[:n] + "..."


# ----- 1. PASSCODE ENDPOINTS MUST BE GONE -----------------------------------
print("\n=== 1. Passcode endpoints removed (expect 404 on all five) ===")

r = requests.get(f"{API}/auth/has-passcode", params={"mobile": MOBILE}, timeout=15)
record("GET /auth/has-passcode -> 404", r.status_code == 404,
       f"status={r.status_code} body={short(r.text)}")

r = requests.post(f"{API}/auth/passcode-login",
                  json={"mobile": MOBILE, "passcode": "5678"}, timeout=15)
record("POST /auth/passcode-login -> 404", r.status_code == 404,
       f"status={r.status_code} body={short(r.text)}")

r = requests.post(f"{API}/auth/set-passcode",
                  json={"passcode": "1234"},
                  headers={"Authorization": "Bearer placeholder"}, timeout=15)
record("POST /auth/set-passcode -> 404", r.status_code == 404,
       f"status={r.status_code} body={short(r.text)}")

r = requests.post(f"{API}/auth/verify-passcode",
                  json={"passcode": "1234"},
                  headers={"Authorization": "Bearer placeholder"}, timeout=15)
record("POST /auth/verify-passcode -> 404", r.status_code == 404,
       f"status={r.status_code} body={short(r.text)}")

r = requests.post(f"{API}/auth/reset-passcode",
                  json={"mobile": MOBILE, "otp": "000000", "passcode": "1234"},
                  timeout=15)
record("POST /auth/reset-passcode -> 404", r.status_code == 404,
       f"status={r.status_code} body={short(r.text)}")


# ----- 2. OTP-ONLY AUTH END-TO-END ------------------------------------------
print("\n=== 2. OTP-only auth ===")

r = requests.post(f"{API}/auth/send-otp",
                  json={"mobile": MOBILE, "purpose": "login"}, timeout=15)
send_ok = r.status_code == 200
send_body: dict = {}
if send_ok:
    try:
        send_body = r.json()
    except Exception:
        send_body = {}
demo_otp = send_body.get("demo_otp")
otp_digits_ok = bool(demo_otp) and bool(re.fullmatch(r"\d{6}", str(demo_otp)))
record(
    "POST /auth/send-otp -> 200 ok:true mobile:9876543210 demo_otp 6-digits",
    send_ok and send_body.get("ok") is True
    and send_body.get("mobile") == MOBILE and otp_digits_ok,
    f"status={r.status_code} body={short(send_body)}",
)

token: str | None = None
user: dict = {}
if demo_otp:
    r = requests.post(f"{API}/auth/verify-otp",
                      json={"mobile": MOBILE, "otp": str(demo_otp)},
                      timeout=15)
    vb: dict = {}
    if r.status_code == 200:
        try:
            vb = r.json()
        except Exception:
            vb = {}
    token = vb.get("access_token")
    user = vb.get("user") or {}
    verify_ok = (
        r.status_code == 200
        and isinstance(token, str) and len(token) > 10
        and isinstance(user, dict)
        and user.get("mobile") == MOBILE
        and bool(user.get("user_id"))
        and "name" in user and "role" in user
        and "has_passcode" in vb and vb.get("has_passcode") is False
    )
    record(
        "POST /auth/verify-otp -> 200 + access_token + user + has_passcode:false",
        verify_ok,
        f"status={r.status_code} token_len={len(token) if token else 0} "
        f"user_keys={sorted(user.keys()) if user else []} "
        f"has_passcode={vb.get('has_passcode')!r}",
    )
else:
    record("POST /auth/verify-otp (skipped)", False, "no demo_otp captured")

if token:
    r = requests.get(f"{API}/auth/me",
                     headers={"Authorization": f"Bearer {token}"}, timeout=15)
    me_body: dict = {}
    try:
        me_body = r.json()
    except Exception:
        pass
    record(
        "GET /auth/me (Bearer) -> 200, user matches",
        r.status_code == 200
        and me_body.get("user_id") == user.get("user_id")
        and me_body.get("mobile") == MOBILE,
        f"status={r.status_code} body={short(me_body)}",
    )
else:
    record("GET /auth/me (skipped)", False, "no token")


# ----- 3. CORE ENDPOINTS REGRESSION -----------------------------------------
print("\n=== 3. Core endpoints regression (Bearer required) ===")

H = {"Authorization": f"Bearer {token}"} if token else {}

r = requests.get(f"{API}/clients", headers=H, timeout=30)
clients: list = []
if r.status_code == 200:
    try:
        clients = r.json()
    except Exception:
        clients = []
risk_kind_ok = (
    isinstance(clients, list) and len(clients) > 0
    and all(
        c.get("risk_kind") in {"on_track", "overdue_mild", "overdue_high"}
        and "risk_overdue_count" in c
        and "risk_overdue_amount" in c
        for c in clients
    )
)
record(
    "GET /clients -> 200, array (>=13) with risk_kind/count/amount",
    r.status_code == 200 and isinstance(clients, list)
    and len(clients) >= 13 and risk_kind_ok,
    f"status={r.status_code} count={len(clients) if isinstance(clients, list) else 'N/A'} "
    f"kinds={sorted({c.get('risk_kind') for c in clients[:30]}) if isinstance(clients, list) else '-'}",
)


def _check_risk_summary(cid: str, expected_kind: str, expected_count: int,
                        extra_label: str = "") -> None:
    r = requests.get(f"{API}/clients/{cid}/risk-summary", headers=H, timeout=20)
    body: dict = {}
    try:
        body = r.json()
    except Exception:
        pass
    ok = (
        r.status_code == 200
        and body.get("kind") == expected_kind
        and body.get("overdue_count") == expected_count
    )
    extra_ok = True
    extra_note = ""
    if cid == "cli_seed_006":
        active = body.get("active_loan_count")
        loans = body.get("overdue_loans") or []
        first_id = (loans[0].get("loan_id") if loans else "") or ""
        extra_ok = active == 1 and first_id.startswith("loan_seed_l7_")
        extra_note = f" active_loan_count={active} first_loan_id={first_id!r}"
    record(
        f"GET /clients/{cid}/risk-summary kind={expected_kind} overdue_count={expected_count}{extra_label}",
        ok and extra_ok,
        f"status={r.status_code} kind={body.get('kind')} "
        f"overdue_count={body.get('overdue_count')}{extra_note}",
    )


_check_risk_summary("cli_seed_006", "overdue_high", 2,
                    extra_label=" + active=1 + first loan_id startswith loan_seed_l7_")
_check_risk_summary("cli_test_scenario_1_mild", "overdue_mild", 1)
_check_risk_summary("cli_test_scenario_5_clean", "on_track", 0)

# /loans
r = requests.get(f"{API}/loans", headers=H, timeout=30)
loans: list = []
if r.status_code == 200:
    try:
        loans = r.json()
    except Exception:
        loans = []
record(
    "GET /loans -> 200, array (>=40)",
    r.status_code == 200 and isinstance(loans, list) and len(loans) >= 40,
    f"status={r.status_code} count={len(loans) if isinstance(loans, list) else 'N/A'}",
)

# /loans/loan_test_scenario_2_high
r = requests.get(f"{API}/loans/loan_test_scenario_2_high", headers=H, timeout=20)
loan_body: dict = {}
try:
    loan_body = r.json()
except Exception:
    pass
schedule = loan_body.get("repayment_schedule") or []
unpaid = [e for e in schedule if (e.get("status") or "").lower() != "paid"]
record(
    "GET /loans/loan_test_scenario_2_high -> 200, status=active, 3 unpaid EMIs",
    r.status_code == 200
    and loan_body.get("status") == "active"
    and len(unpaid) == 3,
    f"status={r.status_code} loan.status={loan_body.get('status')} "
    f"schedule_len={len(schedule)} unpaid={len(unpaid)}",
)

# /dashboard
r = requests.get(f"{API}/dashboard", headers=H, timeout=30)
dash: dict = {}
try:
    dash = r.json()
except Exception:
    pass
required_top = {"total_funded", "active_loans", "overdue_emis",
                "overdue_amount", "monthly_volume", "portfolio_health"}
ph = dash.get("portfolio_health") or {}
required_ph = {"on_track", "overdue", "at_risk", "completed", "defaulted"}
missing_top = [k for k in required_top if k not in dash]
missing_ph = [k for k in required_ph if k not in ph]
record(
    "GET /dashboard -> 200 + required top keys + portfolio_health buckets",
    r.status_code == 200 and not missing_top and not missing_ph,
    f"status={r.status_code} missing_top={missing_top} missing_ph={missing_ph} "
    f"ph={short(ph, 150)}",
)

# /notifications
r = requests.get(f"{API}/notifications", headers=H, timeout=20)
try:
    notifs = r.json()
except Exception:
    notifs = None
record(
    "GET /notifications -> 200, JSON array",
    r.status_code == 200 and isinstance(notifs, list),
    f"status={r.status_code} count={len(notifs) if isinstance(notifs, list) else '-'}",
)

# /applications?status=pending
r = requests.get(f"{API}/applications", params={"status": "pending"},
                 headers=H, timeout=20)
try:
    apps = r.json()
except Exception:
    apps = None
record(
    "GET /applications?status=pending -> 200, JSON array",
    r.status_code == 200 and isinstance(apps, list),
    f"status={r.status_code} count={len(apps) if isinstance(apps, list) else '-'}",
)


# ----- 4. UNAUTHORIZED ACCESS -----------------------------------------------
print("\n=== 4. Unauthorized access (expect 401) ===")

r = requests.get(f"{API}/clients", timeout=15)
record("GET /clients (no Authorization) -> 401", r.status_code == 401,
       f"status={r.status_code} body={short(r.text)}")

r = requests.get(f"{API}/dashboard", timeout=15)
record("GET /dashboard (no Authorization) -> 401", r.status_code == 401,
       f"status={r.status_code} body={short(r.text)}")


# ----- Summary --------------------------------------------------------------
passed = sum(1 for _, ok, _ in results if ok)
failed = [(name, detail) for name, ok, detail in results if not ok]
print(f"\n===== TOTAL: {passed}/{len(results)} PASSED =====")
if failed:
    print("FAILED:")
    for name, detail in failed:
        print(f"  - {name}\n      {detail}")
    sys.exit(1)
sys.exit(0)

"""Backend test suite for LendIQ.
Tests iteration-5 endpoints:
  1. POST /api/loan-apps/check-cibil
  2. GET  /api/dashboard
  3. GET  /api/dashboard/overdue
  4. POST /api/loans/{loan_id}/repay/{month} (with/without override_date)
"""
import os
import sys
import json
import time
from datetime import datetime, timezone, timedelta
import requests

BASE = os.environ.get("BASE_URL", "https://lending-hub-63.preview.emergentagent.com").rstrip("/")
API = f"{BASE}/api"
MOBILE = "9876543210"

results = []

def log(name, ok, detail=""):
    mark = "PASS" if ok else "FAIL"
    print(f"[{mark}] {name}: {detail}")
    results.append({"name": name, "ok": ok, "detail": detail})

def auth_login():
    # Try login first; if 404 user not found, fallback to signup
    r = requests.post(f"{API}/auth/send-otp", json={"mobile": MOBILE, "purpose": "login"})
    if r.status_code == 404:
        print("User not found - signing up")
        r = requests.post(f"{API}/auth/send-otp", json={"mobile": MOBILE, "name": "Demo Lender", "purpose": "signup"})
    assert r.status_code == 200, f"send-otp failed: {r.status_code} {r.text}"
    otp = r.json()["demo_otp"]
    r2 = requests.post(f"{API}/auth/verify-otp", json={"mobile": MOBILE, "otp": otp})
    assert r2.status_code == 200, f"verify-otp failed: {r2.status_code} {r2.text}"
    data = r2.json()
    return data["access_token"], data["user"]

def ensure_subscription(token):
    r = requests.get(f"{API}/subscriptions/me", headers={"Authorization": f"Bearer {token}"})
    if r.status_code == 200:
        sub = r.json()
        if sub.get("status") == "active":
            return
    # Subscribe to starter
    rs = requests.post(
        f"{API}/subscriptions/subscribe",
        headers={"Authorization": f"Bearer {token}"},
        json={"plan": "starter", "method": "upi"},
    )
    assert rs.status_code == 200, f"subscribe failed: {rs.status_code} {rs.text}"

def get_or_create_client(token):
    h = {"Authorization": f"Bearer {token}"}
    r = requests.get(f"{API}/clients", headers=h)
    assert r.status_code == 200, f"GET /clients failed {r.status_code}: {r.text}"
    clients = r.json()
    if clients:
        return clients[0]["client_id"]
    # Create one
    mobile = "9876541236"
    rs = requests.post(f"{API}/clients/send-otp", headers=h, json={"mobile": mobile})
    assert rs.status_code == 200, rs.text
    vid = rs.json()["verification_id"]
    otp = rs.json()["demo_otp"]
    rv = requests.post(f"{API}/clients/verify-otp", headers=h, json={"verification_id": vid, "otp": otp})
    assert rv.status_code == 200, rv.text
    rc = requests.post(f"{API}/clients", headers=h, json={
        "name": "Ravi Kumar",
        "mobile": mobile,
        "aadhaar": "234123412346",
        "pan": "ABCDE1234F",
        "verification_id": vid,
        "address_line1": "123 MG Road",
        "city": "Bengaluru",
        "state": "Karnataka",
        "pincode": "560001",
    })
    assert rc.status_code == 200, rc.text
    return rc.json()["client_id"]

def get_or_create_loan(token, client_id):
    h = {"Authorization": f"Bearer {token}"}
    r = requests.get(f"{API}/loans", headers=h)
    assert r.status_code == 200, r.text
    loans = r.json()
    # Prefer active loan
    active = [l for l in loans if l["status"] == "active"]
    if active:
        return active[0]["loan_id"]
    # Approve a new loan
    ra = requests.post(f"{API}/loan-apps/approve", headers=h, json={
        "client_id": client_id,
        "amount": 60000,
        "term_months": 6,
        "interest_rate": 12.0,
    })
    assert ra.status_code == 200, ra.text
    return ra.json()["loan_id"]

def test_check_cibil(token, client_id):
    h = {"Authorization": f"Bearer {token}"}
    r = requests.post(f"{API}/loan-apps/check-cibil", headers=h, json={"client_id": client_id})
    if r.status_code != 200:
        log("check-cibil", False, f"HTTP {r.status_code}: {r.text[:300]}")
        return
    body = r.json()
    required_types = {
        "score": int,
        "band": str,
        "band_color": str,
        "on_time_payments_pct": (int, float),
        "credit_utilization_pct": (int, float),
        "total_accounts": int,
        "active_loans": int,
        "hard_enquiries_6m": int,
        "summary": str,
    }
    missing = []
    wrong_type = []
    for k, t in required_types.items():
        if k not in body:
            missing.append(k)
        elif not isinstance(body[k], t):
            wrong_type.append(f"{k}(got {type(body[k]).__name__})")
    # factors
    factors_ok = False
    factors_detail = ""
    if "factors" in body and isinstance(body["factors"], list):
        if len(body["factors"]) >= 3:
            good = all(
                isinstance(f, dict) and "label" in f and "impact" in f and "detail" in f
                for f in body["factors"][:3]
            )
            factors_ok = good
            factors_detail = f"{len(body['factors'])} factors"
        else:
            factors_detail = f"only {len(body['factors'])} factors"
    else:
        missing.append("factors")

    score_range_ok = isinstance(body.get("score"), int) and 300 <= body["score"] <= 900

    ok = not missing and not wrong_type and factors_ok and score_range_ok
    detail = (
        f"score={body.get('score')} band={body.get('band')} color={body.get('band_color')} "
        f"{factors_detail}"
    )
    if missing:
        detail += f" MISSING={missing}"
    if wrong_type:
        detail += f" WRONG_TYPE={wrong_type}"
    if not score_range_ok:
        detail += f" SCORE_OUT_OF_RANGE"
    if not factors_ok and "factors" not in missing:
        detail += f" FACTORS_SHAPE_BAD"
    log("POST /api/loan-apps/check-cibil", ok, detail)
    return body

def test_dashboard(token):
    h = {"Authorization": f"Bearer {token}"}
    r = requests.get(f"{API}/dashboard", headers=h)
    if r.status_code != 200:
        log("GET /api/dashboard", False, f"HTTP {r.status_code}: {r.text[:300]}")
        return
    body = r.json()
    required = [
        "inflow_chart", "outflow_chart", "overdue_count", "overdue_amount",
        "total_funded", "total_repaid", "current_month_disbursed",
        "current_month_repaid", "active_loans", "expected_returns", "default_rate",
    ]
    missing = [k for k in required if k not in body]
    # Validate chart shape
    chart_issues = []
    for key in ("inflow_chart", "outflow_chart"):
        arr = body.get(key)
        if not isinstance(arr, list):
            chart_issues.append(f"{key} not list")
            continue
        if len(arr) == 0:
            chart_issues.append(f"{key} empty")
            continue
        for item in arr:
            if not isinstance(item, dict) or "label" not in item or "value" not in item:
                chart_issues.append(f"{key} item shape bad: {item}")
                break
    ok = not missing and not chart_issues
    detail = (
        f"keys_ok={not missing} inflow_len={len(body.get('inflow_chart', []))} "
        f"outflow_len={len(body.get('outflow_chart', []))} "
        f"overdue_count={body.get('overdue_count')} overdue_amount={body.get('overdue_amount')} "
        f"total_funded={body.get('total_funded')}"
    )
    if missing:
        detail += f" MISSING={missing}"
    if chart_issues:
        detail += f" CHART_ISSUES={chart_issues}"
    log("GET /api/dashboard", ok, detail)
    return body

def test_dashboard_overdue(token):
    h = {"Authorization": f"Bearer {token}"}
    r = requests.get(f"{API}/dashboard/overdue", headers=h)
    if r.status_code != 200:
        log("GET /api/dashboard/overdue", False, f"HTTP {r.status_code}: {r.text[:300]}")
        return
    body = r.json()
    if "overdue_loans" not in body or not isinstance(body["overdue_loans"], list):
        log("GET /api/dashboard/overdue", False, f"overdue_loans missing or not list: {list(body.keys())}")
        return
    loans = body["overdue_loans"]
    shape_issues = []
    required_keys = ["loan_id", "borrower_name", "overdue_count", "overdue_amount", "principal", "overdue_entries"]
    entry_keys = ["month", "due_date", "amount", "days_late"]
    for idx, l in enumerate(loans):
        for k in required_keys:
            if k not in l:
                shape_issues.append(f"loan[{idx}] missing {k}")
        entries = l.get("overdue_entries", [])
        if not isinstance(entries, list) or len(entries) == 0:
            shape_issues.append(f"loan[{idx}] entries empty")
        else:
            for ek in entry_keys:
                if ek not in entries[0]:
                    shape_issues.append(f"loan[{idx}].entries[0] missing {ek}")
    ok = (len(shape_issues) == 0)
    detail = f"overdue_loans={len(loans)}"
    if shape_issues:
        detail += f" ISSUES={shape_issues[:5]}"
    if len(loans) == 0:
        detail += " (NOTE: empty list — cannot fully validate shape)"
    log("GET /api/dashboard/overdue", ok, detail)
    return body

def test_repay_scenarios(token, client_id):
    h = {"Authorization": f"Bearer {token}"}
    # Create a fresh loan to avoid "already paid" collisions
    ra = requests.post(f"{API}/loan-apps/approve", headers=h, json={
        "client_id": client_id,
        "amount": 60000,
        "term_months": 6,
        "interest_rate": 12.0,
    })
    if ra.status_code != 200:
        log("create loan for repay test", False, f"{ra.status_code} {ra.text[:200]}")
        return
    loan = ra.json()
    loan_id = loan["loan_id"]
    schedule = loan["repayment_schedule"]
    # Pick distinct months for each scenario
    # Parse due dates
    def _due(m):
        due = next(s["due_date"] for s in schedule if s["month"] == m)
        if isinstance(due, str):
            return datetime.fromisoformat(due.replace("Z", "+00:00"))
        return due

    # --- (a) Without override — paid at now, should be not late (since due in future)
    r1 = requests.post(f"{API}/loans/{loan_id}/repay/1", headers=h)
    if r1.status_code != 200:
        log("repay without override", False, f"{r1.status_code} {r1.text[:200]}")
    else:
        j = r1.json()
        entry = next(s for s in j["repayment_schedule"] if s["month"] == 1)
        paid_ok = entry["status"] == "paid" and entry.get("paid_at") is not None
        # was_late should be False (paid now, due in 30 days)
        late_flag = entry.get("was_late", entry.get("is_delayed", False))
        log("(a) repay without override_date",
            paid_ok and late_flag is False,
            f"status={entry['status']} was_late={late_flag} paid_at={entry.get('paid_at')}")

    # --- (b) With override_date after due_date → should be late
    due2 = _due(2)
    after_due = (due2 + timedelta(days=5)).isoformat()
    r2 = requests.post(f"{API}/loans/{loan_id}/repay/2?paid_date={after_due}", headers=h)
    if r2.status_code != 200:
        log("(b) repay with paid_date after due_date", False, f"{r2.status_code} {r2.text[:200]}")
    else:
        j = r2.json()
        entry = next(s for s in j["repayment_schedule"] if s["month"] == 2)
        late_flag = entry.get("was_late", entry.get("is_delayed", False))
        ok = entry["status"] == "paid" and late_flag is True
        log("(b) repay with override_date AFTER due → was_late=true",
            ok,
            f"status={entry['status']} was_late={late_flag} (sent paid_date={after_due}, due={due2.isoformat()})")

    # --- (c) With override_date before due_date → should not be late
    due3 = _due(3)
    before_due = (due3 - timedelta(days=5)).isoformat()
    r3 = requests.post(f"{API}/loans/{loan_id}/repay/3?paid_date={before_due}", headers=h)
    if r3.status_code != 200:
        log("(c) repay with paid_date before due_date", False, f"{r3.status_code} {r3.text[:200]}")
    else:
        j = r3.json()
        entry = next(s for s in j["repayment_schedule"] if s["month"] == 3)
        late_flag = entry.get("was_late", entry.get("is_delayed", False))
        ok = entry["status"] == "paid" and late_flag is False
        log("(c) repay with override_date BEFORE due → was_late=false",
            ok,
            f"status={entry['status']} was_late={late_flag} (sent paid_date={before_due}, due={due3.isoformat()})")

    # --- (d) Also try alternate param name `override_date` (per review wording)
    r4 = requests.post(f"{API}/loans/{loan_id}/repay/4?override_date={after_due}", headers=h)
    if r4.status_code != 200:
        print(f"(d) repay using ?override_date= returned {r4.status_code}")
    else:
        j = r4.json()
        entry = next(s for s in j["repayment_schedule"] if s["month"] == 4)
        late_flag = entry.get("was_late", entry.get("is_delayed", False))
        # If using override_date is ignored, paid_at ~ now (not late)
        print(f"(info) override_date param behavior: was_late={late_flag} paid_at={entry.get('paid_at')}")

def main():
    print(f"Base URL: {API}\n")
    token, user = auth_login()
    print(f"Authenticated user_id={user['user_id']} mobile={user['mobile']}")
    ensure_subscription(token)
    client_id = get_or_create_client(token)
    print(f"Using client_id={client_id}\n")

    test_check_cibil(token, client_id)
    print()
    test_dashboard(token)
    print()
    test_dashboard_overdue(token)
    print()
    test_repay_scenarios(token, client_id)

    print("\n=== SUMMARY ===")
    passed = sum(1 for r in results if r["ok"])
    print(f"{passed}/{len(results)} passed")
    for r in results:
        print(f"  {'OK' if r['ok'] else 'XX'}  {r['name']}")
    sys.exit(0 if passed == len(results) else 1)

if __name__ == "__main__":
    main()

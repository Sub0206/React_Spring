"""LendIQ iteration 6 backend tests.

Focus:
1) POST /api/clients without verification_id → should 200 & otp_verified=false.
2) POST /api/loan-apps/approve with due_day=5 → due_date day must equal 5 for every entry.
3) POST /api/loan-apps/approve without due_day → backward-compat 30-day cadence.
4) POST /api/loans/{loan_id}/repay/{month}?paid_date=ISO → was_late reflects paid_date vs due_date.
"""
import os
import json
import sys
import uuid
from datetime import datetime, timedelta, timezone

import requests

BASE = os.environ.get("BACKEND_URL", "https://lending-hub-63.preview.emergentagent.com").rstrip("/")
# due_day used for test 2 (per review request iteration-6 retest: due_day=10)
DUE_DAY = 10
API = f"{BASE}/api"

SESSION = requests.Session()
SESSION.headers.update({"Content-Type": "application/json"})


def log(msg):
    print(msg, flush=True)


def auth_as_lender() -> str:
    mobile = "9876543210"
    r = SESSION.post(f"{API}/auth/send-otp", json={"mobile": mobile, "purpose": "login"})
    if r.status_code == 404:
        # Sign up demo lender
        r = SESSION.post(f"{API}/auth/send-otp", json={"mobile": mobile, "name": "Demo Lender", "purpose": "signup"})
    assert r.status_code == 200, f"send-otp failed: {r.status_code} {r.text}"
    otp = r.json()["demo_otp"]
    r2 = SESSION.post(f"{API}/auth/verify-otp", json={"mobile": mobile, "otp": otp})
    assert r2.status_code == 200, f"verify-otp failed: {r2.status_code} {r2.text}"
    token = r2.json()["access_token"]
    SESSION.headers.update({"Authorization": f"Bearer {token}"})
    return token


def random_mobile() -> str:
    # Random Indian mobile starting with 9, unused
    return "9" + "".join([str((uuid.uuid4().int >> (i * 4)) & 0xF % 10) for i in range(9)])[:9]


def gen_unused_mobile() -> str:
    import random
    return "9" + "".join(str(random.randint(0, 9)) for _ in range(9))


def gen_pan() -> str:
    import random, string
    return "".join(random.choices(string.ascii_uppercase, k=5)) + "".join(str(random.randint(0, 9)) for _ in range(4)) + random.choice(string.ascii_uppercase)


# Use a pre-verified Aadhaar number (12 digits with valid Verhoeff checksum).
# 234123412346 is listed as a sample in test_credentials.md.
VALID_AADHAAR = "234123412346"


def create_client_no_otp(name: str, mobile: str, pan: str):
    """Create a client WITHOUT verification_id (test #1)."""
    body = {
        "name": name,
        "mobile": mobile,
        "aadhaar": VALID_AADHAAR,
        "pan": pan,
        "aadhaar_name": name,
        "pan_name": name,
        "pan_dob": "1990-01-01",
    }
    r = SESSION.post(f"{API}/clients", json=body)
    return r


def create_client_with_otp(name: str, mobile: str, pan: str):
    """Full flow with OTP so other tests have a valid client."""
    # Send OTP
    r = SESSION.post(f"{API}/clients/send-otp", json={"mobile": mobile})
    assert r.status_code == 200, f"client send-otp failed: {r.status_code} {r.text}"
    vid = r.json()["verification_id"]
    otp = r.json()["demo_otp"]
    r2 = SESSION.post(f"{API}/clients/verify-otp", json={"verification_id": vid, "otp": otp})
    assert r2.status_code == 200, f"client verify-otp failed: {r2.status_code} {r2.text}"
    body = {
        "name": name,
        "mobile": mobile,
        "aadhaar": VALID_AADHAAR,
        "pan": pan,
        "verification_id": vid,
        "aadhaar_name": name,
        "pan_name": name,
        "pan_dob": "1990-01-01",
    }
    r3 = SESSION.post(f"{API}/clients", json=body)
    assert r3.status_code == 200, f"client create failed: {r3.status_code} {r3.text}"
    return r3.json()


def approve_loan(client_id: str, amount: float, term_months: int, interest_rate: float, due_day=None):
    body = {
        "client_id": client_id,
        "amount": amount,
        "term_months": term_months,
        "interest_rate": interest_rate,
    }
    if due_day is not None:
        body["due_day"] = due_day
    r = SESSION.post(f"{API}/loan-apps/approve", json=body)
    return r


def parse_iso(s):
    if isinstance(s, str):
        return datetime.fromisoformat(s.replace("Z", "+00:00"))
    return s


def test_1_create_client_without_verification_id():
    log("\n--- Test 1: POST /api/clients without verification_id ---")
    mobile = gen_unused_mobile()
    pan = gen_pan()
    r = create_client_no_otp("Test NoOtp Real", mobile, pan)
    log(f"Status: {r.status_code}; Body: {r.text[:400]}")
    if r.status_code != 200:
        return False, f"Expected 200, got {r.status_code}: {r.text}"
    data = r.json()
    # Expected: otp_verified=false, pan_verified=true, aadhaar_verified=true
    if data.get("otp_verified") is not False:
        return False, f"otp_verified expected False, got {data.get('otp_verified')}"
    if data.get("pan_verified") is not True:
        return False, f"pan_verified expected True, got {data.get('pan_verified')}"
    if data.get("aadhaar_verified") is not True:
        return False, f"aadhaar_verified expected True, got {data.get('aadhaar_verified')}"
    return True, data.get("client_id")


def test_2_approve_with_due_day(client_id: str):
    log(f"\n--- Test 2: POST /api/loan-apps/approve with due_day={DUE_DAY} ---")
    r = approve_loan(client_id, 100000, 6, 12, due_day=DUE_DAY)
    log(f"Status: {r.status_code}; Body: {r.text[:500]}")
    if r.status_code != 200:
        return False, f"Expected 200, got {r.status_code}: {r.text}"
    loan = r.json()
    schedule = loan.get("repayment_schedule", [])
    if len(schedule) != 6:
        return False, f"Expected 6 schedule entries, got {len(schedule)}"
    days_seen = []
    for entry in schedule:
        due = parse_iso(entry["due_date"])
        days_seen.append(due.day)
        if due.day != DUE_DAY:
            return False, f"Entry month {entry['month']} due_date={due.isoformat()} day={due.day} (expected {DUE_DAY})"
    log(f"All schedule due-days: {days_seen}")
    return True, loan["loan_id"]


def test_3_approve_without_due_day(client_id: str):
    log("\n--- Test 3: POST /api/loan-apps/approve WITHOUT due_day ---")
    r = approve_loan(client_id, 50000, 3, 0)  # no due_day
    log(f"Status: {r.status_code}; Body: {r.text[:400]}")
    if r.status_code != 200:
        return False, f"Expected 200, got {r.status_code}: {r.text}"
    loan = r.json()
    schedule = loan.get("repayment_schedule", [])
    if len(schedule) != 3:
        return False, f"Expected 3 schedule entries, got {len(schedule)}"
    # Verify 30-day cadence from funding time (approximately). Difference between consecutive should be ~30 days.
    dues = [parse_iso(s["due_date"]) for s in schedule]
    gaps = [(dues[i + 1] - dues[i]).days for i in range(len(dues) - 1)]
    log(f"Gaps between consecutive due_dates: {gaps}")
    for g in gaps:
        if g != 30:
            return False, f"Expected 30-day cadence, got gap {g}"
    return True, loan["loan_id"]


def test_4_repay_paid_date_late_flag(loan_id: str, due_day_based_loan: bool):
    """Test late/early paid_date handling.

    We'll use a due_day-anchored loan so we know exact due_date. month=1 will be paid early, month=2 late.
    """
    log("\n--- Test 4: POST /api/loans/{id}/repay/{month} with paid_date before/after due_date ---")
    # Get loan
    r = SESSION.get(f"{API}/loans/{loan_id}")
    if r.status_code != 200:
        return False, f"Could not fetch loan: {r.status_code} {r.text}"
    loan = r.json()
    schedule = loan["repayment_schedule"]
    # Pay month 1 early (1 day before due_date)
    m1_due = parse_iso(schedule[0]["due_date"])
    early_paid = (m1_due - timedelta(days=1)).isoformat()
    r1 = SESSION.post(f"{API}/loans/{loan_id}/repay/1", params={"paid_date": early_paid})
    log(f"Early payment status={r1.status_code}; resp={r1.text[:300]}")
    if r1.status_code != 200:
        return False, f"Early-pay failed: {r1.status_code} {r1.text}"
    updated = r1.json()
    entry1 = next(s for s in updated["repayment_schedule"] if s["month"] == 1)
    if entry1.get("was_late") is not False:
        return False, f"Early paid expected was_late=False; got {entry1.get('was_late')}"
    # Pay month 2 late (5 days after due_date)
    m2_due = parse_iso(schedule[1]["due_date"])
    late_paid = (m2_due + timedelta(days=5)).isoformat()
    r2 = SESSION.post(f"{API}/loans/{loan_id}/repay/2", params={"paid_date": late_paid})
    log(f"Late payment status={r2.status_code}; resp={r2.text[:300]}")
    if r2.status_code != 200:
        return False, f"Late-pay failed: {r2.status_code} {r2.text}"
    updated2 = r2.json()
    entry2 = next(s for s in updated2["repayment_schedule"] if s["month"] == 2)
    if entry2.get("was_late") is not True:
        return False, f"Late paid expected was_late=True; got {entry2.get('was_late')}"
    return True, "ok"


def main():
    results = {}
    log(f"Base API: {API}")
    auth_as_lender()
    log("Authenticated as lender.")

    # Try to create a fresh OTP-verified client; if that fails, fall back to any existing client.
    verified_client_id = None
    try:
        vc = create_client_with_otp("Iter6 Verified Borrower", gen_unused_mobile(), gen_pan())
        verified_client_id = vc["client_id"]
        log(f"Created OTP-verified fallback client: {verified_client_id}")
    except Exception as e:
        log(f"[WARN] Could not create fresh client ({e}). Falling back to existing client list.")
        r = SESSION.get(f"{API}/clients")
        if r.status_code == 200 and r.json():
            verified_client_id = r.json()[0]["client_id"]
            log(f"Using existing client: {verified_client_id}")
    if not verified_client_id:
        log("FATAL: no client available for tests 2/3/4")
        sys.exit(2)

    # TEST 1
    try:
        ok, val = test_1_create_client_without_verification_id()
        results["1_create_without_otp"] = (ok, val)
    except Exception as e:
        results["1_create_without_otp"] = (False, f"Exception: {e}")

    # Use verified client for tests 2/3/4 (safer than depending on test 1).
    client_id_for_loans = verified_client_id

    # TEST 2
    try:
        ok, val = test_2_approve_with_due_day(client_id_for_loans)
        results["2_approve_with_due_day"] = (ok, val)
        due_day_loan_id = val if ok else None
    except Exception as e:
        results["2_approve_with_due_day"] = (False, f"Exception: {e}")
        due_day_loan_id = None

    # TEST 3
    try:
        ok, val = test_3_approve_without_due_day(client_id_for_loans)
        results["3_approve_without_due_day"] = (ok, val)
    except Exception as e:
        results["3_approve_without_due_day"] = (False, f"Exception: {e}")

    # TEST 4
    if due_day_loan_id:
        try:
            ok, val = test_4_repay_paid_date_late_flag(due_day_loan_id, True)
            results["4_repay_was_late_flag"] = (ok, val)
        except Exception as e:
            results["4_repay_was_late_flag"] = (False, f"Exception: {e}")
    else:
        results["4_repay_was_late_flag"] = (False, "Skipped: Test 2 failed so no due_day loan available")

    # Summary
    log("\n========== SUMMARY ==========")
    any_fail = False
    for k, (ok, v) in results.items():
        mark = "PASS" if ok else "FAIL"
        log(f"[{mark}] {k}: {v}")
        if not ok:
            any_fail = True
    sys.exit(1 if any_fail else 0)


if __name__ == "__main__":
    main()

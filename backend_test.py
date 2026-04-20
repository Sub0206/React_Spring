"""Iteration-8 backend tests: reschedule + undo-pay + repay regression."""
import os
import sys
import json
from datetime import datetime, timezone, timedelta
import requests

BASE = "https://lending-hub-63.preview.emergentagent.com/api"
MOBILE = "9876543210"


def _p(ok, msg):
    print(("[PASS] " if ok else "[FAIL] ") + msg)
    return ok


def login():
    r = requests.post(f"{BASE}/auth/send-otp", json={"mobile": MOBILE, "purpose": "login"}, timeout=20)
    r.raise_for_status()
    otp = r.json()["demo_otp"]
    r = requests.post(f"{BASE}/auth/verify-otp", json={"mobile": MOBILE, "otp": otp}, timeout=20)
    r.raise_for_status()
    return r.json()["access_token"]


def main():
    results = []
    token = login()
    H = {"Authorization": f"Bearer {token}"}

    # Find an active loan with at least one unpaid EMI
    r = requests.get(f"{BASE}/loans", headers=H, timeout=20)
    r.raise_for_status()
    loans = r.json()
    loan = None
    unpaid_month = None
    for L in loans:
        if L.get("status") != "active":
            continue
        for e in L.get("repayment_schedule", []):
            if e.get("status") != "paid":
                loan = L
                unpaid_month = e["month"]
                break
        if loan:
            break

    if not loan:
        print("No active loan with unpaid EMI found — cannot run tests.")
        sys.exit(2)

    loan_id = loan["loan_id"]
    print(f"Using loan={loan_id}, unpaid_month={unpaid_month}, borrower={loan['borrower']['name']}")

    # =========================
    # 1) RESCHEDULE ENDPOINT
    # =========================
    print("\n=== Test 1: POST /loans/{id}/reschedule/{month} ===")
    new_due_iso = "2027-01-15T12:00:00Z"
    r = requests.post(
        f"{BASE}/loans/{loan_id}/reschedule/{unpaid_month}",
        params={"new_due_date": new_due_iso},
        headers=H, timeout=20,
    )
    ok1a = r.status_code == 200
    details = ""
    if ok1a:
        data = r.json()
        ent = next((e for e in data["repayment_schedule"] if e["month"] == unpaid_month), None)
        got_due = ent["due_date"] if ent else None
        try:
            got_dt = datetime.fromisoformat(got_due.replace("Z", "+00:00")) if got_due else None
        except Exception:
            got_dt = None
        expected_dt = datetime(2027, 1, 15, 12, 0, 0, tzinfo=timezone.utc)
        ok1a = got_dt is not None and got_dt == expected_dt
        # confirm full Loan object returned
        has_fields = all(k in data for k in ["loan_id", "repayment_schedule", "principal", "borrower", "monthly_payment"])
        ok1a = ok1a and has_fields
        details = f"status=200, got_due={got_due}, full loan returned={has_fields}"
    else:
        details = f"status={r.status_code} body={r.text[:200]}"
    results.append(_p(ok1a, f"1a: Reschedule unpaid EMI to 2027-01-15 — {details}"))

    # 1b: Reschedule a PAID EMI -> expect 400
    r = requests.get(f"{BASE}/loans/{loan_id}", headers=H, timeout=20)
    fresh = r.json()
    paid_month = next((e["month"] for e in fresh["repayment_schedule"] if e.get("status") == "paid"), None)
    created_paid_for_test = False
    if paid_month is None:
        pay_month = next((e["month"] for e in fresh["repayment_schedule"] if e["month"] != unpaid_month and e.get("status") != "paid"), None)
        if pay_month is not None:
            rp = requests.post(f"{BASE}/loans/{loan_id}/repay/{pay_month}", headers=H, timeout=20)
            if rp.status_code == 200:
                paid_month = pay_month
                created_paid_for_test = True

    if paid_month is not None:
        r = requests.post(
            f"{BASE}/loans/{loan_id}/reschedule/{paid_month}",
            params={"new_due_date": "2027-03-01T00:00:00Z"},
            headers=H, timeout=20,
        )
        ok1b = r.status_code == 400 and "paid" in r.text.lower() and "undo" in r.text.lower()
        results.append(_p(ok1b, f"1b: Reschedule PAID EMI rejected (400 w/ 'Cannot reschedule a paid EMI. Undo first.') — status={r.status_code} body={r.text[:200]}"))
        # cleanup
        if created_paid_for_test:
            requests.post(f"{BASE}/loans/{loan_id}/undo-pay/{paid_month}", headers=H, timeout=20)
    else:
        results.append(_p(False, "1b: Skipped — could not create a paid EMI to test"))

    # 1c: Invalid ISO -> expect 400
    r = requests.post(
        f"{BASE}/loans/{loan_id}/reschedule/{unpaid_month}",
        params={"new_due_date": "not-a-date"},
        headers=H, timeout=20,
    )
    ok1c = r.status_code == 400
    results.append(_p(ok1c, f"1c: Invalid ISO rejected (400) — status={r.status_code} body={r.text[:200]}"))

    # =========================
    # 2) UNDO-PAY ENDPOINT
    # =========================
    print("\n=== Test 2: POST /loans/{id}/undo-pay/{month} ===")

    r = requests.get(f"{BASE}/loans/{loan_id}", headers=H, timeout=20)
    fresh = r.json()
    target_month = next((e["month"] for e in fresh["repayment_schedule"] if e.get("status") != "paid"), None)
    if target_month is None:
        results.append(_p(False, "2: No unpaid EMI available to mark+undo"))
    else:
        before_paid_amount = fresh["paid_amount"]
        emi_amount = next(e["amount"] for e in fresh["repayment_schedule"] if e["month"] == target_month)

        # Mark paid
        r = requests.post(f"{BASE}/loans/{loan_id}/repay/{target_month}", headers=H, timeout=20)
        ok_repay = r.status_code == 200
        if not ok_repay:
            results.append(_p(False, f"2-setup: repay failed: status={r.status_code} {r.text[:200]}"))
        else:
            paid_snapshot = r.json()
            after_paid = paid_snapshot["paid_amount"]
            print(f"  after repay: paid_amount={after_paid} (was {before_paid_amount}, emi={emi_amount})")

            # Undo
            r = requests.post(f"{BASE}/loans/{loan_id}/undo-pay/{target_month}", headers=H, timeout=20)
            ok2a = r.status_code == 200
            if ok2a:
                data = r.json()
                ent = next(e for e in data["repayment_schedule"] if e["month"] == target_month)
                new_paid = data["paid_amount"]
                cond1 = abs(new_paid - (after_paid - emi_amount)) < 0.01
                cond2 = ent["status"] == "upcoming"
                cond3 = ent.get("paid_at") is None
                cond4 = ent.get("was_late") is False
                ok2a = cond1 and cond2 and cond3 and cond4
                results.append(_p(ok2a,
                    f"2a: Undo-pay: paid_amount decremented={cond1} (new={new_paid}, expected={after_paid - emi_amount}), "
                    f"status=upcoming({cond2}), paid_at=None({cond3}), was_late=False({cond4})"))
            else:
                results.append(_p(False, f"2a: undo-pay failed: status={r.status_code} {r.text[:200]}"))

            # 2b: Undo again -> 400 "not marked as paid"
            r = requests.post(f"{BASE}/loans/{loan_id}/undo-pay/{target_month}", headers=H, timeout=20)
            ok2b = r.status_code == 400 and ("not marked as paid" in r.text.lower())
            results.append(_p(ok2b, f"2b: Double-undo rejected (400, 'not marked as paid') — status={r.status_code} body={r.text[:200]}"))

            # 2c: Transaction inserted (fee, negative amount, this loan)
            r = requests.get(f"{BASE}/transactions", headers=H, timeout=20)
            txns = r.json() if r.status_code == 200 else []
            match = [t for t in txns if t.get("loan_id") == loan_id and t.get("type") == "fee" and float(t.get("amount", 0)) < 0]
            ok2c = len(match) > 0
            sample = match[0] if match else None
            results.append(_p(ok2c, f"2c: Reversal txn logged (type=fee, amount<0) — found={len(match)} sample_amt={sample['amount'] if sample else None} desc={sample['description'] if sample else None}"))

    # =========================
    # 3) REGRESSION: repay with paid_date
    # =========================
    print("\n=== Test 3: Regression — repay with paid_date (was_late) ===")
    r = requests.get(f"{BASE}/loans/{loan_id}", headers=H, timeout=20)
    fresh = r.json()
    reg_month = next((e["month"] for e in fresh["repayment_schedule"] if e.get("status") != "paid"), None)
    if reg_month is None:
        results.append(_p(False, "3: No unpaid EMI left for regression"))
    else:
        ent = next(e for e in fresh["repayment_schedule"] if e["month"] == reg_month)
        due_s = ent["due_date"]
        due = datetime.fromisoformat(due_s.replace("Z", "+00:00"))
        if due.tzinfo is None:
            due = due.replace(tzinfo=timezone.utc)
        late_date = (due + timedelta(days=5)).isoformat().replace("+00:00", "Z")
        r = requests.post(
            f"{BASE}/loans/{loan_id}/repay/{reg_month}",
            params={"paid_date": late_date},
            headers=H, timeout=20,
        )
        ok3 = r.status_code == 200
        if ok3:
            data = r.json()
            e2 = next(e for e in data["repayment_schedule"] if e["month"] == reg_month)
            ok3 = (e2.get("was_late") is True) and (e2.get("status") == "paid")
            results.append(_p(ok3, f"3: repay?paid_date=due+5d → was_late=True (got {e2.get('was_late')}), status=paid (got {e2.get('status')})"))
            # undo to leave loan clean
            requests.post(f"{BASE}/loans/{loan_id}/undo-pay/{reg_month}", headers=H, timeout=20)
        else:
            results.append(_p(False, f"3: repay failed: status={r.status_code} {r.text[:200]}"))

    passed = sum(1 for x in results if x)
    total = len(results)
    print(f"\n====== {passed}/{total} PASSED ======")
    sys.exit(0 if passed == total else 1)


if __name__ == "__main__":
    main()

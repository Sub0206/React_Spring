"""Iteration 7 LendIQ backend regression tests.

Targets (no backend code changed in iter 7):
 1. Auth send-otp/verify-otp (login for pre-existing 9876543210)
 2. /api/applications?status=pending|approved|funded|rejected each → 200 + list
 3. /api/loans → list with `repayment_schedule` (month, due_date, amount, status, was_late)
 4. /api/dashboard → overdue_count, overdue_amount, inflow_chart, outflow_chart
 5. /api/dashboard/overdue → {overdue_loans: [...]}
"""
from __future__ import annotations
import os, sys, json, re
import requests

BASE = "https://lending-hub-63.preview.emergentagent.com/api"
MOBILE = "9876543210"

PASS = []
FAIL = []


def record(name: str, ok: bool, detail: str = "") -> None:
    (PASS if ok else FAIL).append((name, detail))
    prefix = "PASS" if ok else "FAIL"
    print(f"[{prefix}] {name}" + (f"  — {detail}" if detail else ""))


def login() -> str:
    # Try login first (account likely already exists from prior iterations)
    r = requests.post(f"{BASE}/auth/send-otp", json={"mobile": MOBILE, "purpose": "login"}, timeout=20)
    if r.status_code == 404:
        # Fall back to signup
        r = requests.post(
            f"{BASE}/auth/send-otp",
            json={"mobile": MOBILE, "purpose": "signup", "name": "Demo Lender"},
            timeout=20,
        )
    if r.status_code != 200:
        raise RuntimeError(f"send-otp failed {r.status_code} {r.text[:200]}")
    body = r.json()
    otp = body.get("demo_otp")
    if not otp:
        raise RuntimeError(f"no demo_otp in send-otp response: {body}")
    record("POST /api/auth/send-otp", True, f"mobile={MOBILE}, demo_otp present")

    r2 = requests.post(f"{BASE}/auth/verify-otp", json={"mobile": MOBILE, "otp": otp}, timeout=20)
    if r2.status_code != 200:
        raise RuntimeError(f"verify-otp failed {r2.status_code} {r2.text[:200]}")
    tok = r2.json().get("access_token")
    if not tok:
        raise RuntimeError("no access_token")
    record("POST /api/auth/verify-otp", True, "access_token returned")
    return tok


def test_applications(h: dict) -> None:
    for st in ("pending", "approved", "funded", "rejected"):
        r = requests.get(f"{BASE}/applications", params={"status": st}, headers=h, timeout=20)
        ok = r.status_code == 200 and isinstance(r.json(), list)
        detail = f"status={r.status_code}, count={len(r.json()) if ok else 'n/a'}"
        if ok and r.json():
            # sanity — every item should have status == requested
            stmatch = all(it.get("status") == st for it in r.json())
            if not stmatch:
                ok = False
                detail += " — MISMATCH: items don't all match requested status"
        record(f"GET /api/applications?status={st}", ok, detail)


def test_loans(h: dict) -> list:
    r = requests.get(f"{BASE}/loans", headers=h, timeout=20)
    ok_status = r.status_code == 200
    loans: list = []
    detail = f"status={r.status_code}"
    if ok_status:
        try:
            loans = r.json()
        except Exception as e:
            record("GET /api/loans", False, f"non-JSON body: {e}")
            return []
        if not isinstance(loans, list):
            record("GET /api/loans", False, "response not list")
            return []
        detail += f", count={len(loans)}"
        # Check schedule shape on each loan
        if loans:
            required_entry_keys = {"month", "due_date", "amount", "status", "was_late"}
            bad = []
            for ln in loans:
                sched = ln.get("repayment_schedule")
                if not isinstance(sched, list) or not sched:
                    bad.append(f"{ln.get('loan_id')}: missing/empty schedule")
                    continue
                first = sched[0]
                missing = required_entry_keys - set(first.keys())
                if missing:
                    bad.append(f"{ln.get('loan_id')}: missing keys {missing}")
            if bad:
                record("GET /api/loans (schedule shape)", False, "; ".join(bad[:3]))
                record("GET /api/loans", True, detail + " — schema issues above")
                return loans
            record("GET /api/loans", True, detail + " — schedules OK (month,due_date,amount,status,was_late)")
        else:
            record("GET /api/loans", True, detail + " — empty list (no loans yet)")
    else:
        record("GET /api/loans", False, detail + f" body={r.text[:200]}")
    return loans


def test_dashboard(h: dict) -> None:
    r = requests.get(f"{BASE}/dashboard", headers=h, timeout=20)
    if r.status_code != 200:
        record("GET /api/dashboard", False, f"status={r.status_code} body={r.text[:200]}")
        return
    d = r.json()
    needed = ["overdue_count", "overdue_amount", "inflow_chart", "outflow_chart"]
    miss = [k for k in needed if k not in d]
    if miss:
        record("GET /api/dashboard", False, f"missing keys {miss}")
        return
    # shape check for charts
    shape_ok = True
    shape_detail = ""
    for k in ("inflow_chart", "outflow_chart"):
        v = d[k]
        if not isinstance(v, list) or not v:
            shape_ok = False
            shape_detail = f"{k} not a non-empty list"
            break
        if not all(isinstance(x, dict) and "label" in x and "value" in x for x in v):
            shape_ok = False
            shape_detail = f"{k} items missing label/value"
            break
    if not shape_ok:
        record("GET /api/dashboard", False, shape_detail)
        return
    record(
        "GET /api/dashboard",
        True,
        f"overdue_count={d['overdue_count']}, overdue_amount={d['overdue_amount']}, "
        f"inflow_chart={len(d['inflow_chart'])} pts, outflow_chart={len(d['outflow_chart'])} pts",
    )


def test_overdue(h: dict) -> None:
    r = requests.get(f"{BASE}/dashboard/overdue", headers=h, timeout=20)
    if r.status_code != 200:
        record("GET /api/dashboard/overdue", False, f"status={r.status_code} body={r.text[:200]}")
        return
    d = r.json()
    if not isinstance(d, dict) or "overdue_loans" not in d or not isinstance(d["overdue_loans"], list):
        record("GET /api/dashboard/overdue", False, f"unexpected shape: {str(d)[:200]}")
        return
    record("GET /api/dashboard/overdue", True, f"overdue_loans count={len(d['overdue_loans'])}")


def main() -> int:
    print(f"BASE = {BASE}")
    try:
        token = login()
    except Exception as e:
        record("auth", False, str(e))
        _summary()
        return 1
    h = {"Authorization": f"Bearer {token}"}
    test_applications(h)
    test_loans(h)
    test_dashboard(h)
    test_overdue(h)
    return _summary()


def _summary() -> int:
    print("\n==== SUMMARY ====")
    print(f"PASSED: {len(PASS)}")
    for n, d in PASS:
        print(f"  ✓ {n}  {d}")
    print(f"FAILED: {len(FAIL)}")
    for n, d in FAIL:
        print(f"  ✗ {n}  {d}")
    return 0 if not FAIL else 1


if __name__ == "__main__":
    sys.exit(main())

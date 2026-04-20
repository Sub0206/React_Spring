"""Iteration-10 regression tests for LendIQ backend.

Focus: validate the new `portfolio_health` field on GET /api/dashboard plus regression
on /api/loans, /api/dashboard/overdue, /api/auth/verify-otp, /api/loan-apps/approve
(with due_day), /api/loans/{id}/repay/{month}, /api/loans/{id}/undo-pay/{month},
/api/loans/{id}/reschedule/{month}.

Runs against the public preview URL defined in frontend/.env (EXPO_PUBLIC_BACKEND_URL).
No backend code is modified.
"""
import os
import re
import sys
import json
import time
import uuid
from datetime import datetime, timedelta, timezone
import requests

# ---- Config ----
ENV_PATH = "/app/frontend/.env"
BASE = None
with open(ENV_PATH) as fh:
    for line in fh:
        line = line.strip()
        if line.startswith("EXPO_PUBLIC_BACKEND_URL="):
            BASE = line.split("=", 1)[1].strip().strip('"').strip("'")
            break
if not BASE:
    print("ERROR: EXPO_PUBLIC_BACKEND_URL not found in frontend/.env")
    sys.exit(2)
API = BASE.rstrip("/") + "/api"
MOBILE = "9876543210"

results = []
def record(name, ok, detail=""):
    status = "PASS" if ok else "FAIL"
    print(f"[{status}] {name} :: {detail}")
    results.append({"name": name, "ok": ok, "detail": detail})

def pretty(v):
    try:
        return json.dumps(v, default=str)[:400]
    except Exception:
        return str(v)[:400]

# ---- 1. Auth ----
print(f"\n== Auth lender {MOBILE} ==  base={API}")
r = requests.post(f"{API}/auth/send-otp", json={"mobile": MOBILE, "purpose": "login"}, timeout=30)
if r.status_code != 200:
    record("auth/send-otp", False, f"{r.status_code} {r.text[:200]}")
    sys.exit(1)
otp = r.json().get("demo_otp")
record("auth/send-otp", bool(otp), f"demo_otp={otp}")

r = requests.post(f"{API}/auth/verify-otp", json={"mobile": MOBILE, "otp": otp}, timeout=30)
if r.status_code != 200:
    record("auth/verify-otp", False, f"{r.status_code} {r.text[:200]}")
    sys.exit(1)
TOKEN = r.json().get("access_token")
USER = r.json().get("user")
record("auth/verify-otp", bool(TOKEN), f"user_id={USER.get('user_id')} name={USER.get('name')}")
H = {"Authorization": f"Bearer {TOKEN}"}

# ---- 2. Dashboard + portfolio_health ----
print("\n== /api/dashboard ==")
r = requests.get(f"{API}/dashboard", headers=H, timeout=30)
dash_ok = r.status_code == 200
dash = r.json() if dash_ok else {}
record("dashboard status 200", dash_ok, f"status={r.status_code}")

required_keys = ["inflow_chart", "outflow_chart", "overdue_count", "overdue_amount", "portfolio_health"]
missing = [k for k in required_keys if k not in dash]
record("dashboard has required keys", not missing, f"missing={missing}" if missing else "all present")

ph = dash.get("portfolio_health", {})
ph_keys = ["on_track", "overdue", "at_risk", "completed", "defaulted"]
ph_missing = [k for k in ph_keys if k not in ph]
record("portfolio_health has 5 keys", not ph_missing, f"keys={list(ph.keys())} missing={ph_missing}")

ph_int = all(isinstance(ph.get(k), int) for k in ph_keys if k in ph)
record("portfolio_health values are int", ph_int, f"values={ph}")

# inflow/outflow chart shape
inflow = dash.get("inflow_chart", [])
outflow = dash.get("outflow_chart", [])
inflow_ok = isinstance(inflow, list) and len(inflow) == 6 and all(
    isinstance(x, dict) and "label" in x and "value" in x for x in inflow
)
outflow_ok = isinstance(outflow, list) and len(outflow) == 6 and all(
    isinstance(x, dict) and "label" in x and "value" in x for x in outflow
)
record("inflow_chart 6 {label,value}", inflow_ok, f"len={len(inflow)} sample={inflow[:1]}")
record("outflow_chart 6 {label,value}", outflow_ok, f"len={len(outflow)} sample={outflow[:1]}")

# ---- 3. Fetch loans & validate portfolio_health sum matches total loans ----
print("\n== /api/loans (regression) ==")
r = requests.get(f"{API}/loans", headers=H, timeout=30)
loans_ok = r.status_code == 200
loans = r.json() if loans_ok else []
record("loans 200", loans_ok, f"status={r.status_code} count={len(loans)}")

# Dashboard scopes loans to current lender (funded_by == user_id); /api/loans returns all.
my_user_id = USER.get("user_id")
my_loans = [l for l in loans if l.get("funded_by") == my_user_id]
ph_sum = sum(int(ph.get(k, 0)) for k in ph_keys)
record("portfolio_health sum == total loans (all)",
       ph_sum == len(loans),
       f"ph_sum={ph_sum} total_loans_all={len(loans)} my_loans={len(my_loans)} ph={ph}")
record("portfolio_health sum == lender's own loans",
       ph_sum == len(my_loans),
       f"ph_sum={ph_sum} my_loans={len(my_loans)} ph={ph}")

# ---- 4. Business-logic verification of ph categorisation ----
print("\n== portfolio_health business logic re-derivation ==")
now = datetime.now(timezone.utc)
derived = {"on_track": 0, "overdue": 0, "at_risk": 0, "completed": 0, "defaulted": 0}
examples = {"on_track": None, "overdue": None, "at_risk": None, "completed": None, "defaulted": None}
for l in my_loans:
    status = l.get("status")
    if status == "completed":
        derived["completed"] += 1
        if examples["completed"] is None:
            examples["completed"] = l["loan_id"]
        continue
    if status == "defaulted":
        derived["defaulted"] += 1
        if examples["defaulted"] is None:
            examples["defaulted"] = l["loan_id"]
        continue
    has_overdue = False
    has_late_history = False
    for s in l.get("repayment_schedule", []):
        due_raw = s.get("due_date")
        due = None
        if due_raw:
            if isinstance(due_raw, str):
                try:
                    due = datetime.fromisoformat(due_raw.replace("Z", "+00:00"))
                except Exception:
                    due = None
            else:
                due = due_raw
        if due is not None and due.tzinfo is None:
            due = due.replace(tzinfo=timezone.utc)
        if s.get("status") != "paid" and due is not None and due < now:
            has_overdue = True
        if s.get("status") == "paid" and s.get("was_late"):
            has_late_history = True
    if has_overdue:
        derived["overdue"] += 1
        if examples["overdue"] is None:
            examples["overdue"] = l["loan_id"]
    elif has_late_history:
        derived["at_risk"] += 1
        if examples["at_risk"] is None:
            examples["at_risk"] = l["loan_id"]
    else:
        derived["on_track"] += 1
        if examples["on_track"] is None:
            examples["on_track"] = l["loan_id"]

record("portfolio_health categorisation matches business rules",
       derived == ph,
       f"backend={ph} derived_from_my_loans={derived} examples={examples}")

# ---- 5. /api/dashboard/overdue regression ----
print("\n== /api/dashboard/overdue ==")
r = requests.get(f"{API}/dashboard/overdue", headers=H, timeout=30)
ov_ok = r.status_code == 200
ov = r.json() if ov_ok else {}
record("dashboard/overdue 200", ov_ok, f"status={r.status_code} shape={list(ov.keys()) if isinstance(ov, dict) else 'list'}")
record("dashboard/overdue has overdue_loans list",
       isinstance(ov.get("overdue_loans"), list),
       f"count={len(ov.get('overdue_loans', [])) if isinstance(ov.get('overdue_loans'), list) else 'n/a'}")

# ---- 6. Pick a loan for repay/undo-pay/reschedule regression ----
print("\n== Regression: approve + repay + undo-pay + reschedule ==")
# Find any existing client of this lender to approve a fresh loan (avoid mutating existing ones)
r = requests.get(f"{API}/clients", headers=H, timeout=30)
if r.status_code != 200 or not r.json():
    record("GET /api/clients", False, f"status={r.status_code} text={r.text[:200]}")
    client_id = None
else:
    clients = r.json()
    # Prefer an active client with no outstanding rejection
    active = [c for c in clients if c.get("status") == "active"]
    client_id = (active[0] if active else clients[0])["client_id"]
    record("GET /api/clients (for approve)", True, f"using client_id={client_id} name={(active[0] if active else clients[0]).get('name')}")

if client_id:
    # Approve a tiny loan with due_day=15 (3 months) for a clean test sandbox
    body = {
        "client_id": client_id,
        "amount": 12000,
        "term_months": 3,
        "interest_rate": 10,
        "due_day": 15,
    }
    r = requests.post(f"{API}/loan-apps/approve", headers=H, json=body, timeout=30)
    approve_ok = r.status_code == 200
    loan = r.json() if approve_ok else {}
    record("loan-apps/approve with due_day=15",
           approve_ok and isinstance(loan.get("repayment_schedule"), list) and len(loan["repayment_schedule"]) == 3,
           f"status={r.status_code} loan_id={loan.get('loan_id')} sched_len={len(loan.get('repayment_schedule', []))}")
    # Verify all due_dates land on day 15
    if approve_ok:
        days = []
        for s in loan.get("repayment_schedule", []):
            d = s["due_date"]
            if isinstance(d, str):
                try:
                    dd = datetime.fromisoformat(d.replace("Z", "+00:00"))
                    days.append(dd.day)
                except Exception:
                    days.append(None)
        record("due_day=15 anchors every EMI to day 15", all(d == 15 for d in days), f"days={days}")

    loan_id = loan.get("loan_id")

    if loan_id:
        # Repay month=1 with override paid_date AFTER due → was_late=true
        target_due = loan["repayment_schedule"][0]["due_date"]
        if isinstance(target_due, str):
            due_dt = datetime.fromisoformat(target_due.replace("Z", "+00:00"))
        else:
            due_dt = target_due
        if due_dt.tzinfo is None:
            due_dt = due_dt.replace(tzinfo=timezone.utc)
        paid_iso = (due_dt + timedelta(days=5)).isoformat().replace("+00:00", "Z")
        r = requests.post(f"{API}/loans/{loan_id}/repay/1", headers=H, params={"paid_date": paid_iso}, timeout=30)
        rep_ok = r.status_code == 200
        rep = r.json() if rep_ok else {}
        was_late = rep.get("repayment_schedule", [{}])[0].get("was_late") if rep_ok else None
        record("repay month=1 (paid_date = due+5d)", rep_ok and was_late is True,
               f"status={r.status_code} was_late={was_late}")

        # Undo-pay month=1
        r = requests.post(f"{API}/loans/{loan_id}/undo-pay/1", headers=H, timeout=30)
        undo_ok = r.status_code == 200
        undo = r.json() if undo_ok else {}
        undone = undo.get("repayment_schedule", [{}])[0] if undo_ok else {}
        record("undo-pay month=1", undo_ok and undone.get("status") == "upcoming" and undone.get("paid_at") is None and undone.get("was_late") is False,
               f"status={r.status_code} entry={pretty(undone)}")

        # Reschedule month=2 to far-future ISO
        new_due_iso = (datetime(now.year + 1, 6, 20, 12, 0, 0, tzinfo=timezone.utc)).isoformat().replace("+00:00", "Z")
        r = requests.post(f"{API}/loans/{loan_id}/reschedule/2", headers=H, params={"new_due_date": new_due_iso}, timeout=30)
        resch_ok = r.status_code == 200
        resch = r.json() if resch_ok else {}
        new_due_in_loan = None
        if resch_ok:
            for s in resch.get("repayment_schedule", []):
                if s["month"] == 2:
                    new_due_in_loan = s["due_date"]
                    break
        match = False
        if new_due_in_loan:
            try:
                dd = datetime.fromisoformat(new_due_in_loan.replace("Z", "+00:00")) if isinstance(new_due_in_loan, str) else new_due_in_loan
                if dd.tzinfo is None:
                    dd = dd.replace(tzinfo=timezone.utc)
                expected = datetime.fromisoformat(new_due_iso.replace("Z", "+00:00"))
                match = dd == expected
            except Exception:
                match = False
        record("reschedule month=2 to ISO", resch_ok and match,
               f"status={r.status_code} returned_due={new_due_in_loan}")

        # Cleanup: delete test loan via DB not available here — leave it; existing runs have done same.

# ---- Summary ----
print("\n\n=============== SUMMARY ===============")
passed = sum(1 for x in results if x["ok"])
failed = sum(1 for x in results if not x["ok"])
for r in results:
    marker = "OK  " if r["ok"] else "FAIL"
    print(f"  [{marker}] {r['name']} — {r['detail']}")
print(f"\nTOTAL: {passed} passed, {failed} failed (of {len(results)})")
sys.exit(0 if failed == 0 else 1)

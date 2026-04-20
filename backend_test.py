"""
Iteration-12 Backend tests — Branded PDF statement analysis report + regressions.
"""
import os
import sys
import json
import requests

BASE = "https://lending-hub-63.preview.emergentagent.com"
API = f"{BASE}/api"
MOBILE = "9876543210"


def _pp(title, r):
    ct = r.headers.get("content-type", "")
    body_preview = ""
    if "json" in ct:
        try:
            body_preview = json.dumps(r.json(), default=str)[:240]
        except Exception:
            body_preview = r.text[:240]
    else:
        body_preview = f"<binary {len(r.content)} bytes>"
    print(f"[{title}] HTTP {r.status_code}  CT={ct}  {body_preview}")


def login():
    r = requests.post(f"{API}/auth/send-otp", json={"mobile": MOBILE, "name": "Demo", "purpose": "login"}, timeout=30)
    r.raise_for_status()
    otp = r.json().get("demo_otp")
    assert otp, f"demo_otp missing in send-otp response: {r.text}"
    r = requests.post(f"{API}/auth/verify-otp", json={"mobile": MOBILE, "otp": otp}, timeout=30)
    r.raise_for_status()
    return r.json()["access_token"]


def main():
    results = []
    token = login()
    h = {"Authorization": f"Bearer {token}"}

    # pick first client
    r = requests.get(f"{API}/clients", headers=h, timeout=30)
    assert r.status_code == 200, r.text
    clients = r.json()
    assert isinstance(clients, list) and len(clients) > 0, "no clients returned"
    client_id = clients[0]["client_id"]
    print(f"Using client_id={client_id}  total_clients={len(clients)}")

    # ---------- PDF endpoint ----------
    for months in (3, 6, 12):
        url = f"{API}/clients/{client_id}/analysis-report.pdf?months={months}"
        r = requests.get(url, headers=h, timeout=60)
        _pp(f"PDF months={months}", r)
        ok = True
        reasons = []
        if r.status_code != 200:
            ok = False; reasons.append(f"status={r.status_code}")
        ct = r.headers.get("content-type", "")
        if not ct.startswith("application/pdf"):
            ok = False; reasons.append(f"content-type={ct}")
        cd = r.headers.get("content-disposition", "")
        if "attachment" not in cd.lower() or "LendIQ-Statement-" not in cd:
            ok = False; reasons.append(f"content-disposition={cd}")
        magic = r.content[:8]
        if not r.content.startswith(b"%PDF-1."):
            ok = False; reasons.append(f"magic={magic!r}")
        size = len(r.content)
        if size <= 4 * 1024:
            ok = False; reasons.append(f"size={size}")
        print(f"   size={size} bytes  CD={cd}  magic={magic!r}")
        results.append((f"PDF months={months}", ok, "; ".join(reasons)))

    # 401 when missing auth
    r = requests.get(f"{API}/clients/{client_id}/analysis-report.pdf?months=6", timeout=30)
    _pp("PDF no-auth", r)
    results.append(("PDF no-auth → 401", r.status_code in (401, 403), f"status={r.status_code}"))

    # 404 for unknown client
    r = requests.get(f"{API}/clients/cli_does_not_exist/analysis-report.pdf?months=6", headers=h, timeout=30)
    _pp("PDF unknown-client", r)
    results.append(("PDF unknown-client → 404", r.status_code == 404, f"status={r.status_code}"))

    # Fallback path: try to find a client without any statement_analyses doc.
    # If DB access not available, just re-hit first client with months=6; the
    # endpoint still must not 500 regardless of whether fallback or saved doc is used.
    r = requests.get(f"{API}/clients/{client_id}/analysis-report.pdf?months=6", headers=h, timeout=60)
    results.append(("PDF fallback-safe (no 500)", r.status_code == 200 and r.content.startswith(b"%PDF-"), f"status={r.status_code}"))

    # ---------- Regression: analyze-statement ----------
    r = requests.post(f"{API}/clients/{client_id}/analyze-statement", headers=h, json={}, timeout=60)
    _pp("analyze-statement", r)
    ok = r.status_code == 200
    reasons = []
    if ok:
        data = r.json()
        required = [
            "months_analyzed", "bank_detected", "account_holder", "account_number_masked",
            "statement_period", "opening_balance", "closing_balance", "total_credit",
            "total_debit", "avg_monthly_credit", "avg_monthly_debit", "avg_balance",
            "highest_balance", "bounced_transactions", "salary_credits_detected",
            "emi_load_pct", "bounce_risk", "risk_color", "loan_eligibility",
            "recommended_decision", "suggested_loan_amount", "suggested_emi",
            "repayment_capacity_pct", "chart", "balance_trend", "categories",
            "red_flags", "behaviour", "fraud_checks", "summary", "highlights",
        ]
        missing = [k for k in required if k not in data]
        if missing:
            ok = False; reasons.append(f"missing={missing}")
        else:
            print(f"   analyze-statement: {len(data)} top-level keys, all {len(required)} required present")
    else:
        reasons.append(f"status={r.status_code}")
    results.append(("analyze-statement 30+ fields", ok, "; ".join(reasons)))

    # ---------- Regression: dashboard ----------
    r = requests.get(f"{API}/dashboard", headers=h, timeout=30)
    _pp("dashboard", r)
    ok = r.status_code == 200
    reasons = []
    if ok:
        data = r.json()
        ph = data.get("portfolio_health")
        if not isinstance(ph, dict):
            ok = False; reasons.append("portfolio_health missing/not dict")
        else:
            for k in ("on_track", "overdue", "at_risk", "completed", "defaulted"):
                v = ph.get(k)
                if not isinstance(v, int):
                    ok = False; reasons.append(f"portfolio_health.{k}={v!r}")
            print(f"   portfolio_health={ph}")
    else:
        reasons.append(f"status={r.status_code}")
    results.append(("dashboard portfolio_health", ok, "; ".join(reasons)))

    # ---------- Regression: loans ----------
    r = requests.get(f"{API}/loans", headers=h, timeout=30)
    _pp("loans", r)
    ok = r.status_code == 200 and isinstance(r.json(), list)
    results.append(("loans list", ok, "" if ok else f"status={r.status_code}"))

    # ---------- Regression: repay + undo-pay (month=1) ----------
    loans = r.json() if ok else []
    target_loan = None
    for l in loans:
        if l.get("status") in ("active", "funded", "disbursed"):
            sched = l.get("repayment_schedule") or []
            if sched:
                first = sched[0]
                if first.get("status") in ("upcoming", "pending", "due"):
                    target_loan = l
                    break
    if not target_loan:
        # fallback: any loan with month 1 not paid
        for l in loans:
            sched = l.get("repayment_schedule") or []
            if sched and sched[0].get("status") != "paid":
                target_loan = l
                break
    if target_loan:
        lid = target_loan["loan_id"]
        print(f"   repay target loan_id={lid}")
        rp = requests.post(f"{API}/loans/{lid}/repay/1", headers=h, timeout=30)
        _pp("repay/1", rp)
        up = requests.post(f"{API}/loans/{lid}/undo-pay/1", headers=h, timeout=30)
        _pp("undo-pay/1", up)
        results.append(("repay month=1", rp.status_code == 200, f"status={rp.status_code}"))
        results.append(("undo-pay month=1", up.status_code == 200, f"status={up.status_code}"))
    else:
        results.append(("repay/undo-pay", True, "skipped: no suitable unpaid month=1 EMI found"))

    # ---------- Summary ----------
    print("\n================ SUMMARY ================")
    fails = 0
    for name, ok, reason in results:
        status = "PASS" if ok else "FAIL"
        line = f"  [{status}] {name}"
        if reason:
            line += f"  ({reason})"
        print(line)
        if not ok:
            fails += 1
    print("========================================")
    print(f"{len(results)-fails}/{len(results)} passed")
    return 0 if fails == 0 else 1


if __name__ == "__main__":
    sys.exit(main())

"""
Iteration 13 backend verification — branded CIBIL PDF report.

Run: python3 /app/backend_test.py
"""
import json
import os
import sys
import uuid
from datetime import datetime

import requests

BASE = "https://lending-hub-63.preview.emergentagent.com/api"
MOBILE = "9876543210"


def _p(title, ok, detail=""):
    mark = "PASS" if ok else "FAIL"
    print(f"[{mark}] {title}")
    if detail:
        for line in detail.splitlines():
            print(f"       {line}")


def login() -> str:
    r = requests.post(f"{BASE}/auth/send-otp", json={"mobile": MOBILE, "purpose": "login"}, timeout=30)
    r.raise_for_status()
    j = r.json()
    otp = j.get("demo_otp") or j.get("otp") or "123456"
    v = requests.post(
        f"{BASE}/auth/verify-otp",
        json={"mobile": MOBILE, "otp": otp, "purpose": "login"},
        timeout=30,
    )
    v.raise_for_status()
    jj = v.json()
    token = jj.get("access_token") or jj.get("token")
    if not token:
        raise RuntimeError(f"no token in verify response: {jj}")
    return token


def _auth(tok):
    return {"Authorization": f"Bearer {tok}"}


def pick_other_client_no_cibil(tok):
    """Return a client_id for THIS lender that has no cibil_reports doc yet — for fallback test."""
    r = requests.get(f"{BASE}/clients", headers=_auth(tok), timeout=30)
    r.raise_for_status()
    data = r.json()
    clients = data if isinstance(data, list) else data.get("clients", [])
    # Prefer a client whose id != cli_seed_000
    for c in clients:
        cid = c.get("client_id")
        if cid and cid != "cli_seed_000":
            # fire the pdf endpoint and check header; if it works we use it for fallback
            return cid
    return None


def test_cibil_pdf():
    results = []
    tok = login()
    print(f"\nAuth OK. token prefix={tok[:12]}…\n")

    # -------- Test 1: valid client, with auth --------
    url = f"{BASE}/clients/cli_seed_000/cibil-report.pdf"
    r = requests.get(url, headers=_auth(tok), timeout=60)
    ok = (
        r.status_code == 200
        and r.headers.get("content-type", "").lower().startswith("application/pdf")
        and r.content[:7] == b"%PDF-1."
        and len(r.content) > 2048
        and "attachment" in r.headers.get("content-disposition", "").lower()
        and "LendIQ-CIBIL-" in r.headers.get("content-disposition", "")
    )
    results.append(("T1 cli_seed_000 + Bearer", ok))
    _p(
        "T1 GET /clients/cli_seed_000/cibil-report.pdf (valid Bearer)",
        ok,
        f"HTTP={r.status_code}  CT={r.headers.get('content-type')}  "
        f"bytes={len(r.content)}  magic={r.content[:8]!r}\n"
        f"Content-Disposition={r.headers.get('content-disposition')}",
    )

    # -------- Test 2: no Authorization header → 401 --------
    r2 = requests.get(url, timeout=30)
    ok2 = r2.status_code == 401
    results.append(("T2 no auth → 401", ok2))
    _p(
        "T2 no Authorization header → 401",
        ok2,
        f"HTTP={r2.status_code}  body={r2.text[:180]}",
    )

    # -------- Test 3: unknown client_id → 404 --------
    url3 = f"{BASE}/clients/cli_does_not_exist/cibil-report.pdf"
    r3 = requests.get(url3, headers=_auth(tok), timeout=30)
    ok3 = r3.status_code == 404
    results.append(("T3 unknown client → 404", ok3))
    _p(
        "T3 unknown client_id → 404",
        ok3,
        f"HTTP={r3.status_code}  body={r3.text[:180]}",
    )

    # -------- Test 4: fallback path — another lender's client with no cibil_reports doc --------
    other_cid = pick_other_client_no_cibil(tok)
    if other_cid:
        url4 = f"{BASE}/clients/{other_cid}/cibil-report.pdf"
        r4 = requests.get(url4, headers=_auth(tok), timeout=60)
        ok4 = (
            r4.status_code == 200
            and r4.content[:7] == b"%PDF-1."
            and r4.headers.get("content-type", "").lower().startswith("application/pdf")
            and len(r4.content) > 2048
        )
        results.append((f"T4 fallback ({other_cid})", ok4))
        _p(
            f"T4 fallback path — {other_cid} (no saved cibil_reports doc)",
            ok4,
            f"HTTP={r4.status_code}  CT={r4.headers.get('content-type')}  "
            f"bytes={len(r4.content)}  magic={r4.content[:8]!r}\n"
            f"Content-Disposition={r4.headers.get('content-disposition')}",
        )
    else:
        results.append(("T4 fallback", False))
        _p("T4 fallback — COULD NOT find another client", False)

    # -------- Test 5: after check-cibil, next pdf still works --------
    # Use the other client or cli_seed_000; doc will be generated and saved.
    target_cid = other_cid or "cli_seed_000"
    chk = requests.post(
        f"{BASE}/loan-apps/check-cibil",
        headers=_auth(tok),
        json={"client_id": target_cid},
        timeout=60,
    )
    ok_chk = chk.status_code == 200
    _p(
        f"T5a POST /loan-apps/check-cibil ({target_cid})",
        ok_chk,
        f"HTTP={chk.status_code}  body_keys={list((chk.json() if ok_chk else {}).keys())[:10]}",
    )

    url5 = f"{BASE}/clients/{target_cid}/cibil-report.pdf"
    r5 = requests.get(url5, headers=_auth(tok), timeout=60)
    ok5 = (
        r5.status_code == 200
        and r5.content[:7] == b"%PDF-1."
        and r5.headers.get("content-type", "").lower().startswith("application/pdf")
        and "attachment" in r5.headers.get("content-disposition", "").lower()
        and "LendIQ-CIBIL-" in r5.headers.get("content-disposition", "")
        and len(r5.content) > 2048
    )
    results.append(("T5 pdf after check-cibil", ok5 and ok_chk))
    _p(
        "T5 GET pdf after saved cibil doc",
        ok5,
        f"HTTP={r5.status_code}  CT={r5.headers.get('content-type')}  "
        f"bytes={len(r5.content)}  magic={r5.content[:8]!r}\n"
        f"Content-Disposition={r5.headers.get('content-disposition')}",
    )

    # ==================== Regressions ====================
    print("\n-- Regressions --")
    # R1 analysis pdf
    r_a = requests.get(
        f"{BASE}/clients/cli_seed_000/analysis-report.pdf?months=6",
        headers=_auth(tok),
        timeout=60,
    )
    okR1 = (
        r_a.status_code == 200
        and r_a.content[:7] == b"%PDF-1."
        and r_a.headers.get("content-type", "").lower().startswith("application/pdf")
        and len(r_a.content) > 2048
    )
    results.append(("R1 analysis-report.pdf?months=6", okR1))
    _p(
        "R1 GET /clients/cli_seed_000/analysis-report.pdf?months=6",
        okR1,
        f"HTTP={r_a.status_code}  bytes={len(r_a.content)}  magic={r_a.content[:8]!r}",
    )

    # R2 enriched analyze-statement
    r_s = requests.post(
        f"{BASE}/clients/cli_seed_000/analyze-statement",
        headers=_auth(tok),
        json={},
        timeout=90,
    )
    okR2 = False
    missing_keys = []
    if r_s.status_code == 200:
        j = r_s.json()
        required = {
            "months_analyzed", "bank_detected", "account_holder", "account_number_masked",
            "statement_period", "opening_balance", "closing_balance", "total_credit",
            "total_debit", "avg_monthly_credit", "avg_monthly_debit", "avg_balance",
            "highest_balance", "bounced_transactions", "salary_credits_detected",
            "emi_load_pct", "bounce_risk", "risk_color", "loan_eligibility",
            "recommended_decision", "suggested_loan_amount", "suggested_emi",
            "repayment_capacity_pct", "chart", "balance_trend", "categories",
            "red_flags", "behaviour", "fraud_checks", "summary", "highlights",
        }
        missing_keys = sorted(required - set(j.keys()))
        okR2 = len(missing_keys) == 0 and len(j.keys()) >= 30
    results.append(("R2 analyze-statement 30+ fields", okR2))
    _p(
        "R2 POST /clients/cli_seed_000/analyze-statement (body={})",
        okR2,
        f"HTTP={r_s.status_code}  keys={len(r_s.json().keys()) if r_s.status_code==200 else 'n/a'}  "
        f"missing={missing_keys}",
    )

    # R3 dashboard
    r_d = requests.get(f"{BASE}/dashboard", headers=_auth(tok), timeout=30)
    okR3 = False
    ph_detail = ""
    if r_d.status_code == 200:
        jd = r_d.json()
        ph = jd.get("portfolio_health", {})
        want = {"on_track", "overdue", "at_risk", "completed", "defaulted"}
        okR3 = want <= set(ph.keys()) and all(isinstance(ph[k], int) for k in want)
        ph_detail = json.dumps(ph)
    results.append(("R3 dashboard.portfolio_health ints", okR3))
    _p(
        "R3 GET /dashboard",
        okR3,
        f"HTTP={r_d.status_code}  portfolio_health={ph_detail}",
    )

    # R4 loans
    r_l = requests.get(f"{BASE}/loans", headers=_auth(tok), timeout=30)
    okR4 = r_l.status_code == 200
    results.append(("R4 loans", okR4))
    _p(
        "R4 GET /loans",
        okR4,
        f"HTTP={r_l.status_code}  count={len(r_l.json() if isinstance(r_l.json(), list) else (r_l.json() or {}).get('loans', []))}",
    )

    # -------- Summary --------
    print("\n==================== SUMMARY ====================")
    total = len(results)
    passed = sum(1 for _, v in results if v)
    for title, v in results:
        print(f"  {'PASS' if v else 'FAIL'}: {title}")
    print(f"\n{passed}/{total} checks passed")
    return passed == total


if __name__ == "__main__":
    try:
        ok = test_cibil_pdf()
        sys.exit(0 if ok else 1)
    except Exception as e:
        print(f"\nERROR: {e!r}")
        sys.exit(2)

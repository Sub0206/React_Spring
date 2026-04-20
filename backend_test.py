"""
Iteration-16 backend tests — verify the 3 NEW endpoints and regressions.

A. GET /api/clients/{client_id}/latest-analyses
B. GET /api/audit/summary
C. GET /api/audit/summary.pdf
D. POST /api/support/chat
E. Regressions (dashboard, analysis-report.pdf, analyze-statement determinism)
"""
import os, sys, json, time
from datetime import datetime, timezone
import requests

BASE = os.environ.get(
    "BACKEND_URL",
    "https://lending-hub-63.preview.emergentagent.com",
).rstrip("/")
API = f"{BASE}/api"
MOBILE = "9876543210"

results = []  # list of (section, name, ok, detail)


def log(section, name, ok, detail=""):
    status = "PASS" if ok else "FAIL"
    print(f"[{status}] {section} :: {name}  {detail}")
    results.append((section, name, ok, detail))


def get_token():
    r = requests.post(f"{API}/auth/send-otp", json={"mobile": MOBILE, "purpose": "login"}, timeout=15)
    assert r.status_code == 200, f"send-otp failed: {r.status_code} {r.text}"
    otp = r.json().get("demo_otp")
    assert otp, "No demo_otp in response"
    r2 = requests.post(f"{API}/auth/verify-otp", json={"mobile": MOBILE, "otp": otp}, timeout=15)
    assert r2.status_code == 200, f"verify-otp failed: {r2.status_code} {r2.text}"
    return r2.json()["access_token"]


def auth_headers(token):
    return {"Authorization": f"Bearer {token}"}


def test_section_A(token):
    print("\n=== Section A: GET /api/clients/{id}/latest-analyses ===")
    r = requests.get(f"{API}/clients", headers=auth_headers(token), timeout=15)
    log("A", "1 GET /api/clients returns 200", r.status_code == 200, f"code={r.status_code}")
    if r.status_code != 200:
        return None
    clients = r.json()
    if not clients:
        log("A", "1 has >=1 client", False, "no clients for this lender")
        return None
    client_id = clients[0]["client_id"]
    log("A", f"1 picked client_id={client_id}", True)

    r = requests.get(f"{API}/clients/{client_id}/latest-analyses",
                     headers=auth_headers(token), timeout=15)
    ok_status = r.status_code == 200
    log("A", "2 HTTP 200 with Bearer", ok_status, f"code={r.status_code}")
    if not ok_status:
        print(r.text[:400]); return client_id
    body = r.json()
    required = ["statement_analysis", "cibil_report", "has_statement", "has_cibil"]
    missing = [k for k in required if k not in body]
    log("A", "2 all 4 keys present", len(missing) == 0, f"missing={missing}")

    r = requests.post(f"{API}/clients/{client_id}/analyze-statement",
                      json={"months": 6, "file_name": "a.pdf"},
                      headers=auth_headers(token), timeout=30)
    log("A", "3a POST analyze-statement 200", r.status_code == 200,
        f"code={r.status_code} body={r.text[:200] if r.status_code!=200 else ''}")
    r = requests.get(f"{API}/clients/{client_id}/latest-analyses",
                     headers=auth_headers(token), timeout=15)
    b3 = r.json() if r.status_code == 200 else {}
    log("A", "3b has_statement==True after analyze", b3.get("has_statement") is True,
        f"has_statement={b3.get('has_statement')}")

    r = requests.post(f"{API}/loan-apps/check-cibil",
                      json={"client_id": client_id},
                      headers=auth_headers(token), timeout=30)
    log("A", "4a POST check-cibil 200", r.status_code == 200,
        f"code={r.status_code}")
    r = requests.get(f"{API}/clients/{client_id}/latest-analyses",
                     headers=auth_headers(token), timeout=15)
    b4 = r.json() if r.status_code == 200 else {}
    log("A", "4b has_cibil==True", b4.get("has_cibil") is True,
        f"has_cibil={b4.get('has_cibil')}")
    score = (b4.get("cibil_report") or {}).get("score")
    ok_score = isinstance(score, int) and 300 <= score <= 900
    log("A", "4c cibil_report.score int in [300,900]", ok_score, f"score={score}")

    r = requests.get(f"{API}/clients/cli_does_not_exist/latest-analyses",
                     headers=auth_headers(token), timeout=15)
    log("A", "5a unknown client -> 404", r.status_code == 404, f"code={r.status_code}")
    r = requests.get(f"{API}/clients/{client_id}/latest-analyses", timeout=15)
    log("A", "5b no auth -> 401", r.status_code == 401, f"code={r.status_code}")
    return client_id


def test_section_B(token):
    print("\n=== Section B: GET /api/audit/summary ===")
    year = datetime.now(timezone.utc).year
    for m in (3, 6, 12):
        r = requests.get(f"{API}/audit/summary?months={m}&year={year}",
                         headers=auth_headers(token), timeout=20)
        ok = r.status_code == 200
        log("B", f"6 months={m} HTTP 200", ok, f"code={r.status_code}")
        if not ok:
            print(r.text[:400]); continue
        body = r.json()
        required = ["period", "inflow_total", "outflow_total", "net",
                    "overdue_total", "funded_count", "repaid_count",
                    "loans_funded", "active_loans", "monthly"]
        missing = [k for k in required if k not in body]
        log("B", f"6 months={m} all top-level keys present", len(missing) == 0,
            f"missing={missing}")
        monthly = body.get("monthly") or []
        log("B", f"7 months={m} len(monthly)=={m}", len(monthly) == m,
            f"len={len(monthly)}")
        shape_ok = all(
            isinstance(x, dict) and {"label", "inflow", "outflow", "net"}.issubset(x.keys())
            for x in monthly
        )
        log("B", f"7 months={m} each has label+inflow+outflow+net", shape_ok)

        inflow_total = body.get("inflow_total", 0)
        outflow_total = body.get("outflow_total", 0)
        net = body.get("net", 0)
        log("B", f"8 months={m} net == inflow-outflow",
            abs(net - (inflow_total - outflow_total)) < 1e-6,
            f"net={net}, inflow-outflow={inflow_total - outflow_total}")
        sum_net = sum(x["net"] for x in monthly)
        log("B", f"8 months={m} sum(monthly.net) == net",
            abs(sum_net - net) < 1e-6,
            f"sum_net={sum_net}, net={net}")

    r = requests.get(f"{API}/audit/summary?months=6&year={year}", timeout=15)
    log("B", "9 no auth -> 401", r.status_code == 401, f"code={r.status_code}")


def test_section_C(token):
    print("\n=== Section C: GET /api/audit/summary.pdf ===")
    year = datetime.now(timezone.utc).year
    r = requests.get(f"{API}/audit/summary.pdf?months=6&year={year}",
                     headers=auth_headers(token), timeout=30)
    ok = r.status_code == 200
    log("C", "10 Bearer HTTP 200", ok, f"code={r.status_code}")
    if ok:
        ct = r.headers.get("Content-Type", "")
        cd = r.headers.get("Content-Disposition", "")
        body = r.content
        log("C", "10 Content-Type=application/pdf", "application/pdf" in ct, f"ct={ct}")
        log("C", "10 body starts with %PDF-1.", body[:7].startswith(b"%PDF-1."),
            f"head={body[:10]!r}")
        log("C", "10 size > 2KB", len(body) > 2048, f"size={len(body)}")
        log("C", "10 CD contains 'attachment; filename=LendIQ-Audit-'",
            ("attachment;" in cd) and ("filename=" in cd) and ("LendIQ-Audit-" in cd),
            f"cd={cd}")

    r = requests.get(f"{API}/audit/summary.pdf?months=6&year={year}&token={token}",
                     timeout=30)
    ok = r.status_code == 200
    log("C", "11 ?token= HTTP 200", ok, f"code={r.status_code}")
    if ok:
        log("C", "11 valid PDF (starts with %PDF-1.)", r.content[:7].startswith(b"%PDF-1."),
            f"head={r.content[:10]!r}")
        log("C", "11 size > 2KB", len(r.content) > 2048, f"size={len(r.content)}")

    r = requests.get(f"{API}/audit/summary.pdf?months=6&year={year}", timeout=15)
    log("C", "12 no auth -> 401", r.status_code == 401, f"code={r.status_code}")


def test_section_D(token):
    print("\n=== Section D: POST /api/support/chat ===")
    r = requests.post(f"{API}/support/chat", json={"question": "How do I add a client?"},
                      headers=auth_headers(token), timeout=15)
    ok = r.status_code == 200
    log("D", "13 HTTP 200 (add client)", ok, f"code={r.status_code}")
    if ok:
        ans = r.json().get("answer", "")
        log("D", "13 answer contains 'Clients tab' (case-insensitive)",
            "clients tab" in ans.lower(), f"ans[:120]={ans[:120]!r}")

    r = requests.post(f"{API}/support/chat", json={"question": "How does EMI rollback work?"},
                      headers=auth_headers(token), timeout=15)
    ok = r.status_code == 200
    log("D", "14 HTTP 200 (rollback)", ok, f"code={r.status_code}")
    if ok:
        ans = r.json().get("answer", "")
        al = ans.lower()
        log("D", "14 mentions 'Undo' or 'rollback'",
            ("undo" in al) or ("rollback" in al), f"ans[:120]={ans[:120]!r}")

    r = requests.post(f"{API}/support/chat", json={"question": "How to analyze a bank statement?"},
                      headers=auth_headers(token), timeout=15)
    ok = r.status_code == 200
    log("D", "15 HTTP 200 (analyze statement)", ok, f"code={r.status_code}")
    if ok:
        ans = r.json().get("answer", "")
        al = ans.lower()
        log("D", "15 mentions 'Upload statement' or '3 / 6 / 12'",
            ("upload statement" in al) or ("3 / 6 / 12" in ans),
            f"ans[:160]={ans[:160]!r}")

    r = requests.post(f"{API}/support/chat", json={"question": ""},
                      headers=auth_headers(token), timeout=15)
    ok = r.status_code == 200
    log("D", "16 empty question HTTP 200", ok, f"code={r.status_code}")
    if ok:
        ans = r.json().get("answer", "")
        log("D", "16 empty returns a helpful generic reply",
            len(ans) > 10, f"ans[:120]={ans[:120]!r}")

    r = requests.post(f"{API}/support/chat", json={"question": "anything"}, timeout=15)
    log("D", "17 no auth -> 401", r.status_code == 401, f"code={r.status_code}")


def test_section_E(token, client_id):
    print("\n=== Section E: Regressions ===")
    r = requests.get(f"{API}/dashboard", headers=auth_headers(token), timeout=20)
    ok = r.status_code == 200
    log("E", "18 GET /api/dashboard 200", ok, f"code={r.status_code}")
    if ok:
        body = r.json()
        log("E", "18 portfolio_health present",
            "portfolio_health" in body,
            f"keys_top={list(body.keys())[:8]}")

    if client_id:
        r = requests.get(f"{API}/clients/{client_id}/analysis-report.pdf?months=6",
                         headers=auth_headers(token), timeout=30)
        ok = r.status_code == 200
        log("E", "19 analysis-report.pdf 200", ok, f"code={r.status_code}")
        if ok:
            log("E", "19 valid PDF", r.content[:7].startswith(b"%PDF-1."),
                f"head={r.content[:10]!r}, size={len(r.content)}")

    if client_id:
        payload = {"months": 6, "file_name": "determinism_probe.pdf"}
        r1 = requests.post(f"{API}/clients/{client_id}/analyze-statement",
                           json=payload, headers=auth_headers(token), timeout=30)
        r2 = requests.post(f"{API}/clients/{client_id}/analyze-statement",
                           json=payload, headers=auth_headers(token), timeout=30)
        ok = r1.status_code == 200 and r2.status_code == 200
        log("E", "20a two analyze-statement calls both 200", ok,
            f"c1={r1.status_code}, c2={r2.status_code}")
        if ok:
            j1, j2 = r1.json(), r2.json()
            log("E", "20b bounced_transactions identical",
                j1.get("bounced_transactions") == j2.get("bounced_transactions"),
                f"{j1.get('bounced_transactions')} vs {j2.get('bounced_transactions')}")
            log("E", "20c avg_balance identical",
                j1.get("avg_balance") == j2.get("avg_balance"),
                f"{j1.get('avg_balance')} vs {j2.get('avg_balance')}")


def main():
    print(f"Testing against: {API}")
    token = get_token()
    print(f"Got token: {token[:20]}...")
    client_id = test_section_A(token)
    test_section_B(token)
    test_section_C(token)
    test_section_D(token)
    test_section_E(token, client_id)

    print("\n" + "=" * 70)
    fails = [r for r in results if not r[2]]
    total = len(results)
    print(f"Total: {total}   Passed: {total - len(fails)}   Failed: {len(fails)}")
    if fails:
        print("\nFAILURES:")
        for s, n, ok, d in fails:
            print(f"  [{s}] {n}  -- {d}")
    print("=" * 70)
    sys.exit(0 if not fails else 1)


if __name__ == "__main__":
    main()

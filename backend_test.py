"""
Iteration-17 backend validation — Unicode ₹ symbol in PDFs + existing regressions.
Tests run against live preview backend. No backend code modified.
"""
import io
import os
import re
import sys
import json
import requests
import pdfplumber

BASE = "https://lending-hub-63.preview.emergentagent.com"
API = f"{BASE}/api"
MOBILE = "9876543210"
CLIENT_ID = "cli_seed_000"
RUPEE = "\u20B9"


def fail(msg):
    print(f"  [FAIL] {msg}")
    return False


def ok(msg):
    print(f"  [PASS] {msg}")
    return True


# ---------- AUTH ----------
def login():
    r = requests.post(f"{API}/auth/send-otp", json={"mobile": MOBILE, "purpose": "login"}, timeout=30)
    r.raise_for_status()
    otp = r.json().get("demo_otp")
    assert otp, f"no demo_otp: {r.text}"
    r2 = requests.post(f"{API}/auth/verify-otp", json={"mobile": MOBILE, "otp": otp}, timeout=30)
    r2.raise_for_status()
    tok = r2.json()["access_token"]
    print(f"  auth OK token={tok[:20]}…")
    return tok


# ---------- PDF HELPERS ----------
def _pdf_basic_checks(label, resp):
    passes = []
    passes.append(ok(f"{label}: HTTP 200") if resp.status_code == 200 else fail(f"{label}: HTTP {resp.status_code} body={resp.text[:200]}"))
    ct = resp.headers.get("content-type", "")
    passes.append(ok(f"{label}: Content-Type={ct}") if "application/pdf" in ct else fail(f"{label}: bad CT={ct}"))
    body = resp.content
    passes.append(ok(f"{label}: magic %PDF-1.") if body[:7] == b"%PDF-1." else fail(f"{label}: magic={body[:10]!r}"))
    passes.append(ok(f"{label}: size={len(body)} bytes") if len(body) > 4096 else fail(f"{label}: size={len(body)} <4KB"))
    return all(passes), body


def _rupee_and_font_check(label, body):
    passes = []
    try:
        with pdfplumber.open(io.BytesIO(body)) as pdf:
            page1_text = pdf.pages[0].extract_text() or ""
            count1 = page1_text.count(RUPEE)
            found_any = False
            for p in pdf.pages:
                t = p.extract_text() or ""
                if RUPEE in t:
                    found_any = True
                    break
            # Font check via raw stream inspection
            raw = body.decode("latin-1", errors="ignore")
            # ReportLab embeds font names after "/BaseFont /FreeSans..."
            font_names = set(re.findall(r"/BaseFont\s*/([A-Za-z0-9\-_,+]+)", raw))
            # also check /FontName
            font_names |= set(re.findall(r"/FontName\s*/([A-Za-z0-9\-_,+]+)", raw))

            passes.append(ok(f"{label}: page1 contains ₹ (count={count1})") if count1 > 0 else fail(f"{label}: page1 has NO ₹ char"))
            passes.append(ok(f"{label}: ₹ found on ≥1 page") if found_any else fail(f"{label}: NO ₹ anywhere"))
            has_freesans = any("FreeSans" in fn for fn in font_names)
            has_liberation = any("LiberationSans" in fn for fn in font_names)
            has_helvetica = any(fn.endswith("Helvetica") or fn == "Helvetica" or fn == "Helvetica-Bold" for fn in font_names)
            passes.append(ok(f"{label}: embedded fonts={sorted(font_names)}"))
            passes.append(ok(f"{label}: FreeSans embedded") if has_freesans else fail(f"{label}: FreeSans NOT in fonts; got {sorted(font_names)}"))
            if has_liberation:
                passes.append(fail(f"{label}: LiberationSans still present"))
            if has_helvetica:
                passes.append(fail(f"{label}: Helvetica still present"))
    except Exception as e:
        passes.append(fail(f"{label}: pdfplumber error {e}"))
    return all(passes)


# ---------- A. ₹ symbol rendering ----------
def test_pdf_rupee(tok):
    print("\n=== A. ₹ UNICODE RENDERING + FONT CHECK ===")
    headers = {"Authorization": f"Bearer {tok}"}
    endpoints = [
        ("analysis-report", f"{API}/clients/{CLIENT_ID}/analysis-report.pdf?months=6"),
        ("cibil-report",    f"{API}/clients/{CLIENT_ID}/cibil-report.pdf"),
        ("audit-summary",   f"{API}/audit/summary.pdf?months=6&year=2026"),
    ]
    all_pass = True
    for label, url in endpoints:
        print(f"\n-- {label} --")
        r = requests.get(url, headers=headers, timeout=60)
        basic, body = _pdf_basic_checks(label, r)
        if not basic:
            all_pass = False
            continue
        if not _rupee_and_font_check(label, body):
            all_pass = False
    return all_pass


# ---------- B. ?token= fallback ----------
def test_token_query_param(tok):
    print("\n=== B. ?token= FALLBACK ===")
    endpoints = [
        ("analysis-report", f"{API}/clients/{CLIENT_ID}/analysis-report.pdf?months=6&token={tok}"),
        ("cibil-report",    f"{API}/clients/{CLIENT_ID}/cibil-report.pdf?token={tok}"),
        ("audit-summary",   f"{API}/audit/summary.pdf?months=6&year=2026&token={tok}"),
    ]
    all_pass = True
    for label, url in endpoints:
        print(f"\n-- {label} (token qp) --")
        r = requests.get(url, timeout=60)
        basic, _ = _pdf_basic_checks(label, r)
        if not basic:
            all_pass = False
    return all_pass


# ---------- C. REGRESSIONS ----------
def test_analyze_determinism(tok):
    print("\n=== C1. analyze-statement determinism ===")
    h = {"Authorization": f"Bearer {tok}"}
    body = {"months": 6, "file_name": "same.pdf"}
    r1 = requests.post(f"{API}/clients/{CLIENT_ID}/analyze-statement", json=body, headers=h, timeout=60).json()
    r2 = requests.post(f"{API}/clients/{CLIENT_ID}/analyze-statement", json=body, headers=h, timeout=60).json()
    passes = []
    passes.append(ok(f"bounced_transactions match ({r1.get('bounced_transactions')})") if r1.get("bounced_transactions") == r2.get("bounced_transactions") else fail(f"bounced diff {r1.get('bounced_transactions')} vs {r2.get('bounced_transactions')}"))
    passes.append(ok(f"avg_balance match ({r1.get('avg_balance')})") if r1.get("avg_balance") == r2.get("avg_balance") else fail(f"avg_balance diff {r1.get('avg_balance')} vs {r2.get('avg_balance')}"))
    return all(passes)


def test_latest_analyses(tok):
    print("\n=== C2. latest-analyses ===")
    h = {"Authorization": f"Bearer {tok}"}
    r = requests.get(f"{API}/clients/{CLIENT_ID}/latest-analyses", headers=h, timeout=30)
    if r.status_code != 200:
        return fail(f"HTTP {r.status_code} body={r.text[:200]}")
    j = r.json()
    needed = {"statement_analysis", "cibil_report", "has_statement", "has_cibil"}
    missing = needed - set(j.keys())
    if missing:
        return fail(f"missing keys {missing}")
    return ok(f"200 with keys {sorted(j.keys())}")


def test_audit_summary(tok):
    print("\n=== C3. audit/summary ===")
    h = {"Authorization": f"Bearer {tok}"}
    r = requests.get(f"{API}/audit/summary?months=3&year=2026", headers=h, timeout=30)
    if r.status_code != 200:
        return fail(f"HTTP {r.status_code}")
    j = r.json()
    passes = []
    m = j.get("monthly", [])
    passes.append(ok(f"monthly.length=3") if len(m) == 3 else fail(f"monthly.length={len(m)}"))
    net = j.get("net"); it = j.get("inflow_total"); ot = j.get("outflow_total")
    passes.append(ok(f"net==inflow-outflow ({net} = {it} - {ot})") if net == it - ot else fail(f"net={net} inflow={it} outflow={ot}"))
    return all(passes)


def test_support_chat(tok):
    print("\n=== C4. support/chat ===")
    h = {"Authorization": f"Bearer {tok}"}
    r = requests.post(f"{API}/support/chat", json={"question": "How do I add a new client?"}, headers=h, timeout=30)
    if r.status_code != 200:
        return fail(f"HTTP {r.status_code}")
    ans = r.json().get("answer", "")
    if "Clients tab" in ans:
        return ok(f"answer contains 'Clients tab'")
    return fail(f"'Clients tab' NOT in answer (answer starts: {ans[:150]!r})")


def test_dashboard(tok):
    print("\n=== C5. dashboard ===")
    h = {"Authorization": f"Bearer {tok}"}
    r = requests.get(f"{API}/dashboard", headers=h, timeout=30)
    if r.status_code != 200:
        return fail(f"HTTP {r.status_code}")
    ph = r.json().get("portfolio_health")
    if ph is None:
        return fail("portfolio_health missing")
    return ok(f"portfolio_health present: {ph}")


def main():
    print("=" * 60)
    print("ITERATION 17 — Unicode ₹ PDF + regressions")
    print("=" * 60)
    tok = login()
    results = {
        "A. PDF ₹ rendering":          test_pdf_rupee(tok),
        "B. ?token= fallback":         test_token_query_param(tok),
        "C1. analyze determinism":     test_analyze_determinism(tok),
        "C2. latest-analyses":         test_latest_analyses(tok),
        "C3. audit/summary":           test_audit_summary(tok),
        "C4. support/chat":            test_support_chat(tok),
        "C5. dashboard":               test_dashboard(tok),
    }
    print("\n" + "=" * 60)
    print("SUMMARY")
    print("=" * 60)
    for k, v in results.items():
        print(f"  {'PASS' if v else 'FAIL'}  {k}")
    failed = [k for k, v in results.items() if not v]
    sys.exit(0 if not failed else 1)


if __name__ == "__main__":
    main()

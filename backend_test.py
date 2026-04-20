"""Iteration-14 backend regression tests.

Scope (per review request):
  A. Determinism + month-slice consistency for POST /api/clients/{id}/analyze-statement
  B. Transparent risk engine (risk_reasons, parse_confidence, etc.)
  C. Bounce-keyword detection on real PDF bytes
  D. Branded PDF endpoints (analysis-report.pdf, cibil-report.pdf) with ?token= fallback
  E. Regressions (/dashboard portfolio_health ints, /loans)

Run against the live preview backend. Does NOT modify any backend code.
"""
from __future__ import annotations

import base64
import io
import json
import os
import random
import sys
import textwrap
from typing import Any, Dict, List, Optional, Tuple

import requests

BASE = "https://lending-hub-63.preview.emergentagent.com/api"
MOBILE = "9876543210"


# ---------- helpers ----------
def hdr(tok: Optional[str] = None) -> Dict[str, str]:
    return {"Authorization": f"Bearer {tok}"} if tok else {}


def _die(msg: str) -> None:
    print(f"\nFATAL: {msg}")
    sys.exit(1)


def login() -> str:
    r = requests.post(f"{BASE}/auth/send-otp", json={"mobile": MOBILE, "purpose": "login"}, timeout=30)
    if r.status_code != 200:
        _die(f"send-otp failed: {r.status_code} {r.text}")
    otp = r.json().get("demo_otp")
    if not otp:
        _die(f"no demo_otp in response: {r.json()}")
    r2 = requests.post(f"{BASE}/auth/verify-otp", json={"mobile": MOBILE, "otp": otp}, timeout=30)
    if r2.status_code != 200:
        _die(f"verify-otp failed: {r2.status_code} {r2.text}")
    return r2.json()["access_token"]


# ---------- running ----------
FAIL: List[str] = []
PASS: List[str] = []


def check(cond: bool, label: str, detail: str = "") -> bool:
    if cond:
        PASS.append(label)
        print(f"  [PASS] {label}")
    else:
        FAIL.append(f"{label} — {detail}")
        print(f"  [FAIL] {label} — {detail}")
    return cond


def section(name: str) -> None:
    print(f"\n=== {name} ===")


# ---------- A. Determinism + month-slice ----------
def analyze(tok: str, cid: str, months: int, file_name: str = "foo.pdf", file_b64: Optional[str] = None) -> Dict[str, Any]:
    body: Dict[str, Any] = {"months": months, "file_name": file_name}
    if file_b64 is not None:
        body["file_base64"] = file_b64
    r = requests.post(f"{BASE}/clients/{cid}/analyze-statement", headers=hdr(tok), json=body, timeout=90)
    if r.status_code != 200:
        return {"__error__": True, "status": r.status_code, "text": r.text[:300]}
    return r.json()


def test_section_A(tok: str) -> None:
    section("A. DETERMINISM + MONTH-SLICE CONSISTENCY")
    cid = "cli_seed_000"
    fn = "foo.pdf"

    # A1 — determinism
    a = analyze(tok, cid, 3, fn)
    b = analyze(tok, cid, 3, fn)
    if a.get("__error__") or b.get("__error__"):
        check(False, "A1 determinism (months=3 twice)", f"a={a} b={b}")
    else:
        keys = ["bounced_transactions", "avg_balance", "total_credit", "total_debit",
                "avg_monthly_credit", "bounce_risk", "parse_source"]
        diffs = [k for k in keys if a.get(k) != b.get(k)]
        check(
            not diffs,
            "A1 determinism: same (client, file_name, months) → identical key values",
            f"diffs={diffs} a={ {k:a.get(k) for k in keys} } b={ {k:b.get(k) for k in keys} }",
        )

    # A2 — month-slice consistency
    a6 = analyze(tok, cid, 6, fn)
    a12 = analyze(tok, cid, 12, fn)
    if any(x.get("__error__") for x in (a, a6, a12)):
        check(False, "A2 slice: 3 vs 6 vs 12", "one of the calls errored")
    else:
        chart3 = a["chart"]
        chart6 = a6["chart"]
        chart12 = a12["chart"]

        def subset_last(big: List[dict], small: List[dict]) -> Tuple[bool, str]:
            if len(small) > len(big):
                return False, f"small({len(small)})>big({len(big)})"
            tail = big[-len(small):]
            for i, (b_, s_) in enumerate(zip(tail, small)):
                for k in ("label", "credit", "debit", "bounces"):
                    if b_.get(k) != s_.get(k):
                        return False, f"idx {i} key {k}: big={b_.get(k)} small={s_.get(k)}"
            return True, "ok"

        ok36, why36 = subset_last(chart6, chart3)
        ok612, why612 = subset_last(chart12, chart6)
        check(len(chart3) == 3 and len(chart6) == 6 and len(chart12) == 12,
              "A2 chart lengths match months", f"{len(chart3)}/{len(chart6)}/{len(chart12)}")
        check(ok36, "A2 chart(3) == last 3 of chart(6)", why36)
        check(ok612, "A2 chart(6) == last 6 of chart(12)", why612)

        # A3 — bounces monotonic + equals sum(chart[i].bounces)
        bb3 = a["bounced_transactions"]
        bb6 = a6["bounced_transactions"]
        bb12 = a12["bounced_transactions"]
        sum3 = sum(c["bounces"] for c in chart3)
        sum6 = sum(c["bounces"] for c in chart6)
        sum12 = sum(c["bounces"] for c in chart12)
        check(bb12 >= bb6 >= bb3,
              "A3 bounces monotonic across windows (12>=6>=3)",
              f"{bb3}/{bb6}/{bb12}")
        check(bb3 == sum3 and bb6 == sum6 and bb12 == sum12,
              "A3 bounced_transactions == sum(chart[i].bounces)",
              f"top={bb3}/{bb6}/{bb12} sum={sum3}/{sum6}/{sum12}")

    # A4 — different file_name → different universe
    alpha = analyze(tok, cid, 6, "alpha.pdf")
    beta = analyze(tok, cid, 6, "beta.pdf")
    if alpha.get("__error__") or beta.get("__error__"):
        check(False, "A4 different file_name → different universe", "error")
    else:
        check(
            alpha["avg_balance"] != beta["avg_balance"],
            "A4 alpha.pdf vs beta.pdf → different avg_balance",
            f"alpha={alpha['avg_balance']} beta={beta['avg_balance']}",
        )


# ---------- B. Risk engine ----------
REQUIRED_TOPLEVEL = [
    "risk_reasons", "parse_confidence", "parse_source", "rows_extracted",
    "bounce_matches_found", "months_covered_in_file", "manual_review_recommended",
]


def test_section_B(tok: str) -> None:
    section("B. TRANSPARENT RISK ENGINE")
    cid = "cli_seed_000"
    res = analyze(tok, cid, 6, "foo.pdf")
    if res.get("__error__"):
        check(False, "B5 schema fields present", f"{res}")
        return
    missing = [k for k in REQUIRED_TOPLEVEL if k not in res]
    check(not missing, "B5 all transparency fields present", f"missing={missing}")

    # Field types / enums
    rr = res.get("risk_reasons")
    check(isinstance(rr, list) and all(isinstance(x, dict) and "severity" in x and "label" in x for x in rr),
          "B5 risk_reasons is list of {severity,label}", f"sample={rr[:2] if rr else rr}")
    check(res.get("parse_confidence") in ("high", "medium", "low"),
          "B5 parse_confidence ∈ {high,medium,low}", f"val={res.get('parse_confidence')}")
    check(res.get("parse_source") in ("parsed", "mock"),
          "B5 parse_source ∈ {parsed,mock}", f"val={res.get('parse_source')}")
    check(isinstance(res.get("rows_extracted"), int),
          "B5 rows_extracted int", f"type={type(res.get('rows_extracted'))}")
    check(isinstance(res.get("bounce_matches_found"), int),
          "B5 bounce_matches_found int", f"val={res.get('bounce_matches_found')}")
    check(isinstance(res.get("months_covered_in_file"), int),
          "B5 months_covered_in_file int", f"val={res.get('months_covered_in_file')}")
    check(isinstance(res.get("manual_review_recommended"), bool),
          "B5 manual_review_recommended bool", f"val={res.get('manual_review_recommended')}")

    # B6 — rule consistency on 3+ clients, different file_names
    probes = []
    # Fetch lender client list to grab real client ids
    cl = requests.get(f"{BASE}/clients", headers=hdr(tok), timeout=30)
    clients = cl.json() if cl.status_code == 200 else []
    pool = [c["client_id"] for c in clients if c.get("client_id")][:20] or ["cli_seed_000", "cli_seed_001"]

    rng = random.Random(42)
    # Use a few file_names to vary seeds until we hit the conditions
    file_names = [f"probe_{i}.pdf" for i in range(30)]
    low_cases = 0
    high_cases = 0
    print("  …scanning for low & high risk cases across probes")
    for cc in rng.sample(pool, min(len(pool), 8)):
        for fn in file_names:
            res_ = analyze(tok, cc, 6, fn)
            if res_.get("__error__"):
                continue
            bounces = res_.get("bounced_transactions", 0)
            emi = res_.get("emi_load_pct", 100)
            br = res_.get("bounce_risk")
            rr = res_.get("risk_reasons", [])
            n_med = sum(1 for r in rr if r.get("severity") == "medium")
            # low rule
            if bounces == 0 and emi < 30:
                ok_low = (br == "low")
                probes.append(("low", cc, fn, bounces, emi, br, ok_low))
                low_cases += 1
            # high rule
            if bounces >= 3 or n_med >= 3:
                ok_hi = (br == "high")
                probes.append(("high", cc, fn, bounces, emi, br, ok_hi, n_med))
                high_cases += 1
            if low_cases >= 3 and high_cases >= 3:
                break
        if low_cases >= 3 and high_cases >= 3:
            break

    low_ok = [p for p in probes if p[0] == "low" and p[6]]
    high_ok = [p for p in probes if p[0] == "high" and p[6]]
    low_bad = [p for p in probes if p[0] == "low" and not p[6]]
    high_bad = [p for p in probes if p[0] == "high" and not p[6]]

    check(len(low_ok) >= 1 and not low_bad,
          "B6 (bounces==0 AND emi<30) → bounce_risk='low' on random clients",
          f"low_ok={len(low_ok)} low_bad={len(low_bad)} sample_bad={low_bad[:2]} sample_ok={low_ok[:1]}")
    check(len(high_ok) >= 1 and not high_bad,
          "B6 (bounces>=3 OR multi-medium) → bounce_risk='high'",
          f"high_ok={len(high_ok)} high_bad={len(high_bad)} sample_bad={high_bad[:2]} sample_ok={high_ok[:1]}")


# ---------- C. Bounce-keyword PDF ----------
def _build_bounce_pdf() -> bytes:
    from reportlab.pdfgen import canvas
    from reportlab.lib.pagesizes import A4
    buf = io.BytesIO()
    c = canvas.Canvas(buf, pagesize=A4)
    y = 800
    lines = [
        "HDFC Bank — Account Statement",
        "Account No: XXXXXXXX1234    Period: 01-Apr-2025 to 30-Apr-2025",
        "",
        "Date        Narration                                             Amount",
        "01-04-2025  SALARY CREDIT ACME INC                              Rs. 1,20,000.00",
        "02-04-2025  UPI/REFERENCE/GROCERY                                Rs. 2,450.00",
        "05-04-2025  CHQ RETN INSUFFICIENT FUNDS                          Rs. 12,500.00",
        "05-04-2025  RTN CHG CHEQUE BOUNCED                               Rs. 550.00",
        "10-04-2025  ECS RETURN INSUFFICIENT FUNDS                        Rs. 8,750.00",
        "15-04-2025  RENT PAYMENT                                         Rs. 22,000.00",
        "20-04-2025  UPI/GPAY                                             Rs. 600.00",
    ]
    for line in lines:
        c.drawString(40, y, line)
        y -= 18
    c.showPage()
    c.save()
    return buf.getvalue()


def test_section_C(tok: str) -> None:
    section("C. BOUNCE-KEYWORD DETECTION (REAL PDF)")
    cid = "cli_seed_000"

    # C7 — parsed path
    pdf_bytes = _build_bounce_pdf()
    b64 = base64.b64encode(pdf_bytes).decode()
    res = analyze(tok, cid, 6, "parsed_real.pdf", file_b64=b64)
    if res.get("__error__"):
        check(False, "C7 parsed real PDF", f"{res}")
    else:
        print(f"    parse_source={res.get('parse_source')} bounce_matches_found={res.get('bounce_matches_found')} rows={res.get('rows_extracted')} bounced_transactions={res.get('bounced_transactions')}")
        check(res.get("parse_source") == "parsed",
              "C7 parse_source == 'parsed'",
              f"got={res.get('parse_source')}")
        check(res.get("bounce_matches_found", 0) >= 1,
              "C7 bounce_matches_found >= 1",
              f"got={res.get('bounce_matches_found')}")
        check(res.get("bounced_transactions") == res.get("bounce_matches_found"),
              "C7 bounced_transactions == bounce_matches_found (override)",
              f"bt={res.get('bounced_transactions')} bm={res.get('bounce_matches_found')}")

    # C8 — invalid base64 falls back to mock
    res2 = analyze(tok, cid, 6, "broken.pdf", file_b64="not-a-real-base64$$$###")
    if res2.get("__error__"):
        check(False, "C8 invalid base64 falls back gracefully (200)", f"{res2}")
    else:
        check(res2.get("parse_source") == "mock",
              "C8 invalid base64 → parse_source='mock'",
              f"got={res2.get('parse_source')}")


# ---------- D. PDF endpoints ----------
def test_section_D(tok: str) -> None:
    section("D. PDF ENDPOINTS")
    cid = "cli_seed_000"

    # D9 — analysis-report.pdf?months=6 with Bearer
    r = requests.get(f"{BASE}/clients/{cid}/analysis-report.pdf?months=6", headers=hdr(tok), timeout=60)
    ct = r.headers.get("content-type", "")
    cd = r.headers.get("content-disposition", "")
    magic = r.content[:7] if r.status_code == 200 else b""
    print(f"    D9 status={r.status_code} size={len(r.content)} ct={ct} magic={magic!r} cd={cd!r}")
    check(r.status_code == 200, "D9 analysis-report.pdf (Bearer) → 200", f"{r.status_code} {r.text[:120]}")
    check("application/pdf" in ct, "D9 Content-Type = application/pdf", f"got={ct}")
    check(r.content.startswith(b"%PDF-1."), "D9 body starts with %PDF-1.", f"magic={magic!r}")
    check(len(r.content) > 4096, "D9 size > 4KB", f"size={len(r.content)}")
    check("attachment; filename=LendIQ-Statement-" in cd or "attachment; filename=\"LendIQ-Statement-" in cd,
          "D9 Content-Disposition contains 'attachment; filename=LendIQ-Statement-'",
          f"got={cd!r}")

    # D10 — analysis-report.pdf with ?token=<jwt>, no Authorization
    r2 = requests.get(f"{BASE}/clients/{cid}/analysis-report.pdf?months=6&token={tok}", timeout=60)
    print(f"    D10 status={r2.status_code} size={len(r2.content)} magic={r2.content[:7]!r}")
    check(r2.status_code == 200, "D10 analysis-report.pdf (?token=) → 200", f"{r2.status_code}")
    check(r2.content.startswith(b"%PDF-1."), "D10 valid PDF magic", f"{r2.content[:7]!r}")
    check(len(r2.content) > 4096, "D10 size > 4KB", f"size={len(r2.content)}")

    # D11 — cibil-report.pdf?token= no Authorization
    r3 = requests.get(f"{BASE}/clients/{cid}/cibil-report.pdf?token={tok}", timeout=60)
    cd3 = r3.headers.get("content-disposition", "")
    print(f"    D11 status={r3.status_code} size={len(r3.content)} magic={r3.content[:7]!r} cd={cd3!r}")
    check(r3.status_code == 200, "D11 cibil-report.pdf (?token=) → 200", f"{r3.status_code}")
    check(r3.content.startswith(b"%PDF-1."), "D11 valid PDF magic", f"{r3.content[:7]!r}")
    check(len(r3.content) > 2048, "D11 size > 2KB", f"size={len(r3.content)}")
    check("LendIQ-CIBIL-" in cd3, "D11 disposition contains LendIQ-CIBIL-", f"cd={cd3!r}")

    # D12 — No auth → 401
    r4 = requests.get(f"{BASE}/clients/{cid}/analysis-report.pdf?months=6", timeout=30)
    r5 = requests.get(f"{BASE}/clients/{cid}/cibil-report.pdf", timeout=30)
    check(r4.status_code == 401, "D12a analysis-report.pdf no auth → 401", f"{r4.status_code} {r4.text[:100]}")
    check(r5.status_code == 401, "D12b cibil-report.pdf no auth → 401", f"{r5.status_code} {r5.text[:100]}")

    # Unknown client → 404
    r6 = requests.get(f"{BASE}/clients/cli_does_not_exist/analysis-report.pdf?months=6", headers=hdr(tok), timeout=30)
    r7 = requests.get(f"{BASE}/clients/cli_does_not_exist/cibil-report.pdf", headers=hdr(tok), timeout=30)
    check(r6.status_code == 404, "D12c analysis-report.pdf unknown client → 404", f"{r6.status_code}")
    check(r7.status_code == 404, "D12d cibil-report.pdf unknown client → 404", f"{r7.status_code}")


# ---------- E. Regressions ----------
def test_section_E(tok: str) -> None:
    section("E. REGRESSIONS")
    r = requests.get(f"{BASE}/dashboard", headers=hdr(tok), timeout=30)
    check(r.status_code == 200, "E13 /api/dashboard → 200", f"{r.status_code}")
    if r.status_code == 200:
        ph = r.json().get("portfolio_health", {})
        print(f"    portfolio_health={ph}")
        ints = isinstance(ph, dict) and all(isinstance(v, int) for v in ph.values())
        check(ints and bool(ph), "E13 portfolio_health values all integers", f"ph={ph}")

    r2 = requests.get(f"{BASE}/loans", headers=hdr(tok), timeout=30)
    check(r2.status_code == 200, "E14 /api/loans → 200", f"{r2.status_code}")
    if r2.status_code == 200:
        print(f"    /loans count={len(r2.json())}")


# ---------- main ----------
def main() -> int:
    print(f"BASE={BASE}")
    tok = login()
    print(f"Logged in as lender {MOBILE}, token={tok[:20]}…")

    test_section_A(tok)
    test_section_B(tok)
    test_section_C(tok)
    test_section_D(tok)
    test_section_E(tok)

    print("\n\n==================== SUMMARY ====================")
    print(f"PASS: {len(PASS)}")
    print(f"FAIL: {len(FAIL)}")
    if FAIL:
        print("\nFailures:")
        for f in FAIL:
            print(f"  - {f}")
        return 1
    return 0


if __name__ == "__main__":
    sys.exit(main())

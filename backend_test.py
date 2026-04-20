"""
Iteration-18 backend validation — Hybrid AI + keyword-FAQ support chat bot
+ regressions. Tests run against live preview backend. No backend code modified.
"""
import sys
import requests

BASE = "https://lending-hub-63.preview.emergentagent.com"
API = f"{BASE}/api"
MOBILE = "9876543210"
CLIENT_ID = "cli_seed_000"


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


def _chat(tok, payload, timeout=60):
    h = {"Authorization": f"Bearer {tok}"}
    return requests.post(f"{API}/support/chat", json=payload, headers=h, timeout=timeout)


# ---------- 1. SHORT FAQ PATH ----------
def test_short_faq(tok):
    print("\n=== 1. SHORT FAQ PATH ===")
    results = []

    # 1a. "add client" → faq, answer mentions "Clients tab"
    print("\n-- 1a. 'add client' --")
    r = _chat(tok, {"question": "add client"})
    if r.status_code != 200:
        results.append(fail(f"HTTP {r.status_code} body={r.text[:200]}"))
    else:
        j = r.json()
        src = j.get("source")
        ans = j.get("answer", "")
        results.append(ok(f"HTTP 200, source={src!r}") if src == "faq" else fail(f"source={src!r}, expected 'faq'"))
        results.append(ok(f"answer mentions 'Clients tab'") if "Clients tab" in ans else fail(f"'Clients tab' NOT in answer: {ans[:200]!r}"))

    # 1b. "how does EMI rollback work" → faq, answer contains "Undo"
    print("\n-- 1b. 'how does EMI rollback work' --")
    r = _chat(tok, {"question": "how does EMI rollback work"})
    if r.status_code != 200:
        results.append(fail(f"HTTP {r.status_code}"))
    else:
        j = r.json()
        src = j.get("source")
        ans = j.get("answer", "")
        results.append(ok(f"HTTP 200, source={src!r}") if src == "faq" else fail(f"source={src!r}, expected 'faq'"))
        results.append(ok(f"answer contains 'Undo'") if "Undo" in ans else fail(f"'Undo' NOT in answer: {ans[:200]!r}"))

    # 1c. Empty question "" → empty, answer starts "Please ask"
    print("\n-- 1c. empty question '' --")
    r = _chat(tok, {"question": ""})
    if r.status_code != 200:
        results.append(fail(f"HTTP {r.status_code}"))
    else:
        j = r.json()
        src = j.get("source")
        ans = j.get("answer", "")
        results.append(ok(f"HTTP 200, source={src!r}") if src == "empty" else fail(f"source={src!r}, expected 'empty'"))
        results.append(ok(f"answer starts 'Please ask'") if ans.startswith("Please ask") else fail(f"answer does not start 'Please ask': {ans[:200]!r}"))

    return all(results)


# ---------- 2. LLM PATH ----------
def test_llm_path(tok):
    print("\n=== 2. LLM PATH ===")
    results = []

    # 2a. "Explain the difference between At Risk and Overdue in portfolio health." (lang en)
    print("\n-- 2a. At Risk vs Overdue (long question, en) --")
    r = _chat(tok, {
        "question": "Explain the difference between At Risk and Overdue in portfolio health.",
        "language": "en",
    }, timeout=90)
    if r.status_code != 200:
        results.append(fail(f"HTTP {r.status_code} body={r.text[:300]}"))
    else:
        j = r.json()
        src = j.get("source")
        ans = j.get("answer", "")
        results.append(ok(f"HTTP 200, source={src!r}") if src == "ai" else fail(f"source={src!r}, expected 'ai' (NOT faq)"))
        al = ans.lower()
        results.append(ok(f"answer mentions 'At Risk'") if "at risk" in al else fail(f"'At Risk' NOT in answer: {ans[:300]!r}"))
        results.append(ok(f"answer mentions 'Overdue'") if "overdue" in al else fail(f"'Overdue' NOT in answer: {ans[:300]!r}"))
        print(f"    (answer len={len(ans)} preview={ans[:200]!r})")

    # 2b. "Why should I upload a bank statement before approving a loan, and what does the app look for?"
    print("\n-- 2b. Bank statement why-upload (long question) --")
    r = _chat(tok, {
        "question": "Why should I upload a bank statement before approving a loan, and what does the app look for?",
    }, timeout=90)
    if r.status_code != 200:
        results.append(fail(f"HTTP {r.status_code} body={r.text[:300]}"))
    else:
        j = r.json()
        src = j.get("source")
        ans = j.get("answer", "")
        results.append(ok(f"HTTP 200, source={src!r}") if src == "ai" else fail(f"source={src!r}, expected 'ai'"))
        al = ans.lower()
        has_any = ("bounce" in al) or ("risk" in al) or ("statement" in al)
        results.append(ok(f"answer references bounce/risk/statement") if has_any else fail(f"no bounce/risk/statement hit in answer: {ans[:300]!r}"))
        print(f"    (answer len={len(ans)} preview={ans[:200]!r})")

    return all(results)


# ---------- 3. LANGUAGE PATH ----------
def test_language_path(tok):
    print("\n=== 3. LANGUAGE PATH (Hindi / Devanagari) ===")
    results = []
    r = _chat(tok, {
        "question": "पोर्टफोलियो हेल्थ क्या है?",
        "language": "hi",
    }, timeout=90)
    if r.status_code != 200:
        results.append(fail(f"HTTP {r.status_code} body={r.text[:300]}"))
    else:
        j = r.json()
        src = j.get("source")
        ans = j.get("answer", "")
        results.append(ok(f"HTTP 200, source={src!r}") if src == "ai" else fail(f"source={src!r}, expected 'ai'"))
        # Devanagari range U+0900 to U+097F
        has_devanagari = any("\u0900" <= ch <= "\u097F" for ch in ans)
        results.append(ok(f"answer contains Devanagari script") if has_devanagari else fail(f"NO Devanagari in answer: {ans[:300]!r}"))
        print(f"    (answer preview={ans[:200]!r})")
    return all(results)


# ---------- 4. BACKWARD COMPAT ----------
def test_backward_compat(tok):
    print("\n=== 4. BACKWARD COMPAT (no language/history) ===")
    r = _chat(tok, {"question": "How do I check CIBIL?"}, timeout=60)
    if r.status_code != 200:
        return fail(f"HTTP {r.status_code} body={r.text[:200]}")
    j = r.json()
    src = j.get("source")
    return ok(f"HTTP 200, source={src!r}, answer len={len(j.get('answer',''))}")


# ---------- 5. AUTH ----------
def test_auth():
    print("\n=== 5. AUTH (no bearer header) ===")
    r = requests.post(f"{API}/support/chat", json={"question": "hello"}, timeout=30)
    if r.status_code == 401:
        return ok(f"HTTP 401 (no auth header)")
    return fail(f"expected 401, got {r.status_code} body={r.text[:200]}")


# ---------- 6. REGRESSIONS ----------
def test_regressions(tok):
    print("\n=== 6. REGRESSIONS ===")
    h = {"Authorization": f"Bearer {tok}"}
    results = []

    # 6a. GET /api/dashboard with portfolio_health
    r = requests.get(f"{API}/dashboard", headers=h, timeout=30)
    if r.status_code != 200:
        results.append(fail(f"/api/dashboard HTTP {r.status_code}"))
    else:
        ph = r.json().get("portfolio_health")
        if ph is None:
            results.append(fail("/api/dashboard: portfolio_health missing"))
        else:
            needed = {"on_track", "overdue", "at_risk", "completed", "defaulted"}
            missing = needed - set(ph.keys())
            if missing:
                results.append(fail(f"/api/dashboard portfolio_health missing keys: {missing}"))
            else:
                results.append(ok(f"/api/dashboard 200 portfolio_health={ph}"))

    # 6b. GET /api/audit/summary?months=3&year=2026
    r = requests.get(f"{API}/audit/summary?months=3&year=2026", headers=h, timeout=30)
    if r.status_code != 200:
        results.append(fail(f"/api/audit/summary HTTP {r.status_code}"))
    else:
        j = r.json()
        results.append(ok(f"/api/audit/summary 200 net={j.get('net')} monthly.len={len(j.get('monthly', []))}"))

    # 6c. POST /api/clients/cli_seed_000/analyze-statement (body={})
    r = requests.post(f"{API}/clients/{CLIENT_ID}/analyze-statement", json={}, headers=h, timeout=60)
    if r.status_code != 200:
        results.append(fail(f"/analyze-statement HTTP {r.status_code} body={r.text[:200]}"))
    else:
        j = r.json()
        results.append(ok(f"/analyze-statement 200 (bounce_risk={j.get('bounce_risk')}, parse_source={j.get('parse_source')})"))

    return all(results)


def main():
    print("=" * 60)
    print("ITERATION 18 — Hybrid AI + FAQ Support Chat")
    print("=" * 60)
    tok = login()
    results = {
        "1. Short FAQ path":         test_short_faq(tok),
        "2. LLM path":               test_llm_path(tok),
        "3. Language path (hi)":     test_language_path(tok),
        "4. Backward compat":        test_backward_compat(tok),
        "5. Auth (401 no bearer)":   test_auth(),
        "6. Regressions":            test_regressions(tok),
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

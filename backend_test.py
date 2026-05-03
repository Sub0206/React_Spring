"""
Backend regression tests for:
  1. Enriched GET /api/v1/clients (risk_kind, risk_overdue_count, risk_overdue_amount)
  2. GET /api/v1/clients/{id}/risk-summary (keys, 404, 401)
  3. Consistency: enriched list risk_kind == risk-summary kind for same client
  4. Dashboard portfolio_health still emits overdue_mild and overdue_high as separate ints
  5. Rate limiter regression on POST /api/v1/auth/passcode-login
"""
import sys
import time
import requests
from collections import Counter

BASE = "https://lending-hub-63.preview.emergentagent.com"
API = f"{BASE}/api/v1"

MOBILE = "9876543210"
PASSCODE = "5678"
BAD_MOBILE = "9876999999"
BAD_PASSCODE = "0000"

results = []


def rec(name: str, ok: bool, evidence: str):
    status = "PASS" if ok else "FAIL"
    line = f"[{status}] {name} :: {evidence}"
    print(line)
    results.append((ok, name, evidence))


def main() -> int:
    # --- Login via passcode-login ---
    r = requests.post(f"{API}/auth/passcode-login",
                      json={"mobile": MOBILE, "passcode": PASSCODE},
                      timeout=30)
    if r.status_code != 200:
        rec("auth/passcode-login (happy path)", False,
            f"HTTP {r.status_code} body={r.text[:200]}")
        return 1
    tok = r.json().get("access_token")
    rec("auth/passcode-login (happy path)", bool(tok),
        f"200, token_len={len(tok or '')}")
    H = {"Authorization": f"Bearer {tok}"}

    # 1. Enriched GET /api/v1/clients
    r = requests.get(f"{API}/clients", headers=H, timeout=30)
    rec("clients: HTTP 200", r.status_code == 200, f"status={r.status_code}")
    clients = r.json() if r.status_code == 200 else []
    rec("clients: response is array", isinstance(clients, list),
        f"type={type(clients).__name__} len={len(clients) if isinstance(clients, list) else 'NA'}")
    if not isinstance(clients, list) or not clients:
        rec("clients: at least one client returned", False, "empty list")
        return 1

    missing = []
    none_risk_kind = []
    invalid_kind = []
    allowed = {"on_track", "overdue_mild", "overdue_high"}
    non_null_count = 0
    type_fail = []
    for c in clients:
        if "risk_kind" not in c or "risk_overdue_count" not in c or "risk_overdue_amount" not in c:
            missing.append(c.get("client_id"))
            continue
        if c.get("risk_kind") is None:
            none_risk_kind.append(c.get("client_id"))
            continue
        if c["risk_kind"] not in allowed:
            invalid_kind.append((c.get("client_id"), c["risk_kind"]))
        else:
            non_null_count += 1
        if not isinstance(c["risk_overdue_count"], int):
            type_fail.append((c.get("client_id"), "risk_overdue_count", type(c["risk_overdue_count"]).__name__))
        if not isinstance(c["risk_overdue_amount"], (int, float)):
            type_fail.append((c.get("client_id"), "risk_overdue_amount", type(c["risk_overdue_amount"]).__name__))

    rec("clients: every item has risk_kind/risk_overdue_count/risk_overdue_amount",
        len(missing) == 0, f"missing_from={missing[:5]} (total {len(missing)})")
    rec("clients: no item has risk_kind=null",
        len(none_risk_kind) == 0, f"null_in={none_risk_kind[:5]} (total {len(none_risk_kind)})")
    rec("clients: every risk_kind in {on_track,overdue_mild,overdue_high}",
        len(invalid_kind) == 0, f"invalid={invalid_kind[:5]}")
    rec("clients: at least one client has a non-null risk_kind",
        non_null_count >= 1, f"non_null_count={non_null_count}/{len(clients)}")
    rec("clients: numeric risk fields have correct types",
        len(type_fail) == 0, f"bad={type_fail[:5]}")

    dist = Counter(c.get("risk_kind") for c in clients)
    print(f"    risk_kind distribution: {dict(dist)}  total_clients={len(clients)}")

    # 2. GET /api/v1/clients/{id}/risk-summary
    first = clients[0]
    cid = first.get("client_id")

    r = requests.get(f"{API}/clients/{cid}/risk-summary", headers=H, timeout=30)
    rec("risk-summary: HTTP 200 for first client", r.status_code == 200,
        f"status={r.status_code} body={r.text[:200]}")
    rs = r.json() if r.status_code == 200 else {}
    required_keys = {
        "client_id", "kind", "late_payments", "missed_months",
        "missed_months_count", "overdue_count", "overdue_amount",
        "overdue_loans", "active_loan_count"
    }
    missing_keys = required_keys - set(rs.keys())
    rec("risk-summary: all required keys present",
        len(missing_keys) == 0, f"missing={missing_keys}")
    if rs:
        rec("risk-summary: client_id matches", rs.get("client_id") == cid,
            f"got={rs.get('client_id')} expected={cid}")
        rec("risk-summary: kind in allowed set", rs.get("kind") in allowed,
            f"kind={rs.get('kind')}")
        rec("risk-summary: late_payments is int", isinstance(rs.get("late_payments"), int),
            f"val={rs.get('late_payments')}")
        mm = rs.get("missed_months")
        rec("risk-summary: missed_months is array of strings",
            isinstance(mm, list) and all(isinstance(s, str) for s in mm),
            f"val={mm}")
        import re
        fmt_ok = isinstance(mm, list) and all(re.match(r"^[A-Z][a-z]{2} \d{4}$", s) for s in mm)
        rec("risk-summary: missed_months formatted 'MMM YYYY'", fmt_ok,
            f"sample={mm[:5] if isinstance(mm, list) else mm}")
        rec("risk-summary: missed_months_count is int",
            isinstance(rs.get("missed_months_count"), int),
            f"val={rs.get('missed_months_count')}")
        rec("risk-summary: overdue_count is int",
            isinstance(rs.get("overdue_count"), int), f"val={rs.get('overdue_count')}")
        rec("risk-summary: overdue_amount is number",
            isinstance(rs.get("overdue_amount"), (int, float)),
            f"val={rs.get('overdue_amount')}")
        ol = rs.get("overdue_loans")
        rec("risk-summary: overdue_loans is array", isinstance(ol, list),
            f"type={type(ol).__name__}")
        if isinstance(ol, list):
            item_ok = all(
                isinstance(item, dict) and
                {"loan_id", "kind", "overdue_count", "overdue_amount"}.issubset(item.keys())
                for item in ol
            )
            rec("risk-summary: each overdue_loans item has {loan_id,kind,overdue_count,overdue_amount}",
                item_ok, f"sample={ol[:2]}")
        rec("risk-summary: active_loan_count is int",
            isinstance(rs.get("active_loan_count"), int),
            f"val={rs.get('active_loan_count')}")

    # 404 for unknown client id
    r = requests.get(f"{API}/clients/cli_does_not_exist_xyz/risk-summary",
                     headers=H, timeout=30)
    rec("risk-summary: 404 for unknown client id",
        r.status_code == 404, f"status={r.status_code} body={r.text[:100]}")

    # 401 without Authorization header
    r = requests.get(f"{API}/clients/{cid}/risk-summary", timeout=30)
    rec("risk-summary: 401 without Authorization",
        r.status_code == 401, f"status={r.status_code} body={r.text[:100]}")

    # 3. Consistency: enriched list risk_kind == risk-summary kind
    list_kind = first.get("risk_kind")
    rs_kind = rs.get("kind")
    rec("consistency: list.risk_kind == risk-summary.kind (first client)",
        list_kind == rs_kind,
        f"list={list_kind} summary={rs_kind} client={cid}")

    # Verify for a few more clients for robustness
    extra_ok = True
    mismatches = []
    for c in clients[1:6]:
        cc = c.get("client_id")
        rr = requests.get(f"{API}/clients/{cc}/risk-summary", headers=H, timeout=30)
        if rr.status_code != 200:
            continue
        k2 = rr.json().get("kind")
        if c.get("risk_kind") != k2:
            extra_ok = False
            mismatches.append((cc, c.get("risk_kind"), k2))
    rec("consistency: list.risk_kind == risk-summary.kind (next 5 clients)",
        extra_ok, f"mismatches={mismatches}")

    # 4. Dashboard portfolio_health still split
    r = requests.get(f"{API}/dashboard", headers=H, timeout=30)
    rec("dashboard: HTTP 200", r.status_code == 200, f"status={r.status_code}")
    dash = r.json() if r.status_code == 200 else {}
    ph = dash.get("portfolio_health", {})
    rec("dashboard: portfolio_health.overdue_mild present and int",
        "overdue_mild" in ph and isinstance(ph.get("overdue_mild"), int),
        f"val={ph.get('overdue_mild')} type={type(ph.get('overdue_mild')).__name__}")
    rec("dashboard: portfolio_health.overdue_high present and int",
        "overdue_high" in ph and isinstance(ph.get("overdue_high"), int),
        f"val={ph.get('overdue_high')} type={type(ph.get('overdue_high')).__name__}")
    print(f"    portfolio_health={ph}")

    # 5. Rate limiter regression on passcode-login
    wrong_url = f"{API}/auth/passcode-login"
    statuses = []
    for i in range(5):
        rr = requests.post(wrong_url,
                           json={"mobile": BAD_MOBILE, "passcode": BAD_PASSCODE},
                           timeout=30)
        statuses.append(rr.status_code)
        time.sleep(0.1)
    rec("rate-limit: first 5 wrong passcodes all return 401",
        all(s == 401 for s in statuses), f"statuses={statuses}")

    # 6th attempt → 429 with Retry-After
    rr = requests.post(wrong_url,
                       json={"mobile": BAD_MOBILE, "passcode": BAD_PASSCODE},
                       timeout=30)
    retry_after = rr.headers.get("Retry-After")
    rec("rate-limit: 6th attempt returns 429",
        rr.status_code == 429, f"status={rr.status_code} body={rr.text[:200]}")
    rec("rate-limit: 6th attempt has Retry-After header",
        retry_after is not None and str(retry_after).strip() != "",
        f"Retry-After={retry_after}")

    # Correct login with valid mobile/passcode still returns 200
    rr = requests.post(wrong_url,
                       json={"mobile": MOBILE, "passcode": PASSCODE},
                       timeout=30)
    ok_token = rr.status_code == 200 and bool(rr.json().get("access_token"))
    rec("rate-limit: valid mobile/passcode still returns 200 (separate bucket)",
        ok_token, f"status={rr.status_code} body_preview={rr.text[:150]}")

    # Summary
    print("\n" + "=" * 72)
    passed = sum(1 for ok, *_ in results if ok)
    failed = [(n, e) for ok, n, e in results if not ok]
    print(f"TOTAL: {passed}/{len(results)} PASSED, {len(failed)} FAILED")
    if failed:
        print("\nFAILURES:")
        for n, e in failed:
            print(f"  - {n}  [{e}]")
    return 0 if not failed else 1


if __name__ == "__main__":
    sys.exit(main())

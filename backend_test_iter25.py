"""Iteration-25 regression: risk-summary + client-list scoped by funded_by."""
import os, json, sys
import requests

BASE = os.environ.get("BACKEND_URL", "https://lending-hub-63.preview.emergentagent.com") + "/api/v1"
MOBILE = "9876543210"
PASS = "5678"

results = []
def rec(tc, ok, detail=""):
    results.append((tc, ok, detail))
    print(f"[{'PASS' if ok else 'FAIL'}] {tc}: {detail}")

# Login
r = requests.post(f"{BASE}/auth/passcode-login",
                  json={"mobile": MOBILE, "passcode": PASS}, timeout=30)
assert r.status_code == 200, f"Login failed: {r.status_code} {r.text}"
token = r.json()["access_token"]
H = {"Authorization": f"Bearer {token}"}
print(f"Login OK. Token length={len(token)}")

# TC1: Clients list
r = requests.get(f"{BASE}/clients", headers=H, timeout=30)
ok = r.status_code == 200
clients = r.json() if ok else []
rec("TC1a: GET /clients status 200", ok, f"status={r.status_code} count={len(clients)}")
rec("TC1b: exactly 13 clients", len(clients) == 13, f"got {len(clients)}")

missing_keys = []
for c in clients:
    for k in ("risk_kind", "risk_overdue_count", "risk_overdue_amount"):
        if k not in c:
            missing_keys.append((c.get("client_id"), k))
rec("TC1c: every client has risk_kind/overdue_count/overdue_amount",
    not missing_keys, f"missing={missing_keys[:5]}")

high_clients = [c for c in clients if c.get("risk_kind") == "overdue_high"]
on_track = [c for c in clients if c.get("risk_kind") == "on_track"]
names_high = sorted([c.get("name") for c in high_clients])
expected_high = sorted(["Arjun Mehta", "Priya Nair", "Rahul Desai", "Meera Joshi"])
rec("TC1d: exactly 4 overdue_high clients",
    len(high_clients) == 4, f"count={len(high_clients)} names={names_high}")
rec("TC1e: overdue_high names match seed",
    names_high == expected_high, f"got={names_high} expected={expected_high}")
rec("TC1f: remaining 9 are on_track",
    len(on_track) == 9, f"on_track count={len(on_track)}")

# TC2: Rahul Desai cli_seed_006
r = requests.get(f"{BASE}/clients/cli_seed_006/risk-summary", headers=H, timeout=30)
rec("TC2a: risk-summary cli_seed_006 200", r.status_code == 200, f"status={r.status_code} body={r.text[:200]}")
rs = r.json() if r.status_code == 200 else {}
required = {"kind","late_payments","missed_months","missed_months_count",
            "overdue_count","overdue_amount","overdue_loans","active_loan_count"}
present = set(rs.keys())
rec("TC2b: all keys present", required.issubset(present), f"missing={required-present}")
rec("TC2c: kind==overdue_high", rs.get("kind") == "overdue_high", f"got={rs.get('kind')}")
rec("TC2d: overdue_count==2", rs.get("overdue_count") == 2, f"got={rs.get('overdue_count')}")
rec("TC2e: overdue_amount==15200", float(rs.get("overdue_amount") or 0) == 15200.0,
    f"got={rs.get('overdue_amount')}")
rec("TC2f: active_loan_count==1", rs.get("active_loan_count") == 1,
    f"got={rs.get('active_loan_count')}")
mm = rs.get("missed_months") or []
rec("TC2g: missed_months includes 'Mar 2026' and 'Apr 2026'",
    "Mar 2026" in mm and "Apr 2026" in mm, f"got={mm}")
ol = rs.get("overdue_loans") or []
rec("TC2h: overdue_loans has exactly 1 item", len(ol) == 1, f"got={ol}")
if ol:
    rec("TC2i: loan_id starts with 'loan_seed_l7_'",
        (ol[0].get("loan_id","").startswith("loan_seed_l7_")),
        f"got={ol[0].get('loan_id')}")
print(f"    full TC2 response: {json.dumps(rs, default=str)}")

# TC3: Rajesh Kumar cli_seed_000 on_track
r = requests.get(f"{BASE}/clients/cli_seed_000/risk-summary", headers=H, timeout=30)
rec("TC3a: risk-summary cli_seed_000 200", r.status_code == 200, f"status={r.status_code}")
rs3 = r.json() if r.status_code == 200 else {}
rec("TC3b: kind==on_track", rs3.get("kind") == "on_track", f"got={rs3.get('kind')}")
rec("TC3c: overdue_count==0", rs3.get("overdue_count") == 0, f"got={rs3.get('overdue_count')}")
rec("TC3d: overdue_amount==0", float(rs3.get("overdue_amount") or 0) == 0.0,
    f"got={rs3.get('overdue_amount')}")
rec("TC3e: missed_months empty", rs3.get("missed_months") == [], f"got={rs3.get('missed_months')}")
rec("TC3f: active_loan_count >= 0",
    isinstance(rs3.get("active_loan_count"), int) and rs3.get("active_loan_count") >= 0,
    f"got={rs3.get('active_loan_count')}")
print(f"    full TC3 response: {json.dumps(rs3, default=str)}")

# TC4: dashboard
r = requests.get(f"{BASE}/dashboard", headers=H, timeout=30)
rec("TC4a: dashboard 200", r.status_code == 200, f"status={r.status_code}")
dash = r.json() if r.status_code == 200 else {}
ph = dash.get("portfolio_health") or {}
req_keys = {"on_track","overdue","at_risk","completed","defaulted"}
rec("TC4b: portfolio_health has all 5 keys", req_keys.issubset(set(ph.keys())),
    f"keys={list(ph.keys())}")
all_int = all(isinstance(ph.get(k), int) for k in req_keys)
rec("TC4c: all values integers", all_int, f"values={ph}")
rec(f"TC4d: at_risk value (report only)", True, f"at_risk={ph.get('at_risk')} full={ph}")

# TC5a: 404 for bad client_id
r = requests.get(f"{BASE}/clients/cli_does_not_exist/risk-summary", headers=H, timeout=30)
rec("TC5a: 404 for unknown client", r.status_code == 404, f"status={r.status_code} body={r.text[:120]}")

# TC5b: 401 without auth
r = requests.get(f"{BASE}/clients/cli_seed_006/risk-summary", timeout=30)
rec("TC5b: 401 without Authorization", r.status_code == 401, f"status={r.status_code} body={r.text[:120]}")

# Summary
fails = [x for x in results if not x[1]]
print(f"\n=== TOTAL: {len(results)}, PASS: {len(results)-len(fails)}, FAIL: {len(fails)} ===")
for t, o, d in fails:
    print(f"  FAIL {t}: {d}")
sys.exit(0 if not fails else 1)

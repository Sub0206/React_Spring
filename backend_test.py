"""LendIQ backend iteration 11 tests: enriched statement analyzer + regressions."""
import os
import json
import requests

BASE = "https://lending-hub-63.preview.emergentagent.com/api"

def auth():
    r = requests.post(f"{BASE}/auth/send-otp", json={"mobile": "9876543210", "purpose": "login"})
    r.raise_for_status()
    otp = r.json()["demo_otp"]
    r = requests.post(f"{BASE}/auth/verify-otp", json={"mobile": "9876543210", "otp": otp})
    r.raise_for_status()
    token = r.json()["access_token"]
    return {"Authorization": f"Bearer {token}"}


def assert_key(obj, key, typ=None, label="", results=None):
    ok = key in obj
    if ok and typ is not None:
        if isinstance(typ, tuple):
            ok = isinstance(obj[key], typ)
        else:
            ok = isinstance(obj[key], typ)
    msg = f"[{'PASS' if ok else 'FAIL'}] {label or key}"
    if not ok:
        msg += f" -- got {type(obj.get(key)).__name__}={obj.get(key)!r}"
    print(msg)
    if results is not None:
        results.append((label or key, ok, obj.get(key)))
    return ok


def main():
    h = auth()
    print("Authenticated.")

    # Pick any existing client
    clients = requests.get(f"{BASE}/clients", headers=h).json()
    if not clients:
        raise SystemExit("No clients found for lender 9876543210")
    client = clients[0]
    client_id = client["client_id"]
    print(f"Using client: {client_id} ({client['name']})")

    results = []

    # --------- PATH CHECK ---------
    print("\n=== PATH: POST /api/clients/{client_id}/analyze-statement ===")
    r = requests.post(f"{BASE}/clients/{client_id}/analyze-statement", headers=h, json={"months": 6})
    print(f"Status: {r.status_code}")
    if r.status_code == 404 or r.status_code == 405:
        print("[FAIL-PATH] The endpoint /api/clients/{client_id}/analyze-statement does NOT exist on backend.")
        results.append(("path_/api/clients/{id}/analyze-statement", False, r.status_code))
        # Fall back to the existing endpoint that has the enriched payload
        print("\n=== FALLBACK: POST /api/loan-apps/analyze-statement ===")
        r = requests.post(
            f"{BASE}/loan-apps/analyze-statement",
            headers=h,
            json={"client_id": client_id, "file_name": "statement.pdf", "file_size": 1024, "months": 6},
        )
        print(f"Status: {r.status_code}")
    else:
        print("[PASS-PATH] endpoint responded")
        results.append(("path_/api/clients/{id}/analyze-statement", True, r.status_code))

    r.raise_for_status()
    data = r.json()

    print(f"\n--- Top-level keys returned ({len(data)}): ---")
    for k in sorted(data.keys()):
        v = data[k]
        preview = v if not isinstance(v, (list, dict)) else f"<{type(v).__name__} len={len(v)}>"
        print(f"  {k}: {preview}")

    print("\n=== REQUIRED FIELDS ===")
    required = [
        ("months_analyzed", int),
        ("bank_detected", str),
        ("account_holder", str),
        ("account_number_masked", str),
        ("statement_period", str),
        ("opening_balance", (int, float)),
        ("closing_balance", (int, float)),
        ("total_credit", (int, float)),
        ("total_debit", (int, float)),
        ("avg_monthly_credit", (int, float)),
        ("avg_monthly_debit", (int, float)),
        ("avg_balance", (int, float)),
        ("highest_balance", (int, float)),
        ("bounced_transactions", int),
        ("salary_credits_detected", int),
        ("emi_load_pct", (int, float)),
        ("bounce_risk", str),
        ("risk_color", str),
        ("loan_eligibility", str),
        ("recommended_decision", str),
        ("suggested_loan_amount", (int, float)),
        ("suggested_emi", (int, float)),
        ("repayment_capacity_pct", (int, float)),
        ("chart", list),
        ("balance_trend", list),
        ("categories", list),
        ("red_flags", list),
        ("behaviour", dict),
        ("fraud_checks", dict),
        ("summary", str),
        ("highlights", list),
    ]
    for k, t in required:
        assert_key(data, k, t, results=results)

    # Enum checks
    print("\n=== ENUM CHECKS ===")
    br = data.get("bounce_risk")
    ok = br in ("low", "medium", "high")
    print(f"[{'PASS' if ok else 'FAIL'}] bounce_risk in [low,medium,high]: {br}")
    results.append(("enum bounce_risk", ok, br))

    rc = data.get("risk_color")
    ok = rc in ("green", "yellow", "red")
    print(f"[{'PASS' if ok else 'FAIL'}] risk_color in [green,yellow,red]: {rc}")
    results.append(("enum risk_color", ok, rc))

    le = data.get("loan_eligibility")
    ok = le in ("strong", "moderate", "weak")
    print(f"[{'PASS' if ok else 'FAIL'}] loan_eligibility in [strong,moderate,weak]: {le}")
    results.append(("enum loan_eligibility", ok, le))

    rd = data.get("recommended_decision")
    ok = rd in ("approve", "approve_with_caution", "manual_review", "reject")
    print(f"[{'PASS' if ok else 'FAIL'}] recommended_decision in [approve, approve_with_caution, manual_review, reject]: {rd}")
    results.append(("enum recommended_decision", ok, rd))

    # Range checks
    emi_pct = data.get("emi_load_pct")
    ok = isinstance(emi_pct, (int, float)) and 0 <= emi_pct <= 100
    print(f"[{'PASS' if ok else 'FAIL'}] emi_load_pct in [0,100]: {emi_pct}")
    results.append(("range emi_load_pct", ok, emi_pct))

    rcap = data.get("repayment_capacity_pct")
    ok = isinstance(rcap, (int, float)) and 0 <= rcap <= 100
    print(f"[{'PASS' if ok else 'FAIL'}] repayment_capacity_pct in [0,100]: {rcap}")
    results.append(("range repayment_capacity_pct", ok, rcap))

    # Array shape checks
    print("\n=== ARRAY SHAPE CHECKS ===")
    chart = data.get("chart") or []
    chart_ok = len(chart) > 0 and all(
        isinstance(c, dict) and set(["label", "credit", "debit", "net", "bounces"]).issubset(c.keys())
        for c in chart
    )
    print(f"[{'PASS' if chart_ok else 'FAIL'}] chart entries have label/credit/debit/net/bounces ({len(chart)} items)")
    if not chart_ok and chart:
        print(f"  First entry: {chart[0]}")
    results.append(("chart shape", chart_ok, len(chart)))

    btrend = data.get("balance_trend") or []
    bt_ok = len(btrend) > 0 and all(
        isinstance(c, dict) and set(["label", "value"]).issubset(c.keys()) for c in btrend
    )
    print(f"[{'PASS' if bt_ok else 'FAIL'}] balance_trend entries have label/value ({len(btrend)} items)")
    results.append(("balance_trend shape", bt_ok, len(btrend)))

    cats = data.get("categories") or []
    cats_ok = len(cats) > 0 and all(
        isinstance(c, dict) and set(["name", "count", "amount", "share_pct", "type"]).issubset(c.keys())
        for c in cats
    )
    print(f"[{'PASS' if cats_ok else 'FAIL'}] categories entries have name/count/amount/share_pct/type ({len(cats)} items)")
    if not cats_ok and cats:
        print(f"  First entry: {cats[0]}")
    results.append(("categories shape", cats_ok, len(cats)))

    rfs = data.get("red_flags") or []
    rf_ok = len(rfs) > 0 and all(
        isinstance(c, dict) and set(["severity", "title", "detail"]).issubset(c.keys()) for c in rfs
    )
    print(f"[{'PASS' if rf_ok else 'FAIL'}] red_flags entries have severity/title/detail ({len(rfs)} items)")
    results.append(("red_flags shape", rf_ok, len(rfs)))

    beh = data.get("behaviour") or {}
    beh_keys = ["salary_consistency", "spending_discipline", "cash_dependence_pct", "unusual_spikes", "frequent_transfers", "risky_merchants"]
    beh_ok = all(k in beh for k in beh_keys)
    print(f"[{'PASS' if beh_ok else 'FAIL'}] behaviour keys {beh_keys}")
    if not beh_ok:
        print(f"  Missing: {[k for k in beh_keys if k not in beh]}")
    results.append(("behaviour shape", beh_ok, list(beh.keys())))

    fc = data.get("fraud_checks") or {}
    fc_keys = ["edited_statement_likelihood", "missing_pages_detected", "duplicate_txn_count", "page_count", "rotated_pages_fixed", "ocr_confidence_pct"]
    fc_ok = all(k in fc for k in fc_keys)
    print(f"[{'PASS' if fc_ok else 'FAIL'}] fraud_checks keys {fc_keys}")
    if not fc_ok:
        print(f"  Missing: {[k for k in fc_keys if k not in fc]}")
    results.append(("fraud_checks shape", fc_ok, list(fc.keys())))

    highlights = data.get("highlights") or []
    hi_ok = isinstance(highlights, list) and all(isinstance(x, str) for x in highlights) and len(highlights) > 0
    print(f"[{'PASS' if hi_ok else 'FAIL'}] highlights is list of strings ({len(highlights)} items)")
    results.append(("highlights shape", hi_ok, len(highlights)))

    # --------- REGRESSIONS ---------
    print("\n=== REGRESSION: GET /api/dashboard portfolio_health ===")
    r = requests.get(f"{BASE}/dashboard", headers=h)
    r.raise_for_status()
    dash = r.json()
    ph = dash.get("portfolio_health")
    ok = isinstance(ph, dict) and set(["on_track", "overdue", "at_risk", "completed", "defaulted"]).issubset(ph.keys())
    print(f"[{'PASS' if ok else 'FAIL'}] portfolio_health: {ph}")
    results.append(("regression portfolio_health", ok, ph))

    # --------- undo-pay + reschedule regression ----------
    print("\n=== REGRESSION: undo-pay / reschedule ===")
    loans = requests.get(f"{BASE}/loans", headers=h).json()
    # Pick a loan owned by this lender with an unpaid month
    target_loan = None
    for l in loans:
        if l.get("funded_by") != os.environ.get("LENDER_ID", ""):
            pass
        # We need any loan with at least one unpaid entry
        for s in l.get("repayment_schedule", []):
            if s.get("status") != "paid":
                target_loan = l
                break
        if target_loan:
            break

    if not target_loan:
        print("[SKIP] No loan with unpaid EMI to test reschedule/undo")
        results.append(("regression reschedule", False, "no-target"))
        results.append(("regression undo-pay", False, "no-target"))
    else:
        loan_id = target_loan["loan_id"]
        # Pick first unpaid month
        unpaid = next((s for s in target_loan["repayment_schedule"] if s.get("status") != "paid"), None)
        month = unpaid["month"]
        print(f"Using loan {loan_id} month {month}")

        # reschedule to 2028-03-15T12:00:00Z
        r = requests.post(
            f"{BASE}/loans/{loan_id}/reschedule/{month}",
            headers=h,
            params={"new_due_date": "2028-03-15T12:00:00Z"},
        )
        ok = r.status_code == 200
        print(f"[{'PASS' if ok else 'FAIL'}] reschedule status={r.status_code}")
        if ok:
            updated = r.json()
            entry = next((s for s in updated["repayment_schedule"] if s["month"] == month), None)
            print(f"  new due_date: {entry['due_date'] if entry else 'MISSING'}")
        else:
            print(f"  body: {r.text[:200]}")
        results.append(("regression reschedule", ok, r.status_code))

        # Mark paid first, then undo-pay
        r = requests.post(f"{BASE}/loans/{loan_id}/repay/{month}", headers=h)
        if r.status_code == 200:
            r = requests.post(f"{BASE}/loans/{loan_id}/undo-pay/{month}", headers=h)
            ok = r.status_code == 200
            print(f"[{'PASS' if ok else 'FAIL'}] undo-pay status={r.status_code}")
            if not ok:
                print(f"  body: {r.text[:200]}")
            results.append(("regression undo-pay", ok, r.status_code))
        else:
            print(f"[FAIL] Pre-req repay failed: {r.status_code} {r.text[:200]}")
            results.append(("regression undo-pay", False, "pre-req repay failed"))

    print("\n=== SUMMARY ===")
    passed = sum(1 for _, ok, _ in results if ok)
    total = len(results)
    print(f"{passed}/{total} checks passed")
    for name, ok, _val in results:
        print(f"  {'OK  ' if ok else 'FAIL'} {name}")

    return results


if __name__ == "__main__":
    main()

"""
Iteration-11 RE-TEST — Enriched statement analyzer.
Tests both the NEW path-based endpoint and the legacy body-based endpoint
against the live preview backend.
"""
import os
import sys
import json
import requests
from pathlib import Path
from dotenv import load_dotenv

load_dotenv(Path("/app/frontend/.env"))
BASE_URL = (
    os.environ.get("EXPO_PUBLIC_BACKEND_URL")
    or os.environ.get("REACT_APP_BACKEND_URL")
    or "https://lending-hub-63.preview.emergentagent.com"
).rstrip("/")
API = f"{BASE_URL}/api"

MOBILE = "9876543210"
SEED_CLIENT = "cli_seed_000"

# ---- Required top-level fields ----
NUMBER_FIELDS = [
    "opening_balance", "closing_balance", "total_credit", "total_debit",
    "avg_monthly_credit", "avg_monthly_debit", "avg_balance", "highest_balance",
    "emi_load_pct", "suggested_loan_amount", "suggested_emi", "repayment_capacity_pct",
]
INT_FIELDS = ["months_analyzed", "bounced_transactions", "salary_credits_detected"]
STR_FIELDS = [
    "bank_detected", "account_holder", "account_number_masked", "statement_period",
    "summary",
]
ENUM_FIELDS = {
    "bounce_risk": {"low", "medium", "high"},
    "risk_color": {"green", "yellow", "red"},
    "loan_eligibility": {"strong", "moderate", "weak"},
    "recommended_decision": {"approve", "approve_with_caution", "manual_review", "reject"},
}
ARRAY_FIELDS = ["chart", "balance_trend", "categories", "red_flags", "highlights"]
OBJECT_FIELDS = ["behaviour", "fraud_checks"]

BEHAVIOUR_KEYS = {
    "salary_consistency", "spending_discipline", "cash_dependence_pct",
    "unusual_spikes", "frequent_transfers", "risky_merchants",
}
FRAUD_KEYS = {
    "edited_statement_likelihood", "missing_pages_detected", "duplicate_txn_count",
    "page_count", "rotated_pages_fixed", "ocr_confidence_pct",
}
CHART_KEYS = {"label", "credit", "debit", "net", "bounces"}
BALANCE_TREND_KEYS = {"label", "value"}
CATEGORIES_KEYS = {"name", "count", "amount", "share_pct", "type"}
RED_FLAGS_KEYS = {"severity", "title", "detail"}


def _is_number(v):
    return isinstance(v, (int, float)) and not isinstance(v, bool)


def login() -> str:
    r = requests.post(f"{API}/auth/send-otp", json={"mobile": MOBILE, "purpose": "login"}, timeout=30)
    r.raise_for_status()
    otp = r.json()["demo_otp"]
    r2 = requests.post(f"{API}/auth/verify-otp", json={"mobile": MOBILE, "otp": otp}, timeout=30)
    r2.raise_for_status()
    return r2.json()["access_token"]


def validate_schema(res: dict, label: str) -> list:
    """Return list of failure strings; empty list means PASS."""
    fails = []
    if not isinstance(res, dict):
        return [f"{label}: response is not a dict"]

    # Ints
    for k in INT_FIELDS:
        if k not in res:
            fails.append(f"{label}: missing int field `{k}`")
        elif not isinstance(res[k], int) or isinstance(res[k], bool):
            fails.append(f"{label}: `{k}` is not int (got {type(res[k]).__name__}={res[k]!r})")

    # Strings
    for k in STR_FIELDS:
        if k not in res:
            fails.append(f"{label}: missing str field `{k}`")
        elif not isinstance(res[k], str):
            fails.append(f"{label}: `{k}` is not str (got {type(res[k]).__name__})")

    # Numbers
    for k in NUMBER_FIELDS:
        if k not in res:
            fails.append(f"{label}: missing numeric field `{k}`")
        elif not _is_number(res[k]):
            fails.append(f"{label}: `{k}` is not a number (got {type(res[k]).__name__}={res[k]!r})")

    # Enums
    for k, allowed in ENUM_FIELDS.items():
        if k not in res:
            fails.append(f"{label}: missing enum field `{k}`")
        elif res[k] not in allowed:
            fails.append(f"{label}: `{k}`={res[k]!r} not in {sorted(allowed)}")

    # Arrays
    for k in ARRAY_FIELDS:
        if k not in res:
            fails.append(f"{label}: missing array field `{k}`")
        elif not isinstance(res[k], list):
            fails.append(f"{label}: `{k}` is not a list (got {type(res[k]).__name__})")
        elif k == "highlights" and res[k] and not all(isinstance(x, str) for x in res[k]):
            fails.append(f"{label}: `highlights` has non-string elements")

    # Objects
    for k in OBJECT_FIELDS:
        if k not in res:
            fails.append(f"{label}: missing object field `{k}`")
        elif not isinstance(res[k], dict):
            fails.append(f"{label}: `{k}` is not a dict")

    # chart[] shape
    chart = res.get("chart") or []
    if isinstance(chart, list):
        if len(chart) == 0:
            fails.append(f"{label}: chart[] is empty")
        for i, c in enumerate(chart):
            if not isinstance(c, dict):
                fails.append(f"{label}: chart[{i}] not a dict")
                continue
            missing = CHART_KEYS - set(c.keys())
            if missing:
                fails.append(f"{label}: chart[{i}] missing keys {sorted(missing)}")

    # balance_trend[] shape
    bt = res.get("balance_trend") or []
    if isinstance(bt, list):
        if len(bt) == 0:
            fails.append(f"{label}: balance_trend[] is empty")
        for i, b in enumerate(bt):
            if not isinstance(b, dict):
                fails.append(f"{label}: balance_trend[{i}] not a dict")
                continue
            missing = BALANCE_TREND_KEYS - set(b.keys())
            if missing:
                fails.append(f"{label}: balance_trend[{i}] missing keys {sorted(missing)}")

    # categories[] shape
    cats = res.get("categories") or []
    if isinstance(cats, list):
        if len(cats) == 0:
            fails.append(f"{label}: categories[] is empty")
        for i, c in enumerate(cats):
            if not isinstance(c, dict):
                fails.append(f"{label}: categories[{i}] not a dict")
                continue
            missing = CATEGORIES_KEYS - set(c.keys())
            if missing:
                fails.append(f"{label}: categories[{i}] missing keys {sorted(missing)}")

    # red_flags[] shape
    rf = res.get("red_flags") or []
    if isinstance(rf, list):
        if len(rf) == 0:
            fails.append(f"{label}: red_flags[] is empty")
        for i, r in enumerate(rf):
            if not isinstance(r, dict):
                fails.append(f"{label}: red_flags[{i}] not a dict")
                continue
            missing = RED_FLAGS_KEYS - set(r.keys())
            if missing:
                fails.append(f"{label}: red_flags[{i}] missing keys {sorted(missing)}")

    # behaviour shape
    beh = res.get("behaviour") or {}
    if isinstance(beh, dict):
        missing = BEHAVIOUR_KEYS - set(beh.keys())
        if missing:
            fails.append(f"{label}: behaviour missing keys {sorted(missing)}")

    # fraud_checks shape
    fc = res.get("fraud_checks") or {}
    if isinstance(fc, dict):
        missing = FRAUD_KEYS - set(fc.keys())
        if missing:
            fails.append(f"{label}: fraud_checks missing keys {sorted(missing)}")

    return fails


def main():
    print(f"API: {API}")
    token = login()
    headers = {"Authorization": f"Bearer {token}"}
    print(f"[AUTH] Logged in as {MOBILE}\n")

    overall = {}

    # ---- TEST 1: NEW path-based endpoint ----
    print("=" * 70)
    print(f"TEST 1: POST /api/clients/{SEED_CLIENT}/analyze-statement (path param)")
    print("=" * 70)
    try:
        r = requests.post(
            f"{API}/clients/{SEED_CLIENT}/analyze-statement",
            headers=headers,
            json={},
            timeout=120,
        )
        print(f"HTTP {r.status_code}")
        if r.status_code != 200:
            print(f"BODY: {r.text[:500]}")
            overall["path_endpoint"] = [f"HTTP {r.status_code}: {r.text[:300]}"]
        else:
            res1 = r.json()
            print(f"Top-level keys ({len(res1)}): {sorted(res1.keys())}")
            fails = validate_schema(res1, "PATH")
            overall["path_endpoint"] = fails
            if fails:
                print(f"\n❌ PATH endpoint {len(fails)} failures:")
                for f in fails:
                    print(f"   - {f}")
            else:
                print("✅ PATH endpoint: ALL FIELDS PRESENT & CORRECT TYPES")
                print(f"   months_analyzed={res1['months_analyzed']}, "
                      f"bank={res1['bank_detected']}, "
                      f"risk={res1['bounce_risk']}/{res1['risk_color']}, "
                      f"eligibility={res1['loan_eligibility']}, "
                      f"decision={res1['recommended_decision']}")
                print(f"   chart[0]={res1['chart'][0] if res1['chart'] else 'EMPTY'}")
                print(f"   balance_trend[0]={res1['balance_trend'][0] if res1['balance_trend'] else 'EMPTY'}")
                print(f"   categories[0]={res1['categories'][0] if res1['categories'] else 'EMPTY'}")
                print(f"   red_flags[0]={res1['red_flags'][0] if res1['red_flags'] else 'EMPTY'}")
                print(f"   behaviour={res1['behaviour']}")
                print(f"   fraud_checks={res1['fraud_checks']}")
    except Exception as e:
        print(f"EXCEPTION: {e!r}")
        overall["path_endpoint"] = [f"Exception: {e!r}"]

    # ---- TEST 2: Legacy body endpoint ----
    print("\n" + "=" * 70)
    print("TEST 2: POST /api/loan-apps/analyze-statement (body)")
    print("=" * 70)
    try:
        r = requests.post(
            f"{API}/loan-apps/analyze-statement",
            headers=headers,
            json={
                "client_id": SEED_CLIENT,
                "file_name": "statement.pdf",
                "file_size": 245678,
                "months": 6,
            },
            timeout=120,
        )
        print(f"HTTP {r.status_code}")
        if r.status_code != 200:
            print(f"BODY: {r.text[:500]}")
            overall["body_endpoint"] = [f"HTTP {r.status_code}: {r.text[:300]}"]
        else:
            res2 = r.json()
            print(f"Top-level keys ({len(res2)}): {sorted(res2.keys())}")
            fails = validate_schema(res2, "BODY")
            overall["body_endpoint"] = fails
            if fails:
                print(f"\n❌ BODY endpoint {len(fails)} failures:")
                for f in fails:
                    print(f"   - {f}")
            else:
                print("✅ BODY endpoint: ALL FIELDS PRESENT & CORRECT TYPES")
    except Exception as e:
        print(f"EXCEPTION: {e!r}")
        overall["body_endpoint"] = [f"Exception: {e!r}"]

    # ---- Summary ----
    print("\n" + "=" * 70)
    print("FINAL SUMMARY")
    print("=" * 70)
    for label, fails in overall.items():
        if fails:
            print(f"❌ {label}: {len(fails)} failures")
        else:
            print(f"✅ {label}: PASS")

    all_pass = all(not f for f in overall.values())
    return 0 if all_pass else 1


if __name__ == "__main__":
    sys.exit(main())

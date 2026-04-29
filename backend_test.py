"""Smoke tests for new server-side passcode auth endpoints (iteration 23).

Tests both /api/* and /api/v1/* paths since the v1 middleware mirrors them.
"""
import os
import sys
import json
import time
import requests
import jwt as pyjwt
from datetime import datetime, timezone

BASE = os.environ.get(
    "BACKEND_URL",
    "https://lending-hub-63.preview.emergentagent.com",
).rstrip("/")

V1 = f"{BASE}/api/v1"
LEGACY = f"{BASE}/api"

MOBILE = "9876543210"
NEW_MOBILE = "9000000001"

results = []


def record(name, ok, detail=""):
    icon = "PASS" if ok else "FAIL"
    line = f"[{icon}] {name}"
    if detail:
        line += f" — {detail}"
    print(line)
    results.append((ok, name, detail))


def jpost(url, body, token=None, expect=None):
    headers = {"Content-Type": "application/json"}
    if token:
        headers["Authorization"] = f"Bearer {token}"
    r = requests.post(url, json=body, headers=headers, timeout=30)
    return r


def jget(url, token=None):
    headers = {}
    if token:
        headers["Authorization"] = f"Bearer {token}"
    r = requests.get(url, headers=headers, timeout=30)
    return r


# ============================================================
# 1. Initial /has-passcode probe (no passcode set yet)
# ============================================================
def test_1_has_passcode_initial():
    # Reset: clear passcode_hash for the user if exists (simulate fresh state)
    # We can't directly hit DB so we'll just validate the response shape.
    r = jget(f"{V1}/auth/has-passcode?mobile={MOBILE}")
    if r.status_code != 200:
        record("1. GET /api/v1/auth/has-passcode initial", False, f"status={r.status_code} body={r.text[:200]}")
        return False
    data = r.json()
    ok = data.get("mobile") == MOBILE and "has_passcode" in data and isinstance(data["has_passcode"], bool)
    record("1. GET /api/v1/auth/has-passcode initial shape", ok,
           f"data={data}")

    # also test unknown mobile -> 200, has_passcode False (no enumeration)
    r2 = jget(f"{V1}/auth/has-passcode?mobile=9999999999")
    ok2 = r2.status_code == 200 and r2.json().get("has_passcode") is False
    record("1b. has-passcode for unknown mobile returns 200 has_passcode=false", ok2,
           f"status={r2.status_code} body={r2.text[:200]}")
    return True


# ============================================================
# 2. End-to-end happy path
# ============================================================
def test_2_happy_path():
    # 2a. send-otp login
    r = jpost(f"{V1}/auth/send-otp", {"mobile": MOBILE, "purpose": "login"})
    if r.status_code != 200:
        record("2a. send-otp login", False, f"status={r.status_code} body={r.text[:200]}")
        return None
    demo_otp = r.json().get("demo_otp")
    record("2a. send-otp login returned demo_otp", bool(demo_otp), f"otp={demo_otp}")

    # 2b. verify-otp
    r = jpost(f"{V1}/auth/verify-otp", {"mobile": MOBILE, "otp": demo_otp})
    if r.status_code != 200:
        record("2b. verify-otp", False, f"status={r.status_code} body={r.text[:200]}")
        return None
    body = r.json()
    has_pc_field = "has_passcode" in body and isinstance(body["has_passcode"], bool)
    token = body.get("access_token")
    record("2b. verify-otp 200 includes has_passcode bool + access_token",
           has_pc_field and bool(token),
           f"has_passcode={body.get('has_passcode')} token_len={len(token) if token else 0}")

    # Initially has_passcode should be False (assuming fresh state). Note: db may already have one
    # from prior test runs. We reset via reset-passcode below if needed.

    # 2c. set-passcode
    r = jpost(f"{V1}/auth/set-passcode", {"passcode": "1234"}, token=token)
    if r.status_code != 200:
        record("2c. set-passcode 1234", False, f"status={r.status_code} body={r.text[:200]}")
        return None
    sd = r.json()
    record("2c. set-passcode 1234 → ok=true,has_passcode=true",
           sd.get("ok") is True and sd.get("has_passcode") is True,
           f"resp={sd}")

    # 2d. has-passcode now returns true
    r = jget(f"{V1}/auth/has-passcode?mobile={MOBILE}")
    record("2d. has-passcode now true",
           r.status_code == 200 and r.json().get("has_passcode") is True,
           f"resp={r.text[:200]}")

    # 2e. passcode-login with correct code
    r = jpost(f"{V1}/auth/passcode-login", {"mobile": MOBILE, "passcode": "1234"})
    pl = r.json() if r.status_code == 200 else {}
    new_token = pl.get("access_token")
    user = pl.get("user")
    record("2e. passcode-login 1234 → 200 + access_token + user",
           r.status_code == 200 and bool(new_token) and bool(user),
           f"status={r.status_code} body_keys={list(pl.keys()) if pl else r.text[:120]}")

    # 2f. passcode-login with wrong code
    r = jpost(f"{V1}/auth/passcode-login", {"mobile": MOBILE, "passcode": "0000"})
    detail = ""
    try:
        detail = r.json().get("detail", "")
    except Exception:
        detail = r.text[:200]
    record("2f. passcode-login 0000 → 401 'Invalid mobile or passcode.'",
           r.status_code == 401 and "Invalid mobile or passcode" in detail,
           f"status={r.status_code} detail={detail!r}")

    return new_token or token


# ============================================================
# 3. Validation cases
# ============================================================
def test_3_validation(token):
    # 3a. set-passcode with non-4-digit body "12"
    r = jpost(f"{V1}/auth/set-passcode", {"passcode": "12"}, token=token)
    record("3a. set-passcode '12' → 400",
           r.status_code == 400,
           f"status={r.status_code} body={r.text[:200]}")

    # 3b. set-passcode without Authorization header
    r = requests.post(f"{V1}/auth/set-passcode", json={"passcode": "1234"}, timeout=15)
    record("3b. set-passcode without Authorization → 401",
           r.status_code == 401,
           f"status={r.status_code} body={r.text[:200]}")

    # 3c. passcode-login with passcode="abc"
    r = jpost(f"{V1}/auth/passcode-login", {"mobile": MOBILE, "passcode": "abc"})
    record("3c. passcode-login passcode='abc' → 400",
           r.status_code == 400,
           f"status={r.status_code} body={r.text[:200]}")


# ============================================================
# 4. Forgot/reset flow
# ============================================================
def test_4_reset_flow():
    # 4a. send-otp purpose=reset
    r = jpost(f"{V1}/auth/send-otp", {"mobile": MOBILE, "purpose": "reset"})
    if r.status_code != 200:
        record("4a. send-otp reset", False, f"status={r.status_code} body={r.text[:200]}")
        return
    demo_otp = r.json().get("demo_otp")
    record("4a. send-otp reset returned demo_otp", bool(demo_otp), f"otp={demo_otp}")

    # 4b. reset-passcode with new code 5678
    r = jpost(f"{V1}/auth/reset-passcode",
              {"mobile": MOBILE, "otp": demo_otp, "passcode": "5678"})
    if r.status_code != 200:
        record("4b. reset-passcode → 200", False, f"status={r.status_code} body={r.text[:200]}")
        return
    body = r.json()
    record("4b. reset-passcode 200 returns access_token + user + has_passcode=true",
           bool(body.get("access_token")) and bool(body.get("user")) and body.get("has_passcode") is True,
           f"keys={list(body.keys())} has_passcode={body.get('has_passcode')}")

    # 4c. old passcode 1234 must NOT work
    r = jpost(f"{V1}/auth/passcode-login", {"mobile": MOBILE, "passcode": "1234"})
    record("4c. old passcode 1234 → 401",
           r.status_code == 401,
           f"status={r.status_code} body={r.text[:200]}")

    # 4d. new passcode 5678 works
    r = jpost(f"{V1}/auth/passcode-login", {"mobile": MOBILE, "passcode": "5678"})
    record("4d. new passcode 5678 → 200",
           r.status_code == 200 and bool(r.json().get("access_token")),
           f"status={r.status_code} body_keys={list(r.json().keys()) if r.status_code==200 else r.text[:200]}")


# ============================================================
# 5. JWT lifetime (~30 days)
# ============================================================
def test_5_jwt_lifetime():
    # passcode-login with new code 5678
    r = jpost(f"{V1}/auth/passcode-login", {"mobile": MOBILE, "passcode": "5678"})
    if r.status_code != 200:
        record("5. JWT lifetime check via passcode-login", False,
               f"login failed status={r.status_code}")
        return
    token = r.json().get("access_token")
    try:
        decoded = pyjwt.decode(token, options={"verify_signature": False})
    except Exception as e:
        record("5. decode JWT exp", False, f"decode error: {e}")
        return
    exp = decoded.get("exp")
    iat = decoded.get("iat")
    now_ts = int(datetime.now(timezone.utc).timestamp())
    delta_days = (exp - now_ts) / 86400.0
    # tolerance: between 29.5 and 30.5 days
    ok = 29.5 <= delta_days <= 30.5
    record("5. JWT exp roughly 30 days from now",
           ok,
           f"exp={exp} iat={iat} now={now_ts} delta_days={delta_days:.4f}")


# ============================================================
# 6. Regression: signup flow for brand-new mobile
# ============================================================
def test_6_signup_regression():
    # Try signup for 9000000001
    r = jpost(f"{V1}/auth/send-otp",
              {"mobile": NEW_MOBILE, "purpose": "signup", "name": "Test User"})
    if r.status_code == 400 and "already" in r.text.lower():
        # Already registered from earlier run; switch to login flow to confirm token works
        record("6a. signup send-otp (mobile already exists, falling back to login)",
               True, f"status=400 already-registered; trying login")
        r = jpost(f"{V1}/auth/send-otp", {"mobile": NEW_MOBILE, "purpose": "login"})
        if r.status_code != 200:
            record("6. signup-regression login fallback failed", False,
                   f"status={r.status_code} body={r.text[:200]}")
            return
        otp = r.json().get("demo_otp")
        r = jpost(f"{V1}/auth/verify-otp", {"mobile": NEW_MOBILE, "otp": otp})
        record("6b. verify-otp login (existing) → 200 with access_token + has_passcode bool",
               r.status_code == 200 and "access_token" in r.json() and isinstance(r.json().get("has_passcode"), bool),
               f"status={r.status_code} keys={list(r.json().keys()) if r.status_code==200 else r.text[:200]}")
        return
    if r.status_code != 200:
        record("6a. signup send-otp", False, f"status={r.status_code} body={r.text[:200]}")
        return
    otp = r.json().get("demo_otp")
    record("6a. signup send-otp → demo_otp", bool(otp), f"otp={otp}")
    r = jpost(f"{V1}/auth/verify-otp", {"mobile": NEW_MOBILE, "otp": otp})
    if r.status_code != 200:
        record("6b. signup verify-otp", False, f"status={r.status_code} body={r.text[:200]}")
        return
    body = r.json()
    record("6b. signup verify-otp → 200 with access_token + user + has_passcode bool",
           bool(body.get("access_token")) and bool(body.get("user")) and isinstance(body.get("has_passcode"), bool),
           f"user_id={body.get('user',{}).get('user_id')} mobile={body.get('user',{}).get('mobile')} has_passcode={body.get('has_passcode')}")


# ============================================================
# Bonus: confirm /api/* legacy paths also work for these endpoints
# ============================================================
def test_legacy_alias_smoke():
    r = jget(f"{LEGACY}/auth/has-passcode?mobile={MOBILE}")
    record("L1. /api/auth/has-passcode (legacy) works",
           r.status_code == 200 and "has_passcode" in r.json(),
           f"status={r.status_code} body={r.text[:200]}")


def main():
    print(f"BASE={BASE}")
    print(f"V1={V1}")
    print()
    test_1_has_passcode_initial()
    token = test_2_happy_path()
    if token:
        test_3_validation(token)
    test_4_reset_flow()
    test_5_jwt_lifetime()
    test_6_signup_regression()
    test_legacy_alias_smoke()

    print()
    fails = [(n, d) for ok, n, d in results if not ok]
    print(f"\n=== TOTAL: {len(results)}  PASS: {sum(1 for ok,_,_ in results if ok)}  FAIL: {len(fails)} ===")
    for n, d in fails:
        print(f"  FAIL → {n} :: {d}")
    return 0 if not fails else 1


if __name__ == "__main__":
    sys.exit(main())

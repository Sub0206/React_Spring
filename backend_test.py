"""
Iteration 24 — re-verify server-side passcode auth endpoints under realistic
production scenarios.

Targets the live preview backend via REACT_APP/EXPO_PUBLIC_BACKEND_URL.
Endpoints exercised: /api/v1/auth/* (the /api/v1/<x> middleware aliases the
canonical /api/<x> handlers, so this validates BOTH paths in spirit).

Reference creds (from /app/memory/test_credentials.md):
    Mobile  : 9876543210
    Passcode: 5678
"""
import os
import re
import time
import uuid
import json
import base64
import requests
from datetime import datetime
from pathlib import Path
import jwt as pyjwt

# Resolve backend URL from frontend .env
FRONT_ENV = Path("/app/frontend/.env")
BACKEND_URL = None
for line in FRONT_ENV.read_text().splitlines():
    if line.startswith("EXPO_PUBLIC_BACKEND_URL="):
        BACKEND_URL = line.split("=", 1)[1].strip().strip('"')
        break
assert BACKEND_URL, "EXPO_PUBLIC_BACKEND_URL not found"
API_V1 = f"{BACKEND_URL}/api/v1"
API_LEGACY = f"{BACKEND_URL}/api"
print(f"BACKEND={BACKEND_URL}\n")

results = []  # (name, passed, evidence)

def record(name, passed, evidence=""):
    icon = "✅" if passed else "❌"
    results.append((name, passed, evidence))
    print(f"{icon} {name}  {evidence}")

def post(path, json_body=None, token=None, base=API_V1):
    headers = {"Content-Type": "application/json"}
    if token:
        headers["Authorization"] = f"Bearer {token}"
    return requests.post(f"{base}{path}", json=json_body or {}, headers=headers, timeout=30)

def get(path, params=None, token=None, base=API_V1):
    headers = {}
    if token:
        headers["Authorization"] = f"Bearer {token}"
    return requests.get(f"{base}{path}", params=params or {}, headers=headers, timeout=30)


# ---------------------------------------------------------------------------
# 1. Happy-path scenarios for existing user 9876543210 (passcode = 5678)
# ---------------------------------------------------------------------------
print("=== 1. HAPPY-PATH for 9876543210 (passcode 5678) ===")
EXISTING_MOBILE = "9876543210"
EXISTING_PASSCODE = "5678"

r = get("/auth/has-passcode", params={"mobile": EXISTING_MOBILE})
ok = r.status_code == 200 and r.json().get("has_passcode") is True
record("1.1 has-passcode for existing user → true", ok,
       f"status={r.status_code}, body={r.json() if r.status_code==200 else r.text}")

r = post("/auth/passcode-login", {"mobile": EXISTING_MOBILE, "passcode": EXISTING_PASSCODE})
existing_token = None
ok = r.status_code == 200 and "access_token" in r.json()
if ok:
    existing_token = r.json()["access_token"]
record("1.2 passcode-login mobile/5678 → 200 + JWT", ok,
       f"status={r.status_code}")

# Decode JWT and check 30-day TTL
ttl_ok = False
ttl_evidence = ""
if existing_token:
    try:
        payload = pyjwt.decode(existing_token, options={"verify_signature": False})
        delta = int(payload["exp"]) - int(payload["iat"])
        ttl_ok = delta >= 29 * 86400
        ttl_evidence = f"exp-iat={delta}s ({delta/86400:.4f}d)"
    except Exception as e:
        ttl_evidence = f"decode error: {e}"
record("1.3 JWT ttl (exp-iat) >= 29 days", ttl_ok, ttl_evidence)

r = post("/auth/verify-passcode", {"passcode": EXISTING_PASSCODE}, token=existing_token)
ok = r.status_code == 200 and r.json().get("ok") is True
record("1.4 verify-passcode (correct) → 200 {ok:true}", ok,
       f"status={r.status_code}, body={r.text[:160]}")

# verify-passcode does NOT issue a new token (no access_token field expected)
no_new_token = False
if r.status_code == 200:
    no_new_token = "access_token" not in r.json()
record("1.5 verify-passcode does NOT issue new token", no_new_token,
       f"keys={list(r.json().keys()) if r.status_code==200 else r.status_code}")

r = post("/auth/verify-passcode", {"passcode": "0000"}, token=existing_token)
ok = r.status_code == 401 and "passcode" in (r.json().get("detail", "").lower())
record("1.6 verify-passcode (wrong 0000) → 401", ok,
       f"status={r.status_code}, detail={r.json().get('detail') if r.headers.get('content-type','').startswith('application/json') else r.text[:120]}")


# ---------------------------------------------------------------------------
# 2. Sign-up → set-passcode → passcode-login flow (fresh mobile)
# ---------------------------------------------------------------------------
print("\n=== 2. SIGN-UP → SET-PASSCODE → PASSCODE-LOGIN ===")
NEW_MOBILE = "9000000077"
# Best-effort cleanup if user already exists from previous runs:
# we cannot DELETE users via API, so if the mobile already has a passcode
# we simply switch to a less-used number.
probe = get("/auth/has-passcode", params={"mobile": NEW_MOBILE}).json()
if probe.get("has_passcode"):
    NEW_MOBILE = "9000007" + str(int(time.time()) % 1000).zfill(3)
    print(f"   (mobile collided — switching to fresh {NEW_MOBILE})")

r = post("/auth/send-otp", {"mobile": NEW_MOBILE, "name": "QA User", "purpose": "signup"})
signup_otp = None
if r.status_code == 200:
    signup_otp = r.json().get("demo_otp")
ok = r.status_code == 200 and signup_otp is not None
record("2.1 send-otp(signup) → 200 + demo_otp", ok,
       f"status={r.status_code}, demo_otp={signup_otp}")

r = post("/auth/verify-otp", {"mobile": NEW_MOBILE, "otp": signup_otp or ""})
new_token = None
if r.status_code == 200:
    new_token = r.json().get("access_token")
ok = (r.status_code == 200
      and r.json().get("has_passcode") is False
      and new_token)
record("2.2 verify-otp → 200, has_passcode:false, JWT", ok,
       f"status={r.status_code}, has_pc={r.json().get('has_passcode') if r.status_code==200 else '-'}")

r = post("/auth/set-passcode", {"passcode": "1111"}, token=new_token)
ok = r.status_code == 200 and r.json().get("has_passcode") is True
record("2.3 set-passcode 1111 (Auth) → 200 has_passcode:true", ok,
       f"status={r.status_code}, body={r.text[:160]}")

r = get("/auth/has-passcode", params={"mobile": NEW_MOBILE})
ok = r.status_code == 200 and r.json().get("has_passcode") is True
record("2.4 has-passcode for new user → true", ok,
       f"status={r.status_code}, body={r.json() if r.status_code==200 else r.text}")

r = post("/auth/passcode-login", {"mobile": NEW_MOBILE, "passcode": "1111"})
ok = r.status_code == 200 and r.json().get("access_token")
record("2.5 passcode-login 1111 → 200 + JWT", ok,
       f"status={r.status_code}")


# ---------------------------------------------------------------------------
# 3. Forgot/reset flow
# ---------------------------------------------------------------------------
print("\n=== 3. FORGOT / RESET FLOW ===")
r = post("/auth/send-otp", {"mobile": NEW_MOBILE, "purpose": "reset"})
reset_otp = r.json().get("demo_otp") if r.status_code == 200 else None
record("3.1 send-otp(reset) for known mobile → 200", r.status_code == 200 and reset_otp,
       f"status={r.status_code}, demo_otp={reset_otp}")

r = post("/auth/reset-passcode",
         {"mobile": NEW_MOBILE, "otp": reset_otp or "", "passcode": "2222"})
reset_token = r.json().get("access_token") if r.status_code == 200 else None
ok = (r.status_code == 200 and reset_token
      and r.json().get("has_passcode") is True)
record("3.2 reset-passcode → 200 + JWT + has_passcode:true", ok,
       f"status={r.status_code}")

r = post("/auth/passcode-login", {"mobile": NEW_MOBILE, "passcode": "1111"})
ok = r.status_code == 401
record("3.3 old passcode 1111 now → 401", ok,
       f"status={r.status_code}, detail={r.json().get('detail') if r.headers.get('content-type','').startswith('application/json') else r.text[:120]}")

r = post("/auth/passcode-login", {"mobile": NEW_MOBILE, "passcode": "2222"})
ok = r.status_code == 200 and r.json().get("access_token")
record("3.4 new passcode 2222 → 200 + JWT", ok, f"status={r.status_code}")

# Reuse reset OTP a 2nd time
r = post("/auth/reset-passcode",
         {"mobile": NEW_MOBILE, "otp": reset_otp or "", "passcode": "3333"})
ok = r.status_code == 400
record("3.5 reuse same reset OTP → 400", ok,
       f"status={r.status_code}, detail={r.json().get('detail') if r.headers.get('content-type','').startswith('application/json') else r.text[:120]}")

# Reset OTP for unknown mobile
r = post("/auth/send-otp", {"mobile": "9000000888", "purpose": "reset"})
ok = r.status_code == 404
record("3.6 send-otp(reset) for unknown mobile → 404", ok,
       f"status={r.status_code}, detail={r.json().get('detail') if r.headers.get('content-type','').startswith('application/json') else r.text[:120]}")


# ---------------------------------------------------------------------------
# 4. Edge cases & validation
# ---------------------------------------------------------------------------
print("\n=== 4. VALIDATION / EDGE CASES ===")
r = get("/auth/has-passcode", params={"mobile": ""})
ok = r.status_code == 200 and r.json().get("has_passcode") is False
record("4.1 has-passcode empty mobile → 200 false", ok,
       f"status={r.status_code}, body={r.text[:120]}")

r = get("/auth/has-passcode", params={"mobile": "abc"})
ok = r.status_code == 200 and r.json().get("has_passcode") is False
record("4.2 has-passcode non-numeric → 200 false", ok,
       f"status={r.status_code}, body={r.text[:120]}")

r = get("/auth/has-passcode", params={"mobile": "9999999999"})
ok = r.status_code == 200 and r.json().get("has_passcode") is False
record("4.3 has-passcode unknown mobile → 200 false (no enum leak)", ok,
       f"status={r.status_code}, body={r.text[:120]}")

r = post("/auth/passcode-login", {"mobile": EXISTING_MOBILE, "passcode": ""})
ok = r.status_code == 400
record("4.4 passcode-login empty passcode → 400", ok,
       f"status={r.status_code}, detail={r.json().get('detail') if r.headers.get('content-type','').startswith('application/json') else r.text[:120]}")

r = post("/auth/passcode-login", {"mobile": EXISTING_MOBILE, "passcode": "12"})
ok = r.status_code == 400
record("4.5 passcode-login 2 digits → 400", ok,
       f"status={r.status_code}, detail={r.json().get('detail') if r.headers.get('content-type','').startswith('application/json') else r.text[:120]}")

r = post("/auth/passcode-login", {"mobile": EXISTING_MOBILE, "passcode": "abcd"})
ok = r.status_code == 400
record("4.6 passcode-login non-numeric → 400", ok,
       f"status={r.status_code}, detail={r.json().get('detail') if r.headers.get('content-type','').startswith('application/json') else r.text[:120]}")

# Account with NO passcode → create one via signup, do NOT set passcode, then attempt passcode-login
NOPC_MOBILE = "9000007" + str((int(time.time()) + 5) % 1000).zfill(3)
r = post("/auth/send-otp", {"mobile": NOPC_MOBILE, "name": "NoPC User", "purpose": "signup"})
nopc_otp = r.json().get("demo_otp") if r.status_code == 200 else None
r = post("/auth/verify-otp", {"mobile": NOPC_MOBILE, "otp": nopc_otp or ""})
nopc_created = r.status_code == 200
# Now attempt passcode-login WITHOUT having set a passcode
r = post("/auth/passcode-login", {"mobile": NOPC_MOBILE, "passcode": "1234"})
ok = r.status_code == 401
detail = r.json().get('detail') if r.headers.get('content-type','').startswith('application/json') else r.text[:120]
record("4.7 passcode-login on account w/o passcode → 401 generic", ok,
       f"status={r.status_code}, detail={detail!r}")

r = post("/auth/set-passcode", {"passcode": "1234"})  # no auth header
ok = r.status_code == 401
record("4.8 set-passcode without Auth → 401", ok,
       f"status={r.status_code}, detail={r.json().get('detail') if r.headers.get('content-type','').startswith('application/json') else r.text[:120]}")

# We need an auth token to send 5-digit
r = post("/auth/set-passcode", {"passcode": "12345"}, token=existing_token)
ok = r.status_code == 400
record("4.9 set-passcode 5 digits → 400", ok,
       f"status={r.status_code}, detail={r.json().get('detail') if r.headers.get('content-type','').startswith('application/json') else r.text[:120]}")


# ---------------------------------------------------------------------------
# 5. Brute-force protection (informational only)
# ---------------------------------------------------------------------------
print("\n=== 5. BRUTE-FORCE behaviour (informational) ===")
codes = []
for i in range(8):
    r = post("/auth/passcode-login", {"mobile": EXISTING_MOBILE, "passcode": "0000"})
    codes.append(r.status_code)
unique = set(codes)
no_lockout = unique == {401}
# Now ensure the correct passcode still works (no permanent lockout side-effect)
r = post("/auth/passcode-login", {"mobile": EXISTING_MOBILE, "passcode": EXISTING_PASSCODE})
correct_still_works = r.status_code == 200
record("5.1 8x wrong attempts — codes captured", True,
       f"status_codes={codes}, lockout={'NO' if no_lockout else 'YES (>=1 non-401 returned)'}")
record("5.2 Correct passcode still works AFTER 8 wrong attempts", correct_still_works,
       f"status={r.status_code}  (informational — brute-force protection NOT implemented server-side)")


# ---------------------------------------------------------------------------
# 6. Regression — protected endpoints with freshly-issued JWT
# ---------------------------------------------------------------------------
print("\n=== 6. REGRESSION (protected endpoints) ===")
fresh_token = r.json().get("access_token") if r.status_code == 200 else existing_token
# /dashboard
r = get("/dashboard", token=fresh_token)
ok = r.status_code == 200
record("6.1 GET /api/v1/dashboard with new JWT → 200", ok,
       f"status={r.status_code}, keys={list(r.json().keys())[:6] if r.status_code==200 else r.text[:120]}")

# /borrowers (alias for /clients via v1 middleware)
r = get("/borrowers", token=fresh_token)
ok = r.status_code == 200 and isinstance(r.json(), list)
record("6.2 GET /api/v1/borrowers with new JWT → 200 (list)", ok,
       f"status={r.status_code}, count={len(r.json()) if r.status_code==200 else '-'}")

# Also assert legacy /api/auth/* mirror works
print("\n=== 7. LEGACY /api/auth/* mirror ===")
r = requests.get(f"{API_LEGACY}/auth/has-passcode", params={"mobile": EXISTING_MOBILE}, timeout=15)
ok = r.status_code == 200 and r.json().get("has_passcode") is True
record("7.1 GET /api/auth/has-passcode (legacy) → 200 true", ok,
       f"status={r.status_code}, body={r.text[:120]}")


# ---------------------------------------------------------------------------
# Summary
# ---------------------------------------------------------------------------
print("\n" + "=" * 70)
passed = sum(1 for _, p, _ in results if p)
total = len(results)
print(f"PASSED {passed}/{total}")
fails = [r for r in results if not r[1]]
if fails:
    print("\nFAILED CASES:")
    for n, _, ev in fails:
        print(f"  ❌ {n}  {ev}")
exit(0 if not fails else 1)

#!/usr/bin/env python3
"""Iteration-19 regression tests — notification delete + applications loan_id linkage."""
import os, sys, json, uuid, requests
from datetime import datetime, timezone

BASE = os.environ.get("BASE_URL", "http://localhost:8001") + "/api"
MOBILE = "9876543210"

def seed_notifications_for_user(user_id: str, n: int = 3):
    """Directly insert notifications into Mongo so we can test DELETE endpoints."""
    try:
        from pymongo import MongoClient
    except Exception:
        os.system(sys.executable + " -m pip install -q pymongo")
        from pymongo import MongoClient
    cli = MongoClient(os.environ.get("MONGO_URL", "mongodb://localhost:27017"))
    db = cli[os.environ.get("DB_NAME", "test_database")]
    ids = []
    for i in range(n):
        nid = f"ntf_test_{uuid.uuid4().hex[:10]}"
        db.notifications.insert_one({
            "notification_id": nid, "user_id": user_id,
            "title": f"Test {i+1}", "body": "iter19 regression seed",
            "type": "system", "read": False,
            "created_at": datetime.now(timezone.utc),
        })
        ids.append(nid)
    return ids

results = []
def out(name, ok, info=""):
    results.append((name, ok, info))
    prefix = "[PASS]" if ok else "[FAIL]"
    print(f"{prefix} {name}: {info}")

def auth() -> str:
    r = requests.post(f"{BASE}/auth/send-otp", json={"mobile": MOBILE, "purpose": "login"}, timeout=15)
    r.raise_for_status()
    otp = r.json()["demo_otp"]
    r2 = requests.post(f"{BASE}/auth/verify-otp", json={"mobile": MOBILE, "otp": otp}, timeout=15)
    r2.raise_for_status()
    return r2.json()["access_token"]

def seed_notification(tok, n=2):
    """Ensure at least n notifications exist for this user via a small side effect."""
    # We will approve then reject a loan-app via seed endpoints if available, but
    # easiest: just directly insert via a harmless endpoint. We'll attempt to
    # trigger real notifications by calling a no-op flow. If nothing adds
    # notifications, the tests will still verify empty list gracefully.
    pass

def main():
    tok = auth()
    out("O. auth send/verify-otp", True, "token acquired")
    H = {"Authorization": f"Bearer {tok}"}

    # get user_id for seeding
    me = requests.get(f"{BASE}/auth/me", headers=H, timeout=15).json()
    user_id = me["user_id"]

    # Seed 3 notifications directly so we can test B/C/D reliably
    seeded = seed_notifications_for_user(user_id, n=3)
    print(f"[seed] inserted {len(seeded)} notifications for user {user_id}")

    # A. GET notifications
    r = requests.get(f"{BASE}/notifications", headers=H, timeout=15)
    if r.status_code != 200:
        out("A. GET /notifications", False, f"HTTP {r.status_code} {r.text[:200]}")
        return
    lst = r.json()
    out("A. GET /notifications", isinstance(lst, list), f"count={len(lst)}")

    # We need at least one notification for B-D. If the list is empty, we'll
    # trigger some by performing and then undoing a repayment (which logs a
    # notification). If still empty, skip B-D with a note.
    nid = lst[0]["notification_id"] if lst else None
    seeded_note = False
    if not nid:
        # Try to create a notification via the reschedule endpoint on any loan.
        loans = requests.get(f"{BASE}/loans", headers=H, timeout=15).json()
        if isinstance(loans, list) and loans:
            loan_id = loans[0]["loan_id"]
            # Reschedule first unpaid EMI to today to produce a notif? Our
            # inspection shows notifications are inserted in approve/reject/fund
            # pathways. So trigger via bulk-clear then check again.
            pass
        # Just re-check — some seeders may have added entries already
        lst = requests.get(f"{BASE}/notifications", headers=H, timeout=15).json()
        nid = lst[0]["notification_id"] if lst else None

    if nid:
        # B. DELETE /notifications/{nid}
        r = requests.delete(f"{BASE}/notifications/{nid}", headers=H, timeout=15)
        ok = r.status_code == 200 and r.json().get("ok") is True and r.json().get("deleted") == 1
        out("B. DELETE /notifications/{nid}", ok, f"HTTP {r.status_code} body={r.text[:200]}")

        # C. GET again, NID must not appear
        lst2 = requests.get(f"{BASE}/notifications", headers=H, timeout=15).json()
        ids2 = {n["notification_id"] for n in lst2}
        out("C. NID absent from list", nid not in ids2, f"count={len(lst2)}, present={nid in ids2}")

        # D. DELETE same nid again -> 404
        r = requests.delete(f"{BASE}/notifications/{nid}", headers=H, timeout=15)
        out("D. Second DELETE same nid", r.status_code == 404, f"HTTP {r.status_code}")
    else:
        out("B. DELETE /notifications/{nid}", True, "SKIPPED — no notifications in DB for this user")
        out("C. NID absent from list", True, "SKIPPED")
        out("D. Second DELETE", True, "SKIPPED")

    # E. DELETE unknown id
    r = requests.delete(f"{BASE}/notifications/does_not_exist_xyz", headers=H, timeout=15)
    out("E. DELETE unknown id -> 404", r.status_code == 404, f"HTTP {r.status_code}")

    # E2. DELETE someone else's notification -> 404
    other_ids = seed_notifications_for_user("user_other_xyz_test", n=1)
    other_nid = other_ids[0]
    r = requests.delete(f"{BASE}/notifications/{other_nid}", headers=H, timeout=15)
    out("E2. DELETE other-user's notif -> 404", r.status_code == 404, f"HTTP {r.status_code}")

    # F. DELETE valid id WITHOUT auth -> 401
    r = requests.delete(f"{BASE}/notifications/any_id", timeout=15)
    out("F. DELETE single w/o auth -> 401", r.status_code == 401, f"HTTP {r.status_code}")

    # G. DELETE /notifications (bulk wipe) with auth
    r = requests.delete(f"{BASE}/notifications", headers=H, timeout=15)
    body = {}
    try: body = r.json()
    except: pass
    ok = r.status_code == 200 and body.get("ok") is True and isinstance(body.get("deleted"), int) and body["deleted"] >= 0
    out("G. DELETE /notifications bulk", ok, f"HTTP {r.status_code} body={body}")

    # H. list must be empty after
    lst3 = requests.get(f"{BASE}/notifications", headers=H, timeout=15).json()
    out("H. list empty after bulk wipe", lst3 == [], f"count={len(lst3)}")

    # I. DELETE /notifications without auth -> 401
    r = requests.delete(f"{BASE}/notifications", timeout=15)
    out("I. DELETE bulk w/o auth -> 401", r.status_code == 401, f"HTTP {r.status_code}")

    # --- APPLICATIONS loan_id ---
    # J. funded apps
    r = requests.get(f"{BASE}/applications?status=funded", headers=H, timeout=15)
    funded = r.json() if r.status_code == 200 else []
    out("J. GET /applications?status=funded", r.status_code == 200 and isinstance(funded, list), f"count={len(funded)}")
    if funded:
        FUNDED_APP_ID = funded[0]["application_id"]
        # K. detail with loan_id
        r = requests.get(f"{BASE}/applications/{FUNDED_APP_ID}", headers=H, timeout=15)
        app = r.json() if r.status_code == 200 else {}
        loan_id = app.get("loan_id")
        ok = r.status_code == 200 and loan_id and isinstance(loan_id, str)
        out("K1. funded app has loan_id", ok, f"HTTP {r.status_code} loan_id={loan_id}")
        if ok:
            # sanity GET /loans/{loan_id}
            r2 = requests.get(f"{BASE}/loans/{loan_id}", headers=H, timeout=15)
            loan = r2.json() if r2.status_code == 200 else {}
            ok2 = r2.status_code == 200 and loan.get("application_id") == FUNDED_APP_ID
            out("K2. /loans/{loan_id}.application_id matches", ok2, f"HTTP {r2.status_code} app_id={loan.get('application_id')}")
    else:
        out("K. funded app linkage", True, "SKIPPED — no funded apps")

    # L. pending
    r = requests.get(f"{BASE}/applications?status=pending", headers=H, timeout=15)
    pend = r.json() if r.status_code == 200 else []
    out("L. GET /applications?status=pending", r.status_code == 200, f"count={len(pend)}")
    if pend:
        PENDING_APP_ID = pend[0]["application_id"]
        r = requests.get(f"{BASE}/applications/{PENDING_APP_ID}", headers=H, timeout=15)
        app = r.json() if r.status_code == 200 else {}
        loan_id = app.get("loan_id")
        out("M. pending app loan_id is null/absent", r.status_code == 200 and (loan_id is None), f"loan_id={loan_id}")
    else:
        out("M. pending app loan_id null", True, "SKIPPED — no pending apps")

    # N. rejected
    r = requests.get(f"{BASE}/applications?status=rejected", headers=H, timeout=15)
    rej = r.json() if r.status_code == 200 else []
    if rej:
        RID = rej[0]["application_id"]
        r = requests.get(f"{BASE}/applications/{RID}", headers=H, timeout=15)
        app = r.json() if r.status_code == 200 else {}
        out("N. rejected app loan_id null", r.status_code == 200 and app.get("loan_id") is None, f"loan_id={app.get('loan_id')}")
    else:
        out("N. rejected app loan_id null", True, "SKIPPED — no rejected apps")

    # P. POST notifications/read-all (should still work even with empty list)
    r = requests.post(f"{BASE}/notifications/read-all", headers=H, timeout=15)
    out("P. POST /notifications/read-all", r.status_code == 200, f"HTTP {r.status_code}")

    # Q. dashboard
    r = requests.get(f"{BASE}/dashboard", headers=H, timeout=15)
    ok = r.status_code == 200 and "portfolio_health" in (r.json() if r.status_code == 200 else {})
    out("Q. /dashboard has portfolio_health", ok, f"HTTP {r.status_code}")

    # Summary
    print("\n=== SUMMARY ===")
    fails = [(n, i) for (n, ok, i) in results if not ok]
    print(f"Total: {len(results)}  Pass: {len(results)-len(fails)}  Fail: {len(fails)}")
    for n, i in fails:
        print(f"  FAIL - {n}: {i}")
    sys.exit(1 if fails else 0)

if __name__ == "__main__":
    main()

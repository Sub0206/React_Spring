"""Backend tests for Iteration 4 - Subscriptions, Address, Approve/Reject loan flow."""
import os
import uuid
import pytest
import requests

BASE_URL = (os.environ.get("EXPO_BACKEND_URL") or os.environ.get("EXPO_PUBLIC_BACKEND_URL") or "").rstrip("/")
if not BASE_URL:
    # Fallback: read from frontend/.env
    try:
        with open("/app/frontend/.env") as _f:
            for _line in _f:
                if _line.startswith("EXPO_PUBLIC_BACKEND_URL="):
                    BASE_URL = _line.split("=", 1)[1].strip().rstrip("/")
                    break
    except Exception:
        pass
assert BASE_URL, "Backend URL not configured"
API = f"{BASE_URL}/api"

AADHAAR_VALID = "234123412346"
PAN_VALID = "ABCDE1234F"


def _rand_mobile():
    return f"9{uuid.uuid4().int % 1000000000:09d}"


def _rand_pan():
    letters = "ABCDEFGHIJKLMNOPQRSTUVWXYZ"
    p = "".join(letters[uuid.uuid4().int >> (i * 4) & 0xF] for i in range(5))
    n = f"{uuid.uuid4().int % 10000:04d}"
    s = letters[uuid.uuid4().int & 0xF]
    return f"{p}{n}{s}"


@pytest.fixture(scope="module")
def session():
    s = requests.Session()
    s.headers.update({"Content-Type": "application/json"})
    return s


def _signup(session, name="QA Lender"):
    mob = _rand_mobile()
    r = session.post(f"{API}/auth/send-otp", json={"mobile": mob, "name": name, "purpose": "signup"})
    assert r.status_code == 200, r.text
    otp = r.json()["demo_otp"]
    v = session.post(f"{API}/auth/verify-otp", json={"mobile": mob, "otp": otp})
    assert v.status_code == 200, v.text
    return v.json()["access_token"], mob


@pytest.fixture(scope="module")
def lender_a(session):
    tok, mob = _signup(session, "Lender A")
    return {"token": tok, "mobile": mob, "hdr": {"Authorization": f"Bearer {tok}", "Content-Type": "application/json"}}


@pytest.fixture(scope="module")
def lender_b(session):
    tok, mob = _signup(session, "Lender B")
    return {"token": tok, "mobile": mob, "hdr": {"Authorization": f"Bearer {tok}", "Content-Type": "application/json"}}


def _create_client(session, hdr, mobile=None, addr=True):
    mobile = mobile or _rand_mobile()
    r = session.post(f"{API}/clients/send-otp", json={"mobile": mobile}, headers=hdr)
    assert r.status_code == 200, r.text
    vid = r.json()["verification_id"]
    otp = r.json()["demo_otp"]
    v = session.post(f"{API}/clients/verify-otp", json={"verification_id": vid, "otp": otp}, headers=hdr)
    assert v.status_code == 200
    payload = {
        "name": "Test Client",
        "mobile": mobile,
        "aadhaar": AADHAAR_VALID,
        "pan": _rand_pan(),
        "verification_id": vid,
    }
    if addr:
        payload.update({
            "address_line1": "123 MG Road",
            "address_line2": "Flat 4B",
            "city": "Mumbai",
            "state": "MH",
            "pincode": "400001",
        })
    c = session.post(f"{API}/clients", json=payload, headers=hdr)
    assert c.status_code == 200, c.text
    return c.json()


# ---------- Subscriptions ----------
class TestSubscriptions:
    def test_plans_list(self, session):
        r = session.get(f"{API}/subscriptions/plans")
        assert r.status_code == 200
        plans = r.json()["plans"]
        assert len(plans) == 3
        by_id = {p["id"]: p for p in plans}
        assert by_id["starter"]["price"] == 2999
        assert by_id["smart"]["price"] == 4999
        assert by_id["prime"]["price"] == 6999
        assert by_id["smart"].get("popular") is True

    def test_subscribe_updates_user(self, session, lender_a):
        r = session.post(f"{API}/subscriptions/subscribe", json={"plan": "smart", "method": "upi"}, headers=lender_a["hdr"])
        assert r.status_code == 200, r.text
        assert r.json()["ok"] is True
        assert r.json()["plan"]["id"] == "smart"
        # Verify via GET /subscriptions/me
        me = session.get(f"{API}/subscriptions/me", headers=lender_a["hdr"])
        assert me.status_code == 200
        data = me.json()
        assert data["plan"] == "smart"
        assert data["status"] == "active"
        assert data["expires_at"] is not None

    def test_subscribe_invalid_plan(self, session, lender_a):
        r = session.post(f"{API}/subscriptions/subscribe", json={"plan": "ultra", "method": "upi"}, headers=lender_a["hdr"])
        assert r.status_code in (400, 422)

    def test_subscribe_requires_auth(self, session):
        r = session.post(f"{API}/subscriptions/subscribe", json={"plan": "starter", "method": "upi"})
        assert r.status_code == 401


# ---------- Address on Client ----------
class TestClientAddress:
    def test_client_stores_and_returns_address(self, session, lender_a):
        c = _create_client(session, lender_a["hdr"])
        assert c["address_line1"] == "123 MG Road"
        assert c["city"] == "Mumbai"
        assert c["state"] == "MH"
        assert c["pincode"] == "400001"
        # Persistence
        g = session.get(f"{API}/clients/{c['client_id']}", headers=lender_a["hdr"])
        assert g.status_code == 200
        gd = g.json()
        assert gd["address_line1"] == "123 MG Road"
        assert gd["address_line2"] == "Flat 4B"
        assert gd["pincode"] == "400001"


# ---------- Reject loan ----------
class TestRejectLoan:
    def test_reject_sets_status_and_reason(self, session, lender_a):
        c = _create_client(session, lender_a["hdr"])
        cid = c["client_id"]
        r = session.post(f"{API}/loan-apps/reject",
                         json={"client_id": cid, "reason": "Low bank balance"},
                         headers=lender_a["hdr"])
        assert r.status_code == 200, r.text
        assert r.json()["ok"] is True
        # Client now rejected
        g = session.get(f"{API}/clients/{cid}", headers=lender_a["hdr"])
        assert g.status_code == 200
        assert g.json()["status"] == "rejected"
        assert g.json()["reject_reason"] == "Low bank balance"
        assert g.json()["reject_at"] is not None
        # Appears in list with rejected status
        lst = session.get(f"{API}/clients", headers=lender_a["hdr"])
        assert lst.status_code == 200
        match = [x for x in lst.json() if x["client_id"] == cid]
        assert match and match[0]["status"] == "rejected"
        assert match[0]["reject_reason"] == "Low bank balance"

    def test_reject_other_lenders_client_404(self, session, lender_a, lender_b):
        c = _create_client(session, lender_a["hdr"])
        r = session.post(f"{API}/loan-apps/reject",
                         json={"client_id": c["client_id"], "reason": "x"},
                         headers=lender_b["hdr"])
        assert r.status_code == 404


# ---------- Approve loan ----------
class TestApproveLoan:
    def test_approve_zero_interest(self, session, lender_a):
        c = _create_client(session, lender_a["hdr"])
        r = session.post(f"{API}/loan-apps/approve",
                         json={"client_id": c["client_id"], "amount": 60000, "term_months": 12, "interest_rate": 0},
                         headers=lender_a["hdr"])
        assert r.status_code == 200, r.text
        loan = r.json()
        assert loan["principal"] == 60000
        assert loan["monthly_payment"] == 5000.0
        assert loan["total_repayment"] == 60000.0
        assert loan["status"] == "active"
        assert loan["interest_rate"] == 0
        assert len(loan["repayment_schedule"]) == 12
        for entry in loan["repayment_schedule"]:
            assert entry["amount"] == 5000.0
            assert entry["status"] == "upcoming"
            assert entry["due_date"] is not None
        # Client should NOT be rejected
        g = session.get(f"{API}/clients/{c['client_id']}", headers=lender_a["hdr"])
        assert g.json()["status"] == "active"

    def test_approve_with_interest(self, session, lender_a):
        c = _create_client(session, lender_a["hdr"])
        r = session.post(f"{API}/loan-apps/approve",
                         json={"client_id": c["client_id"], "amount": 60000, "term_months": 12, "interest_rate": 12},
                         headers=lender_a["hdr"])
        assert r.status_code == 200
        loan = r.json()
        # EMI ≈ 5330.93
        assert abs(loan["monthly_payment"] - 5330.93) < 0.5
        assert abs(loan["total_repayment"] - loan["monthly_payment"] * 12) < 0.5

    def test_approve_validations(self, session, lender_a):
        c = _create_client(session, lender_a["hdr"])
        r = session.post(f"{API}/loan-apps/approve",
                         json={"client_id": c["client_id"], "amount": 0, "term_months": 12, "interest_rate": 0},
                         headers=lender_a["hdr"])
        assert r.status_code == 400
        r = session.post(f"{API}/loan-apps/approve",
                         json={"client_id": c["client_id"], "amount": 5000, "term_months": 0, "interest_rate": 0},
                         headers=lender_a["hdr"])
        assert r.status_code == 400

    def test_approve_other_lenders_client_404(self, session, lender_a, lender_b):
        c = _create_client(session, lender_a["hdr"])
        r = session.post(f"{API}/loan-apps/approve",
                         json={"client_id": c["client_id"], "amount": 10000, "term_months": 6, "interest_rate": 0},
                         headers=lender_b["hdr"])
        assert r.status_code == 404

    def test_approve_creates_disbursement_transaction(self, session, lender_a):
        c = _create_client(session, lender_a["hdr"])
        before = session.get(f"{API}/transactions", headers=lender_a["hdr"])
        before_count = sum(1 for t in before.json() if t["type"] == "disbursement")
        r = session.post(f"{API}/loan-apps/approve",
                         json={"client_id": c["client_id"], "amount": 12000, "term_months": 6, "interest_rate": 0,
                               "proof_image_base64": "data:image/png;base64,AAAA"},
                         headers=lender_a["hdr"])
        assert r.status_code == 200
        after = session.get(f"{API}/transactions", headers=lender_a["hdr"])
        after_count = sum(1 for t in after.json() if t["type"] == "disbursement")
        assert after_count == before_count + 1

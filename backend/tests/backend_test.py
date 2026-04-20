"""Backend API tests for Smart Lending App - Iteration 2 (Mobile+OTP auth + Clients)."""
import os
import uuid
import pytest
import requests

# Frontend uses EXPO_PUBLIC_BACKEND_URL; honour either env var for CI.
BASE_URL = (
    os.environ.get("EXPO_BACKEND_URL")
    or os.environ.get("EXPO_PUBLIC_BACKEND_URL")
    or "https://lending-hub-63.preview.emergentagent.com"
).rstrip("/")
API = f"{BASE_URL}/api"

LENDER_A_MOBILE = "9876543210"
LENDER_A_NAME = "Demo Lender"
LENDER_B_MOBILE = "9123456780"
LENDER_B_NAME = "Second Lender"
CLIENT_MOBILE = "9998887777"
AADHAAR_VALID = "234123412346"      # valid Verhoeff
AADHAAR_INVALID = "234123412345"    # invalid Verhoeff
PAN_VALID = "ABCDE1234F"
PAN_INVALID = "ABC123"


@pytest.fixture(scope="session")
def session():
    s = requests.Session()
    s.headers.update({"Content-Type": "application/json"})
    return s


def _signup_lender(session, mobile, name):
    r = session.post(f"{API}/auth/send-otp", json={"mobile": mobile, "name": name, "purpose": "signup"})
    if r.status_code == 400 and "already registered" in r.text.lower():
        r2 = session.post(f"{API}/auth/send-otp", json={"mobile": mobile, "purpose": "login"})
        otp = r2.json()["demo_otp"]
    else:
        assert r.status_code == 200, r.text
        otp = r.json()["demo_otp"]
    v = session.post(f"{API}/auth/verify-otp", json={"mobile": mobile, "otp": otp})
    assert v.status_code == 200, v.text
    return v.json()["access_token"]


@pytest.fixture(scope="session")
def lender_a_token(session):
    return _signup_lender(session, LENDER_A_MOBILE, LENDER_A_NAME)


@pytest.fixture(scope="session")
def lender_b_token(session):
    return _signup_lender(session, LENDER_B_MOBILE, LENDER_B_NAME)


@pytest.fixture(scope="session")
def hdr_a(lender_a_token):
    return {"Authorization": f"Bearer {lender_a_token}", "Content-Type": "application/json"}


@pytest.fixture(scope="session")
def hdr_b(lender_b_token):
    return {"Authorization": f"Bearer {lender_b_token}", "Content-Type": "application/json"}


# ---------- Auth: Mobile + OTP ----------
class TestAuthOTP:
    def test_send_otp_signup_returns_demo_otp(self, session):
        mobile = f"90000{uuid.uuid4().int % 100000:05d}"
        r = session.post(f"{API}/auth/send-otp", json={"mobile": mobile, "name": "QA User", "purpose": "signup"})
        assert r.status_code == 200, r.text
        data = r.json()
        assert data.get("demo_otp") and len(data["demo_otp"]) == 6
        assert data["mobile"] == mobile

    def test_verify_otp_issues_token_and_persists_user(self, session):
        mobile = f"91111{uuid.uuid4().int % 100000:05d}"
        r = session.post(f"{API}/auth/send-otp", json={"mobile": mobile, "name": "Persist User", "purpose": "signup"})
        otp = r.json()["demo_otp"]
        v = session.post(f"{API}/auth/verify-otp", json={"mobile": mobile, "otp": otp})
        assert v.status_code == 200, v.text
        body = v.json()
        assert body["access_token"]
        assert body["user"]["mobile"] == mobile
        assert body["user"]["name"] == "Persist User"
        # GET /auth/me verifies persistence
        me = session.get(f"{API}/auth/me", headers={"Authorization": f"Bearer {body['access_token']}"})
        assert me.status_code == 200
        assert me.json()["mobile"] == mobile

    def test_login_existing_user_with_purpose_login(self, session, lender_a_token):
        r = session.post(f"{API}/auth/send-otp", json={"mobile": LENDER_A_MOBILE, "purpose": "login"})
        assert r.status_code == 200, r.text
        otp = r.json()["demo_otp"]
        v = session.post(f"{API}/auth/verify-otp", json={"mobile": LENDER_A_MOBILE, "otp": otp})
        assert v.status_code == 200
        assert v.json()["user"]["mobile"] == LENDER_A_MOBILE

    def test_send_otp_invalid_mobile_returns_400(self, session):
        r = session.post(f"{API}/auth/send-otp", json={"mobile": "12345", "purpose": "login"})
        assert r.status_code == 400

    def test_login_unregistered_mobile_returns_404(self, session):
        r = session.post(f"{API}/auth/send-otp", json={"mobile": "9000000001", "purpose": "login"})
        assert r.status_code == 404

    def test_verify_wrong_otp_returns_400(self, session):
        mobile = f"92222{uuid.uuid4().int % 100000:05d}"
        session.post(f"{API}/auth/send-otp", json={"mobile": mobile, "name": "x", "purpose": "signup"})
        v = session.post(f"{API}/auth/verify-otp", json={"mobile": mobile, "otp": "000000"})
        assert v.status_code == 400

    def test_me_without_token_401(self, session):
        r = session.get(f"{API}/auth/me")
        assert r.status_code == 401


# ---------- Client KYC validators ----------
class TestClientKYC:
    def test_aadhaar_valid(self, session):
        r = session.post(f"{API}/clients/verify-aadhaar", json={"aadhaar": AADHAAR_VALID})
        assert r.status_code == 200 and r.json()["valid"] is True
        assert r.json()["masked"].endswith(AADHAAR_VALID[-4:])

    def test_aadhaar_invalid_checksum(self, session):
        r = session.post(f"{API}/clients/verify-aadhaar", json={"aadhaar": AADHAAR_INVALID})
        assert r.status_code == 200 and r.json()["valid"] is False

    def test_pan_valid(self, session):
        r = session.post(f"{API}/clients/verify-pan", json={"pan": PAN_VALID})
        assert r.status_code == 200 and r.json()["valid"] is True
        assert r.json()["pan"] == PAN_VALID

    def test_pan_invalid(self, session):
        r = session.post(f"{API}/clients/verify-pan", json={"pan": PAN_INVALID})
        assert r.status_code == 200 and r.json()["valid"] is False


# ---------- Client CRUD workflow ----------
class TestClients:
    def _send_and_verify_client_otp(self, session, hdr, mobile=CLIENT_MOBILE):
        r = session.post(f"{API}/clients/send-otp", json={"mobile": mobile}, headers=hdr)
        assert r.status_code == 200, r.text
        d = r.json()
        assert d["verification_id"] and d["demo_otp"]
        v = session.post(
            f"{API}/clients/verify-otp",
            json={"verification_id": d["verification_id"], "otp": d["demo_otp"]},
            headers=hdr,
        )
        assert v.status_code == 200 and v.json()["verified"] is True
        return d["verification_id"]

    def test_send_otp_requires_auth(self, session):
        r = session.post(f"{API}/clients/send-otp", json={"mobile": CLIENT_MOBILE})
        assert r.status_code == 401

    def test_create_client_full_flow_and_persistence(self, session, hdr_a):
        vid = self._send_and_verify_client_otp(session, hdr_a)
        payload = {
            "name": "Ravi Kumar",
            "mobile": CLIENT_MOBILE,
            "aadhaar": AADHAAR_VALID,
            "pan": PAN_VALID,
            "verification_id": vid,
        }
        r = session.post(f"{API}/clients", json=payload, headers=hdr_a)
        assert r.status_code == 200, r.text
        c = r.json()
        assert c["name"] == "Ravi Kumar"
        assert c["mobile"] == CLIENT_MOBILE
        assert c["pan"] == PAN_VALID
        assert c["aadhaar_masked"].endswith(AADHAAR_VALID[-4:])
        assert c["otp_verified"] and c["pan_verified"] and c["aadhaar_verified"]
        cid = c["client_id"]
        # Persistence via GET /clients/{id}
        g = session.get(f"{API}/clients/{cid}", headers=hdr_a)
        assert g.status_code == 200 and g.json()["client_id"] == cid

    def test_list_and_search_clients(self, session, hdr_a):
        r = session.get(f"{API}/clients", headers=hdr_a)
        assert r.status_code == 200
        items = r.json()
        assert any(c["mobile"] == CLIENT_MOBILE for c in items)
        # Search by name
        rs = session.get(f"{API}/clients", params={"q": "Ravi"}, headers=hdr_a)
        assert rs.status_code == 200
        assert any(c["name"] == "Ravi Kumar" for c in rs.json())
        # Search by mobile
        rm = session.get(f"{API}/clients", params={"q": CLIENT_MOBILE[-4:]}, headers=hdr_a)
        assert rm.status_code == 200 and len(rm.json()) >= 1
        # Search by pan
        rp = session.get(f"{API}/clients", params={"q": PAN_VALID}, headers=hdr_a)
        assert rp.status_code == 200 and len(rp.json()) >= 1

    def test_create_without_verification_fails(self, session, hdr_a):
        payload = {
            "name": "No OTP",
            "mobile": "9111222333",
            "aadhaar": AADHAAR_VALID,
            "pan": "ZYXWV9876A",
            "verification_id": "vr_nonexistent",
        }
        r = session.post(f"{API}/clients", json=payload, headers=hdr_a)
        assert r.status_code == 400

    def test_duplicate_mobile_fails(self, session, hdr_a):
        vid = self._send_and_verify_client_otp(session, hdr_a)
        payload = {
            "name": "Another Ravi",
            "mobile": CLIENT_MOBILE,
            "aadhaar": AADHAAR_VALID,
            "pan": "QRSTU5678V",
            "verification_id": vid,
        }
        r = session.post(f"{API}/clients", json=payload, headers=hdr_a)
        assert r.status_code == 400
        assert "mobile" in r.text.lower()

    def test_duplicate_pan_fails(self, session, hdr_a):
        other_mobile = "9555444333"
        vid = self._send_and_verify_client_otp(session, hdr_a, mobile=other_mobile)
        payload = {
            "name": "Same PAN",
            "mobile": other_mobile,
            "aadhaar": AADHAAR_VALID,
            "pan": PAN_VALID,  # dup
            "verification_id": vid,
        }
        r = session.post(f"{API}/clients", json=payload, headers=hdr_a)
        assert r.status_code == 400
        assert "pan" in r.text.lower()

    def test_lender_isolation(self, session, hdr_a, hdr_b):
        # Lender B should NOT see Lender A's clients
        r = session.get(f"{API}/clients", headers=hdr_b)
        assert r.status_code == 200
        for c in r.json():
            assert c["mobile"] != CLIENT_MOBILE

    def test_delete_client_and_verify_404(self, session, hdr_a):
        # Create a disposable client
        dispose_mobile = "9888777666"
        vid = self._send_and_verify_client_otp(session, hdr_a, mobile=dispose_mobile)
        r = session.post(
            f"{API}/clients",
            json={
                "name": "Dispose Me",
                "mobile": dispose_mobile,
                "aadhaar": AADHAAR_VALID,
                "pan": "LMNOP1234Q",
                "verification_id": vid,
            },
            headers=hdr_a,
        )
        assert r.status_code == 200, r.text
        cid = r.json()["client_id"]
        d = session.delete(f"{API}/clients/{cid}", headers=hdr_a)
        assert d.status_code == 200
        g = session.get(f"{API}/clients/{cid}", headers=hdr_a)
        assert g.status_code == 404


# ---------- Smoke-check legacy loan flow still works ----------
class TestLegacySmoke:
    def test_dashboard_shape(self, session, hdr_a):
        r = session.get(f"{API}/dashboard", headers=hdr_a)
        assert r.status_code == 200
        d = r.json()
        for k in ["total_funded", "active_loans", "pending_applications", "chart_disbursed"]:
            assert k in d
        assert len(d["chart_disbursed"]) == 6

    def test_list_pending_applications_seeded(self, session, hdr_a):
        r = session.get(f"{API}/applications?status=pending", headers=hdr_a)
        assert r.status_code == 200
        assert len(r.json()) >= 5  # 10 seeded; some may be decided by other tests

    def test_notifications_list(self, session, hdr_a):
        r = session.get(f"{API}/notifications", headers=hdr_a)
        assert r.status_code == 200

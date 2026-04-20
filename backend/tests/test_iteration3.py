"""Backend API tests for Smart Lending App - Iteration 3.

Covers:
 - Aadhaar send-otp + verify-otp (new same-screen Aadhaar OTP flow)
 - PAN verify now returning name/dob/entity
 - Client create accepting aadhaar_verification_id, aadhaar_name, pan_name, pan_dob
 - GET /clients/{id}/loans
 - POST /loan-apps/analyze-statement (LLM)
 - POST /loan-apps/check-cibil (LLM)
 - POST /loan-apps/create  ->  visible in client loans + applications (pending)
 - Auth enforcement + lender isolation for new endpoints
"""
import os
import uuid
import pytest
import requests

BASE_URL = (
    os.environ.get("EXPO_BACKEND_URL")
    or os.environ.get("EXPO_PUBLIC_BACKEND_URL")
    or "https://lending-hub-63.preview.emergentagent.com"
).rstrip("/")
API = f"{BASE_URL}/api"

AADHAAR_VALID = "234123412346"
AADHAAR_INVALID = "234123412345"
PAN_VALID = "ABCDE1234F"


# ---------- helpers ----------
def _signup(session, mobile, name):
    r = session.post(f"{API}/auth/send-otp", json={"mobile": mobile, "name": name, "purpose": "signup"})
    if r.status_code == 400 and "already registered" in r.text.lower():
        r = session.post(f"{API}/auth/send-otp", json={"mobile": mobile, "purpose": "login"})
    assert r.status_code == 200, r.text
    otp = r.json()["demo_otp"]
    v = session.post(f"{API}/auth/verify-otp", json={"mobile": mobile, "otp": otp})
    assert v.status_code == 200, v.text
    return v.json()["access_token"]


@pytest.fixture(scope="session")
def session():
    s = requests.Session()
    s.headers.update({"Content-Type": "application/json"})
    return s


@pytest.fixture(scope="session")
def lender_a(session):
    mobile = f"93333{uuid.uuid4().int % 100000:05d}"
    tok = _signup(session, mobile, "Lender A i3")
    return {"mobile": mobile, "token": tok, "hdr": {"Authorization": f"Bearer {tok}", "Content-Type": "application/json"}}


@pytest.fixture(scope="session")
def lender_b(session):
    mobile = f"94444{uuid.uuid4().int % 100000:05d}"
    tok = _signup(session, mobile, "Lender B i3")
    return {"mobile": mobile, "token": tok, "hdr": {"Authorization": f"Bearer {tok}", "Content-Type": "application/json"}}


def _rand_pan():
    import random, string
    letters = "".join(random.choices(string.ascii_uppercase, k=5))
    digits = "".join(random.choices(string.digits, k=4))
    last = random.choice(string.ascii_uppercase)
    return f"{letters}{digits}{last}"


def _make_client(session, hdr, client_mobile=None, aadhaar=AADHAAR_VALID, pan=None):
    client_mobile = client_mobile or f"95555{uuid.uuid4().int % 100000:05d}"
    pan = pan or _rand_pan()
    # aadhaar send+verify
    ra = session.post(f"{API}/clients/aadhaar-send-otp", json={"aadhaar": aadhaar}, headers=hdr)
    assert ra.status_code == 200, ra.text
    av = ra.json()
    vr = session.post(
        f"{API}/clients/aadhaar-verify-otp",
        json={"verification_id": av["verification_id"], "otp": av["demo_otp"]},
        headers=hdr,
    )
    assert vr.status_code == 200, vr.text
    aadhaar_name = vr.json()["name"]
    # PAN verify (no OTP)
    rp = session.post(f"{API}/clients/verify-pan", json={"pan": pan})
    assert rp.status_code == 200
    pd = rp.json()
    # client mobile OTP
    rm = session.post(f"{API}/clients/send-otp", json={"mobile": client_mobile}, headers=hdr)
    assert rm.status_code == 200, rm.text
    mv = rm.json()
    session.post(
        f"{API}/clients/verify-otp",
        json={"verification_id": mv["verification_id"], "otp": mv["demo_otp"]},
        headers=hdr,
    )
    payload = {
        "name": aadhaar_name,
        "mobile": client_mobile,
        "aadhaar": aadhaar,
        "pan": pan,
        "verification_id": mv["verification_id"],
        "aadhaar_verification_id": av["verification_id"],
        "aadhaar_name": aadhaar_name,
        "pan_name": pd.get("name"),
        "pan_dob": pd.get("dob"),
    }
    rc = session.post(f"{API}/clients", json=payload, headers=hdr)
    assert rc.status_code == 200, rc.text
    return rc.json(), aadhaar_name, pd


# ---------- Aadhaar OTP ----------
class TestAadhaarOtp:
    def test_send_otp_valid(self, session, lender_a):
        r = session.post(f"{API}/clients/aadhaar-send-otp", json={"aadhaar": AADHAAR_VALID}, headers=lender_a["hdr"])
        assert r.status_code == 200, r.text
        d = r.json()
        assert d.get("verification_id", "").startswith("av_")
        assert d.get("demo_otp") and len(d["demo_otp"]) == 6
        assert d["masked"].endswith(AADHAAR_VALID[-4:])

    def test_send_otp_invalid_checksum(self, session, lender_a):
        r = session.post(f"{API}/clients/aadhaar-send-otp", json={"aadhaar": AADHAAR_INVALID}, headers=lender_a["hdr"])
        assert r.status_code == 400

    def test_send_otp_requires_auth(self, session):
        r = session.post(f"{API}/clients/aadhaar-send-otp", json={"aadhaar": AADHAAR_VALID})
        assert r.status_code == 401

    def test_verify_otp_success_returns_name(self, session, lender_a):
        r = session.post(f"{API}/clients/aadhaar-send-otp", json={"aadhaar": AADHAAR_VALID}, headers=lender_a["hdr"])
        d = r.json()
        v = session.post(
            f"{API}/clients/aadhaar-verify-otp",
            json={"verification_id": d["verification_id"], "otp": d["demo_otp"]},
            headers=lender_a["hdr"],
        )
        assert v.status_code == 200, v.text
        body = v.json()
        assert body["verified"] is True
        assert isinstance(body.get("name"), str) and len(body["name"]) > 2
        assert body["masked"].endswith(AADHAAR_VALID[-4:])

    def test_verify_otp_wrong(self, session, lender_a):
        r = session.post(f"{API}/clients/aadhaar-send-otp", json={"aadhaar": AADHAAR_VALID}, headers=lender_a["hdr"])
        d = r.json()
        v = session.post(
            f"{API}/clients/aadhaar-verify-otp",
            json={"verification_id": d["verification_id"], "otp": "000000"},
            headers=lender_a["hdr"],
        )
        assert v.status_code == 400

    def test_verify_otp_cross_lender_denied(self, session, lender_a, lender_b):
        r = session.post(f"{API}/clients/aadhaar-send-otp", json={"aadhaar": AADHAAR_VALID}, headers=lender_a["hdr"])
        d = r.json()
        v = session.post(
            f"{API}/clients/aadhaar-verify-otp",
            json={"verification_id": d["verification_id"], "otp": d["demo_otp"]},
            headers=lender_b["hdr"],
        )
        assert v.status_code == 400


# ---------- PAN ----------
class TestPanVerify:
    def test_pan_returns_name_dob_entity(self, session):
        r = session.post(f"{API}/clients/verify-pan", json={"pan": PAN_VALID})
        assert r.status_code == 200
        d = r.json()
        assert d["valid"] is True
        assert d["pan"] == PAN_VALID
        assert isinstance(d.get("name"), str) and " " in d["name"]
        assert isinstance(d.get("dob"), str) and len(d["dob"]) == 10  # dd/mm/yyyy
        assert isinstance(d.get("entity"), str) and d["entity"]

    def test_pan_deterministic(self, session):
        r1 = session.post(f"{API}/clients/verify-pan", json={"pan": PAN_VALID}).json()
        r2 = session.post(f"{API}/clients/verify-pan", json={"pan": PAN_VALID}).json()
        assert r1["name"] == r2["name"] and r1["dob"] == r2["dob"]


# ---------- Client create with new fields ----------
class TestClientCreateI3:
    def test_create_stores_aadhaar_pan_name_dob(self, session, lender_a):
        c, aad_name, pd = _make_client(session, lender_a["hdr"])
        cid = c["client_id"]
        g = session.get(f"{API}/clients/{cid}", headers=lender_a["hdr"])
        assert g.status_code == 200
        body = g.json()
        assert body.get("aadhaar_name") == aad_name
        assert body.get("pan_name") == pd.get("name")
        assert body.get("pan_dob") == pd.get("dob")


# ---------- Client loans endpoint ----------
class TestClientLoans:
    def test_empty_for_new_client(self, session, lender_a):
        c, _, _ = _make_client(session, lender_a["hdr"])
        r = session.get(f"{API}/clients/{c['client_id']}/loans", headers=lender_a["hdr"])
        assert r.status_code == 200
        assert r.json() == []

    def test_cross_lender_denied(self, session, lender_a, lender_b):
        c, _, _ = _make_client(session, lender_a["hdr"])
        r = session.get(f"{API}/clients/{c['client_id']}/loans", headers=lender_b["hdr"])
        assert r.status_code == 404


# ---------- Statement analysis ----------
@pytest.fixture(scope="module")
def shared_client(request):
    """Single client reused across LLM tests to save OTP churn."""
    s = requests.Session()
    s.headers.update({"Content-Type": "application/json"})
    mobile = f"96666{uuid.uuid4().int % 100000:05d}"
    tok = _signup(s, mobile, "Shared i3")
    hdr = {"Authorization": f"Bearer {tok}", "Content-Type": "application/json"}
    c, _, _ = _make_client(s, hdr)
    return {"session": s, "hdr": hdr, "client": c}


class TestAnalyzeStatement:
    def test_requires_auth(self, session, shared_client):
        r = session.post(
            f"{API}/loan-apps/analyze-statement",
            json={"client_id": shared_client["client"]["client_id"], "file_name": "a.pdf", "file_size": 1000, "months": 6},
        )
        assert r.status_code == 401

    def test_analyze_shape_and_chart_size(self, shared_client):
        r = shared_client["session"].post(
            f"{API}/loan-apps/analyze-statement",
            json={"client_id": shared_client["client"]["client_id"], "file_name": "stmt.pdf", "file_size": 32768, "months": 6},
            headers=shared_client["hdr"],
            timeout=90,
        )
        assert r.status_code == 200, r.text
        d = r.json()
        for k in [
            "months_analyzed", "total_credit", "total_debit", "avg_balance",
            "bounced_transactions", "salary_credits_detected", "bounce_risk",
            "risk_color", "chart", "summary", "highlights", "analysis_id",
        ]:
            assert k in d, f"missing {k}"
        assert d["months_analyzed"] == 6
        assert isinstance(d["chart"], list) and len(d["chart"]) == 6
        assert d["risk_color"] in {"green", "yellow", "red"}
        assert d["bounce_risk"] in {"low", "medium", "high"}
        # chart items
        for item in d["chart"]:
            assert {"label", "credit", "debit", "bounces"} <= set(item.keys())

    def test_cross_lender_client_404(self, session, shared_client, lender_b):
        r = session.post(
            f"{API}/loan-apps/analyze-statement",
            json={"client_id": shared_client["client"]["client_id"], "file_name": "x.pdf", "file_size": 10, "months": 3},
            headers=lender_b["hdr"],
            timeout=60,
        )
        assert r.status_code == 404


# ---------- CIBIL ----------
class TestCibil:
    def test_requires_auth(self, session, shared_client):
        r = session.post(f"{API}/loan-apps/check-cibil", json={"client_id": shared_client["client"]["client_id"]})
        assert r.status_code == 401

    def test_cibil_shape(self, shared_client):
        r = shared_client["session"].post(
            f"{API}/loan-apps/check-cibil",
            json={"client_id": shared_client["client"]["client_id"]},
            headers=shared_client["hdr"],
            timeout=90,
        )
        assert r.status_code == 200, r.text
        d = r.json()
        for k in [
            "score", "band", "band_color", "on_time_payments_pct",
            "credit_utilization_pct", "total_accounts", "active_loans",
            "hard_enquiries_6m", "factors", "summary", "report_id",
        ]:
            assert k in d, f"missing {k}"
        assert 300 <= int(d["score"]) <= 900
        assert d["band_color"] in {"red", "yellow", "green", "blue"}
        assert isinstance(d["factors"], list) and len(d["factors"]) == 4


# ---------- Create loan app ----------
class TestCreateLoanApp:
    def test_create_and_visible_in_client_loans(self, shared_client):
        s, hdr = shared_client["session"], shared_client["hdr"]
        cid = shared_client["client"]["client_id"]
        payload = {
            "client_id": cid,
            "amount": 150000,
            "purpose": "Business expansion",
            "term_months": 18,
            "interest_rate": 11.5,
            "statement_analysis": {"months_analyzed": 6, "total_credit": 600000, "bounced_transactions": 0},
            "cibil_report": {"score": 742, "band": "good"},
        }
        r = s.post(f"{API}/loan-apps/create", json=payload, headers=hdr, timeout=30)
        assert r.status_code == 200, r.text
        app_ = r.json()
        assert app_["status"] == "pending"
        assert app_["amount"] == 150000
        assert app_["application_id"].startswith("app_")
        app_id = app_["application_id"]
        # Appears in client loans
        lr = s.get(f"{API}/clients/{cid}/loans", headers=hdr)
        assert lr.status_code == 200
        assert any(a["application_id"] == app_id for a in lr.json())

    def test_requires_valid_client(self, shared_client):
        s, hdr = shared_client["session"], shared_client["hdr"]
        r = s.post(
            f"{API}/loan-apps/create",
            json={"client_id": "cli_does_not_exist", "amount": 1000, "purpose": "x", "term_months": 12, "interest_rate": 10},
            headers=hdr,
        )
        assert r.status_code == 404

    def test_requires_auth(self, session, shared_client):
        r = session.post(
            f"{API}/loan-apps/create",
            json={"client_id": shared_client["client"]["client_id"], "amount": 1000, "purpose": "x", "term_months": 12, "interest_rate": 10},
        )
        assert r.status_code == 401

"""Backend API tests for Smart Lending App."""
import os
import time
import uuid
import pytest
import requests

BASE_URL = os.environ.get("EXPO_PUBLIC_BACKEND_URL", "https://lending-hub-63.preview.emergentagent.com").rstrip("/")
API = f"{BASE_URL}/api"

DEMO_EMAIL = "demo@lendify.app"
DEMO_PASSWORD = "Demo123!"


@pytest.fixture(scope="session")
def session():
    s = requests.Session()
    s.headers.update({"Content-Type": "application/json"})
    return s


@pytest.fixture(scope="session")
def auth_token(session):
    # Try login first; if fails, register demo then login
    r = session.post(f"{API}/auth/login", json={"email": DEMO_EMAIL, "password": DEMO_PASSWORD})
    if r.status_code != 200:
        session.post(f"{API}/auth/register", json={"email": DEMO_EMAIL, "password": DEMO_PASSWORD, "name": "Demo Lender"})
        r = session.post(f"{API}/auth/login", json={"email": DEMO_EMAIL, "password": DEMO_PASSWORD})
    assert r.status_code == 200, f"Login failed: {r.text}"
    data = r.json()
    assert "access_token" in data and "user" in data
    return data["access_token"]


@pytest.fixture(scope="session")
def auth_headers(auth_token):
    return {"Authorization": f"Bearer {auth_token}", "Content-Type": "application/json"}


# ---------- Auth ----------
class TestAuth:
    def test_register_new_user(self, session):
        email = f"test_{uuid.uuid4().hex[:8]}@lendify.app"
        r = session.post(f"{API}/auth/register", json={"email": email, "password": "Pass123!", "name": "Test User"})
        assert r.status_code == 200, r.text
        data = r.json()
        assert data["user"]["email"] == email
        assert data["user"]["role"] == "lender"
        assert "access_token" in data

    def test_register_duplicate_fails(self, session):
        r = session.post(f"{API}/auth/register", json={"email": DEMO_EMAIL, "password": "x", "name": "x"})
        assert r.status_code == 400

    def test_login_success(self, session, auth_token):
        assert auth_token

    def test_login_wrong_password(self, session):
        r = session.post(f"{API}/auth/login", json={"email": DEMO_EMAIL, "password": "wrong"})
        assert r.status_code == 401

    def test_me_with_token(self, session, auth_headers):
        r = session.get(f"{API}/auth/me", headers=auth_headers)
        assert r.status_code == 200
        assert r.json()["email"] == DEMO_EMAIL

    def test_me_without_token(self, session):
        r = session.get(f"{API}/auth/me")
        assert r.status_code == 401


# ---------- Dashboard ----------
class TestDashboard:
    def test_dashboard_shape(self, session, auth_headers):
        r = session.get(f"{API}/dashboard", headers=auth_headers)
        assert r.status_code == 200
        d = r.json()
        for key in ["total_funded", "active_loans", "pending_applications", "default_rate", "chart_disbursed"]:
            assert key in d, f"missing {key}"
        assert isinstance(d["chart_disbursed"], list)
        assert len(d["chart_disbursed"]) == 6
        for pt in d["chart_disbursed"]:
            assert "label" in pt and "value" in pt


# ---------- Applications ----------
class TestApplications:
    def test_list_pending_has_seed(self, session, auth_headers):
        r = session.get(f"{API}/applications?status=pending", headers=auth_headers)
        assert r.status_code == 200
        apps = r.json()
        assert len(apps) >= 10, f"Expected 10 seeded pending apps, got {len(apps)}"
        first = apps[0]
        for f in ["application_id", "borrower", "amount", "purpose", "term_months", "interest_rate", "status"]:
            assert f in first

    def test_get_application_generates_ai_score(self, session, auth_headers):
        r = session.get(f"{API}/applications?status=pending", headers=auth_headers)
        apps = r.json()
        app_id = apps[0]["application_id"]
        # Detail call should populate AI fields (allow up to ~30s for LLM)
        r2 = session.get(f"{API}/applications/{app_id}", headers=auth_headers, timeout=60)
        assert r2.status_code == 200
        d = r2.json()
        assert d["ai_score"] is not None, f"ai_score missing: {d}"
        assert 300 <= d["ai_score"] <= 850
        assert d["ai_risk"] in ("low", "medium", "high")
        assert d["ai_recommendation"] in ("approve", "review", "reject")
        assert isinstance(d["ai_reasoning"], str) and len(d["ai_reasoning"]) > 0
        assert isinstance(d["ai_factors"], list) and len(d["ai_factors"]) >= 1


# ---------- Full lender workflow ----------
class TestLenderWorkflow:
    @pytest.fixture(scope="class")
    def pending_ids(self, session, auth_headers):
        r = session.get(f"{API}/applications?status=pending", headers=auth_headers)
        return [a["application_id"] for a in r.json()]

    def test_approve(self, session, auth_headers, pending_ids):
        r = session.post(f"{API}/applications/{pending_ids[0]}/approve", headers=auth_headers)
        assert r.status_code == 200
        assert r.json()["status"] == "approved"

    def test_reject(self, session, auth_headers, pending_ids):
        r = session.post(f"{API}/applications/{pending_ids[1]}/reject", headers=auth_headers)
        assert r.status_code == 200
        assert r.json()["status"] == "rejected"

    def test_fund_creates_loan_and_txn(self, session, auth_headers, pending_ids):
        app_id = pending_ids[2]
        r = session.post(f"{API}/applications/{app_id}/fund", headers=auth_headers)
        assert r.status_code == 200, r.text
        loan = r.json()
        assert loan["application_id"] == app_id
        assert loan["status"] == "active"
        assert len(loan["repayment_schedule"]) == loan["term_months"]
        loan_id = loan["loan_id"]

        # verify app transitioned to funded
        r2 = session.get(f"{API}/applications/{app_id}", headers=auth_headers)
        assert r2.json()["status"] == "funded"

        # verify disbursement txn
        rt = session.get(f"{API}/transactions", headers=auth_headers)
        assert rt.status_code == 200
        txns = rt.json()
        assert any(t["loan_id"] == loan_id and t["type"] == "disbursement" for t in txns)

        # save for next test
        pytest.funded_loan_id = loan_id

    def test_repay_month(self, session, auth_headers):
        loan_id = getattr(pytest, "funded_loan_id", None)
        assert loan_id, "no funded loan from previous test"
        r = session.post(f"{API}/loans/{loan_id}/repay/1", headers=auth_headers)
        assert r.status_code == 200, r.text
        loan = r.json()
        assert loan["repayment_schedule"][0]["status"] == "paid"
        assert loan["paid_amount"] > 0

        # verify repayment txn exists
        rt = session.get(f"{API}/transactions", headers=auth_headers)
        txns = rt.json()
        assert any(t["loan_id"] == loan_id and t["type"] == "repayment" for t in txns)

    def test_list_loans(self, session, auth_headers):
        r = session.get(f"{API}/loans", headers=auth_headers)
        assert r.status_code == 200
        assert len(r.json()) >= 1


# ---------- Notifications ----------
class TestNotifications:
    def test_list_and_mark_all_read(self, session, auth_headers):
        r = session.get(f"{API}/notifications", headers=auth_headers)
        assert r.status_code == 200
        notifs = r.json()
        assert len(notifs) >= 1
        r2 = session.post(f"{API}/notifications/read-all", headers=auth_headers)
        assert r2.status_code == 200
        r3 = session.get(f"{API}/notifications", headers=auth_headers)
        assert all(n["read"] is True for n in r3.json())

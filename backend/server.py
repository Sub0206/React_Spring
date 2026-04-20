"""Smart Lending App - Backend API"""
import os
import uuid
import logging
import asyncio
import json
import bcrypt
import jwt as pyjwt
from datetime import datetime, timezone, timedelta
from pathlib import Path
from typing import List, Optional, Literal

import httpx
from fastapi import FastAPI, APIRouter, HTTPException, Depends, Header, Request
from fastapi.responses import JSONResponse
from starlette.middleware.cors import CORSMiddleware
from motor.motor_asyncio import AsyncIOMotorClient
from pydantic import BaseModel, Field, EmailStr
from dotenv import load_dotenv

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / ".env")

# --- Config ---
MONGO_URL = os.environ["MONGO_URL"]
DB_NAME = os.environ["DB_NAME"]
EMERGENT_LLM_KEY = os.environ.get("EMERGENT_LLM_KEY", "")
JWT_SECRET = os.environ.get("JWT_SECRET", "dev-secret")
JWT_ALG = "HS256"
JWT_EXP_DAYS = 7

client = AsyncIOMotorClient(MONGO_URL)
db = client[DB_NAME]

app = FastAPI(title="Smart Lending API")
api = APIRouter(prefix="/api")

logging.basicConfig(level=logging.INFO, format="%(asctime)s - %(levelname)s - %(message)s")
logger = logging.getLogger("smart-lending")

# ---------- Models ----------
class UserPublic(BaseModel):
    user_id: str
    email: str
    name: str
    picture: Optional[str] = None
    role: str = "lender"
    created_at: datetime

class RegisterRequest(BaseModel):
    email: EmailStr
    password: str
    name: str

class LoginRequest(BaseModel):
    email: EmailStr
    password: str

class GoogleAuthRequest(BaseModel):
    session_id: str

class TokenResponse(BaseModel):
    access_token: str
    user: UserPublic

class BorrowerProfile(BaseModel):
    name: str
    avatar: Optional[str] = None
    age: int
    occupation: str
    monthly_income: float
    employment_years: float
    existing_debts: float
    credit_history_years: float
    previous_defaults: int = 0

class LoanApplication(BaseModel):
    application_id: str
    borrower: BorrowerProfile
    amount: float
    purpose: str
    term_months: int
    interest_rate: float
    status: Literal["pending", "approved", "rejected", "funded"] = "pending"
    ai_score: Optional[int] = None
    ai_risk: Optional[str] = None
    ai_recommendation: Optional[str] = None
    ai_reasoning: Optional[str] = None
    ai_factors: Optional[List[dict]] = None
    created_at: datetime
    decided_at: Optional[datetime] = None
    decided_by: Optional[str] = None

class RepaymentEntry(BaseModel):
    month: int
    due_date: datetime
    amount: float
    status: Literal["upcoming", "paid", "overdue"] = "upcoming"

class Loan(BaseModel):
    loan_id: str
    application_id: str
    borrower: BorrowerProfile
    principal: float
    interest_rate: float
    term_months: int
    monthly_payment: float
    total_repayment: float
    paid_amount: float = 0.0
    status: Literal["active", "completed", "defaulted"] = "active"
    repayment_schedule: List[RepaymentEntry]
    funded_at: datetime
    funded_by: str

class Transaction(BaseModel):
    transaction_id: str
    type: Literal["disbursement", "repayment", "fee"]
    amount: float
    loan_id: Optional[str] = None
    borrower_name: Optional[str] = None
    description: str
    created_at: datetime

class Notification(BaseModel):
    notification_id: str
    user_id: str
    title: str
    body: str
    type: Literal["application", "repayment", "system", "alert"] = "system"
    read: bool = False
    created_at: datetime

# ---------- Auth helpers ----------
def hash_password(pw: str) -> str:
    return bcrypt.hashpw(pw.encode(), bcrypt.gensalt()).decode()

def verify_password(pw: str, hashed: str) -> bool:
    try:
        return bcrypt.checkpw(pw.encode(), hashed.encode())
    except Exception:
        return False

def create_access_token(user_id: str) -> str:
    payload = {
        "sub": user_id,
        "exp": datetime.now(timezone.utc) + timedelta(days=JWT_EXP_DAYS),
        "iat": datetime.now(timezone.utc),
    }
    return pyjwt.encode(payload, JWT_SECRET, algorithm=JWT_ALG)

async def get_current_user(authorization: Optional[str] = Header(None)) -> UserPublic:
    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="Missing or invalid auth token")
    token = authorization.split(" ", 1)[1]
    try:
        payload = pyjwt.decode(token, JWT_SECRET, algorithms=[JWT_ALG])
    except pyjwt.ExpiredSignatureError:
        raise HTTPException(status_code=401, detail="Token expired")
    except Exception:
        # Fallback: try as Emergent session token
        session_doc = await db.user_sessions.find_one({"session_token": token}, {"_id": 0})
        if not session_doc:
            raise HTTPException(status_code=401, detail="Invalid token")
        expires_at = session_doc["expires_at"]
        if isinstance(expires_at, str):
            expires_at = datetime.fromisoformat(expires_at)
        if expires_at.tzinfo is None:
            expires_at = expires_at.replace(tzinfo=timezone.utc)
        if expires_at < datetime.now(timezone.utc):
            raise HTTPException(status_code=401, detail="Session expired")
        user_doc = await db.users.find_one({"user_id": session_doc["user_id"]}, {"_id": 0, "password_hash": 0})
        if not user_doc:
            raise HTTPException(status_code=401, detail="User not found")
        return UserPublic(**user_doc)

    user_id = payload.get("sub")
    user_doc = await db.users.find_one({"user_id": user_id}, {"_id": 0, "password_hash": 0})
    if not user_doc:
        raise HTTPException(status_code=401, detail="User not found")
    return UserPublic(**user_doc)

# ---------- Auth endpoints ----------
@api.post("/auth/register", response_model=TokenResponse)
async def register(body: RegisterRequest):
    existing = await db.users.find_one({"email": body.email.lower()}, {"_id": 0})
    if existing:
        raise HTTPException(status_code=400, detail="Email already registered")
    user_id = f"user_{uuid.uuid4().hex[:12]}"
    user_doc = {
        "user_id": user_id,
        "email": body.email.lower(),
        "name": body.name,
        "picture": None,
        "role": "lender",
        "password_hash": hash_password(body.password),
        "created_at": datetime.now(timezone.utc),
    }
    await db.users.insert_one(user_doc)
    token = create_access_token(user_id)
    public = {k: v for k, v in user_doc.items() if k != "password_hash"}
    return TokenResponse(access_token=token, user=UserPublic(**public))

@api.post("/auth/login", response_model=TokenResponse)
async def login(body: LoginRequest):
    user = await db.users.find_one({"email": body.email.lower()}, {"_id": 0})
    if not user or not user.get("password_hash"):
        raise HTTPException(status_code=401, detail="Invalid credentials")
    if not verify_password(body.password, user["password_hash"]):
        raise HTTPException(status_code=401, detail="Invalid credentials")
    token = create_access_token(user["user_id"])
    public = {k: v for k, v in user.items() if k != "password_hash"}
    return TokenResponse(access_token=token, user=UserPublic(**public))

@api.post("/auth/google", response_model=TokenResponse)
async def google_auth(body: GoogleAuthRequest):
    """Exchange Emergent session_id for user + app JWT token."""
    async with httpx.AsyncClient(timeout=15) as http:
        r = await http.get(
            "https://demobackend.emergentagent.com/auth/v1/env/oauth/session-data",
            headers={"X-Session-ID": body.session_id},
        )
        if r.status_code != 200:
            raise HTTPException(status_code=401, detail="Invalid session_id")
        data = r.json()

    email = (data.get("email") or "").lower()
    name = data.get("name") or email.split("@")[0]
    picture = data.get("picture")
    session_token = data.get("session_token")
    if not email:
        raise HTTPException(status_code=400, detail="No email returned")

    user = await db.users.find_one({"email": email}, {"_id": 0})
    if not user:
        user_id = f"user_{uuid.uuid4().hex[:12]}"
        user = {
            "user_id": user_id,
            "email": email,
            "name": name,
            "picture": picture,
            "role": "lender",
            "password_hash": None,
            "created_at": datetime.now(timezone.utc),
        }
        await db.users.insert_one(user)
    else:
        await db.users.update_one(
            {"user_id": user["user_id"]},
            {"$set": {"name": name, "picture": picture}},
        )
        user["name"] = name
        user["picture"] = picture

    if session_token:
        await db.user_sessions.update_one(
            {"session_token": session_token},
            {"$set": {
                "user_id": user["user_id"],
                "session_token": session_token,
                "expires_at": datetime.now(timezone.utc) + timedelta(days=7),
                "created_at": datetime.now(timezone.utc),
            }},
            upsert=True,
        )

    token = create_access_token(user["user_id"])
    public = {k: v for k, v in user.items() if k != "password_hash"}
    return TokenResponse(access_token=token, user=UserPublic(**public))

@api.get("/auth/me", response_model=UserPublic)
async def me(current: UserPublic = Depends(get_current_user)):
    return current

# ---------- AI Credit Scoring ----------
async def run_ai_credit_score(app_doc: dict) -> dict:
    """Call Emergent LLM to produce credit score."""
    try:
        from emergentintegrations.llm.chat import LlmChat, UserMessage
    except Exception as e:
        logger.warning(f"emergentintegrations not available: {e}")
        return _fallback_score(app_doc)

    b = app_doc["borrower"]
    system = (
        "You are an expert credit-risk analyst for a peer-to-peer lending platform. "
        "Analyze the borrower's profile and loan request, then return a strict JSON object. "
        "Do not include any text outside the JSON."
    )
    prompt = f"""
Borrower profile:
- Name: {b['name']}
- Age: {b['age']}
- Occupation: {b['occupation']}
- Monthly income: ${b['monthly_income']:.2f}
- Employment years: {b['employment_years']}
- Existing monthly debts: ${b['existing_debts']:.2f}
- Credit history years: {b['credit_history_years']}
- Previous defaults: {b['previous_defaults']}

Loan request:
- Amount: ${app_doc['amount']:.2f}
- Purpose: {app_doc['purpose']}
- Term: {app_doc['term_months']} months
- Interest rate: {app_doc['interest_rate']}% APR

Return ONLY a JSON object with this exact schema:
{{
  "score": <int 300-850>,
  "risk": "<low|medium|high>",
  "recommendation": "<approve|review|reject>",
  "reasoning": "<2-3 sentence explanation>",
  "factors": [
    {{"label": "<short factor name>", "impact": "<positive|negative|neutral>", "detail": "<brief>"}},
    ... 3-5 items
  ]
}}
"""
    try:
        chat = LlmChat(
            api_key=EMERGENT_LLM_KEY,
            session_id=f"score-{app_doc['application_id']}",
            system_message=system,
        ).with_model("anthropic", "claude-sonnet-4-5-20250929")
        resp = await chat.send_message(UserMessage(text=prompt))
        text = resp.strip()
        # Extract JSON
        start = text.find("{")
        end = text.rfind("}")
        if start == -1 or end == -1:
            raise ValueError("No JSON in response")
        parsed = json.loads(text[start : end + 1])
        return {
            "ai_score": int(parsed["score"]),
            "ai_risk": parsed["risk"],
            "ai_recommendation": parsed["recommendation"],
            "ai_reasoning": parsed["reasoning"],
            "ai_factors": parsed.get("factors", []),
        }
    except Exception as e:
        logger.error(f"AI scoring failed: {e}")
        return _fallback_score(app_doc)

def _fallback_score(app_doc: dict) -> dict:
    """Deterministic fallback scorer when LLM fails."""
    b = app_doc["borrower"]
    dti = app_doc["amount"] / max(b["monthly_income"] * app_doc["term_months"], 1)
    base = 720
    base -= int(dti * 200)
    base -= b["previous_defaults"] * 60
    base += min(int(b["credit_history_years"] * 8), 60)
    base += min(int(b["employment_years"] * 5), 40)
    base = max(320, min(840, base))
    if base >= 720:
        risk, rec = "low", "approve"
    elif base >= 620:
        risk, rec = "medium", "review"
    else:
        risk, rec = "high", "reject"
    return {
        "ai_score": base,
        "ai_risk": risk,
        "ai_recommendation": rec,
        "ai_reasoning": f"Debt-to-income ratio {dti:.2f}, {b['previous_defaults']} prior default(s), {b['credit_history_years']}y credit history.",
        "ai_factors": [
            {"label": "Debt-to-Income", "impact": "negative" if dti > 0.35 else "positive", "detail": f"DTI {dti:.2f}"},
            {"label": "Credit History", "impact": "positive" if b["credit_history_years"] >= 3 else "neutral", "detail": f"{b['credit_history_years']} years"},
            {"label": "Employment Stability", "impact": "positive" if b["employment_years"] >= 2 else "neutral", "detail": f"{b['employment_years']} years"},
            {"label": "Prior Defaults", "impact": "negative" if b["previous_defaults"] > 0 else "positive", "detail": f"{b['previous_defaults']} defaults"},
        ],
    }

# ---------- Loan Applications ----------
@api.get("/applications", response_model=List[LoanApplication])
async def list_applications(status: Optional[str] = None, current: UserPublic = Depends(get_current_user)):
    query = {}
    if status:
        query["status"] = status
    cursor = db.applications.find(query, {"_id": 0}).sort("created_at", -1)
    docs = await cursor.to_list(200)
    return [LoanApplication(**d) for d in docs]

@api.get("/applications/{application_id}", response_model=LoanApplication)
async def get_application(application_id: str, current: UserPublic = Depends(get_current_user)):
    doc = await db.applications.find_one({"application_id": application_id}, {"_id": 0})
    if not doc:
        raise HTTPException(404, "Application not found")
    # Generate AI score on-demand if missing
    if doc.get("ai_score") is None:
        ai = await run_ai_credit_score(doc)
        await db.applications.update_one({"application_id": application_id}, {"$set": ai})
        doc.update(ai)
    return LoanApplication(**doc)

@api.post("/applications/{application_id}/score", response_model=LoanApplication)
async def rescore_application(application_id: str, current: UserPublic = Depends(get_current_user)):
    doc = await db.applications.find_one({"application_id": application_id}, {"_id": 0})
    if not doc:
        raise HTTPException(404, "Application not found")
    ai = await run_ai_credit_score(doc)
    await db.applications.update_one({"application_id": application_id}, {"$set": ai})
    doc.update(ai)
    return LoanApplication(**doc)

@api.post("/applications/{application_id}/approve", response_model=LoanApplication)
async def approve_application(application_id: str, current: UserPublic = Depends(get_current_user)):
    doc = await db.applications.find_one({"application_id": application_id}, {"_id": 0})
    if not doc:
        raise HTTPException(404, "Application not found")
    if doc["status"] != "pending":
        raise HTTPException(400, f"Application is {doc['status']}")
    await db.applications.update_one(
        {"application_id": application_id},
        {"$set": {"status": "approved", "decided_at": datetime.now(timezone.utc), "decided_by": current.user_id}},
    )
    await _notify(current.user_id, "Loan approved", f"You approved {doc['borrower']['name']}'s loan request.", "application")
    doc["status"] = "approved"
    doc["decided_at"] = datetime.now(timezone.utc)
    doc["decided_by"] = current.user_id
    return LoanApplication(**doc)

@api.post("/applications/{application_id}/reject", response_model=LoanApplication)
async def reject_application(application_id: str, current: UserPublic = Depends(get_current_user)):
    doc = await db.applications.find_one({"application_id": application_id}, {"_id": 0})
    if not doc:
        raise HTTPException(404, "Application not found")
    if doc["status"] not in ("pending", "approved"):
        raise HTTPException(400, f"Cannot reject a {doc['status']} application")
    await db.applications.update_one(
        {"application_id": application_id},
        {"$set": {"status": "rejected", "decided_at": datetime.now(timezone.utc), "decided_by": current.user_id}},
    )
    await _notify(current.user_id, "Loan rejected", f"You rejected {doc['borrower']['name']}'s loan request.", "application")
    doc["status"] = "rejected"
    return LoanApplication(**doc)

@api.post("/applications/{application_id}/fund", response_model=Loan)
async def fund_application(application_id: str, current: UserPublic = Depends(get_current_user)):
    doc = await db.applications.find_one({"application_id": application_id}, {"_id": 0})
    if not doc:
        raise HTTPException(404, "Application not found")
    if doc["status"] not in ("pending", "approved"):
        raise HTTPException(400, f"Cannot fund a {doc['status']} application")

    principal = doc["amount"]
    months = doc["term_months"]
    rate = doc["interest_rate"] / 100 / 12
    monthly = (principal * rate * (1 + rate) ** months) / ((1 + rate) ** months - 1) if rate > 0 else principal / months
    total = monthly * months

    now = datetime.now(timezone.utc)
    schedule = []
    for m in range(1, months + 1):
        due = now + timedelta(days=30 * m)
        schedule.append({
            "month": m,
            "due_date": due,
            "amount": round(monthly, 2),
            "status": "upcoming",
        })

    loan_id = f"loan_{uuid.uuid4().hex[:10]}"
    loan_doc = {
        "loan_id": loan_id,
        "application_id": application_id,
        "borrower": doc["borrower"],
        "principal": principal,
        "interest_rate": doc["interest_rate"],
        "term_months": months,
        "monthly_payment": round(monthly, 2),
        "total_repayment": round(total, 2),
        "paid_amount": 0.0,
        "status": "active",
        "repayment_schedule": schedule,
        "funded_at": now,
        "funded_by": current.user_id,
    }
    await db.loans.insert_one(loan_doc)
    await db.applications.update_one(
        {"application_id": application_id},
        {"$set": {"status": "funded", "decided_at": now, "decided_by": current.user_id}},
    )
    # Record disbursement transaction
    await db.transactions.insert_one({
        "transaction_id": f"txn_{uuid.uuid4().hex[:10]}",
        "type": "disbursement",
        "amount": -principal,
        "loan_id": loan_id,
        "borrower_name": doc["borrower"]["name"],
        "description": f"Funded loan to {doc['borrower']['name']}",
        "created_at": now,
    })
    await _notify(current.user_id, "Loan funded", f"${principal:,.0f} disbursed to {doc['borrower']['name']}.", "application")
    return Loan(**loan_doc)

# ---------- Loans ----------
@api.get("/loans", response_model=List[Loan])
async def list_loans(status: Optional[str] = None, current: UserPublic = Depends(get_current_user)):
    query = {}
    if status:
        query["status"] = status
    cursor = db.loans.find(query, {"_id": 0}).sort("funded_at", -1)
    docs = await cursor.to_list(200)
    return [Loan(**d) for d in docs]

@api.get("/loans/{loan_id}", response_model=Loan)
async def get_loan(loan_id: str, current: UserPublic = Depends(get_current_user)):
    doc = await db.loans.find_one({"loan_id": loan_id}, {"_id": 0})
    if not doc:
        raise HTTPException(404, "Loan not found")
    return Loan(**doc)

@api.post("/loans/{loan_id}/repay/{month}", response_model=Loan)
async def record_repayment(loan_id: str, month: int, current: UserPublic = Depends(get_current_user)):
    doc = await db.loans.find_one({"loan_id": loan_id}, {"_id": 0})
    if not doc:
        raise HTTPException(404, "Loan not found")
    schedule = doc["repayment_schedule"]
    target = next((s for s in schedule if s["month"] == month), None)
    if not target:
        raise HTTPException(400, "Invalid month")
    if target["status"] == "paid":
        raise HTTPException(400, "Already paid")
    target["status"] = "paid"
    paid = doc["paid_amount"] + target["amount"]
    new_status = "completed" if all(s["status"] == "paid" for s in schedule) else "active"
    await db.loans.update_one(
        {"loan_id": loan_id},
        {"$set": {"repayment_schedule": schedule, "paid_amount": paid, "status": new_status}},
    )
    await db.transactions.insert_one({
        "transaction_id": f"txn_{uuid.uuid4().hex[:10]}",
        "type": "repayment",
        "amount": target["amount"],
        "loan_id": loan_id,
        "borrower_name": doc["borrower"]["name"],
        "description": f"Repayment #{month} from {doc['borrower']['name']}",
        "created_at": datetime.now(timezone.utc),
    })
    await _notify(current.user_id, "Repayment received", f"${target['amount']:,.2f} from {doc['borrower']['name']}.", "repayment")
    doc["repayment_schedule"] = schedule
    doc["paid_amount"] = paid
    doc["status"] = new_status
    return Loan(**doc)

# ---------- Transactions ----------
@api.get("/transactions", response_model=List[Transaction])
async def list_transactions(current: UserPublic = Depends(get_current_user)):
    cursor = db.transactions.find({}, {"_id": 0}).sort("created_at", -1).limit(100)
    docs = await cursor.to_list(100)
    return [Transaction(**d) for d in docs]

# ---------- Notifications ----------
async def _notify(user_id: str, title: str, body: str, type_: str = "system"):
    await db.notifications.insert_one({
        "notification_id": f"ntf_{uuid.uuid4().hex[:10]}",
        "user_id": user_id,
        "title": title,
        "body": body,
        "type": type_,
        "read": False,
        "created_at": datetime.now(timezone.utc),
    })

@api.get("/notifications", response_model=List[Notification])
async def list_notifications(current: UserPublic = Depends(get_current_user)):
    cursor = db.notifications.find({"user_id": current.user_id}, {"_id": 0}).sort("created_at", -1).limit(50)
    docs = await cursor.to_list(50)
    return [Notification(**d) for d in docs]

@api.post("/notifications/{notification_id}/read")
async def mark_read(notification_id: str, current: UserPublic = Depends(get_current_user)):
    await db.notifications.update_one(
        {"notification_id": notification_id, "user_id": current.user_id},
        {"$set": {"read": True}},
    )
    return {"ok": True}

@api.post("/notifications/read-all")
async def mark_all_read(current: UserPublic = Depends(get_current_user)):
    await db.notifications.update_many({"user_id": current.user_id}, {"$set": {"read": True}})
    return {"ok": True}

# ---------- Dashboard ----------
@api.get("/dashboard")
async def dashboard(current: UserPublic = Depends(get_current_user)):
    loans = await db.loans.find({}, {"_id": 0}).to_list(500)
    apps = await db.applications.find({}, {"_id": 0}).to_list(500)
    total_funded = sum(l["principal"] for l in loans)
    active_loans = [l for l in loans if l["status"] == "active"]
    total_repaid = sum(l["paid_amount"] for l in loans)
    expected_returns = sum(l["total_repayment"] - l["principal"] for l in loans)
    default_count = sum(1 for l in loans if l["status"] == "defaulted")
    default_rate = (default_count / len(loans) * 100) if loans else 0.0
    pending = sum(1 for a in apps if a["status"] == "pending")
    approved = sum(1 for a in apps if a["status"] == "approved")
    # Monthly chart: disbursed per month (last 6 months, calendar-aware)
    now = datetime.now(timezone.utc)
    chart = []
    for i in range(5, -1, -1):
        year = now.year
        month = now.month - i
        while month <= 0:
            month += 12
            year -= 1
        m_label = datetime(year, month, 1).strftime("%b")
        m_total = sum(
            l["principal"] for l in loans
            if l["funded_at"].month == month and l["funded_at"].year == year
        ) if loans else 0
        chart.append({"label": m_label, "value": m_total})
    return {
        "total_funded": round(total_funded, 2),
        "total_repaid": round(total_repaid, 2),
        "expected_returns": round(expected_returns, 2),
        "active_loans": len(active_loans),
        "completed_loans": sum(1 for l in loans if l["status"] == "completed"),
        "pending_applications": pending,
        "approved_applications": approved,
        "default_rate": round(default_rate, 2),
        "chart_disbursed": chart,
    }

# ---------- Seed data ----------
async def seed_demo_data():
    count = await db.applications.count_documents({})
    if count > 0:
        return
    logger.info("Seeding demo applications...")
    avatars = [
        "https://images.unsplash.com/photo-1758600587839-56ba05596c69?w=200&q=80",
        "https://images.unsplash.com/photo-1765648580808-76d75e4f3833?w=200&q=80",
        "https://images.unsplash.com/photo-1621808886790-12905b142573?w=200&q=80",
        "https://images.unsplash.com/photo-1544005313-94ddf0286df2?w=200&q=80",
        "https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=200&q=80",
        "https://images.unsplash.com/photo-1438761681033-6461ffad8d80?w=200&q=80",
    ]
    seed = [
        {"name": "Aria Chen", "age": 29, "occupation": "Software Engineer", "monthly_income": 8500, "employment_years": 5, "existing_debts": 600, "credit_history_years": 7, "previous_defaults": 0, "amount": 15000, "purpose": "Home renovation", "term_months": 24, "interest_rate": 8.5},
        {"name": "Marcus Johnson", "age": 34, "occupation": "Small Business Owner", "monthly_income": 6200, "employment_years": 3, "existing_debts": 900, "credit_history_years": 5, "previous_defaults": 0, "amount": 25000, "purpose": "Business expansion", "term_months": 36, "interest_rate": 11.0},
        {"name": "Priya Patel", "age": 26, "occupation": "Marketing Manager", "monthly_income": 5200, "employment_years": 2, "existing_debts": 350, "credit_history_years": 3, "previous_defaults": 0, "amount": 8000, "purpose": "Debt consolidation", "term_months": 18, "interest_rate": 9.8},
        {"name": "Diego Ramirez", "age": 41, "occupation": "Freelance Designer", "monthly_income": 4500, "employment_years": 6, "existing_debts": 800, "credit_history_years": 10, "previous_defaults": 1, "amount": 12000, "purpose": "Equipment purchase", "term_months": 24, "interest_rate": 12.5},
        {"name": "Sofia Nakamura", "age": 23, "occupation": "Graduate Student", "monthly_income": 2200, "employment_years": 1, "existing_debts": 200, "credit_history_years": 1, "previous_defaults": 0, "amount": 5000, "purpose": "Education", "term_months": 12, "interest_rate": 10.5},
        {"name": "James O'Connor", "age": 48, "occupation": "Construction Foreman", "monthly_income": 7200, "employment_years": 15, "existing_debts": 1100, "credit_history_years": 20, "previous_defaults": 0, "amount": 20000, "purpose": "Vehicle purchase", "term_months": 36, "interest_rate": 7.9},
        {"name": "Emma Lindqvist", "age": 31, "occupation": "Nurse Practitioner", "monthly_income": 7800, "employment_years": 8, "existing_debts": 500, "credit_history_years": 9, "previous_defaults": 0, "amount": 10000, "purpose": "Wedding", "term_months": 24, "interest_rate": 8.2},
        {"name": "Kai Tanaka", "age": 37, "occupation": "Restaurant Manager", "monthly_income": 4800, "employment_years": 2, "existing_debts": 1500, "credit_history_years": 4, "previous_defaults": 2, "amount": 18000, "purpose": "Medical expenses", "term_months": 30, "interest_rate": 13.5},
        {"name": "Olivia Brooks", "age": 28, "occupation": "Data Analyst", "monthly_income": 6500, "employment_years": 4, "existing_debts": 400, "credit_history_years": 6, "previous_defaults": 0, "amount": 14000, "purpose": "Home renovation", "term_months": 24, "interest_rate": 8.8},
        {"name": "Noah Williams", "age": 35, "occupation": "Truck Driver", "monthly_income": 5400, "employment_years": 10, "existing_debts": 700, "credit_history_years": 12, "previous_defaults": 0, "amount": 9000, "purpose": "Family vacation", "term_months": 18, "interest_rate": 9.5},
    ]
    now = datetime.now(timezone.utc)
    for i, s in enumerate(seed):
        app_id = f"app_{uuid.uuid4().hex[:10]}"
        doc = {
            "application_id": app_id,
            "borrower": {
                "name": s["name"],
                "avatar": avatars[i % len(avatars)],
                "age": s["age"],
                "occupation": s["occupation"],
                "monthly_income": s["monthly_income"],
                "employment_years": s["employment_years"],
                "existing_debts": s["existing_debts"],
                "credit_history_years": s["credit_history_years"],
                "previous_defaults": s["previous_defaults"],
            },
            "amount": s["amount"],
            "purpose": s["purpose"],
            "term_months": s["term_months"],
            "interest_rate": s["interest_rate"],
            "status": "pending",
            "ai_score": None,
            "ai_risk": None,
            "ai_recommendation": None,
            "ai_reasoning": None,
            "ai_factors": None,
            "created_at": now - timedelta(hours=i * 3),
            "decided_at": None,
            "decided_by": None,
        }
        await db.applications.insert_one(doc)
    logger.info("Seed complete")

@app.on_event("startup")
async def startup():
    await seed_demo_data()

@app.on_event("shutdown")
async def shutdown():
    client.close()

app.include_router(api)

app.add_middleware(
    CORSMiddleware,
    allow_credentials=True,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

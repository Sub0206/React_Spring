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
    mobile: str
    name: str
    email: Optional[str] = None
    picture: Optional[str] = None
    role: str = "lender"
    subscription_plan: Optional[str] = None
    subscription_status: Optional[str] = None
    subscription_expires_at: Optional[datetime] = None
    created_at: datetime

class SendOtpRequest(BaseModel):
    mobile: str
    name: Optional[str] = None
    purpose: Literal["signup", "login"] = "login"

class VerifyOtpRequest(BaseModel):
    mobile: str
    otp: str

class GoogleAuthRequest(BaseModel):
    session_id: str

class TokenResponse(BaseModel):
    access_token: str
    user: UserPublic

class ClientModel(BaseModel):
    client_id: str
    lender_id: str
    name: str
    mobile: str
    aadhaar_masked: str
    pan: str
    aadhaar_name: Optional[str] = None
    pan_name: Optional[str] = None
    pan_dob: Optional[str] = None
    address_line1: Optional[str] = None
    address_line2: Optional[str] = None
    city: Optional[str] = None
    state: Optional[str] = None
    pincode: Optional[str] = None
    aadhaar_verified: bool = False
    pan_verified: bool = False
    otp_verified: bool = False
    status: str = "active"
    reject_reason: Optional[str] = None
    reject_at: Optional[datetime] = None
    avatar: Optional[str] = None
    created_at: datetime

class VerifyAadhaarRequest(BaseModel):
    aadhaar: str

class AadhaarOtpVerifyRequest(BaseModel):
    verification_id: str
    otp: str

class VerifyPanRequest(BaseModel):
    pan: str

class AnalyzeStatementRequest(BaseModel):
    client_id: str
    file_name: str
    file_size: int = 0
    months: Literal[3, 6, 12] = 6

class CibilRequest(BaseModel):
    client_id: str

class CreateLoanAppRequest(BaseModel):
    client_id: str
    amount: float
    purpose: str
    term_months: int
    interest_rate: float
    statement_analysis: Optional[dict] = None
    cibil_report: Optional[dict] = None

class ClientOtpRequest(BaseModel):
    mobile: str

class ClientVerifyOtpRequest(BaseModel):
    verification_id: str
    otp: str

class CreateClientRequest(BaseModel):
    name: str
    mobile: str
    aadhaar: str
    pan: str
    verification_id: Optional[str] = None
    aadhaar_verification_id: Optional[str] = None
    aadhaar_name: Optional[str] = None
    pan_name: Optional[str] = None
    pan_dob: Optional[str] = None
    address_line1: Optional[str] = None
    address_line2: Optional[str] = None
    city: Optional[str] = None
    state: Optional[str] = None
    pincode: Optional[str] = None

class SubscribeRequest(BaseModel):
    plan: Literal["starter", "smart", "prime"]
    method: Literal["upi", "card", "phonepe", "gpay"] = "upi"

class RejectLoanRequest(BaseModel):
    client_id: str
    reason: str
    statement_analysis: Optional[dict] = None
    cibil_report: Optional[dict] = None

class ApproveLoanRequest(BaseModel):
    client_id: str
    amount: float
    term_months: int
    interest_rate: float = 0.0
    due_day: Optional[int] = None  # Day of month for EMI due (1-28). None = 30-day cadence from now.
    proof_image_base64: Optional[str] = None
    statement_analysis: Optional[dict] = None
    cibil_report: Optional[dict] = None

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
    paid_at: Optional[datetime] = None
    was_late: bool = False

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

# --- Indian KYC validators (mock / format-level) ---
_VERHOEFF_D = [
    [0,1,2,3,4,5,6,7,8,9],
    [1,2,3,4,0,6,7,8,9,5],
    [2,3,4,0,1,7,8,9,5,6],
    [3,4,0,1,2,8,9,5,6,7],
    [4,0,1,2,3,9,5,6,7,8],
    [5,9,8,7,6,0,4,3,2,1],
    [6,5,9,8,7,1,0,4,3,2],
    [7,6,5,9,8,2,1,0,4,3],
    [8,7,6,5,9,3,2,1,0,4],
    [9,8,7,6,5,4,3,2,1,0],
]
_VERHOEFF_P = [
    [0,1,2,3,4,5,6,7,8,9],
    [1,5,7,6,2,8,3,0,9,4],
    [5,8,0,3,7,9,6,1,4,2],
    [8,9,1,6,0,4,3,5,2,7],
    [9,4,5,3,1,2,6,8,7,0],
    [4,2,8,6,5,7,3,9,0,1],
    [2,7,9,3,8,0,6,4,1,5],
    [7,0,4,6,9,1,3,2,5,8],
]

def validate_aadhaar(num: str) -> dict:
    s = "".join(ch for ch in num if ch.isdigit())
    if len(s) != 12:
        return {"valid": False, "reason": "Aadhaar must be exactly 12 digits."}
    if s[0] in "01":
        return {"valid": False, "reason": "Aadhaar cannot start with 0 or 1."}
    c = 0
    for i, digit in enumerate(reversed(s)):
        c = _VERHOEFF_D[c][_VERHOEFF_P[i % 8][int(digit)]]
    if c != 0:
        return {"valid": False, "reason": "Invalid Aadhaar checksum."}
    import hashlib
    h = hashlib.md5(s.encode()).hexdigest()
    firsts = ["Ravi","Priya","Amit","Neha","Arjun","Divya","Rohit","Sneha","Vikas","Anita"]
    lasts = ["Kumar","Sharma","Patel","Singh","Mehta","Gupta","Rao","Iyer","Nair","Reddy"]
    name = f"{firsts[int(h[0:2],16)%10]} {lasts[int(h[2:4],16)%10]}"
    return {"valid": True, "masked": f"XXXX-XXXX-{s[-4:]}", "name": name}

import re as _re
_PAN_REGEX = _re.compile(r"^[A-Z]{5}[0-9]{4}[A-Z]$")

def validate_pan(pan: str) -> dict:
    p = (pan or "").strip().upper()
    if not _PAN_REGEX.match(p):
        return {"valid": False, "reason": "PAN must match format AAAAA9999A."}
    entity = p[3]
    entity_map = {
        "P": "Individual", "F": "Firm", "C": "Company", "H": "HUF",
        "A": "AOP", "T": "Trust", "B": "BOI", "L": "Local authority",
        "J": "Artificial Juridical", "G": "Government", "E": "LLP",
    }
    # Deterministic mock name/DOB from PAN
    import hashlib
    h = hashlib.md5(p.encode()).hexdigest()
    first_names = ["Ravi","Priya","Amit","Neha","Arjun","Divya","Rohit","Sneha","Vikas","Anita","Suresh","Pooja","Karan","Meera","Rahul","Kavya"]
    last_names = ["Kumar","Sharma","Patel","Singh","Mehta","Gupta","Rao","Iyer","Nair","Reddy","Pillai","Joshi","Bose","Chopra","Banerjee","Malhotra"]
    fn = first_names[int(h[0:2], 16) % len(first_names)]
    ln = last_names[int(h[2:4], 16) % len(last_names)]
    year = 1970 + (int(h[4:6], 16) % 35)
    month = 1 + (int(h[6:8], 16) % 12)
    day = 1 + (int(h[8:10], 16) % 28)
    return {
        "valid": True,
        "entity": entity_map.get(entity, "Individual"),
        "pan": p,
        "name": f"{fn} {ln}",
        "dob": f"{day:02d}/{month:02d}/{year}",
    }

def mask_mobile(m: str) -> str:
    digits = "".join(ch for ch in m if ch.isdigit())
    if len(digits) < 6:
        return m
    return "X" * (len(digits) - 4) + digits[-4:]

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
def _normalize_mobile(m: str) -> str:
    digits = "".join(ch for ch in (m or "") if ch.isdigit())
    # Keep last 10 digits for India; still accept others
    if len(digits) > 10:
        return digits[-10:]
    return digits

def _generate_otp() -> str:
    import random
    return f"{random.randint(100000, 999999)}"

@api.post("/auth/send-otp")
async def auth_send_otp(body: SendOtpRequest):
    mobile = _normalize_mobile(body.mobile)
    if len(mobile) != 10:
        raise HTTPException(400, "Invalid mobile number. Enter 10-digit Indian mobile.")
    existing = await db.users.find_one({"mobile": mobile}, {"_id": 0})
    if body.purpose == "login" and not existing:
        raise HTTPException(404, "No account found. Please sign up first.")
    if body.purpose == "signup" and existing:
        raise HTTPException(400, "Mobile already registered. Please sign in.")
    if body.purpose == "signup" and not (body.name and body.name.strip()):
        raise HTTPException(400, "Name is required for sign up.")
    otp = _generate_otp()
    await db.otps.delete_many({"mobile": mobile, "scope": "auth"})
    await db.otps.insert_one({
        "mobile": mobile,
        "scope": "auth",
        "otp": otp,
        "purpose": body.purpose,
        "name": (body.name or "").strip() or None,
        "expires_at": datetime.now(timezone.utc) + timedelta(minutes=5),
        "created_at": datetime.now(timezone.utc),
    })
    logger.info(f"[MOCK-OTP] auth OTP for {mobile}: {otp}")
    # Return OTP in response for demo/mock mode
    return {"ok": True, "mobile": mobile, "demo_otp": otp, "message": "OTP sent (mock). Valid 5 minutes."}

@api.post("/auth/verify-otp", response_model=TokenResponse)
async def auth_verify_otp(body: VerifyOtpRequest):
    mobile = _normalize_mobile(body.mobile)
    rec = await db.otps.find_one({"mobile": mobile, "scope": "auth"}, {"_id": 0})
    if not rec:
        raise HTTPException(400, "OTP not found. Please request again.")
    expires_at = rec["expires_at"]
    if isinstance(expires_at, str):
        expires_at = datetime.fromisoformat(expires_at)
    if expires_at.tzinfo is None:
        expires_at = expires_at.replace(tzinfo=timezone.utc)
    if expires_at < datetime.now(timezone.utc):
        raise HTTPException(400, "OTP expired. Please request a new one.")
    if rec["otp"] != body.otp.strip():
        raise HTTPException(400, "Invalid OTP.")

    user = await db.users.find_one({"mobile": mobile}, {"_id": 0})
    if not user:
        # Signup flow
        if rec.get("purpose") != "signup":
            raise HTTPException(404, "No account. Please sign up.")
        user_id = f"user_{uuid.uuid4().hex[:12]}"
        user = {
            "user_id": user_id,
            "mobile": mobile,
            "name": rec.get("name") or f"Lender {mobile[-4:]}",
            "email": None,
            "picture": None,
            "role": "lender",
            "mobile_verified": True,
            "created_at": datetime.now(timezone.utc),
        }
        await db.users.insert_one(user)

    await db.otps.delete_one({"mobile": mobile, "scope": "auth"})
    token = create_access_token(user["user_id"])
    public = {k: v for k, v in user.items() if k not in ("password_hash", "mobile_verified")}
    public.setdefault("email", None)
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
            "mobile": "",
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
        user.setdefault("mobile", "")

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

# ---------- Client Management ----------
@api.post("/clients/verify-aadhaar")
async def client_verify_aadhaar(body: VerifyAadhaarRequest):
    res = validate_aadhaar(body.aadhaar)
    return res

@api.post("/clients/verify-pan")
async def client_verify_pan(body: VerifyPanRequest):
    res = validate_pan(body.pan)
    return res

@api.post("/clients/aadhaar-send-otp")
async def aadhaar_send_otp(body: VerifyAadhaarRequest, current: UserPublic = Depends(get_current_user)):
    a = validate_aadhaar(body.aadhaar)
    if not a["valid"]:
        raise HTTPException(400, a.get("reason", "Invalid Aadhaar"))
    otp = _generate_otp()
    vid = f"av_{uuid.uuid4().hex[:14]}"
    await db.otps.insert_one({
        "verification_id": vid,
        "scope": "aadhaar",
        "lender_id": current.user_id,
        "aadhaar_last4": body.aadhaar.strip()[-4:],
        "aadhaar_full": body.aadhaar.strip(),
        "otp": otp,
        "verified": False,
        "expires_at": datetime.now(timezone.utc) + timedelta(minutes=5),
        "created_at": datetime.now(timezone.utc),
    })
    logger.info(f"[MOCK-OTP] aadhaar OTP for ****{body.aadhaar.strip()[-4:]}: {otp}")
    return {"verification_id": vid, "masked": a["masked"], "demo_otp": otp}

@api.post("/clients/aadhaar-verify-otp")
async def aadhaar_verify_otp(body: AadhaarOtpVerifyRequest, current: UserPublic = Depends(get_current_user)):
    rec = await db.otps.find_one({"verification_id": body.verification_id, "scope": "aadhaar"}, {"_id": 0})
    if not rec or rec.get("lender_id") != current.user_id:
        raise HTTPException(400, "Verification session not found")
    exp = rec["expires_at"]
    if isinstance(exp, str):
        exp = datetime.fromisoformat(exp)
    if exp.tzinfo is None:
        exp = exp.replace(tzinfo=timezone.utc)
    if exp < datetime.now(timezone.utc):
        raise HTTPException(400, "Aadhaar OTP expired")
    if rec["otp"] != body.otp.strip():
        raise HTTPException(400, "Invalid Aadhaar OTP")
    # Deterministic mock name from aadhaar
    import hashlib
    h = hashlib.md5(rec["aadhaar_full"].encode()).hexdigest()
    first = ["Ravi","Priya","Amit","Neha","Arjun","Divya","Rohit","Sneha"][int(h[0:2], 16) % 8]
    last = ["Kumar","Sharma","Patel","Singh","Mehta","Gupta","Rao","Iyer"][int(h[2:4], 16) % 8]
    name = f"{first} {last}"
    await db.otps.update_one(
        {"verification_id": body.verification_id},
        {"$set": {"verified": True, "aadhaar_name": name, "verified_at": datetime.now(timezone.utc)}},
    )
    a_last4 = rec["aadhaar_last4"]
    return {"verified": True, "name": name, "masked": f"XXXX-XXXX-{a_last4}"}


@api.post("/clients/send-otp")
async def client_send_otp(body: ClientOtpRequest, current: UserPublic = Depends(get_current_user)):
    mobile = _normalize_mobile(body.mobile)
    if len(mobile) != 10:
        raise HTTPException(400, "Enter a valid 10-digit mobile number.")
    otp = _generate_otp()
    verification_id = f"vr_{uuid.uuid4().hex[:14]}"
    await db.otps.insert_one({
        "verification_id": verification_id,
        "mobile": mobile,
        "scope": "client",
        "lender_id": current.user_id,
        "otp": otp,
        "verified": False,
        "expires_at": datetime.now(timezone.utc) + timedelta(minutes=5),
        "created_at": datetime.now(timezone.utc),
    })
    logger.info(f"[MOCK-OTP] client OTP for {mobile}: {otp}")
    return {"verification_id": verification_id, "mobile_masked": mask_mobile(mobile), "demo_otp": otp}

@api.post("/clients/verify-otp")
async def client_verify_otp(body: ClientVerifyOtpRequest, current: UserPublic = Depends(get_current_user)):
    rec = await db.otps.find_one({"verification_id": body.verification_id, "scope": "client"}, {"_id": 0})
    if not rec:
        raise HTTPException(400, "Verification session not found.")
    if rec.get("lender_id") != current.user_id:
        raise HTTPException(403, "Not allowed.")
    expires_at = rec["expires_at"]
    if isinstance(expires_at, str):
        expires_at = datetime.fromisoformat(expires_at)
    if expires_at.tzinfo is None:
        expires_at = expires_at.replace(tzinfo=timezone.utc)
    if expires_at < datetime.now(timezone.utc):
        raise HTTPException(400, "OTP expired.")
    if rec["otp"] != body.otp.strip():
        raise HTTPException(400, "Invalid OTP.")
    await db.otps.update_one(
        {"verification_id": body.verification_id},
        {"$set": {"verified": True, "verified_at": datetime.now(timezone.utc)}},
    )
    return {"verified": True, "verification_id": body.verification_id}

@api.post("/clients", response_model=ClientModel)
async def client_create(body: CreateClientRequest, current: UserPublic = Depends(get_current_user)):
    # Validate Aadhaar
    a = validate_aadhaar(body.aadhaar)
    if not a["valid"]:
        raise HTTPException(400, a.get("reason", "Invalid Aadhaar"))
    # Validate PAN
    p = validate_pan(body.pan)
    if not p["valid"]:
        raise HTTPException(400, p.get("reason", "Invalid PAN"))
    mobile = _normalize_mobile(body.mobile)
    if len(mobile) != 10:
        raise HTTPException(400, "Enter a valid 10-digit mobile number.")
    if not body.name or not body.name.strip():
        raise HTTPException(400, "Name is required.")
    # OTP verification is optional — if provided, validate it; otherwise proceed without.
    otp_verified_flag = False
    if body.verification_id:
        vr = await db.otps.find_one({"verification_id": body.verification_id, "scope": "client"}, {"_id": 0})
        if not vr or not vr.get("verified"):
            raise HTTPException(400, "Mobile OTP not verified.")
        if vr.get("lender_id") != current.user_id:
            raise HTTPException(403, "Verification belongs to another lender.")
        if _normalize_mobile(vr["mobile"]) != mobile:
            raise HTTPException(400, "Verified mobile does not match client mobile.")
        otp_verified_flag = True
    # Dedup check
    dup = await db.clients.find_one(
        {"lender_id": current.user_id, "$or": [
            {"mobile": mobile},
            {"pan": p["pan"]},
            {"aadhaar_hash": hash_password(body.aadhaar)} if False else {"aadhaar_last4": body.aadhaar[-4:]},
        ]},
        {"_id": 0},
    )
    # Simpler: dedup by (lender_id, mobile)
    dup_mobile = await db.clients.find_one({"lender_id": current.user_id, "mobile": mobile}, {"_id": 0})
    if dup_mobile:
        raise HTTPException(400, "A client with this mobile already exists.")
    dup_pan = await db.clients.find_one({"lender_id": current.user_id, "pan": p["pan"]}, {"_id": 0})
    if dup_pan:
        raise HTTPException(400, "A client with this PAN already exists.")

    client_id = f"cli_{uuid.uuid4().hex[:12]}"
    avatars = [
        "https://images.unsplash.com/photo-1758600587839-56ba05596c69?w=200&q=80",
        "https://images.unsplash.com/photo-1765648580808-76d75e4f3833?w=200&q=80",
        "https://images.unsplash.com/photo-1621808886790-12905b142573?w=200&q=80",
        "https://images.unsplash.com/photo-1544005313-94ddf0286df2?w=200&q=80",
        "https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=200&q=80",
    ]
    import random as _r
    doc = {
        "client_id": client_id,
        "lender_id": current.user_id,
        "name": body.name.strip(),
        "mobile": mobile,
        "aadhaar_masked": a["masked"],
        "aadhaar_last4": body.aadhaar.strip()[-4:],
        "pan": p["pan"],
        "aadhaar_name": body.aadhaar_name,
        "pan_name": body.pan_name or p.get("name"),
        "pan_dob": body.pan_dob or p.get("dob"),
        "address_line1": body.address_line1,
        "address_line2": body.address_line2,
        "city": body.city,
        "state": body.state,
        "pincode": body.pincode,
        "aadhaar_verified": True,
        "pan_verified": True,
        "otp_verified": otp_verified_flag,
        "status": "active",
        "reject_reason": None,
        "reject_at": None,
        "avatar": _r.choice(avatars),
        "created_at": datetime.now(timezone.utc),
    }
    await db.clients.insert_one(doc)
    if body.verification_id:
        await db.otps.delete_one({"verification_id": body.verification_id})
    # Strip fields not in response model
    public = {k: v for k, v in doc.items() if k != "aadhaar_last4"}
    return ClientModel(**public)

@api.get("/clients", response_model=List[ClientModel])
async def client_list(q: Optional[str] = None, current: UserPublic = Depends(get_current_user)):
    query = {"lender_id": current.user_id}
    if q and q.strip():
        term = q.strip()
        import re as _re2
        rx = {"$regex": _re2.escape(term), "$options": "i"}
        query = {
            "lender_id": current.user_id,
            "$or": [
                {"name": rx},
                {"mobile": {"$regex": _re2.escape(term)}},
                {"pan": {"$regex": _re2.escape(term.upper())}},
                {"aadhaar_masked": {"$regex": _re2.escape(term)}},
            ],
        }
    cursor = db.clients.find(query, {"_id": 0, "aadhaar_last4": 0}).sort("created_at", -1)
    docs = await cursor.to_list(500)
    return [ClientModel(**d) for d in docs]

@api.get("/clients/{client_id}", response_model=ClientModel)
async def client_get(client_id: str, current: UserPublic = Depends(get_current_user)):
    doc = await db.clients.find_one(
        {"client_id": client_id, "lender_id": current.user_id},
        {"_id": 0, "aadhaar_last4": 0},
    )
    if not doc:
        raise HTTPException(404, "Client not found")
    return ClientModel(**doc)

@api.delete("/clients/{client_id}")
async def client_delete(client_id: str, current: UserPublic = Depends(get_current_user)):
    res = await db.clients.delete_one({"client_id": client_id, "lender_id": current.user_id})
    if res.deleted_count == 0:
        raise HTTPException(404, "Client not found")
    return {"ok": True}

@api.get("/clients/{client_id}/loans", response_model=List[LoanApplication])
async def client_loans(client_id: str, current: UserPublic = Depends(get_current_user)):
    """Return loan applications associated with this client (by client_id)."""
    client = await db.clients.find_one({"client_id": client_id, "lender_id": current.user_id}, {"_id": 0})
    if not client:
        raise HTTPException(404, "Client not found")
    cursor = db.applications.find({"client_id": client_id, "lender_id": current.user_id}, {"_id": 0}).sort("created_at", -1)
    docs = await cursor.to_list(100)
    return [LoanApplication(**d) for d in docs]

# ---------- Loan Analysis (Bank statement + CIBIL) ----------
async def _llm_json(system: str, user: str, session_id: str) -> dict:
    """Call Claude and parse JSON response."""
    try:
        from emergentintegrations.llm.chat import LlmChat, UserMessage
        chat = LlmChat(
            api_key=EMERGENT_LLM_KEY,
            session_id=session_id,
            system_message=system,
        ).with_model("anthropic", "claude-sonnet-4-5-20250929")
        resp = await chat.send_message(UserMessage(text=user))
        text = (resp or "").strip()
        start = text.find("{")
        end = text.rfind("}")
        if start == -1 or end == -1:
            raise ValueError("no json")
        return json.loads(text[start:end + 1])
    except Exception as e:
        logger.error(f"LLM error: {e}")
        raise

def _fallback_statement_analysis(client: dict, months: int) -> dict:
    """Deterministic fallback if LLM fails."""
    import hashlib, random as _r
    seed = int(hashlib.md5((client["client_id"] + str(months)).encode()).hexdigest()[:8], 16)
    rnd = _r.Random(seed)
    bounces = rnd.randint(0, 5)
    avg_balance = rnd.randint(15000, 250000)
    inflow = rnd.randint(30000, 120000)
    outflow = int(inflow * rnd.uniform(0.55, 0.95))
    # Risk category
    if bounces == 0 and avg_balance >= 80000:
        risk, color = "low", "green"
    elif bounces <= 2:
        risk, color = "medium", "yellow"
    else:
        risk, color = "high", "red"
    from datetime import datetime as _dt
    now = _dt.now(timezone.utc)
    chart = []
    for i in range(months - 1, -1, -1):
        y, m = now.year, now.month - i
        while m <= 0:
            m += 12; y -= 1
        label = _dt(y, m, 1).strftime("%b")
        inc = int(inflow * rnd.uniform(0.8, 1.2))
        exp = int(outflow * rnd.uniform(0.8, 1.2))
        chart.append({"label": label, "credit": inc, "debit": exp, "bounces": rnd.randint(0, bounces)})
    return {
        "months_analyzed": months,
        "total_credit": sum(c["credit"] for c in chart),
        "total_debit": sum(c["debit"] for c in chart),
        "avg_balance": avg_balance,
        "bounced_transactions": bounces,
        "salary_credits_detected": rnd.randint(max(0, months - 1), months),
        "bounce_risk": risk,
        "risk_color": color,
        "chart": chart,
        "summary": (
            f"{months}-month bank statement review detected {bounces} bounced transaction(s), "
            f"avg balance ₹{avg_balance:,}, and {risk} bounce risk."
        ),
        "highlights": [
            f"{'Consistent' if bounces == 0 else 'Irregular'} salary inflow pattern",
            f"Average monthly balance ~ ₹{avg_balance:,}",
            f"{bounces} dishonoured transaction(s) in window",
            f"Inflow/outflow ratio: {(inflow/max(outflow,1)):.2f}",
        ],
    }

@api.post("/loan-apps/analyze-statement")
async def analyze_statement(body: AnalyzeStatementRequest, current: UserPublic = Depends(get_current_user)):
    client = await db.clients.find_one({"client_id": body.client_id, "lender_id": current.user_id}, {"_id": 0})
    if not client:
        raise HTTPException(404, "Client not found")
    months = int(body.months)
    system = (
        "You are an expert bank-statement analyst for a lending platform. "
        "Return STRICT JSON. Do not include text outside JSON."
    )
    user_prompt = f"""
Analyze a simulated {months}-month bank statement for this client:
- Name: {client['name']}
- Mobile: {client['mobile']}
- PAN: {client['pan']}
- Uploaded file: {body.file_name} ({body.file_size} bytes)

Return JSON with EXACT schema:
{{
  "months_analyzed": {months},
  "total_credit": <int rupees>,
  "total_debit": <int rupees>,
  "avg_balance": <int rupees>,
  "bounced_transactions": <int 0-8>,
  "salary_credits_detected": <int 0-{months}>,
  "bounce_risk": "<low|medium|high>",
  "risk_color": "<green|yellow|red>",
  "chart": [
    {{"label": "<Jan/Feb/etc>", "credit": <int>, "debit": <int>, "bounces": <int>}},
    ... exactly {months} items chronological
  ],
  "summary": "<2-3 sentence narrative>",
  "highlights": ["<bullet 1>", "<bullet 2>", "<bullet 3>", "<bullet 4>"]
}}

Realism rules: if bounced_transactions == 0 and avg_balance >= 80000 → risk low/green.
If 1-2 bounces → medium/yellow. If 3+ bounces or avg_balance < 20000 → high/red.
Use realistic Indian-salary ranges (₹25k-₹1.5L inflow/month).
"""
    try:
        parsed = await _llm_json(system, user_prompt, f"stmt-{body.client_id}-{uuid.uuid4().hex[:6]}")
        # Save analysis
        analysis_id = f"ana_{uuid.uuid4().hex[:10]}"
        parsed["analysis_id"] = analysis_id
        parsed["client_id"] = body.client_id
        parsed["file_name"] = body.file_name
        parsed["created_at"] = datetime.now(timezone.utc).isoformat()
        await db.statement_analyses.insert_one({**parsed, "lender_id": current.user_id})
        parsed.pop("_id", None)
        return parsed
    except Exception:
        fb = _fallback_statement_analysis(client, months)
        fb["analysis_id"] = f"ana_{uuid.uuid4().hex[:10]}"
        fb["client_id"] = body.client_id
        fb["file_name"] = body.file_name
        fb["created_at"] = datetime.now(timezone.utc).isoformat()
        return fb

@api.post("/loan-apps/check-cibil")
async def check_cibil(body: CibilRequest, current: UserPublic = Depends(get_current_user)):
    client = await db.clients.find_one({"client_id": body.client_id, "lender_id": current.user_id}, {"_id": 0})
    if not client:
        raise HTTPException(404, "Client not found")
    system = "You are a credit-bureau analyst. Return STRICT JSON only."
    user_prompt = f"""
Generate a realistic mock CIBIL credit report for:
- Name: {client['name']}
- PAN: {client['pan']}
- Mobile: {client['mobile']}

Return JSON with schema:
{{
  "score": <int 300-900>,
  "band": "<poor|fair|good|excellent>",
  "band_color": "<red|yellow|green|blue>",
  "on_time_payments_pct": <float 60-100>,
  "credit_utilization_pct": <float 5-95>,
  "total_accounts": <int 1-15>,
  "active_loans": <int 0-6>,
  "hard_enquiries_6m": <int 0-8>,
  "factors": [
    {{"label": "<factor>", "impact": "<positive|negative|neutral>", "detail": "<brief>"}},
    ... 4 items
  ],
  "summary": "<2-3 sentence narrative>"
}}

Band rules: 300-579 poor/red, 580-669 fair/yellow, 670-749 good/green, 750-900 excellent/blue.
"""
    try:
        parsed = await _llm_json(system, user_prompt, f"cibil-{body.client_id}-{uuid.uuid4().hex[:6]}")
    except Exception:
        import hashlib, random as _r
        seed = int(hashlib.md5(client["pan"].encode()).hexdigest()[:8], 16)
        rnd = _r.Random(seed)
        score = rnd.randint(520, 820)
        band, col = (
            ("excellent", "blue") if score >= 750 else
            ("good", "green") if score >= 670 else
            ("fair", "yellow") if score >= 580 else ("poor", "red")
        )
        parsed = {
            "score": score, "band": band, "band_color": col,
            "on_time_payments_pct": round(rnd.uniform(75, 99), 1),
            "credit_utilization_pct": round(rnd.uniform(15, 75), 1),
            "total_accounts": rnd.randint(2, 9),
            "active_loans": rnd.randint(0, 4),
            "hard_enquiries_6m": rnd.randint(0, 5),
            "factors": [
                {"label": "Payment history", "impact": "positive" if score >= 700 else "negative", "detail": "Recent on-time EMI pattern"},
                {"label": "Credit utilization", "impact": "neutral", "detail": "Within typical range"},
                {"label": "Credit mix", "impact": "positive", "detail": "Healthy blend of secured/unsecured"},
                {"label": "Enquiry velocity", "impact": "negative" if score < 650 else "neutral", "detail": "Recent enquiries observed"},
            ],
            "summary": f"CIBIL score {score} ({band}). Overall credit discipline appears {band}.",
        }
    parsed["report_id"] = f"cib_{uuid.uuid4().hex[:10]}"
    parsed["client_id"] = body.client_id
    parsed["pan"] = client["pan"]
    parsed["name"] = client["name"]
    parsed["created_at"] = datetime.now(timezone.utc).isoformat()
    await db.cibil_reports.insert_one({**parsed, "lender_id": current.user_id})
    parsed.pop("_id", None)
    return parsed

# ---------- Subscriptions ----------
PLANS = [
    {"id": "starter", "name": "Starter Loan", "price": 2999, "features": ["Up to 10 active clients", "Basic KYC verification", "Mobile OTP verification", "Email support"]},
    {"id": "smart", "name": "Smart Credit", "price": 4999, "features": ["Up to 50 clients", "AI credit scoring", "Bank statement analysis", "Priority email support"], "popular": True},
    {"id": "prime", "name": "Prime Elite", "price": 6999, "features": ["Unlimited clients", "CIBIL reports & scoring", "AI risk analytics", "Dedicated manager", "24/7 support"]},
]

@api.get("/subscriptions/plans")
async def list_plans():
    return {"plans": PLANS}

@api.post("/subscriptions/subscribe")
async def subscribe(body: SubscribeRequest, current: UserPublic = Depends(get_current_user)):
    plan = next((p for p in PLANS if p["id"] == body.plan), None)
    if not plan:
        raise HTTPException(400, "Invalid plan")
    now = datetime.now(timezone.utc)
    expires = now + timedelta(days=30)
    await db.users.update_one(
        {"user_id": current.user_id},
        {"$set": {
            "subscription_plan": plan["id"],
            "subscription_status": "active",
            "subscription_expires_at": expires,
        }},
    )
    await db.payments.insert_one({
        "payment_id": f"pay_{uuid.uuid4().hex[:10]}",
        "user_id": current.user_id,
        "plan": plan["id"],
        "amount": plan["price"],
        "method": body.method,
        "status": "success",
        "created_at": now,
    })
    await _notify(current.user_id, "Subscription active",
                  f"Welcome to {plan['name']}. Valid till {expires.strftime('%d %b %Y')}.", "system")
    return {"ok": True, "plan": plan, "expires_at": expires.isoformat()}

@api.get("/subscriptions/me")
async def my_subscription(current: UserPublic = Depends(get_current_user)):
    user = await db.users.find_one({"user_id": current.user_id}, {"_id": 0})
    return {
        "plan": user.get("subscription_plan"),
        "status": user.get("subscription_status"),
        "expires_at": user.get("subscription_expires_at"),
    }

# ---------- Loan approve / reject ----------
@api.post("/loan-apps/reject")
async def reject_loan(body: RejectLoanRequest, current: UserPublic = Depends(get_current_user)):
    client = await db.clients.find_one({"client_id": body.client_id, "lender_id": current.user_id}, {"_id": 0})
    if not client:
        raise HTTPException(404, "Client not found")
    now = datetime.now(timezone.utc)
    await db.clients.update_one(
        {"client_id": body.client_id, "lender_id": current.user_id},
        {"$set": {"status": "rejected", "reject_reason": body.reason.strip() or "No reason", "reject_at": now}},
    )
    # Record application record for history
    app_id = f"app_{uuid.uuid4().hex[:10]}"
    await db.applications.insert_one({
        "application_id": app_id,
        "client_id": body.client_id,
        "lender_id": current.user_id,
        "borrower": {
            "name": client["name"], "avatar": client.get("avatar"),
            "age": 30, "occupation": "Client", "monthly_income": 50000.0,
            "employment_years": 3.0, "existing_debts": 0.0,
            "credit_history_years": 5.0, "previous_defaults": 0,
        },
        "amount": 0, "purpose": "N/A", "term_months": 0, "interest_rate": 0,
        "status": "rejected",
        "reject_reason": body.reason,
        "statement_analysis": body.statement_analysis,
        "cibil_report": body.cibil_report,
        "created_at": now, "decided_at": now, "decided_by": current.user_id,
        "ai_score": None, "ai_risk": None, "ai_recommendation": None, "ai_reasoning": None, "ai_factors": None,
    })
    await _notify(current.user_id, "Client rejected",
                  f"{client['name']} marked as rejected. Reason: {body.reason}", "application")
    return {"ok": True, "client_id": body.client_id, "reject_reason": body.reason}

def compute_emi(principal: float, rate_pct_annual: float, months: int) -> float:
    if months <= 0:
        return 0.0
    if rate_pct_annual <= 0:
        return round(principal / months, 2)
    r = rate_pct_annual / 100 / 12
    emi = (principal * r * (1 + r) ** months) / ((1 + r) ** months - 1)
    return round(emi, 2)

@api.post("/loan-apps/approve", response_model=Loan)
async def approve_loan(body: ApproveLoanRequest, current: UserPublic = Depends(get_current_user)):
    client = await db.clients.find_one({"client_id": body.client_id, "lender_id": current.user_id}, {"_id": 0})
    if not client:
        raise HTTPException(404, "Client not found")
    if body.amount <= 0 or body.term_months <= 0:
        raise HTTPException(400, "Amount and term are required")
    principal = float(body.amount)
    months = int(body.term_months)
    rate = float(body.interest_rate or 0)
    emi = compute_emi(principal, rate, months)
    total = round(emi * months, 2)
    now = datetime.now(timezone.utc)
    schedule = []
    # Compute due dates: either anchored to given day-of-month or 30-day cadence
    if body.due_day and 1 <= int(body.due_day) <= 28:
        day = int(body.due_day)
        # First due: nearest future month whose 'day' is at least a week from now to avoid immediate dues
        ref_year, ref_month = now.year, now.month
        # If today's day is past the due day, start from next month; else, use current if > 7 days away
        if now.day >= day:
            ref_month += 1
            if ref_month > 12:
                ref_month = 1; ref_year += 1
        else:
            if (day - now.day) < 7:
                ref_month += 1
                if ref_month > 12:
                    ref_month = 1; ref_year += 1
        for m in range(1, months + 1):
            y, mo = ref_year, ref_month + (m - 1)
            while mo > 12:
                mo -= 12; y += 1
            schedule.append({
                "month": m,
                "due_date": datetime(y, mo, day, 0, 0, 0, tzinfo=timezone.utc),
                "amount": emi,
                "status": "upcoming",
                "paid_at": None,
            })
    else:
        for m in range(1, months + 1):
            schedule.append({
                "month": m,
                "due_date": now + timedelta(days=30 * m),
                "amount": emi,
                "status": "upcoming",
                "paid_at": None,
            })
    # Create application record (approved/funded in one shot)
    app_id = f"app_{uuid.uuid4().hex[:10]}"
    loan_id = f"loan_{uuid.uuid4().hex[:10]}"
    borrower = {
        "name": client["name"], "avatar": client.get("avatar"),
        "age": 30, "occupation": "Client", "monthly_income": 50000.0,
        "employment_years": 3.0, "existing_debts": 0.0,
        "credit_history_years": 5.0, "previous_defaults": 0,
    }
    await db.applications.insert_one({
        "application_id": app_id,
        "client_id": body.client_id, "lender_id": current.user_id,
        "borrower": borrower,
        "amount": principal, "purpose": "Client loan",
        "term_months": months, "interest_rate": rate,
        "status": "funded",
        "statement_analysis": body.statement_analysis,
        "cibil_report": body.cibil_report,
        "created_at": now, "decided_at": now, "decided_by": current.user_id,
        "ai_score": None, "ai_risk": None, "ai_recommendation": None, "ai_reasoning": None, "ai_factors": None,
    })
    await db.loans.insert_one({
        "loan_id": loan_id,
        "application_id": app_id,
        "client_id": body.client_id,
        "borrower": borrower,
        "principal": principal, "interest_rate": rate,
        "term_months": months, "monthly_payment": emi,
        "total_repayment": total, "paid_amount": 0.0,
        "status": "active",
        "repayment_schedule": schedule,
        "proof_image_base64": body.proof_image_base64,
        "funded_at": now, "funded_by": current.user_id,
    })
    await db.transactions.insert_one({
        "transaction_id": f"txn_{uuid.uuid4().hex[:10]}",
        "type": "disbursement", "amount": -principal,
        "loan_id": loan_id, "borrower_name": client["name"],
        "description": f"Disbursed ₹{principal:,.0f} to {client['name']}",
        "created_at": now,
    })
    await _notify(current.user_id, "Loan approved & disbursed",
                  f"₹{principal:,.0f} to {client['name']} · EMI ₹{emi:,.0f}", "application")
    loan_doc = await db.loans.find_one({"loan_id": loan_id}, {"_id": 0, "proof_image_base64": 0})
    return Loan(**loan_doc)

@api.post("/loan-apps/create", response_model=LoanApplication)
async def create_loan_app(body: CreateLoanAppRequest, current: UserPublic = Depends(get_current_user)):
    client = await db.clients.find_one({"client_id": body.client_id, "lender_id": current.user_id}, {"_id": 0})
    if not client:
        raise HTTPException(404, "Client not found")
    if body.amount <= 0 or body.term_months <= 0 or body.interest_rate < 0:
        raise HTTPException(400, "Invalid loan params")
    app_id = f"app_{uuid.uuid4().hex[:10]}"
    now = datetime.now(timezone.utc)
    borrower = {
        "name": client["name"],
        "avatar": client.get("avatar"),
        "age": 30,
        "occupation": "Client",
        "monthly_income": float(body.statement_analysis.get("total_credit", 0) / max(body.statement_analysis.get("months_analyzed", 1), 1)) if body.statement_analysis else 50000.0,
        "employment_years": 3.0,
        "existing_debts": 0.0,
        "credit_history_years": 5.0,
        "previous_defaults": (body.statement_analysis or {}).get("bounced_transactions", 0),
    }
    doc = {
        "application_id": app_id,
        "client_id": body.client_id,
        "lender_id": current.user_id,
        "borrower": borrower,
        "amount": float(body.amount),
        "purpose": body.purpose,
        "term_months": int(body.term_months),
        "interest_rate": float(body.interest_rate),
        "status": "pending",
        "ai_score": None,
        "ai_risk": None,
        "ai_recommendation": None,
        "ai_reasoning": None,
        "ai_factors": None,
        "statement_analysis": body.statement_analysis,
        "cibil_report": body.cibil_report,
        "created_at": now,
        "decided_at": None,
        "decided_by": None,
    }
    await db.applications.insert_one(doc)
    await _notify(current.user_id, "New loan created",
                  f"Loan application of ₹{body.amount:,.0f} created for {client['name']}.",
                  "application")
    doc.pop("_id", None)
    return LoanApplication(**{k: v for k, v in doc.items() if k in LoanApplication.model_fields})

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
async def record_repayment(loan_id: str, month: int, paid_date: Optional[str] = None, current: UserPublic = Depends(get_current_user)):
    doc = await db.loans.find_one({"loan_id": loan_id}, {"_id": 0})
    if not doc:
        raise HTTPException(404, "Loan not found")
    schedule = doc["repayment_schedule"]
    target = next((s for s in schedule if s["month"] == month), None)
    if not target:
        raise HTTPException(400, "Invalid month")
    if target["status"] == "paid":
        raise HTTPException(400, "Already paid")
    # Parse paid_date - default to now
    paid_at = datetime.now(timezone.utc)
    if paid_date:
        try:
            paid_at = datetime.fromisoformat(paid_date.replace("Z", "+00:00"))
            if paid_at.tzinfo is None:
                paid_at = paid_at.replace(tzinfo=timezone.utc)
        except Exception:
            pass
    due = target["due_date"]
    if isinstance(due, str):
        due = datetime.fromisoformat(due)
    if due.tzinfo is None:
        due = due.replace(tzinfo=timezone.utc)
    late = paid_at > due
    target["status"] = "paid"
    target["paid_at"] = paid_at
    target["was_late"] = late
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
        "description": f"Repayment #{month} from {doc['borrower']['name']}" + (" (late)" if late else ""),
        "created_at": paid_at,
    })
    title = "Late repayment" if late else "Repayment received"
    await _notify(current.user_id, title, f"₹{target['amount']:,.2f} from {doc['borrower']['name']}" + (f" (due {due.date()}, paid {paid_at.date()})" if late else ""), "repayment")
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
    loans = await db.loans.find({"funded_by": current.user_id}, {"_id": 0, "proof_image_base64": 0}).to_list(500)
    if not loans:
        loans = await db.loans.find({}, {"_id": 0, "proof_image_base64": 0}).to_list(500)
    total_funded = sum(l["principal"] for l in loans)
    active_loans = [l for l in loans if l["status"] == "active"]
    total_repaid = sum(l["paid_amount"] for l in loans)
    expected_returns = sum(l["total_repayment"] - l["principal"] for l in loans)
    default_count = sum(1 for l in loans if l["status"] == "defaulted")
    default_rate = (default_count / len(loans) * 100) if loans else 0.0
    now = datetime.now(timezone.utc)
    # Overdue: unpaid schedule entries whose due_date < now
    overdue_count = 0
    overdue_amount = 0.0
    for l in loans:
        for s in l.get("repayment_schedule", []):
            if s.get("status") == "paid":
                continue
            due = s["due_date"]
            if isinstance(due, str):
                due = datetime.fromisoformat(due)
            if due.tzinfo is None:
                due = due.replace(tzinfo=timezone.utc)
            if due < now:
                overdue_count += 1
                overdue_amount += s["amount"]
    # Current-month repaid
    month_start = now.replace(day=1, hour=0, minute=0, second=0, microsecond=0)
    current_month_repaid = 0.0
    current_month_disbursed = 0.0
    for l in loans:
        for s in l.get("repayment_schedule", []):
            if s.get("status") == "paid" and s.get("paid_at"):
                pa = s["paid_at"]
                if isinstance(pa, str):
                    pa = datetime.fromisoformat(pa)
                if pa.tzinfo is None:
                    pa = pa.replace(tzinfo=timezone.utc)
                if pa >= month_start:
                    current_month_repaid += s["amount"]
        funded_at = l["funded_at"]
        if isinstance(funded_at, str):
            funded_at = datetime.fromisoformat(funded_at)
        if funded_at.tzinfo is None:
            funded_at = funded_at.replace(tzinfo=timezone.utc)
        if funded_at >= month_start:
            current_month_disbursed += l["principal"]
    # Inflow (repayments) + Outflow (disbursements) last 6 months
    inflow = []
    outflow = []
    for i in range(5, -1, -1):
        y, m = now.year, now.month - i
        while m <= 0:
            m += 12; y -= 1
        label = datetime(y, m, 1).strftime("%b")
        inf = 0.0; outf = 0.0
        for l in loans:
            funded_at = l["funded_at"]
            if isinstance(funded_at, str):
                funded_at = datetime.fromisoformat(funded_at)
            if funded_at.month == m and funded_at.year == y:
                outf += l["principal"]
            for s in l.get("repayment_schedule", []):
                if s.get("status") == "paid" and s.get("paid_at"):
                    pa = s["paid_at"]
                    if isinstance(pa, str):
                        pa = datetime.fromisoformat(pa)
                    if pa.month == m and pa.year == y:
                        inf += s["amount"]
        inflow.append({"label": label, "value": round(inf, 2)})
        outflow.append({"label": label, "value": round(outf, 2)})

    return {
        "total_funded": round(total_funded, 2),
        "total_repaid": round(total_repaid, 2),
        "expected_returns": round(expected_returns, 2),
        "active_loans": len(active_loans),
        "completed_loans": sum(1 for l in loans if l["status"] == "completed"),
        "overdue_count": overdue_count,
        "overdue_amount": round(overdue_amount, 2),
        "current_month_repaid": round(current_month_repaid, 2),
        "current_month_disbursed": round(current_month_disbursed, 2),
        "default_rate": round(default_rate, 2),
        "inflow_chart": inflow,
        "outflow_chart": outflow,
    }

@api.get("/dashboard/overdue")
async def dashboard_overdue(current: UserPublic = Depends(get_current_user)):
    """List loans with overdue unpaid EMIs."""
    loans = await db.loans.find({"funded_by": current.user_id}, {"_id": 0, "proof_image_base64": 0}).to_list(500)
    if not loans:
        loans = await db.loans.find({}, {"_id": 0, "proof_image_base64": 0}).to_list(500)
    now = datetime.now(timezone.utc)
    out = []
    for l in loans:
        overdue_entries = []
        overdue_amount = 0.0
        for s in l.get("repayment_schedule", []):
            if s.get("status") == "paid":
                continue
            due = s["due_date"]
            if isinstance(due, str):
                due = datetime.fromisoformat(due)
            if due.tzinfo is None:
                due = due.replace(tzinfo=timezone.utc)
            if due < now:
                days_late = (now - due).days
                overdue_entries.append({
                    "month": s["month"], "due_date": due.isoformat(),
                    "amount": s["amount"], "days_late": days_late,
                })
                overdue_amount += s["amount"]
        if overdue_entries:
            out.append({
                "loan_id": l["loan_id"],
                "client_id": l.get("client_id"),
                "borrower_name": l["borrower"]["name"],
                "borrower_avatar": l["borrower"].get("avatar"),
                "overdue_count": len(overdue_entries),
                "overdue_amount": round(overdue_amount, 2),
                "overdue_entries": overdue_entries,
                "principal": l["principal"],
            })
    return {"overdue_loans": out}

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

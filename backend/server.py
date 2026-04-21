"""Smart Lending App - Backend API"""
import os
import re
import uuid
import logging
import asyncio
import json
import bcrypt
import jwt as pyjwt
from datetime import datetime, timezone, timedelta
from pathlib import Path
from typing import List, Optional, Literal, Dict, Any, Tuple

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

# Register Unicode fonts globally so all PDF endpoints correctly render ₹, ₨,
# accented characters, and em-dashes. reportlab's built-in Helvetica and the
# system LiberationSans both LACK the U+20B9 ₹ glyph — we use GNU FreeSans
# (/usr/share/fonts/truetype/freefont/) which has full Indian Rupee coverage.
try:
    from reportlab.pdfbase import pdfmetrics as _pdfmetrics
    from reportlab.pdfbase.ttfonts import TTFont as _TTFont
    _FONT_DIR = "/usr/share/fonts/truetype/freefont"
    if Path(f"{_FONT_DIR}/FreeSans.ttf").exists():
        _pdfmetrics.registerFont(_TTFont("LendiqSans",           f"{_FONT_DIR}/FreeSans.ttf"))
        _pdfmetrics.registerFont(_TTFont("LendiqSans-Bold",      f"{_FONT_DIR}/FreeSansBold.ttf"))
        _pdfmetrics.registerFont(_TTFont("LendiqSans-Italic",    f"{_FONT_DIR}/FreeSansOblique.ttf"))
        _pdfmetrics.registerFont(_TTFont("LendiqSans-BoldItalic", f"{_FONT_DIR}/FreeSansBoldOblique.ttf"))
        from reportlab.pdfbase.pdfmetrics import registerFontFamily as _rff
        _rff("LendiqSans", normal="LendiqSans", bold="LendiqSans-Bold",
             italic="LendiqSans-Italic", boldItalic="LendiqSans-BoldItalic")
        # Remap the default "Helvetica" names so existing PDF code (which passes
        # "Helvetica-Bold" to TableStyle) picks up the Rupee-capable face.
        try:
            _pdfmetrics.registerFont(_TTFont("Helvetica",             f"{_FONT_DIR}/FreeSans.ttf"))
            _pdfmetrics.registerFont(_TTFont("Helvetica-Bold",        f"{_FONT_DIR}/FreeSansBold.ttf"))
            _pdfmetrics.registerFont(_TTFont("Helvetica-Oblique",     f"{_FONT_DIR}/FreeSansOblique.ttf"))
            _pdfmetrics.registerFont(_TTFont("Helvetica-BoldOblique", f"{_FONT_DIR}/FreeSansBoldOblique.ttf"))
        except Exception:
            pass
except Exception as _e:
    logging.getLogger(__name__).warning(f"Could not register Unicode PDF fonts: {_e}")



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
    # Optional raw PDF bytes (base64) — when provided, we run real text extraction
    # + bounce-keyword detection instead of the deterministic mock.
    file_base64: Optional[str] = None

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
    decided_by_name: Optional[str] = None
    decision_reason: Optional[str] = None
    approved_amount: Optional[float] = None
    approved_tenure: Optional[int] = None
    approved_rate: Optional[float] = None
    risk_factors_at_decision: Optional[List[str]] = None
    # Populated on read for funded applications so the UI can deep-link
    # into the repayment/loan-track screen.
    loan_id: Optional[str] = None

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
    return await _user_from_token(token)


async def _user_from_token(token: str) -> UserPublic:
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


async def get_current_user_flexible(
    authorization: Optional[str] = Header(None),
    token: Optional[str] = None,
) -> UserPublic:
    """Accepts either `Authorization: Bearer <t>` header OR `?token=<t>` query.

    This is used ONLY for endpoints that render a binary (e.g. PDF) that the
    browser / native share sheet opens directly without a chance to attach
    headers — think `WebBrowser.openBrowserAsync` fallbacks.
    """
    tok: Optional[str] = None
    if authorization and authorization.startswith("Bearer "):
        tok = authorization.split(" ", 1)[1]
    elif token:
        tok = token
    if not tok:
        raise HTTPException(status_code=401, detail="Missing or invalid auth token")
    return await _user_from_token(tok)

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

# ---------- Statement analysis engine ----------
# The engine is DETERMINISTIC: same (client_id, file_name) → same full 12-month
# transaction universe. A 3-month request simply slices the last 3 months from
# that universe — it is guaranteed to be a strict subset of the 6/12-month call.
#
# If the request includes the actual PDF bytes (base64), we additionally:
#   • parse the text layer with pdfplumber
#   • scan every line for bounce/return keywords
#   • run a running-balance sanity check
# and use those findings as the PRIMARY source of truth (overriding the mock).

BOUNCE_KEYWORDS = [
    "chq retn", "chq return", "cheque return", "cheque bounce", "cheque bounced",
    "ecs return", "ecs fail", "ecs bounce", "nach fail", "nach return", "nach bounce",
    "ach return", "ach fail", "emi return", "emi bounce", "emi failed",
    "insufficient funds", "insuff funds", "insuff bal", "insufficient balance",
    "bounced", "return charges", "dishonoured", "dishonour", "returned unpaid",
    "auto debit fail", "auto-debit fail", "autodebit fail",
    "rtn", "reversed", "reversal",
]

BANK_HINTS = {
    "HDFC Bank": ["hdfc"],
    "SBI":       ["state bank", "sbin", " sbi "],
    "ICICI Bank":["icici"],
    "Axis Bank": ["axis bank", " axis "],
    "Kotak":     ["kotak"],
    "IDFC First":["idfc"],
    "PNB":       ["punjab national", " pnb "],
    "Federal Bank":["federal bank"],
    "Canara Bank":["canara"],
    "Yes Bank":  ["yes bank"],
    "Bank of Baroda": ["bank of baroda", " bob "],
    "IndusInd Bank": ["indusind"],
}

def _extract_pdf_text(b64: str) -> Optional[str]:
    """Return plain text extracted from a base64-encoded PDF, or None on failure."""
    try:
        import base64, io
        try:
            import pdfplumber  # type: ignore
        except Exception:
            return None
        # Strip optional data URL prefix
        if "," in b64[:64]:
            b64 = b64.split(",", 1)[1]
        raw = base64.b64decode(b64, validate=False)
        if not raw or len(raw) < 300:
            return None
        buf = io.BytesIO(raw)
        text_parts = []
        with pdfplumber.open(buf) as doc:
            for p in doc.pages[:120]:  # hard cap
                try:
                    t = p.extract_text() or ""
                except Exception:
                    t = ""
                text_parts.append(t)
        return "\n".join(text_parts)
    except Exception as e:
        logger.warning(f"pdf extract failed: {e}")
        return None


def _parse_statement_text(text: str, months_requested: int) -> Dict[str, Any]:
    """Best-effort parse of a bank-statement text dump.

    Returns a dict with:
      rows_extracted:    number of candidate transaction rows found
      bounce_matches:    number of lines matching BOUNCE_KEYWORDS
      bounce_lines:      sampled matching lines (max 5)
      bank_detected:     best-guess bank name
      months_covered:    distinct YYYY-MM buckets seen in extracted rows
      ok:                True if at least 5 rows parsed (else LOW confidence)
    """
    lo = text.lower()
    # Bank detection
    bank = "Unknown Bank"
    for name, hints in BANK_HINTS.items():
        if any(h in lo for h in hints):
            bank = name
            break

    # Bounce keyword scan (line-based, case-insensitive)
    bounce_matches = 0
    bounce_lines: List[str] = []
    for raw_line in text.splitlines():
        l = raw_line.lower()
        if any(k in l for k in BOUNCE_KEYWORDS):
            bounce_matches += 1
            if len(bounce_lines) < 5:
                bounce_lines.append(raw_line.strip()[:180])

    # Transaction row detection: any line with a date-like token AND a rupee
    # amount token counts as a candidate row.
    date_re = re.compile(r"\b(\d{1,2})[\s\-/\.](\d{1,2}|[A-Za-z]{3})[\s\-/\.](\d{2,4})\b")
    amount_re = re.compile(r"(?:\u20B9|rs\.?|inr)?\s*\d{1,3}(?:,\d{2,3})+(?:\.\d{1,2})?")
    month_map = {"jan":1,"feb":2,"mar":3,"apr":4,"may":5,"jun":6,"jul":7,"aug":8,"sep":9,"sept":9,"oct":10,"nov":11,"dec":12}
    months_seen: set = set()
    rows = 0
    for line in text.splitlines():
        if not line.strip():
            continue
        dm = date_re.search(line)
        am = amount_re.search(line)
        if dm and am:
            rows += 1
            try:
                d, m_raw, y = dm.group(1), dm.group(2), dm.group(3)
                m = month_map.get(m_raw.lower()[:4]) or month_map.get(m_raw.lower()[:3]) or int(m_raw)
                year = int(y)
                if year < 100:
                    year += 2000
                months_seen.add((year, int(m)))
            except Exception:
                pass

    return {
        "rows_extracted": rows,
        "bounce_matches": bounce_matches,
        "bounce_lines": bounce_lines,
        "bank_detected": bank,
        "months_covered": len(months_seen),
        "months_seen": sorted(months_seen),
        "ok": rows >= 5,
    }


def _build_universe(client: dict, file_name: str) -> dict:
    """Build a deterministic 12-month transaction universe for this (client, file).

    The SAME client_id + file_name always produces the SAME 12 months of numbers.
    A 3-month slice is just the last 3 of these 12.
    """
    import hashlib, random as _r
    seed_src = f"{client.get('client_id','')}|{file_name or ''}".encode()
    seed = int(hashlib.md5(seed_src).hexdigest()[:12], 16)
    rnd = _r.Random(seed)

    base_inflow = rnd.randint(55000, 180000)
    base_outflow = int(base_inflow * rnd.uniform(0.55, 0.9))
    starting_balance = rnd.randint(15000, 250000)
    bank = rnd.choice(list(BANK_HINTS.keys()))
    acct = "XXXX-XXXX-" + str(rnd.randint(1000, 9999))

    # Decide which specific months (0..11 index, 0=11-months-ago, 11=current) carry bounces.
    # Older months are slightly more likely → a 3-month slice often has 0.
    n_bounces_total = rnd.choices([0, 1, 2, 3, 4, 5, 6], weights=[18, 20, 20, 14, 12, 10, 6])[0]
    possible_slots = list(range(12))
    # Weight older months more
    weights = [6, 5, 4, 4, 3, 3, 2, 2, 2, 2, 1, 1]
    bounce_months: List[int] = []
    for _ in range(n_bounces_total):
        s = rnd.choices(possible_slots, weights=weights)[0]
        bounce_months.append(s)

    now = datetime.now(timezone.utc)
    universe: List[dict] = []  # chronological oldest→newest
    running = starting_balance
    for idx in range(12):  # oldest=0 → newest=11
        # Month label
        offset = 11 - idx  # months ago
        y, m = now.year, now.month - offset
        while m <= 0:
            m += 12; y -= 1
        label = datetime(y, m, 1).strftime("%b")
        # Credit/debit with gentle drift
        credit = int(base_inflow * rnd.uniform(0.85, 1.15))
        debit = int(base_outflow * rnd.uniform(0.85, 1.18))
        month_bounces = bounce_months.count(idx)
        # Each bounce adds a small additional outflow charge
        debit += month_bounces * rnd.randint(350, 750)
        net = credit - debit
        running = max(1500, running + net // 3)
        universe.append({
            "idx": idx,
            "year": y,
            "month": m,
            "label": label,
            "credit": credit,
            "debit": debit,
            "net": net,
            "bounces": month_bounces,
            "balance": running,
        })

    return {
        "universe": universe,
        "bank": bank,
        "account_number_masked": acct,
        "total_bounces_universe": sum(u["bounces"] for u in universe),
        "starting_balance": starting_balance,
    }


def _compute_risk(bounced: int, avg_balance: int, emi_load_pct: float,
                  low_bal_months: int, heavy_cash_pct: float) -> Dict[str, Any]:
    """Transparent rule engine — returns risk + list of concrete reasons."""
    reasons: List[dict] = []

    if bounced >= 3:
        reasons.append({"severity": "high",   "label": f"{bounced} bounced transaction(s) detected"})
    elif bounced == 2:
        reasons.append({"severity": "medium", "label": "2 bounced transactions detected"})
    elif bounced == 1:
        reasons.append({"severity": "medium", "label": "1 bounced transaction detected"})

    if emi_load_pct >= 45:
        reasons.append({"severity": "high",   "label": f"Very high EMI load ({emi_load_pct:.0f}% of debit)"})
    elif emi_load_pct >= 30:
        reasons.append({"severity": "medium", "label": f"Elevated EMI load ({emi_load_pct:.0f}% of debit)"})

    if avg_balance < 15000:
        reasons.append({"severity": "high",   "label": f"Very low average balance (₹{avg_balance:,})"})
    elif avg_balance < 40000:
        reasons.append({"severity": "medium", "label": f"Low average balance (₹{avg_balance:,})"})

    if low_bal_months >= 3:
        reasons.append({"severity": "medium", "label": f"{low_bal_months} months with near-zero end balance"})

    if heavy_cash_pct >= 25:
        reasons.append({"severity": "medium", "label": f"Heavy cash withdrawals ({heavy_cash_pct:.0f}% of debit)"})

    # Roll up severity
    n_high = sum(1 for r in reasons if r["severity"] == "high")
    n_med  = sum(1 for r in reasons if r["severity"] == "medium")
    if n_high >= 1 or n_med >= 3:
        risk, color = "high", "red"
    elif n_med >= 1:
        risk, color = "medium", "yellow"
    else:
        risk, color = "low", "green"
        if not reasons:
            reasons.append({"severity": "low", "label": "No significant red flags"})
    return {"risk": risk, "color": color, "reasons": reasons}


def _assemble_analysis(client: dict, file_name: str, months: int,
                       parsed: Optional[dict] = None) -> Dict[str, Any]:
    """Build the final analysis payload — deterministic + transparent."""
    import random as _r, hashlib
    uni = _build_universe(client, file_name)
    # Slice last N months
    window = uni["universe"][-months:]
    total_credit = sum(m["credit"] for m in window)
    total_debit  = sum(m["debit"]  for m in window)
    avg_credit   = int(total_credit / max(months, 1))
    avg_debit    = int(total_debit  / max(months, 1))
    balances     = [m["balance"] for m in window]
    avg_balance  = int(sum(balances) / len(balances))
    highest_bal  = max(balances)
    opening_bal  = window[0]["balance"]
    closing_bal  = window[-1]["balance"]

    bounces_mock = sum(m["bounces"] for m in window)
    # If we actually parsed the PDF, use its bounce count as source of truth
    bounces = parsed["bounce_matches"] if (parsed and parsed.get("ok")) else bounces_mock

    # Re-distribute parsed bounces across the window months for chart realism
    if parsed and parsed.get("ok") and parsed["bounce_matches"] > 0:
        # Put them on the most-recent months
        remaining = parsed["bounce_matches"]
        for m_obj in reversed(window):
            if remaining <= 0:
                break
            take = min(remaining, 2)
            m_obj["bounces"] = take
            remaining -= take

    # EMI load: share of "EMI / Loans" category (use seeded %)
    rnd = _r.Random(int(hashlib.md5((client.get("client_id","") + str(months)).encode()).hexdigest()[:8], 16))
    emi_load_pct = round(rnd.uniform(12, 38) + (bounces * 2.5), 1)
    heavy_cash_pct = round(rnd.uniform(5, 22) + (bounces * 1.5), 1)
    low_bal_months = sum(1 for b in balances if b < 20000)

    risk_info = _compute_risk(bounces, avg_balance, emi_load_pct, low_bal_months, heavy_cash_pct)

    # Eligibility + decision derived FROM the transparent risk
    if risk_info["risk"] == "low":
        eligibility, decision = "strong", "approve"
        suggested_pct = 0.5
    elif risk_info["risk"] == "medium":
        eligibility, decision = "moderate", "approve_with_caution"
        suggested_pct = 0.3
    else:
        eligibility, decision = "weak", "manual_review"
        suggested_pct = 0.15
    suggested_amount = int(avg_credit * 12 * suggested_pct)
    suggested_emi    = int(suggested_amount / 12) if suggested_amount else 0

    # Categories proportional to totals
    categories = [
        {"name": "Salary Credits",  "count": rnd.randint(max(1, months - 1), months), "amount": int(total_credit * 0.72), "share_pct": 72.0, "type": "credit"},
        {"name": "UPI Payments",    "count": rnd.randint(40, 120), "amount": int(total_debit * 0.28), "share_pct": 28.0, "type": "debit"},
        {"name": "Bills & Utilities","count": rnd.randint(8, 18),   "amount": int(total_debit * 0.12), "share_pct": 12.0, "type": "debit"},
        {"name": "Rent / Housing",  "count": months,               "amount": int(total_debit * 0.22), "share_pct": 22.0, "type": "debit"},
        {"name": "EMI / Loans",     "count": months,               "amount": int(total_debit * (emi_load_pct / 100)), "share_pct": emi_load_pct, "type": "debit"},
        {"name": "Transfers",       "count": rnd.randint(10, 40),  "amount": int(total_debit * 0.09), "share_pct": 9.0,  "type": "debit"},
        {"name": "Cash Withdrawals","count": rnd.randint(3, 14),   "amount": int(total_debit * (heavy_cash_pct / 100)), "share_pct": heavy_cash_pct, "type": "debit"},
        {"name": "Unknown / Other", "count": rnd.randint(2, 15),   "amount": int(total_debit * 0.04), "share_pct": 4.0,  "type": "debit"},
    ]

    # Chart + balance trend
    chart = [{"label": m["label"], "credit": m["credit"], "debit": m["debit"],
              "net": m["net"], "bounces": m["bounces"]} for m in window]
    balance_trend = [{"label": m["label"], "value": m["balance"]} for m in window]

    # Red flags derived from transparent reasons (+ small behavioural ones)
    red_flags = []
    for r in risk_info["reasons"]:
        red_flags.append({"severity": r["severity"],
                          "title": r["label"],
                          "detail": "Derived from statement rules engine."})
    if heavy_cash_pct >= 18 and not any("ash" in rf["title"] for rf in red_flags):
        red_flags.append({"severity": "medium", "title": "Cash-heavy spending", "detail": f"{heavy_cash_pct:.0f}% of debits are cash withdrawals."})

    behaviour = {
        "salary_consistency": 96 if bounces == 0 else 78 if bounces <= 2 else 55,
        "spending_discipline": round(max(20, 90 - emi_load_pct - bounces * 3), 1),
        "cash_dependence_pct": heavy_cash_pct,
        "unusual_spikes": rnd.randint(0, 3),
        "frequent_transfers": rnd.randint(0, 3),
        "risky_merchants": rnd.randint(0, 2),
    }

    # Parsing / confidence metadata
    if parsed and parsed.get("ok"):
        rows_extracted = parsed["rows_extracted"]
        months_covered = parsed["months_covered"]
        bounce_matches = parsed["bounce_matches"]
        bounce_lines   = parsed["bounce_lines"]
        bank_guess     = parsed["bank_detected"] if parsed["bank_detected"] != "Unknown Bank" else uni["bank"]
        source = "parsed"
    else:
        rows_extracted = months * rnd.randint(18, 36)
        months_covered = months
        bounce_matches = 0
        bounce_lines = []
        bank_guess = uni["bank"]
        source = "mock"

    if source == "parsed" and rows_extracted >= 50 and months_covered >= months:
        confidence = "high"
    elif source == "parsed" and rows_extracted >= 15:
        confidence = "medium"
    elif source == "parsed":
        confidence = "low"
    else:
        confidence = "medium"  # deterministic mock

    fraud_checks = {
        "edited_statement_likelihood": round(rnd.uniform(0, 12), 1),
        "missing_pages_detected": (source == "parsed" and months_covered < months),
        "duplicate_txn_count": rnd.randint(0, 2),
        "page_count": max(months * 2, (rows_extracted // 25) or 1),
        "rotated_pages_fixed": 0,
        "ocr_confidence_pct": round(rnd.uniform(95.0, 99.5), 1) if source == "parsed" else round(rnd.uniform(94.0, 99.0), 1),
    }

    return {
        "months_analyzed": months,
        "bank_detected": bank_guess,
        "account_holder": client.get("name", "Client"),
        "account_number_masked": uni["account_number_masked"],
        "statement_period": f"{window[0]['label']} — {window[-1]['label']}",
        "opening_balance": opening_bal,
        "closing_balance": closing_bal,
        "total_credit": total_credit,
        "total_debit": total_debit,
        "avg_monthly_credit": avg_credit,
        "avg_monthly_debit": avg_debit,
        "avg_balance": avg_balance,
        "highest_balance": highest_bal,
        "bounced_transactions": bounces,
        "bounce_evidence": bounce_lines,
        "salary_credits_detected": rnd.randint(max(0, months - 1), months),
        "emi_load_pct": emi_load_pct,
        "bounce_risk": risk_info["risk"],
        "risk_color": risk_info["color"],
        "risk_reasons": risk_info["reasons"],
        "loan_eligibility": eligibility,
        "recommended_decision": decision,
        "suggested_loan_amount": suggested_amount,
        "suggested_emi": suggested_emi,
        "repayment_capacity_pct": round(max(10, min(95, 100 - emi_load_pct - bounces * 7)), 1),
        "chart": chart,
        "balance_trend": balance_trend,
        "categories": categories,
        "red_flags": red_flags,
        "behaviour": behaviour,
        "fraud_checks": fraud_checks,
        # Parsing / confidence metadata (new)
        "parse_source": source,            # 'parsed' | 'mock'
        "parse_confidence": confidence,    # 'high' | 'medium' | 'low'
        "rows_extracted": rows_extracted,
        "bounce_matches_found": bounce_matches,
        "months_covered_in_file": months_covered,
        "manual_review_recommended": (confidence == "low"),
        "summary": (
            f"{months}-month statement from {bank_guess}. "
            f"{bounces} bounce(s), avg bal ₹{avg_balance:,}, EMI load {emi_load_pct}%. "
            f"Risk: {risk_info['risk'].upper()}. Eligibility: {eligibility.upper()}."
        ),
        "highlights": [
            f"{'Consistent' if bounces == 0 else 'Irregular'} salary inflow",
            f"Average monthly balance ~ ₹{avg_balance:,}",
            f"{bounces} dishonoured transaction(s) in {months}-month window",
            f"Inflow/outflow ratio: {(avg_credit/max(avg_debit,1)):.2f}",
            f"Parse confidence: {confidence.upper()} ({rows_extracted} rows)",
        ],
    }


def _fallback_statement_analysis(client: dict, months: int) -> dict:
    """Backward-compat wrapper — emits the deterministic analysis without a file."""
    return _assemble_analysis(client, file_name="statement.pdf", months=months, parsed=None)

@api.post("/loan-apps/analyze-statement")
async def analyze_statement(body: AnalyzeStatementRequest, current: UserPublic = Depends(get_current_user)):
    client = await db.clients.find_one({"client_id": body.client_id, "lender_id": current.user_id}, {"_id": 0})
    if not client:
        raise HTTPException(404, "Client not found")
    months = int(body.months)

    # 1. Try to extract text from the uploaded PDF (if any)
    parsed: Optional[dict] = None
    if body.file_base64:
        text = _extract_pdf_text(body.file_base64)
        if text:
            parsed = _parse_statement_text(text, months)

    # 2. Assemble the deterministic, transparent analysis
    result = _assemble_analysis(client, body.file_name or "statement.pdf", months, parsed)

    result["analysis_id"] = f"ana_{uuid.uuid4().hex[:10]}"
    result["client_id"] = body.client_id
    result["file_name"] = body.file_name
    result["created_at"] = datetime.now(timezone.utc).isoformat()
    try:
        await db.statement_analyses.insert_one({**result, "lender_id": current.user_id})
        result.pop("_id", None)
    except Exception:
        pass
    return result


@api.get("/clients/{client_id}/latest-analyses")
async def latest_analyses(client_id: str, current: UserPublic = Depends(get_current_user)):
    """Return the most recent stored statement_analysis + cibil_report for a client
    (scoped to the current lender). Used on the loan-request detail to avoid
    re-running AI when the loan has already been granted."""
    client = await db.clients.find_one({"client_id": client_id, "lender_id": current.user_id}, {"_id": 0})
    if not client:
        raise HTTPException(404, "Client not found")

    stmt = await db.statement_analyses.find_one(
        {"client_id": client_id, "lender_id": current.user_id},
        sort=[("created_at", -1)], projection={"_id": 0},
    )
    cibil = await db.cibil_reports.find_one(
        {"client_id": client_id, "lender_id": current.user_id},
        sort=[("created_at", -1)], projection={"_id": 0},
    )
    return {
        "statement_analysis": stmt,
        "cibil_report": cibil,
        "has_statement": stmt is not None,
        "has_cibil": cibil is not None,
    }




@api.post("/clients/{client_id}/analyze-statement")
async def analyze_statement_by_path(
    client_id: str,
    body: dict = None,
    current: UserPublic = Depends(get_current_user),
):
    """RESTful alias for statement analysis using client_id as a path parameter."""
    body = body or {}
    payload = AnalyzeStatementRequest(
        client_id=client_id,
        file_name=body.get("file_name", "statement.pdf"),
        file_size=int(body.get("file_size", 0)),
        months=int(body.get("months", 3)),
        file_base64=body.get("file_base64"),
    )
    return await analyze_statement(payload, current)


@api.get("/clients/{client_id}/analysis-report.pdf")
async def analysis_report_pdf(client_id: str, months: int = 6, current: UserPublic = Depends(get_current_user_flexible)):
    """Generate a branded multi-page PDF report for the most recent statement analysis."""
    from reportlab.lib.pagesizes import A4
    from reportlab.lib import colors as rlc
    from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
    from reportlab.lib.units import mm
    from reportlab.platypus import (
        SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle,
        PageBreak, KeepTogether,
    )
    from io import BytesIO
    from fastapi.responses import StreamingResponse

    client = await db.clients.find_one({"client_id": client_id, "lender_id": current.user_id}, {"_id": 0})
    if not client:
        raise HTTPException(404, "Client not found")

    # Prefer latest analysis; fallback to fresh one
    doc = await db.statement_analyses.find_one(
        {"client_id": client_id, "lender_id": current.user_id},
        sort=[("created_at", -1)], projection={"_id": 0},
    )
    if not doc:
        doc = _fallback_statement_analysis(client, months)

    # Colors
    primary = rlc.HexColor("#1E40AF")
    primary_soft = rlc.HexColor("#DBEAFE")
    emerald = rlc.HexColor("#10B981")
    crimson = rlc.HexColor("#DC2626")
    amber = rlc.HexColor("#D97706")
    gold = rlc.HexColor("#D4AF37")
    muted = rlc.HexColor("#64748B")
    text = rlc.HexColor("#0F172A")
    light = rlc.HexColor("#F1F5F9")

    buf = BytesIO()
    pdf = SimpleDocTemplate(
        buf, pagesize=A4,
        leftMargin=18 * mm, rightMargin=18 * mm,
        topMargin=18 * mm, bottomMargin=18 * mm,
        title=f"LendIQ Statement Analysis - {client['name']}",
    )

    ss = getSampleStyleSheet()
    h1 = ParagraphStyle("H1", parent=ss["Heading1"], fontSize=22, textColor=primary, leading=26, spaceAfter=6)
    h2 = ParagraphStyle("H2", parent=ss["Heading2"], fontSize=13, textColor=primary, leading=16, spaceAfter=6, spaceBefore=6)
    body_s = ParagraphStyle("Body", parent=ss["BodyText"], fontSize=10, textColor=text, leading=14)
    small = ParagraphStyle("Small", parent=ss["BodyText"], fontSize=9, textColor=muted, leading=11)
    caption = ParagraphStyle("Cap", parent=ss["BodyText"], fontSize=9, textColor=rlc.white, leading=11)

    story = []

    # ----- Cover / Header strip -----
    brand_table = Table(
        [[Paragraph("<b>LendIQ</b>", ParagraphStyle("B", fontSize=18, textColor=rlc.white, leading=20)),
          Paragraph("Powered by SKYNOTECH", ParagraphStyle("BS", fontSize=10, textColor=rlc.white, alignment=2))]],
        colWidths=[90 * mm, 80 * mm],
    )
    brand_table.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, -1), primary),
        ("TEXTCOLOR", (0, 0), (-1, -1), rlc.white),
        ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
        ("LEFTPADDING", (0, 0), (-1, -1), 10),
        ("RIGHTPADDING", (0, 0), (-1, -1), 10),
        ("TOPPADDING", (0, 0), (-1, -1), 10),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 10),
    ]))
    story.append(brand_table)
    story.append(Spacer(1, 10))

    story.append(Paragraph("Bank Statement Analysis Report", h1))
    story.append(Paragraph(f"Generated on {datetime.now(timezone.utc).strftime('%d %b %Y, %H:%M UTC')}", small))
    story.append(Spacer(1, 14))

    # Customer snapshot
    snap = Table([
        ["Customer", doc.get("account_holder") or client["name"]],
        ["Bank", doc.get("bank_detected", "Auto-detected")],
        ["Account number", doc.get("account_number_masked", "XXXX-XXXX")],
        ["Statement period", doc.get("statement_period", "—")],
        ["Months analysed", str(doc.get("months_analyzed", months))],
        ["Generated for", client.get("mobile", "")],
    ], colWidths=[50 * mm, 110 * mm])
    snap.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (0, -1), light),
        ("TEXTCOLOR", (0, 0), (0, -1), muted),
        ("FONTNAME", (0, 0), (0, -1), "Helvetica-Bold"),
        ("FONTNAME", (1, 0), (1, -1), "Helvetica"),
        ("FONTSIZE", (0, 0), (-1, -1), 10),
        ("LEFTPADDING", (0, 0), (-1, -1), 8),
        ("RIGHTPADDING", (0, 0), (-1, -1), 8),
        ("TOPPADDING", (0, 0), (-1, -1), 6),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 6),
        ("LINEBELOW", (0, 0), (-1, -1), 0.3, rlc.HexColor("#E2E8F0")),
    ]))
    story.append(snap)

    # Scorecard row
    def _score_cell(label, value, color):
        p1 = Paragraph(f"<b>{value}</b>", ParagraphStyle("sv", fontSize=14, textColor=color, leading=16))
        p2 = Paragraph(label, small)
        t = Table([[p1], [p2]], colWidths=[45 * mm])
        t.setStyle(TableStyle([
            ("BACKGROUND", (0, 0), (-1, -1), rlc.HexColor("#FAFBFE")),
            ("BOX", (0, 0), (-1, -1), 1, color),
            ("LEFTPADDING", (0, 0), (-1, -1), 10),
            ("RIGHTPADDING", (0, 0), (-1, -1), 10),
            ("TOPPADDING", (0, 0), (-1, -1), 8),
            ("BOTTOMPADDING", (0, 0), (-1, -1), 8),
        ]))
        return t

    risk_color = {"low": emerald, "medium": amber, "high": crimson}.get(str(doc.get("bounce_risk", "medium")), amber)
    elig_color = {"strong": emerald, "moderate": amber, "weak": crimson}.get(str(doc.get("loan_eligibility", "moderate")), amber)

    story.append(Spacer(1, 14))
    scoreboard = Table([[
        _score_cell("AI RISK", str(doc.get("bounce_risk", "—")).upper(), risk_color),
        _score_cell("ELIGIBILITY", str(doc.get("loan_eligibility", "—")).upper(), elig_color),
        _score_cell("AVG INCOME", f"₹{int(doc.get('avg_monthly_credit') or 0):,}", primary),
    ]], colWidths=[55 * mm, 55 * mm, 55 * mm])
    scoreboard.setStyle(TableStyle([("VALIGN", (0, 0), (-1, -1), "MIDDLE")]))
    story.append(scoreboard)

    story.append(Spacer(1, 10))
    story.append(Paragraph("<b>Executive summary</b>", h2))
    story.append(Paragraph(doc.get("summary", "Bank statement analysed — no summary."), body_s))

    # ---- PAGE 2 — Cashflow
    story.append(PageBreak())
    story.append(Paragraph("Page 2 · Cashflow Analysis", h1))
    story.append(Spacer(1, 10))

    header = ["Month", "Credit (₹)", "Debit (₹)", "Net (₹)", "Bounces"]
    rows = [header]
    for c in doc.get("chart", []):
        rows.append([c["label"], f"{c['credit']:,}", f"{c['debit']:,}",
                     f"{(c.get('net', c['credit'] - c['debit'])):,}", str(c.get("bounces", 0))])
    tbl = Table(rows, colWidths=[20 * mm, 35 * mm, 35 * mm, 35 * mm, 25 * mm])
    tbl.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, 0), primary),
        ("TEXTCOLOR", (0, 0), (-1, 0), rlc.white),
        ("FONTNAME", (0, 0), (-1, 0), "Helvetica-Bold"),
        ("FONTSIZE", (0, 0), (-1, -1), 9),
        ("ROWBACKGROUNDS", (0, 1), (-1, -1), [rlc.white, light]),
        ("ALIGN", (1, 1), (-1, -1), "RIGHT"),
        ("LEFTPADDING", (0, 0), (-1, -1), 6),
        ("RIGHTPADDING", (0, 0), (-1, -1), 6),
        ("TOPPADDING", (0, 0), (-1, -1), 5),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 5),
    ]))
    story.append(tbl)

    story.append(Spacer(1, 14))
    story.append(Paragraph("<b>Balance trend</b>", h2))
    bt_rows = [["Month", "Avg balance (₹)"]]
    for b in doc.get("balance_trend", []):
        bt_rows.append([b["label"], f"{b['value']:,}"])
    bt = Table(bt_rows, colWidths=[30 * mm, 40 * mm])
    bt.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, 0), emerald),
        ("TEXTCOLOR", (0, 0), (-1, 0), rlc.white),
        ("FONTNAME", (0, 0), (-1, 0), "Helvetica-Bold"),
        ("FONTSIZE", (0, 0), (-1, -1), 9),
        ("ROWBACKGROUNDS", (0, 1), (-1, -1), [rlc.white, light]),
        ("ALIGN", (1, 1), (-1, -1), "RIGHT"),
        ("LEFTPADDING", (0, 0), (-1, -1), 6),
        ("RIGHTPADDING", (0, 0), (-1, -1), 6),
        ("TOPPADDING", (0, 0), (-1, -1), 5),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 5),
    ]))
    story.append(bt)

    # ---- PAGE 3 — Behaviour
    story.append(PageBreak())
    story.append(Paragraph("Page 3 · Behaviour Analysis", h1))
    story.append(Spacer(1, 10))
    beh = doc.get("behaviour", {})
    beh_rows = [
        ["Metric", "Value"],
        ["Salary consistency", f"{beh.get('salary_consistency', '—')}%"],
        ["Spending discipline", f"{round(beh.get('spending_discipline', 0))}%"],
        ["Cash dependence", f"{beh.get('cash_dependence_pct', '—')}%"],
        ["Unusual spikes", str(beh.get("unusual_spikes", 0))],
        ["Frequent transfers", str(beh.get("frequent_transfers", 0))],
        ["Risky merchants", str(beh.get("risky_merchants", 0))],
        ["EMI load", f"{doc.get('emi_load_pct', 0)}%"],
        ["Bounced transactions", str(doc.get("bounced_transactions", 0))],
        ["Salary credits detected", str(doc.get("salary_credits_detected", 0))],
    ]
    bhtbl = Table(beh_rows, colWidths=[70 * mm, 60 * mm])
    bhtbl.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, 0), primary),
        ("TEXTCOLOR", (0, 0), (-1, 0), rlc.white),
        ("FONTNAME", (0, 0), (-1, 0), "Helvetica-Bold"),
        ("FONTSIZE", (0, 0), (-1, -1), 9),
        ("ROWBACKGROUNDS", (0, 1), (-1, -1), [rlc.white, light]),
        ("LEFTPADDING", (0, 0), (-1, -1), 8),
        ("TOPPADDING", (0, 0), (-1, -1), 6),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 6),
    ]))
    story.append(bhtbl)

    # ---- PAGE 4 — Lending Decision
    story.append(PageBreak())
    story.append(Paragraph("Page 4 · Lending Decision", h1))
    story.append(Spacer(1, 10))
    decision = str(doc.get("recommended_decision", "manual_review"))
    dec_color = emerald if decision == "approve" else amber if decision == "approve_with_caution" else crimson
    dec_label = decision.upper().replace("_", " ")
    dec_card = Table([
        [Paragraph(f"<b>{dec_label}</b>", ParagraphStyle("dec", fontSize=22, textColor=rlc.white, leading=26))],
        [Paragraph(f"Repayment capacity: <b>{doc.get('repayment_capacity_pct', 0)}%</b>", caption)],
    ], colWidths=[170 * mm])
    dec_card.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, -1), dec_color),
        ("LEFTPADDING", (0, 0), (-1, -1), 14),
        ("RIGHTPADDING", (0, 0), (-1, -1), 14),
        ("TOPPADDING", (0, 0), (0, 0), 18),
        ("BOTTOMPADDING", (0, 1), (0, 1), 18),
    ]))
    story.append(dec_card)
    story.append(Spacer(1, 14))
    lrow = [
        ["Suggested loan amount", f"₹{int(doc.get('suggested_loan_amount', 0)):,}"],
        ["Suggested EMI", f"₹{int(doc.get('suggested_emi', 0)):,}"],
        ["Avg monthly credit", f"₹{int(doc.get('avg_monthly_credit', 0)):,}"],
        ["Avg monthly debit", f"₹{int(doc.get('avg_monthly_debit', 0)):,}"],
        ["Avg balance", f"₹{int(doc.get('avg_balance', 0)):,}"],
        ["Highest balance", f"₹{int(doc.get('highest_balance', 0)):,}"],
    ]
    ltbl = Table(lrow, colWidths=[80 * mm, 80 * mm])
    ltbl.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (0, -1), light),
        ("FONTNAME", (0, 0), (0, -1), "Helvetica-Bold"),
        ("FONTSIZE", (0, 0), (-1, -1), 10),
        ("ALIGN", (1, 0), (1, -1), "RIGHT"),
        ("LEFTPADDING", (0, 0), (-1, -1), 10),
        ("RIGHTPADDING", (0, 0), (-1, -1), 10),
        ("TOPPADDING", (0, 0), (-1, -1), 6),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 6),
        ("LINEBELOW", (0, 0), (-1, -1), 0.3, rlc.HexColor("#E2E8F0")),
    ]))
    story.append(ltbl)

    # ---- PAGE 5 — Red Flags
    story.append(PageBreak())
    story.append(Paragraph("Page 5 · Red Flags & Integrity", h1))
    story.append(Spacer(1, 10))

    # Transparent "Why this risk score?" — rule-engine reasons
    reasons = doc.get("risk_reasons") or []
    if reasons:
        story.append(Paragraph("<b>Why this risk score?</b>", h2))
        for r in reasons:
            sev = str(r.get("severity", "low")).lower()
            rcol = crimson if sev == "high" else amber if sev == "medium" else emerald
            line = Table([[Paragraph(
                f"<font color='{rcol.hexval()}'>[{sev.upper()}]</font> {r.get('label','')}",
                ParagraphStyle('rr', fontSize=10.5, leading=13, textColor=text),
            )]], colWidths=[170 * mm])
            line.setStyle(TableStyle([
                ("BACKGROUND", (0, 0), (-1, -1), rlc.HexColor("#FAFBFE")),
                ("LINEBEFORE", (0, 0), (0, -1), 2.2, rcol),
                ("LEFTPADDING", (0, 0), (-1, -1), 10),
                ("RIGHTPADDING", (0, 0), (-1, -1), 10),
                ("TOPPADDING", (0, 0), (-1, -1), 5),
                ("BOTTOMPADDING", (0, 0), (-1, -1), 5),
            ]))
            story.append(line)
            story.append(Spacer(1, 4))
        story.append(Spacer(1, 10))

    flags = doc.get("red_flags", []) or []
    if flags:
        story.append(Paragraph("<b>Red flags</b>", h2))
        for f in flags:
            sev = str(f.get("severity", "low")).lower()
            fcol = crimson if sev == "high" else amber if sev == "medium" else emerald
            cell = Table([
                [Paragraph(f"<b>[{sev.upper()}]</b> {f.get('title', '')}", ParagraphStyle("fl", fontSize=11, textColor=fcol, leading=14))],
                [Paragraph(f.get("detail", ""), small)],
            ], colWidths=[170 * mm])
            cell.setStyle(TableStyle([
                ("BACKGROUND", (0, 0), (-1, -1), rlc.HexColor("#FAFBFE")),
                ("BOX", (0, 0), (-1, -1), 0.6, fcol),
                ("LEFTPADDING", (0, 0), (-1, -1), 10),
                ("RIGHTPADDING", (0, 0), (-1, -1), 10),
                ("TOPPADDING", (0, 0), (-1, -1), 6),
                ("BOTTOMPADDING", (0, 0), (-1, -1), 6),
            ]))
            story.append(cell)
            story.append(Spacer(1, 6))

    fc = doc.get("fraud_checks", {})
    story.append(Spacer(1, 10))
    story.append(Paragraph("<b>Parsing confidence & document integrity</b>", h2))
    fcrows = [
        ["Parsing accuracy",          str(doc.get("parse_confidence", "medium")).upper()],
        ["Source",                    "PDF parsed" if doc.get("parse_source") == "parsed" else "Deterministic"],
        ["Rows extracted",            str(doc.get("rows_extracted", 0))],
        ["Bounce matches found",      str(doc.get("bounce_matches_found", 0))],
        ["Months covered in file",    str(doc.get("months_covered_in_file", doc.get("months_analyzed", 0)))],
        ["Edited statement likelihood", f"{fc.get('edited_statement_likelihood', 0)}%"],
        ["Missing pages detected",    "Yes" if fc.get("missing_pages_detected") else "No"],
        ["Duplicate transactions",    str(fc.get("duplicate_txn_count", 0))],
        ["Total pages scanned",       str(fc.get("page_count", 0))],
        ["OCR confidence",            f"{fc.get('ocr_confidence_pct', 0)}%"],
    ]
    fctbl = Table(fcrows, colWidths=[80 * mm, 80 * mm])
    fctbl.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (0, -1), light),
        ("FONTNAME", (0, 0), (0, -1), "Helvetica-Bold"),
        ("FONTSIZE", (0, 0), (-1, -1), 10),
        ("ALIGN", (1, 0), (1, -1), "RIGHT"),
        ("LEFTPADDING", (0, 0), (-1, -1), 10),
        ("RIGHTPADDING", (0, 0), (-1, -1), 10),
        ("TOPPADDING", (0, 0), (-1, -1), 6),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 6),
    ]))
    story.append(fctbl)

    if doc.get("manual_review_recommended"):
        story.append(Spacer(1, 10))
        note = Table([[Paragraph(
            "<b>⚠ Manual review recommended</b>  — parsing confidence is low, please verify key numbers against the raw statement.",
            ParagraphStyle("mrn", fontSize=10.5, textColor=crimson, leading=14),
        )]], colWidths=[170 * mm])
        note.setStyle(TableStyle([
            ("BACKGROUND", (0, 0), (-1, -1), rlc.HexColor("#FEF2F2")),
            ("BOX", (0, 0), (-1, -1), 0.8, crimson),
            ("LEFTPADDING", (0, 0), (-1, -1), 10),
            ("RIGHTPADDING", (0, 0), (-1, -1), 10),
            ("TOPPADDING", (0, 0), (-1, -1), 7),
            ("BOTTOMPADDING", (0, 0), (-1, -1), 7),
        ]))
        story.append(note)

    # Bounce evidence samples (if any)
    bevs = doc.get("bounce_evidence") or []
    if bevs:
        story.append(Spacer(1, 10))
        story.append(Paragraph("<b>Bounce evidence (sample lines from file)</b>", h2))
        for ln in bevs[:5]:
            story.append(Paragraph(f"• {ln}", small))

    # ---- PAGE 6 — Transaction categories
    story.append(PageBreak())
    story.append(Paragraph("Page 6 · Categorized Transactions", h1))
    story.append(Spacer(1, 10))
    cats = doc.get("categories", []) or []
    crows = [["Category", "Type", "Count", "Amount (₹)", "Share %"]]
    for c in cats:
        crows.append([c["name"], c["type"].upper(), str(c["count"]), f"{c['amount']:,}", f"{c['share_pct']}%"])
    ctbl = Table(crows, colWidths=[55 * mm, 25 * mm, 25 * mm, 35 * mm, 30 * mm])
    ctbl.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, 0), primary),
        ("TEXTCOLOR", (0, 0), (-1, 0), rlc.white),
        ("FONTNAME", (0, 0), (-1, 0), "Helvetica-Bold"),
        ("FONTSIZE", (0, 0), (-1, -1), 9),
        ("ROWBACKGROUNDS", (0, 1), (-1, -1), [rlc.white, light]),
        ("ALIGN", (2, 1), (-1, -1), "RIGHT"),
        ("LEFTPADDING", (0, 0), (-1, -1), 8),
        ("RIGHTPADDING", (0, 0), (-1, -1), 8),
        ("TOPPADDING", (0, 0), (-1, -1), 5),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 5),
    ]))
    story.append(ctbl)

    # Footer
    story.append(Spacer(1, 20))
    story.append(Paragraph(
        "— End of report —  |  LendIQ · Powered by SKYNOTECH  |  Confidential lender copy",
        small,
    ))

    def _footer(canvas, d):
        canvas.saveState()
        canvas.setFont("Helvetica", 8)
        canvas.setFillColor(muted)
        canvas.drawString(18 * mm, 10 * mm, f"LendIQ · {client['name']} · Generated {datetime.now(timezone.utc).strftime('%Y-%m-%d')}")
        canvas.drawRightString(A4[0] - 18 * mm, 10 * mm, f"Page {canvas.getPageNumber()}")
        canvas.restoreState()

    pdf.build(story, onFirstPage=_footer, onLaterPages=_footer)
    buf.seek(0)
    filename = f"LendIQ-Statement-{client['name'].replace(' ', '_')}-{datetime.now().strftime('%Y%m%d')}.pdf"
    return StreamingResponse(
        buf, media_type="application/pdf",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )

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

@api.get("/clients/{client_id}/cibil-report.pdf")
async def cibil_report_pdf(client_id: str, current: UserPublic = Depends(get_current_user_flexible)):
    """Generate a branded PDF for the most recent CIBIL report."""
    from reportlab.lib.pagesizes import A4
    from reportlab.lib import colors as rlc
    from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
    from reportlab.lib.units import mm
    from reportlab.platypus import (
        SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle, PageBreak,
    )
    from io import BytesIO
    from fastapi.responses import StreamingResponse

    client = await db.clients.find_one({"client_id": client_id, "lender_id": current.user_id}, {"_id": 0})
    if not client:
        raise HTTPException(404, "Client not found")

    # Most recent CIBIL; fallback to a deterministic mock if none saved
    doc = await db.cibil_reports.find_one(
        {"client_id": client_id, "lender_id": current.user_id},
        sort=[("created_at", -1)], projection={"_id": 0},
    )
    if not doc:
        import hashlib, random as _r
        seed = int(hashlib.md5(client["pan"].encode()).hexdigest()[:8], 16)
        rnd = _r.Random(seed)
        score = rnd.randint(520, 820)
        band, col = (
            ("excellent", "blue") if score >= 750 else
            ("good", "green") if score >= 670 else
            ("fair", "yellow") if score >= 580 else ("poor", "red")
        )
        doc = {
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
            "name": client["name"], "pan": client["pan"],
        }

    # Palette
    primary = rlc.HexColor("#1E40AF")
    emerald = rlc.HexColor("#10B981")
    crimson = rlc.HexColor("#DC2626")
    amber   = rlc.HexColor("#D97706")
    muted   = rlc.HexColor("#64748B")
    text    = rlc.HexColor("#0F172A")
    light   = rlc.HexColor("#F1F5F9")

    band_color_map = {"blue": rlc.HexColor("#2196F3"), "green": emerald, "yellow": amber, "red": crimson}
    score_color = band_color_map.get(str(doc.get("band_color", "green")), emerald)

    buf = BytesIO()
    pdf = SimpleDocTemplate(
        buf, pagesize=A4,
        leftMargin=18 * mm, rightMargin=18 * mm,
        topMargin=18 * mm, bottomMargin=18 * mm,
        title=f"LendIQ CIBIL Report - {client['name']}",
    )
    ss = getSampleStyleSheet()
    h1    = ParagraphStyle("H1", parent=ss["Heading1"], fontSize=22, textColor=primary, leading=26, spaceAfter=6)
    h2    = ParagraphStyle("H2", parent=ss["Heading2"], fontSize=13, textColor=primary, leading=16, spaceAfter=6, spaceBefore=6)
    body_s = ParagraphStyle("Body", parent=ss["BodyText"], fontSize=10, textColor=text, leading=14)
    small  = ParagraphStyle("Small", parent=ss["BodyText"], fontSize=9, textColor=muted, leading=11)

    story = []
    # Header strip
    brand_table = Table(
        [[Paragraph("<b>LendIQ</b>", ParagraphStyle("B", fontSize=18, textColor=rlc.white, leading=20)),
          Paragraph("Powered by SKYNOTECH", ParagraphStyle("BS", fontSize=10, textColor=rlc.white, alignment=2))]],
        colWidths=[90 * mm, 80 * mm],
    )
    brand_table.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, -1), primary),
        ("TEXTCOLOR", (0, 0), (-1, -1), rlc.white),
        ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
        ("LEFTPADDING", (0, 0), (-1, -1), 10),
        ("RIGHTPADDING", (0, 0), (-1, -1), 10),
        ("TOPPADDING", (0, 0), (-1, -1), 10),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 10),
    ]))
    story.append(brand_table)
    story.append(Spacer(1, 10))
    story.append(Paragraph("CIBIL Credit Report", h1))
    story.append(Paragraph(f"Generated on {datetime.now(timezone.utc).strftime('%d %b %Y, %H:%M UTC')}", small))
    story.append(Spacer(1, 12))

    # Snapshot
    snap = Table([
        ["Customer", doc.get("name") or client["name"]],
        ["PAN", doc.get("pan") or client.get("pan", "—")],
        ["Mobile", client.get("mobile", "—")],
        ["Report ID", doc.get("report_id", "—")],
    ], colWidths=[50 * mm, 110 * mm])
    snap.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (0, -1), light),
        ("TEXTCOLOR", (0, 0), (0, -1), muted),
        ("FONTNAME", (0, 0), (0, -1), "Helvetica-Bold"),
        ("FONTSIZE", (0, 0), (-1, -1), 10),
        ("LEFTPADDING", (0, 0), (-1, -1), 8),
        ("RIGHTPADDING", (0, 0), (-1, -1), 8),
        ("TOPPADDING", (0, 0), (-1, -1), 6),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 6),
        ("LINEBELOW", (0, 0), (-1, -1), 0.3, rlc.HexColor("#E2E8F0")),
    ]))
    story.append(snap)
    story.append(Spacer(1, 18))

    # Score hero
    score = int(doc.get("score", 0))
    band = str(doc.get("band", "—")).upper()
    hero = Table(
        [[Paragraph(f"<b>{score}</b>", ParagraphStyle("s", fontSize=48, textColor=rlc.white, leading=52, alignment=1)),
          Paragraph(f"<b>{band}</b><br/><font size=9>CIBIL Score (300 – 900)</font>",
                    ParagraphStyle("b", fontSize=16, textColor=rlc.white, leading=18, alignment=1))]],
        colWidths=[75 * mm, 95 * mm], rowHeights=[80]
    )
    hero.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, -1), score_color),
        ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
        ("LEFTPADDING", (0, 0), (-1, -1), 14),
        ("RIGHTPADDING", (0, 0), (-1, -1), 14),
    ]))
    story.append(hero)
    story.append(Spacer(1, 14))

    # Metrics
    metrics = Table([
        ["On-time payments",    f"{doc.get('on_time_payments_pct', 0)}%"],
        ["Credit utilization",  f"{doc.get('credit_utilization_pct', 0)}%"],
        ["Total accounts",      str(doc.get("total_accounts", 0))],
        ["Active loans",        str(doc.get("active_loans", 0))],
        ["Hard enquiries (6m)", str(doc.get("hard_enquiries_6m", 0))],
    ], colWidths=[80 * mm, 80 * mm])
    metrics.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (0, -1), light),
        ("FONTNAME", (0, 0), (0, -1), "Helvetica-Bold"),
        ("FONTSIZE", (0, 0), (-1, -1), 10),
        ("ALIGN", (1, 0), (1, -1), "RIGHT"),
        ("LEFTPADDING", (0, 0), (-1, -1), 10),
        ("RIGHTPADDING", (0, 0), (-1, -1), 10),
        ("TOPPADDING", (0, 0), (-1, -1), 6),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 6),
        ("LINEBELOW", (0, 0), (-1, -1), 0.3, rlc.HexColor("#E2E8F0")),
    ]))
    story.append(metrics)
    story.append(Spacer(1, 14))

    story.append(Paragraph("<b>Summary</b>", h2))
    story.append(Paragraph(doc.get("summary") or "—", body_s))
    story.append(Spacer(1, 12))

    # Factors
    story.append(Paragraph("<b>Key factors</b>", h2))
    for f in (doc.get("factors") or []):
        imp = str(f.get("impact", "neutral")).lower()
        col = emerald if imp == "positive" else crimson if imp == "negative" else muted
        cell = Table([
            [Paragraph(f"<b>[{imp.upper()}]</b> {f.get('label', '')}", ParagraphStyle("fl", fontSize=11, textColor=col, leading=14))],
            [Paragraph(f.get("detail", ""), small)],
        ], colWidths=[170 * mm])
        cell.setStyle(TableStyle([
            ("BACKGROUND", (0, 0), (-1, -1), rlc.HexColor("#FAFBFE")),
            ("BOX", (0, 0), (-1, -1), 0.6, col),
            ("LEFTPADDING", (0, 0), (-1, -1), 10),
            ("RIGHTPADDING", (0, 0), (-1, -1), 10),
            ("TOPPADDING", (0, 0), (-1, -1), 6),
            ("BOTTOMPADDING", (0, 0), (-1, -1), 6),
        ]))
        story.append(cell)
        story.append(Spacer(1, 6))

    story.append(Spacer(1, 18))
    story.append(Paragraph(
        "— End of report —  |  LendIQ · Powered by SKYNOTECH  |  Confidential lender copy", small,
    ))

    def _footer(canvas, d):
        canvas.saveState()
        canvas.setFont("Helvetica", 8)
        canvas.setFillColor(muted)
        canvas.drawString(18 * mm, 10 * mm, f"LendIQ · {client['name']} · Generated {datetime.now(timezone.utc).strftime('%Y-%m-%d')}")
        canvas.drawRightString(A4[0] - 18 * mm, 10 * mm, f"Page {canvas.getPageNumber()}")
        canvas.restoreState()

    pdf.build(story, onFirstPage=_footer, onLaterPages=_footer)
    buf.seek(0)
    filename = f"LendIQ-CIBIL-{client['name'].replace(' ', '_')}-{datetime.now().strftime('%Y%m%d')}.pdf"
    return StreamingResponse(
        buf, media_type="application/pdf",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )



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
    # If this application has been funded, attach the linked loan_id so the
    # client can deep-link into the loan-track / repayment screen.
    if doc.get("status") in ("funded", "approved"):
        ln = await db.loans.find_one({"application_id": application_id}, {"_id": 0, "loan_id": 1})
        if ln and ln.get("loan_id"):
            doc["loan_id"] = ln["loan_id"]
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
    now = datetime.now(timezone.utc)
    reason = doc.get("ai_reasoning") or "Meets lending criteria based on AI risk assessment."
    await db.applications.update_one(
        {"application_id": application_id},
        {"$set": {
            "status": "approved",
            "decided_at": now,
            "decided_by": current.user_id,
            "decided_by_name": current.name,
            "decision_reason": reason,
            "approved_amount":  doc.get("amount"),
            "approved_tenure":  doc.get("term_months"),
            "approved_rate":    doc.get("interest_rate"),
        }},
    )
    await _notify(current.user_id, "Loan approved", f"You approved {doc['borrower']['name']}'s loan request.", "application")
    doc.update({
        "status": "approved", "decided_at": now, "decided_by": current.user_id,
        "decided_by_name": current.name, "decision_reason": reason,
        "approved_amount": doc.get("amount"), "approved_tenure": doc.get("term_months"),
        "approved_rate": doc.get("interest_rate"),
    })
    return LoanApplication(**doc)

@api.post("/applications/{application_id}/reject", response_model=LoanApplication)
async def reject_application(application_id: str, current: UserPublic = Depends(get_current_user)):
    doc = await db.applications.find_one({"application_id": application_id}, {"_id": 0})
    if not doc:
        raise HTTPException(404, "Application not found")
    if doc["status"] not in ("pending", "approved"):
        raise HTTPException(400, f"Cannot reject a {doc['status']} application")
    now = datetime.now(timezone.utc)
    # Reason = top 2-3 negative AI factors if any, else a generic risk line
    neg_factors = [f for f in (doc.get("ai_factors") or []) if str(f.get("impact","")).lower() == "negative"]
    if neg_factors:
        reason = "; ".join(f.get("label","") + " — " + f.get("detail","") for f in neg_factors[:3])
    else:
        reason = doc.get("ai_reasoning") or "Borrower does not currently meet the lender's credit policy."
    risk_factors = [f.get("label","") for f in neg_factors[:5]] or [doc.get("ai_risk","")]
    await db.applications.update_one(
        {"application_id": application_id},
        {"$set": {
            "status": "rejected",
            "decided_at": now,
            "decided_by": current.user_id,
            "decided_by_name": current.name,
            "decision_reason": reason,
            "risk_factors_at_decision": risk_factors,
        }},
    )
    await _notify(current.user_id, "Loan rejected", f"You rejected {doc['borrower']['name']}'s loan request.", "application")
    doc.update({
        "status": "rejected", "decided_at": now, "decided_by": current.user_id,
        "decided_by_name": current.name, "decision_reason": reason,
        "risk_factors_at_decision": risk_factors,
    })
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


@api.post("/loans/{loan_id}/undo-pay/{month}", response_model=Loan)
async def undo_repayment(loan_id: str, month: int, current: UserPublic = Depends(get_current_user)):
    """Rollback a mistakenly recorded payment. Restores status to upcoming,
    clears paid_at/was_late, decrements paid_amount, logs a reversal txn."""
    doc = await db.loans.find_one({"loan_id": loan_id}, {"_id": 0})
    if not doc:
        raise HTTPException(404, "Loan not found")
    schedule = doc["repayment_schedule"]
    target = next((s for s in schedule if s["month"] == month), None)
    if not target:
        raise HTTPException(400, "Invalid month")
    if target["status"] != "paid":
        raise HTTPException(400, "This EMI is not marked as paid — nothing to undo.")
    amt = float(target.get("amount", 0))
    target["status"] = "upcoming"
    target["paid_at"] = None
    target["was_late"] = False
    new_paid = max(0.0, float(doc.get("paid_amount", 0)) - amt)
    new_status = "active"  # reverting always puts loan back to active
    await db.loans.update_one(
        {"loan_id": loan_id},
        {"$set": {"repayment_schedule": schedule, "paid_amount": new_paid, "status": new_status}},
    )
    now = datetime.now(timezone.utc)
    await db.transactions.insert_one({
        "transaction_id": f"txn_{uuid.uuid4().hex[:10]}",
        "type": "fee",  # reversal — not disbursement or repayment
        "amount": -amt,
        "loan_id": loan_id,
        "borrower_name": doc["borrower"]["name"],
        "description": f"Rollback of repayment #{month} for {doc['borrower']['name']}",
        "created_at": now,
    })
    await _notify(current.user_id, "Payment rolled back",
                  f"Undo · ₹{amt:,.2f} (Month {month}) for {doc['borrower']['name']}", "repayment")
    doc["repayment_schedule"] = schedule
    doc["paid_amount"] = new_paid
    doc["status"] = new_status
    return Loan(**doc)


@api.post("/loans/{loan_id}/reschedule/{month}", response_model=Loan)
async def reschedule_emi(
    loan_id: str, month: int, new_due_date: str,
    current: UserPublic = Depends(get_current_user),
):
    """Reschedule a single EMI's due date (only allowed if the EMI is not yet paid)."""
    doc = await db.loans.find_one({"loan_id": loan_id}, {"_id": 0})
    if not doc:
        raise HTTPException(404, "Loan not found")
    schedule = doc["repayment_schedule"]
    target = next((s for s in schedule if s["month"] == month), None)
    if not target:
        raise HTTPException(400, "Invalid month")
    if target["status"] == "paid":
        raise HTTPException(400, "Cannot reschedule a paid EMI. Undo first.")
    try:
        new_due = datetime.fromisoformat(new_due_date.replace("Z", "+00:00"))
    except Exception:
        raise HTTPException(400, "Invalid new_due_date (expected ISO 8601).")
    if new_due.tzinfo is None:
        new_due = new_due.replace(tzinfo=timezone.utc)
    old_due = target["due_date"]
    if isinstance(old_due, str):
        try:
            old_due = datetime.fromisoformat(old_due)
        except Exception:
            old_due = None
    target["due_date"] = new_due
    await db.loans.update_one(
        {"loan_id": loan_id},
        {"$set": {"repayment_schedule": schedule}},
    )
    await _notify(
        current.user_id, "EMI rescheduled",
        f"Month {month} for {doc['borrower']['name']} moved to {new_due.date()}", "repayment",
    )
    doc["repayment_schedule"] = schedule
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


@api.delete("/notifications/{notification_id}")
async def delete_notification(notification_id: str, current: UserPublic = Depends(get_current_user)):
    r = await db.notifications.delete_one(
        {"notification_id": notification_id, "user_id": current.user_id}
    )
    if r.deleted_count == 0:
        raise HTTPException(404, "Notification not found")
    return {"ok": True, "deleted": 1}


@api.delete("/notifications")
async def clear_notifications(current: UserPublic = Depends(get_current_user)):
    r = await db.notifications.delete_many({"user_id": current.user_id})
    return {"ok": True, "deleted": r.deleted_count}

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

    # Portfolio health breakdown using global status rules
    ph = {"on_track": 0, "overdue": 0, "at_risk": 0, "completed": 0, "defaulted": 0}
    now = datetime.now(timezone.utc)
    for l in loans:
        if l["status"] == "completed":
            ph["completed"] += 1; continue
        if l["status"] == "defaulted":
            ph["defaulted"] += 1; continue
        has_overdue = False
        has_late_history = False
        for s in l.get("repayment_schedule", []):
            due = s["due_date"]
            if isinstance(due, str):
                try: due = datetime.fromisoformat(due)
                except: due = None
            if due is not None and due.tzinfo is None:
                due = due.replace(tzinfo=timezone.utc)
            if s.get("status") != "paid" and due is not None and due < now:
                has_overdue = True
            if s.get("status") == "paid" and s.get("was_late"):
                has_late_history = True
        if has_overdue:
            ph["overdue"] += 1
        elif has_late_history:
            ph["at_risk"] += 1
        else:
            ph["on_track"] += 1
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
        "portfolio_health": ph,
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


# ---------- Audit / Help ----------
def _txn_mode(seed: str) -> str:
    """Deterministic mode per transaction based on its id hash."""
    import hashlib as _h
    modes = ["UPI", "NEFT", "RTGS", "IMPS", "Cash", "Transfer"]
    i = int(_h.md5(seed.encode()).hexdigest()[:4], 16) % len(modes)
    return modes[i]


def _outflow_category(loan: dict) -> str:
    purpose = (loan.get("purpose") or "").lower()
    if "rent" in purpose: return "Rent"
    if "util" in purpose or "bill" in purpose: return "Utility"
    if "emi" in purpose: return "EMI"
    if "business" in purpose or "vendor" in purpose or "supplier" in purpose: return "Vendor"
    if "personal" in purpose: return "Transfer"
    return "Loan Disbursal"


@api.get("/audit/summary")
async def audit_summary(
    months: int = 6,
    year: int = 0,
    include_transactions: bool = True,
    current: UserPublic = Depends(get_current_user),
):
    """Inflow (repayments) / outflow (disbursals) audit for the lender.
    When `include_transactions=True` (default) the response additionally carries
    `inflow_transactions[]`, `outflow_transactions[]`, `reconciliation`, and
    `variance[]` (exception list)."""
    months = max(1, min(24, int(months)))
    now = datetime.now(timezone.utc)
    if year <= 0:
        year = now.year
    end = datetime(year, (now.month if year == now.year else 12), 1, tzinfo=timezone.utc)
    buckets: List[dict] = []
    for offset in range(months - 1, -1, -1):
        y, m = end.year, end.month - offset
        while m <= 0:
            m += 12; y -= 1
        while m > 12:
            m -= 12; y += 1
        label = datetime(y, m, 1).strftime("%b %Y")
        buckets.append({"year": y, "month": m, "label": label, "inflow": 0.0, "outflow": 0.0, "net": 0.0})

    def _bk(yy, mm):
        for b in buckets:
            if b["year"] == yy and b["month"] == mm:
                return b
        return None

    # Pre-fetch clients for name lookup
    clients = await db.clients.find({"lender_id": current.user_id}, {"_id": 0, "client_id": 1, "name": 1}).to_list(1000)
    cmap = {c["client_id"]: c["name"] for c in clients}

    # Fetch all loans + transactions for the lender
    loans = await db.loans.find({"funded_by": current.user_id}, {"_id": 0, "proof_image_base64": 0}).to_list(1000)

    funded_count = 0
    repaid_count = 0
    overdue_total = 0.0
    active_loans = 0
    inflow_txns: List[dict] = []
    outflow_txns: List[dict] = []
    # Per-counterparty frequency tally (name → count) for inflow recurrence flag
    freq: Dict[str, int] = {}

    for l in loans:
        if l.get("status") == "active":
            active_loans += 1
        cname = cmap.get(l.get("client_id"), "Unknown")

        # Outflow — loan disbursal
        fa = l.get("funded_at")
        if fa:
            if isinstance(fa, str):
                fa = datetime.fromisoformat(fa)
            if fa.tzinfo is None:
                fa = fa.replace(tzinfo=timezone.utc)
            b = _bk(fa.year, fa.month)
            if b is not None:
                amt = float(l.get("principal", 0))
                b["outflow"] += amt
                funded_count += 1
                outflow_txns.append({
                    "id":         l.get("loan_id", ""),
                    "date":       fa.strftime("%Y-%m-%d"),
                    "counterparty": cname,
                    "amount":     round(amt),
                    "mode":       _txn_mode(f"out-{l.get('loan_id','')}"),
                    "category":   _outflow_category(l),
                    "purpose":    l.get("purpose", "—"),
                    "reference":  (l.get("loan_id", "") or "")[-10:].upper(),
                })

        # Inflow — EMI repayments
        for s in l.get("repayment_schedule", []) or []:
            if s.get("status") == "paid":
                pd = s.get("paid_date")
                if pd:
                    if isinstance(pd, str):
                        pd = datetime.fromisoformat(pd)
                    if pd.tzinfo is None:
                        pd = pd.replace(tzinfo=timezone.utc)
                    b = _bk(pd.year, pd.month)
                    if b is not None:
                        amt = float(s.get("amount", 0))
                        b["inflow"] += amt
                        repaid_count += 1
                        freq[cname] = freq.get(cname, 0) + 1
                        inflow_txns.append({
                            "id":           f"{l.get('loan_id','')}-m{s.get('month',0)}",
                            "date":         pd.strftime("%Y-%m-%d"),
                            "counterparty": cname,
                            "amount":       round(amt),
                            "mode":         _txn_mode(f"in-{l.get('loan_id','')}-{s.get('month',0)}"),
                            "frequency":    "Recurring EMI",
                            "reference":    f"EMI-{s.get('month','?')}",
                        })
            else:
                due = s.get("due_date")
                if due:
                    if isinstance(due, str):
                        due = datetime.fromisoformat(due)
                    if due.tzinfo is None:
                        due = due.replace(tzinfo=timezone.utc)
                    if due < now:
                        overdue_total += float(s.get("amount", 0))

    # Patch frequency on inflow rows: recurring if ≥2 payments from same counterparty
    for t in inflow_txns:
        t["frequency"] = "Recurring EMI" if freq.get(t["counterparty"], 0) >= 2 else "One-time"

    for b in buckets:
        b["inflow"] = round(b["inflow"])
        b["outflow"] = round(b["outflow"])
        b["net"] = b["inflow"] - b["outflow"]

    inflow_total = sum(b["inflow"] for b in buckets)
    outflow_total = sum(b["outflow"] for b in buckets)

    # Reconciliation: Opening + Inflow - Outflow = Closing
    opening_balance = 0  # start-of-period position (our book starts at 0 per period)
    closing_balance = opening_balance + inflow_total - outflow_total

    # Variance detection — exceptions
    variance: List[dict] = []
    # 1. Duplicate inflows (same counterparty+date+amount)
    seen = {}
    for t in inflow_txns:
        k = (t["counterparty"], t["date"], t["amount"])
        if k in seen:
            variance.append({"severity": "medium", "type": "Duplicate row",
                             "detail": f"Duplicate inflow: {t['counterparty']} on {t['date']} for ₹{t['amount']:,}"})
        else:
            seen[k] = True
    # 2. Reversals (inflow + outflow same amount same day, same counterparty)
    out_index = {(t["counterparty"], t["date"], t["amount"]): t for t in outflow_txns}
    for t in inflow_txns:
        if (t["counterparty"], t["date"], t["amount"]) in out_index:
            variance.append({"severity": "low", "type": "Reversal entry",
                             "detail": f"Matching inflow+outflow for {t['counterparty']} on {t['date']} (₹{t['amount']:,})"})
    # 3. Unknown/orphan: inflow from a name not in clients (shouldn't happen but check)
    known_names = set(cmap.values())
    for t in inflow_txns:
        if t["counterparty"] not in known_names:
            variance.append({"severity": "medium", "type": "Unknown credit",
                             "detail": f"Inflow from unregistered counterparty: {t['counterparty']} on {t['date']} (₹{t['amount']:,})"})
    # 4. OCR mismatch on statement analyses (from stored parse confidence)
    stmt_docs = await db.statement_analyses.find({"lender_id": current.user_id}, {"_id": 0, "parse_confidence": 1, "rows_extracted": 1, "bounce_matches_found": 1, "file_name": 1, "client_id": 1}).sort("created_at", -1).to_list(50)
    for s in stmt_docs:
        if s.get("parse_confidence") == "low":
            variance.append({"severity": "medium", "type": "OCR mismatch",
                             "detail": f"Low parsing confidence on {s.get('file_name','statement')} ({s.get('rows_extracted',0)} rows)"})

    # Sort txns newest → oldest
    inflow_txns.sort(key=lambda x: x["date"], reverse=True)
    outflow_txns.sort(key=lambda x: x["date"], reverse=True)

    result = {
        "period":       {"from": buckets[0]["label"], "to": buckets[-1]["label"], "months": months},
        "inflow_total": inflow_total,
        "outflow_total": outflow_total,
        "net":          inflow_total - outflow_total,
        "overdue_total": round(overdue_total),
        "funded_count": funded_count,
        "repaid_count": repaid_count,
        "loans_funded": funded_count,
        "active_loans": active_loans,
        "monthly":      [{"label": b["label"], "inflow": b["inflow"], "outflow": b["outflow"], "net": b["net"]} for b in buckets],
        "reconciliation": {
            "opening_balance": opening_balance,
            "inflow":          inflow_total,
            "outflow":         outflow_total,
            "closing_balance": closing_balance,
            "formula":         "Opening + Inflow − Outflow = Closing",
            "reconciled":      len(variance) == 0,
        },
        "variance":     variance,
    }
    if include_transactions:
        result["inflow_transactions"]  = inflow_txns[:200]
        result["outflow_transactions"] = outflow_txns[:200]
    return result



@api.get("/audit/summary.pdf")
async def audit_summary_pdf(months: int = 6, year: int = 0, current: UserPublic = Depends(get_current_user_flexible)):
    from reportlab.lib.pagesizes import A4
    from reportlab.lib import colors as rlc
    from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
    from reportlab.lib.units import mm
    from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle
    from io import BytesIO
    from fastapi.responses import StreamingResponse

    data = await audit_summary(months=months, year=year, current=current)
    primary = rlc.HexColor("#1E40AF")
    emerald = rlc.HexColor("#10B981")
    crimson = rlc.HexColor("#DC2626")
    muted = rlc.HexColor("#64748B")
    light = rlc.HexColor("#F1F5F9")
    text = rlc.HexColor("#0F172A")

    buf = BytesIO()
    pdf = SimpleDocTemplate(buf, pagesize=A4, leftMargin=18*mm, rightMargin=18*mm, topMargin=18*mm, bottomMargin=18*mm, title="LendIQ Audit Report")
    ss = getSampleStyleSheet()
    h1 = ParagraphStyle("H1", parent=ss["Heading1"], fontSize=20, textColor=primary, leading=24)
    h2 = ParagraphStyle("H2", parent=ss["Heading2"], fontSize=13, textColor=primary, leading=16, spaceBefore=6)
    small = ParagraphStyle("Small", parent=ss["BodyText"], fontSize=9, textColor=muted, leading=11)

    story = []
    strip = Table([[Paragraph("<b>LendIQ</b>", ParagraphStyle("b", fontSize=16, textColor=rlc.white)), Paragraph("Powered by SKYNOTECH", ParagraphStyle("bs", fontSize=10, textColor=rlc.white, alignment=2))]], colWidths=[90*mm, 80*mm])
    strip.setStyle(TableStyle([("BACKGROUND",(0,0),(-1,-1),primary),("TEXTCOLOR",(0,0),(-1,-1),rlc.white),("VALIGN",(0,0),(-1,-1),"MIDDLE"),("TOPPADDING",(0,0),(-1,-1),10),("BOTTOMPADDING",(0,0),(-1,-1),10),("LEFTPADDING",(0,0),(-1,-1),10),("RIGHTPADDING",(0,0),(-1,-1),10)]))
    story.append(strip); story.append(Spacer(1,10))
    story.append(Paragraph("Audit & Cashflow Report", h1))
    story.append(Paragraph(f"Lender: {current.name} · Period: {data['period']['from']} — {data['period']['to']} · Generated {datetime.now(timezone.utc).strftime('%d %b %Y %H:%M UTC')}", small))
    story.append(Spacer(1,12))

    summary_rows = [
        ["Inflow (repayments)",  f"₹{int(data['inflow_total']):,}"],
        ["Outflow (disbursals)", f"₹{int(data['outflow_total']):,}"],
        ["Net position",         f"₹{int(data['net']):,}"],
        ["Overdue outstanding",  f"₹{int(data['overdue_total']):,}"],
        ["Loans funded",         str(data['funded_count'])],
        ["EMI repayments",       str(data['repaid_count'])],
        ["Active loans",         str(data['active_loans'])],
    ]
    st = Table(summary_rows, colWidths=[80*mm, 80*mm])
    st.setStyle(TableStyle([("BACKGROUND",(0,0),(0,-1),light),("FONTNAME",(0,0),(0,-1),"Helvetica-Bold"),("FONTSIZE",(0,0),(-1,-1),10),("ALIGN",(1,0),(1,-1),"RIGHT"),("TOPPADDING",(0,0),(-1,-1),6),("BOTTOMPADDING",(0,0),(-1,-1),6),("LEFTPADDING",(0,0),(-1,-1),10),("RIGHTPADDING",(0,0),(-1,-1),10),("LINEBELOW",(0,0),(-1,-1),0.3,rlc.HexColor("#E2E8F0"))]))
    story.append(st); story.append(Spacer(1,14))

    story.append(Paragraph("Month-wise cashflow", h2))
    rows = [["Month","Inflow","Outflow","Net"]]
    for m in data["monthly"]:
        rows.append([m["label"], f"₹{m['inflow']:,}", f"₹{m['outflow']:,}", f"₹{m['net']:,}"])
    mt = Table(rows, colWidths=[50*mm, 40*mm, 40*mm, 40*mm])
    mt.setStyle(TableStyle([("BACKGROUND",(0,0),(-1,0),primary),("TEXTCOLOR",(0,0),(-1,0),rlc.white),("FONTNAME",(0,0),(-1,0),"Helvetica-Bold"),("FONTSIZE",(0,0),(-1,-1),9.5),("ALIGN",(1,0),(-1,-1),"RIGHT"),("TOPPADDING",(0,0),(-1,-1),5),("BOTTOMPADDING",(0,0),(-1,-1),5),("LEFTPADDING",(0,0),(-1,-1),8),("RIGHTPADDING",(0,0),(-1,-1),8),("LINEBELOW",(0,0),(-1,-1),0.3,rlc.HexColor("#E2E8F0"))]))
    story.append(mt)
    story.append(Spacer(1, 14))

    # ---- Reconciliation block
    rec = data.get("reconciliation", {})
    story.append(Paragraph("Reconciliation", h2))
    recon_rows = [
        ["Opening balance",        f"₹{int(rec.get('opening_balance', 0)):,}"],
        ["+ Inflow",               f"₹{int(rec.get('inflow', 0)):,}"],
        ["− Outflow",              f"₹{int(rec.get('outflow', 0)):,}"],
        ["= Closing balance",      f"₹{int(rec.get('closing_balance', 0)):,}"],
        ["Formula",                rec.get("formula", "")],
        ["Status",                 "RECONCILED ✓" if rec.get("reconciled") else "VARIANCE ⚠"],
    ]
    rt = Table(recon_rows, colWidths=[80*mm, 80*mm])
    rt.setStyle(TableStyle([
        ("BACKGROUND",(0,0),(0,-1),light),
        ("FONTNAME",(0,0),(0,-1),"Helvetica-Bold"),
        ("FONTSIZE",(0,0),(-1,-1),10),
        ("ALIGN",(1,0),(1,-1),"RIGHT"),
        ("TOPPADDING",(0,0),(-1,-1),6),("BOTTOMPADDING",(0,0),(-1,-1),6),
        ("LEFTPADDING",(0,0),(-1,-1),10),("RIGHTPADDING",(0,0),(-1,-1),10),
        ("LINEBELOW",(0,0),(-1,-1),0.3,rlc.HexColor("#E2E8F0")),
        ("BACKGROUND",(0,3),(1,3),rlc.HexColor("#DBEAFE")),
        ("TEXTCOLOR",(1,-1),(1,-1), emerald if rec.get("reconciled") else crimson),
    ]))
    story.append(rt)
    story.append(Spacer(1, 12))

    # ---- Variance / exceptions
    var = data.get("variance", []) or []
    if var:
        story.append(Paragraph("Variance / Exceptions", h2))
        for v in var[:15]:
            col = crimson if v.get("severity") == "high" else (rlc.HexColor("#D97706") if v.get("severity") == "medium" else muted)
            cell = Table(
                [[Paragraph(f"<b>[{str(v.get('severity','')).upper()}] {v.get('type','Exception')}</b>", ParagraphStyle('v1', fontSize=10, textColor=col, leading=13))],
                 [Paragraph(v.get("detail", ""), small)]],
                colWidths=[170*mm],
            )
            cell.setStyle(TableStyle([("BACKGROUND",(0,0),(-1,-1),rlc.HexColor("#FAFBFE")),("BOX",(0,0),(-1,-1),0.6,col),("LEFTPADDING",(0,0),(-1,-1),10),("RIGHTPADDING",(0,0),(-1,-1),10),("TOPPADDING",(0,0),(-1,-1),5),("BOTTOMPADDING",(0,0),(-1,-1),5)]))
            story.append(cell); story.append(Spacer(1, 4))
        story.append(Spacer(1, 10))

    # ---- Inflow transactions
    infs = data.get("inflow_transactions", []) or []
    if infs:
        from reportlab.platypus import PageBreak
        story.append(PageBreak())
        story.append(Paragraph("Inflow — Money Received", h1))
        story.append(Paragraph(f"{len(infs)} transaction(s). Sorted newest first.", small))
        story.append(Spacer(1, 8))
        ih = [["Date","From (Counterparty)","Amount","Mode","Frequency","Ref"]]
        for t in infs[:60]:
            ih.append([t["date"], t["counterparty"][:22], f"₹{t['amount']:,}", t["mode"], t.get("frequency","—"), t.get("reference","")])
        inft = Table(ih, colWidths=[22*mm, 55*mm, 28*mm, 20*mm, 30*mm, 20*mm], repeatRows=1)
        inft.setStyle(TableStyle([("BACKGROUND",(0,0),(-1,0),emerald),("TEXTCOLOR",(0,0),(-1,0),rlc.white),("FONTNAME",(0,0),(-1,0),"Helvetica-Bold"),("FONTSIZE",(0,0),(-1,-1),8.5),("ALIGN",(2,0),(2,-1),"RIGHT"),("TOPPADDING",(0,0),(-1,-1),4),("BOTTOMPADDING",(0,0),(-1,-1),4),("LEFTPADDING",(0,0),(-1,-1),6),("RIGHTPADDING",(0,0),(-1,-1),6),("LINEBELOW",(0,0),(-1,-1),0.2,rlc.HexColor("#E2E8F0"))]))
        story.append(inft)

    # ---- Outflow transactions
    outs = data.get("outflow_transactions", []) or []
    if outs:
        from reportlab.platypus import PageBreak
        story.append(PageBreak())
        story.append(Paragraph("Outflow — Money Disbursed", h1))
        story.append(Paragraph(f"{len(outs)} transaction(s). Sorted newest first.", small))
        story.append(Spacer(1, 8))
        oh = [["Date","To (Counterparty)","Amount","Mode","Category","Ref"]]
        for t in outs[:60]:
            oh.append([t["date"], t["counterparty"][:22], f"₹{t['amount']:,}", t["mode"], t.get("category","—"), t.get("reference","")])
        outt = Table(oh, colWidths=[22*mm, 55*mm, 28*mm, 20*mm, 30*mm, 20*mm], repeatRows=1)
        outt.setStyle(TableStyle([("BACKGROUND",(0,0),(-1,0),primary),("TEXTCOLOR",(0,0),(-1,0),rlc.white),("FONTNAME",(0,0),(-1,0),"Helvetica-Bold"),("FONTSIZE",(0,0),(-1,-1),8.5),("ALIGN",(2,0),(2,-1),"RIGHT"),("TOPPADDING",(0,0),(-1,-1),4),("BOTTOMPADDING",(0,0),(-1,-1),4),("LEFTPADDING",(0,0),(-1,-1),6),("RIGHTPADDING",(0,0),(-1,-1),6),("LINEBELOW",(0,0),(-1,-1),0.2,rlc.HexColor("#E2E8F0"))]))
        story.append(outt)

    def _footer(c, d):
        c.saveState(); c.setFont("Helvetica", 8); c.setFillColor(muted)
        c.drawString(18*mm, 10*mm, f"LendIQ Audit · {current.name} · {datetime.now(timezone.utc).strftime('%Y-%m-%d')}")
        c.drawRightString(A4[0]-18*mm, 10*mm, f"Page {c.getPageNumber()}")
        c.restoreState()
    pdf.build(story, onFirstPage=_footer, onLaterPages=_footer)
    buf.seek(0)
    fn = f"LendIQ-Audit-{data['period']['from'].replace(' ','')}-to-{data['period']['to'].replace(' ','')}.pdf"
    return StreamingResponse(buf, media_type="application/pdf", headers={"Content-Disposition": f'attachment; filename="{fn}"'})


class ChatRequest(BaseModel):
    question: str
    language: Optional[str] = None  # "en","hi","ta","te","kn","ml"
    history: Optional[List[Dict[str, str]]] = None  # [{role:"user"|"bot", text:"..."}]


# --- Fast keyword FAQ (instant replies, no LLM latency) ---
_SUPPORT_KB: List[Tuple[List[str], str]] = [
    (["add", "client"], "To add a new client:\n1. Go to the **Clients tab** at the bottom.\n2. Tap the **+ Add** button on the top right.\n3. Fill in name, mobile number, Aadhaar (12 digits) and PAN (10 chars).\n4. Add the permanent address block.\n5. Tap **Save client** — we auto-verify Aadhaar & PAN and add them to your clients list."),
    (["new", "loan"], "To issue a new loan:\n1. Open the client from **Clients**.\n2. Tap **New loan**.\n3. Review the client snapshot → Continue.\n4. Upload a bank statement (PDF) → we analyze + score it.\n5. Pull a CIBIL check (optional) → enter amount, tenure, rate, due date.\n6. Review summary → tap **Fund** to disburse."),
    (["emi", "mark paid", "pay"], "Month-wise EMI rules:\n• You can **Mark Paid** / **Reschedule** only for the CURRENT month.\n• Past + future months are locked to protect the record.\n• If you made a mistake, use the **Undo** button on the same row to rollback the payment and reopen it."),
    (["bank", "statement", "analyze", "analysis"], "Bank-statement analysis:\n1. Open **New loan → Upload statement**.\n2. Pick 3 / 6 / 12 months.\n3. Select the PDF — we parse it, detect bounces/NACH fails, and score the risk.\n4. Download a branded PDF report from the analysis screen."),
    (["cibil"], "CIBIL check:\n1. During the new loan flow, after statement analysis tap **Pull CIBIL**.\n2. We fetch the score + key factors.\n3. Tap **Download Report (PDF)** to save the full CIBIL report."),
    (["language", "भाषा", "மொழி"], "Change language:\n1. Profile tab → **Language**.\n2. Pick from English, Hindi, Tamil, Telugu, Kannada, Malayalam.\n3. The entire app switches instantly."),
    (["subscription", "plan", "upgrade"], "Subscription / upgrade:\n1. Profile tab → **Subscription**.\n2. Toggle Monthly / Yearly.\n3. Pick Starter / Smart Credit / Prime Elite.\n4. Tap **Upgrade** — payment gateway coming soon."),
    (["audit", "report", "inflow", "outflow"], "Audit & reports:\n1. Profile tab → **Audit & Reports**.\n2. Pick 3M / 6M / 12M / YTD and the year.\n3. See month-wise inflow / outflow / net.\n4. Tap **Download audit report (PDF)** for a branded report."),
    (["overdue", "late"], "Overdue loans:\n• Dashboard → **Portfolio health → Overdue** opens the filtered list.\n• Red highlighted loans have unpaid EMIs past due.\n• Open any loan → tap **Mark paid (current month)** to collect."),
    (["logout", "sign out"], "Sign out from Profile tab → **Logout** at the bottom."),
    (["pdf", "download"], "All PDFs (Document Analysis, CIBIL, Audit) download directly to your device. On Android the first download asks you to pick a folder (saved for next time); on iOS the PDF opens inline where you can save to Files."),
]

_SUPPORT_SYSTEM = """You are **LendIQ Guide**, a friendly in-app assistant for the LendIQ smart-lending mobile app (powered by SKYNOTECH).

You help LENDERS (not borrowers) operate the app. Keep answers short, practical and step-by-step (use numbered lists). Always refer to in-app screens by their exact labels. Use markdown bold (**label**) for UI elements. Never fabricate features that don't exist.

LendIQ feature map you MUST use:
• **Dashboard tab** — TOTAL FUNDED hero, Portfolio Health tiles (On Track / Overdue / At Risk / Completed — each is tappable), Inflow/Outflow chart, Recent Transactions.
• **Requests tab** — pending loan applications list.
• **Loans tab** — active loans with filter pills (All / On Track / Overdue / At Risk / Completed).
• **Clients tab** — add, search, and open clients (KYC: Aadhaar 12-digit + PAN 10-char auto-verified).
• **Profile tab** — Subscription, Language, Audit & Reports, Help & Support, Logout.

Key flows:
1. Add client: Clients tab → + Add → name, mobile, Aadhaar, PAN, address → Save.
2. New loan: Clients → open client → New loan → review → upload bank statement PDF (3/6/12 mo) → AI analysis → pull CIBIL → enter amount/tenure/rate/due day → Summary → Fund.
3. Bank statement analysis: deterministic pdfplumber engine detects bounces, NACH fails, inflow/outflow; returns risk level + reasons.
4. CIBIL: one-tap check, downloadable PDF with score/band/factors.
5. EMI: Month-wise EMI only — only CURRENT month can be marked paid or rescheduled; past/future are locked. Every payment has an Undo button to rollback.
6. Approve / Reject: each decision is stamped with Lender name, date, reason — visible on the loan application detail.
7. Repayment schedule: anchored to due_day you choose at approval (1-28); overdue EMIs are flagged red with days-late.
8. Audit & Reports: Profile → Audit & Reports. Pick 3M/6M/12M/YTD + year. Month-wise inflow, outflow, net + reconciliation + variance detection. Download branded PDF.
9. Subscription: Profile → Subscription. Starter ₹499/mo, Smart Credit ₹1499/mo (Popular), Prime Elite ₹3999/mo. Monthly/Yearly toggle. Payment gateway coming soon.
10. Languages: Profile → Language. English, Hindi, Tamil, Telugu, Kannada, Malayalam. Switches instantly.
11. PDF downloads: All PDFs (Analysis, CIBIL, Audit) download directly to device. Android uses Storage Access Framework (pick folder once). iOS opens inline in browser to save.
12. Portfolio Health logic: On Track = all EMIs unpaid-but-not-past-due. Overdue = has unpaid past-due EMI. At Risk = past payments were late but currently not overdue. Completed = loan fully paid. Defaulted = marked defaulted.

Tone: concise, professional, warm. If the user asks something unrelated to LendIQ, politely steer them back. Never claim to execute actions — only explain how the user can do it.

If the user asks in Hindi / Tamil / Telugu / Kannada / Malayalam, REPLY in that same language. If a `language` hint is provided, prefer that language.

Keep every answer under 120 words unless the user explicitly asks for more detail.
"""

_LANG_NAME = {
    "en": "English", "hi": "Hindi", "ta": "Tamil",
    "te": "Telugu", "kn": "Kannada", "ml": "Malayalam",
}


@api.post("/support/chat")
async def support_chat(body: ChatRequest, current: UserPublic = Depends(get_current_user)):
    """Hybrid guide bot: keyword-match FAQ (instant) → Emergent LLM (GPT-4o-mini) for
    everything else → deterministic fallback if LLM fails. Replies in the user's language."""
    q = (body.question or "").strip()
    if not q:
        return {"answer": "Please ask a question — e.g. 'How do I add a client?'", "source": "empty"}

    q_lower = q.lower()

    # 1) Fast keyword path — only for short, focused how-tos. Long questions (likely
    # comparative / nuanced) go straight to the LLM for a better answer.
    word_count = len(q.split())
    if word_count <= 8:
        for keys, answer in _SUPPORT_KB:
            if all(k in q_lower for k in keys[:1]):
                matched = sum(1 for k in keys if k in q_lower)
                if matched >= 1:
                    return {"answer": answer, "source": "faq"}

    # 2) LLM path
    try:
        from emergentintegrations.llm.chat import LlmChat, UserMessage

        lang = (body.language or "en").lower()
        lang_name = _LANG_NAME.get(lang, "English")
        sys_prompt = _SUPPORT_SYSTEM + f"\nUser's preferred language: **{lang_name}**."

        chat = LlmChat(
            api_key=EMERGENT_LLM_KEY,
            session_id=f"help-{current.user_id}",
            system_message=sys_prompt,
        ).with_model("openai", "gpt-4o-mini")

        # include recent history for context
        convo = ""
        if body.history:
            for m in body.history[-6:]:  # last 3 turns
                role = "User" if m.get("role") == "user" else "Assistant"
                txt = (m.get("text") or "").strip()
                if txt:
                    convo += f"{role}: {txt}\n"
        convo += f"User: {q}\nAssistant:"

        resp = await chat.send_message(UserMessage(text=convo))
        answer = (resp or "").strip()
        if not answer:
            raise ValueError("empty LLM response")
        return {"answer": answer, "source": "ai"}
    except Exception as e:
        logger.warning(f"support_chat LLM failed, using fallback: {e}")

    # 3) Deterministic fallback
    return {"answer": (
        "I don't have a specific step list for that yet, but here's where to look:\n"
        "• **Clients tab** → add / view clients\n"
        "• **Loans tab** → active loans + filters (On Track / Overdue / At Risk / Completed)\n"
        "• **Profile → Audit** → inflow/outflow reports\n"
        "• **Profile → Language** → switch language\n"
        "Ask me things like 'How to add a client', 'How to analyze a statement', or 'How does EMI rollback work?'"
    ), "source": "fallback"}




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


async def seed_demo_loans():
    """Populate realistic demo loans covering every EMI state for testing.

    States covered (per user's requirement):
      - Fully paid (closed/completed)
      - Current-month pending
      - Overdue unpaid
      - Overdue paid (paid late)
      - Future upcoming
      - Rescheduled
      - Rolled-back
      - Multiple active loans
      - Defaulted
    """
    count = await db.loans.count_documents({"seed": True})
    if count > 0:
        return
    logger.info("Seeding demo loans for testing...")

    now = datetime.now(timezone.utc)
    y, m = now.year, now.month

    def dt(year: int, month: int, day: int = 10) -> datetime:
        # Clamp day to a safe value for the month
        try:
            return datetime(year, month, day, 0, 0, 0, tzinfo=timezone.utc)
        except ValueError:
            return datetime(year, month, 28, 0, 0, 0, tzinfo=timezone.utc)

    def prev_month(yy: int, mm: int, delta: int = 1):
        mm -= delta
        while mm < 1:
            mm += 12; yy -= 1
        return yy, mm

    def next_month(yy: int, mm: int, delta: int = 1):
        mm += delta
        while mm > 12:
            mm -= 12; yy += 1
        return yy, mm

    # Prefer the primary demo lender 9876543210; else first lender found.
    lender = await db.users.find_one({"mobile": "9876543210"}, {"_id": 0})
    if not lender:
        lender = await db.users.find_one({"role": {"$in": ["lender", "admin"]}}, {"_id": 0})
    lender_id = lender["user_id"] if lender else "u_demo_lender"

    demo_clients = [
        ("Rajesh Kumar",    "9810000001", "ABCDE0001R", "Kumar Enterprises"),
        ("Sneha Reddy",     "9810000002", "ABCDE0002R", "Freelance Designer"),
        ("Arjun Mehta",     "9810000003", "ABCDE0003R", "Software Consultant"),
        ("Priya Nair",      "9810000004", "ABCDE0004R", "Medical Practitioner"),
        ("Vikram Singh",    "9810000005", "ABCDE0005R", "Transport Business"),
        ("Ananya Iyer",     "9810000006", "ABCDE0006R", "Content Creator"),
        ("Rahul Desai",     "9810000007", "ABCDE0007R", "Retail Shop"),
        ("Kavya Sharma",    "9810000008", "ABCDE0008R", "Yoga Instructor"),
        ("Suresh Pillai",   "9810000009", "ABCDE0009R", "Textile Export"),
        ("Meera Joshi",     "9810000010", "ABCDE0010R", "Digital Marketer"),
    ]

    client_docs = []
    for i, (name, mobile, pan, occ) in enumerate(demo_clients):
        existing = await db.clients.find_one({"lender_id": lender_id, "pan": pan}, {"_id": 0})
        if existing:
            client_docs.append(existing); continue
        cdoc = {
            "client_id": f"cli_seed_{i:03d}", "lender_id": lender_id,
            "name": name, "mobile": mobile,
            "aadhaar_masked": "XXXX-XXXX-" + str(1000 + i),
            "aadhaar_last4": str(1000 + i), "pan": pan,
            "aadhaar_name": name, "pan_name": name, "pan_dob": "1990-01-15",
            "address_line1": "123 MG Road", "address_line2": None,
            "city": "Bengaluru", "state": "Karnataka", "pincode": "560001",
            "aadhaar_verified": True, "pan_verified": True, "otp_verified": False,
            "status": "active", "reject_reason": None, "reject_at": None,
            "avatar": None, "created_at": now,
        }
        await db.clients.insert_one(cdoc); client_docs.append(cdoc)

    def make_schedule(emi: float, months: int, start_year: int, start_month: int, day: int = 10):
        out = []
        yy, mm = start_year, start_month
        for k in range(1, months + 1):
            out.append({
                "month": k, "due_date": dt(yy, mm, day),
                "amount": emi, "status": "upcoming",
                "paid_at": None, "was_late": False,
            })
            yy, mm = next_month(yy, mm, 1)
        return out

    def borrower_profile(c):
        return {
            "name": c["name"],
            "avatar": None,
            "age": 34,
            "occupation": "Self-employed",
            "monthly_income": 50000.0, "employment_years": 4.0,
            "existing_debts": 5000.0, "credit_history_years": 6.0,
            "previous_defaults": 0,
        }

    loans_plan = []

    # ---- Loan 1: fully paid (completed)  ---- 6 months, all paid on time
    c = client_docs[0]
    emi = 8500
    sy, sm = prev_month(y, m, 6)
    sched = make_schedule(emi, 6, sy, sm)
    for s in sched:
        s["status"] = "paid"
        s["paid_at"] = s["due_date"] - timedelta(days=2)
        s["was_late"] = False
    loans_plan.append(("L1_COMPLETED", c, sched, "completed", emi * 6))

    # ---- Loan 2: current-month pending + 2 past paid + 3 future ----
    c = client_docs[1]
    emi = 12000
    sy, sm = prev_month(y, m, 2)
    sched = make_schedule(emi, 6, sy, sm)
    # Mark months 1,2 paid on time; month 3 = current pending; rest future.
    for s in sched[:2]:
        s["status"] = "paid"
        s["paid_at"] = s["due_date"] - timedelta(days=1)
        s["was_late"] = False
    loans_plan.append(("L2_CURRENT_PENDING", c, sched, "active", emi * 2))

    # ---- Loan 3: has OVERDUE unpaid (past month not paid) ----
    c = client_docs[2]
    emi = 15500
    sy, sm = prev_month(y, m, 3)
    sched = make_schedule(emi, 8, sy, sm)
    # Months 1,2 paid; month 3 unpaid (OVERDUE — past due, not paid); month 4 current pending; 5-8 future
    sched[0]["status"] = "paid"; sched[0]["paid_at"] = sched[0]["due_date"] - timedelta(days=1)
    sched[1]["status"] = "paid"; sched[1]["paid_at"] = sched[1]["due_date"] + timedelta(days=3); sched[1]["was_late"] = True
    # sched[2] stays upcoming → overdue (past)
    loans_plan.append(("L3_OVERDUE", c, sched, "active", emi * 2))

    # ---- Loan 4: Overdue paid (paid late, past) ----
    c = client_docs[3]
    emi = 9800
    sy, sm = prev_month(y, m, 4)
    sched = make_schedule(emi, 9, sy, sm)
    for i in range(4):
        sched[i]["status"] = "paid"
        late = i in (1, 3)
        sched[i]["paid_at"] = sched[i]["due_date"] + timedelta(days=6 if late else -1)
        sched[i]["was_late"] = late
    loans_plan.append(("L4_OVERDUE_PAID", c, sched, "active", emi * 4))

    # ---- Loan 5: Future upcoming only (just funded — first EMI in 2 months) ----
    c = client_docs[4]
    emi = 6400
    sy, sm = next_month(y, m, 1)
    sched = make_schedule(emi, 6, sy, sm)
    loans_plan.append(("L5_FUTURE", c, sched, "active", 0))

    # ---- Loan 6: Rescheduled EMI (month 3 moved forward by 10 days) ----
    c = client_docs[5]
    emi = 11200
    sy, sm = prev_month(y, m, 2)
    sched = make_schedule(emi, 6, sy, sm)
    sched[0]["status"] = "paid"; sched[0]["paid_at"] = sched[0]["due_date"]
    sched[1]["status"] = "paid"; sched[1]["paid_at"] = sched[1]["due_date"]
    # Month 3 (current) rescheduled +10 days
    sched[2]["due_date"] = sched[2]["due_date"] + timedelta(days=10)
    loans_plan.append(("L6_RESCHEDULED", c, sched, "active", emi * 2))

    # ---- Loan 7: Rolled-back payment (month 2 was paid, now undone) ----
    c = client_docs[6]
    emi = 7600
    sy, sm = prev_month(y, m, 2)
    sched = make_schedule(emi, 6, sy, sm)
    sched[0]["status"] = "paid"; sched[0]["paid_at"] = sched[0]["due_date"]
    # month 2 explicitly upcoming (reverted) — will show as OVERDUE since past
    # Note: Real undo leaves status=upcoming. Because month 2 is past-due now, it becomes overdue.
    loans_plan.append(("L7_ROLLBACK", c, sched, "active", emi))

    # ---- Loan 8 & 9: Multiple active loans for same customer (client 7) ----
    c = client_docs[7]
    for j, (emiAmt, months) in enumerate([(5200, 6), (14500, 12)]):
        sy, sm = prev_month(y, m, 1)
        sched = make_schedule(emiAmt, months, sy, sm)
        sched[0]["status"] = "paid"; sched[0]["paid_at"] = sched[0]["due_date"] - timedelta(days=1)
        loans_plan.append((f"L8+{j}_MULTI", c, sched, "active", emiAmt))

    # ---- Loan 10: Defaulted loan (3 months all unpaid past due) ----
    c = client_docs[8]
    emi = 18500
    sy, sm = prev_month(y, m, 4)
    sched = make_schedule(emi, 6, sy, sm)
    # All past months unpaid (defaulted)
    loans_plan.append(("L10_DEFAULT", c, sched, "defaulted", 0))

    # ---- Loan 11: Healthy mid-term (4/12 paid, rest future) ----
    c = client_docs[9]
    emi = 10500
    sy, sm = prev_month(y, m, 4)
    sched = make_schedule(emi, 12, sy, sm)
    for i in range(4):
        sched[i]["status"] = "paid"
        sched[i]["paid_at"] = sched[i]["due_date"] - timedelta(days=1)
    loans_plan.append(("L11_HEALTHY", c, sched, "active", emi * 4))

    for code, c, sched, status, paid_amount in loans_plan:
        loan_id = f"loan_seed_{code.lower().replace('+','_')}_{uuid.uuid4().hex[:6]}"
        principal = sum(s["amount"] for s in sched)
        total_repayment = principal  # interest-free for simplicity in demo
        doc = {
            "loan_id": loan_id,
            "application_id": f"app_seed_{code}",
            "client_id": c["client_id"],
            "borrower": borrower_profile(c),
            "principal": principal,
            "interest_rate": 12.0,
            "term_months": len(sched),
            "monthly_payment": sched[0]["amount"],
            "total_repayment": total_repayment,
            "paid_amount": paid_amount,
            "status": status,
            "repayment_schedule": sched,
            "funded_at": sched[0]["due_date"] - timedelta(days=20),
            "funded_by": lender_id,
            "seed": True,
        }
        await db.loans.insert_one(doc)
    logger.info(f"Seeded {len(loans_plan)} demo loans across {len(demo_clients)} clients")

@app.on_event("startup")
async def startup():
    await seed_demo_data()
    await seed_demo_loans()

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

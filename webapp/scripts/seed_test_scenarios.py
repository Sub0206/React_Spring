"""Seed 5 deterministic test scenarios for the Repayment / Risk flows.

Creates clients + loans tied to the Demo Lender (mobile 9876543210).
Idempotent: running twice just re-upserts the same docs.

Run from container:
    python3 /app/webapp/scripts/seed_test_scenarios.py

Test clients produced:
    1. Test Mild Overdue    (🟡 OVERDUE MILD)       1 paid + 1 overdue-this-month + 1 future
    2. Test High Risk       (🔴 AT RISK)            2 overdue past months + 1 current
    3. Test Loan Warning    (🟡 Warning modal)      1 active loan with 1 current-month overdue
    4. Test High Risk Loan  (🔴 Blocking modal)     Multiple unpaid past-due EMIs
    5. Test Clean Client    (🟢 ON TRACK)           All 3 EMIs paid
"""
from __future__ import annotations

import asyncio
import os
from datetime import datetime, timezone, timedelta
from typing import List, Dict
from dotenv import load_dotenv
from motor.motor_asyncio import AsyncIOMotorClient


DEMO_LENDER_MOBILE = "9876543210"
SCENARIO_PREFIX = "cli_test_scenario"


def _now_utc() -> datetime:
    return datetime.now(tz=timezone.utc)


def _months_ago(n: int) -> datetime:
    """Give a datetime whose calendar-month is N months before today."""
    d = _now_utc()
    year = d.year
    month = d.month - n
    while month <= 0:
        year -= 1
        month += 12
    # use day=10 so we don't run into end-of-month edge cases
    return d.replace(year=year, month=month, day=10, hour=10, minute=0, second=0, microsecond=0)


def _this_month(day: int = 10) -> datetime:
    d = _now_utc().replace(day=day, hour=10, minute=0, second=0, microsecond=0)
    return d


def _months_ahead(n: int, day: int = 10) -> datetime:
    d = _now_utc()
    year = d.year
    month = d.month + n
    while month > 12:
        year += 1
        month -= 12
    return d.replace(year=year, month=month, day=day, hour=10, minute=0, second=0, microsecond=0)


def _make_emi(month: int, due: datetime, amount: float, *, paid: bool = False, was_late: bool = False) -> Dict:
    entry = {
        "month": month,
        "due_date": due,
        "amount": round(amount, 2),
        "status": "paid" if paid else "upcoming",
        "paid_at": (due + timedelta(days=(2 if was_late else -1))) if paid else None,
        "was_late": bool(paid and was_late),
    }
    return entry


def _client_doc(*, client_id: str, name: str, mobile: str, pan: str, lender_id: str) -> Dict:
    created = _now_utc() - timedelta(days=30)
    return {
        "client_id": client_id,
        "lender_id": lender_id,
        "name": name,
        "mobile": mobile,
        "pan": pan,
        "pan_name": name,
        "pan_dob": "1990-01-01",
        "aadhaar_masked": "XXXX-XXXX-1234",
        "aadhaar_name": name,
        "address_line1": "42 Scenario Lane",
        "address_line2": "",
        "city": "Bengaluru",
        "state": "Karnataka",
        "pincode": "560001",
        "avatar": None,
        "otp_verified": True,
        "pan_verified": True,
        "aadhaar_verified": True,
        "status": "active",
        "reject_reason": None,
        "reject_at": None,
        "created_at": created,
    }


def _loan_doc(
    *,
    loan_id: str,
    client_id: str,
    lender_user_id: str,
    name: str,
    mobile: str,
    principal: float,
    emi_amount: float,
    schedule: List[Dict],
) -> Dict:
    total_repay = round(sum(e["amount"] for e in schedule), 2)
    paid_amount = round(sum(e["amount"] for e in schedule if e["status"] == "paid"), 2)
    # Compute status: completed only when everything's paid.
    status = "completed" if paid_amount >= total_repay and total_repay > 0 else "active"
    created = _now_utc() - timedelta(days=90)
    return {
        "loan_id": loan_id,
        "application_id": f"app_{loan_id}",  # Loan.application_id is required (str)
        "client_id": client_id,
        "funded_by": lender_user_id,
        "funded_at": created,
        "principal": principal,
        "emi_amount": round(emi_amount, 2),
        "monthly_payment": round(emi_amount, 2),
        "interest_rate": 14.0,
        "term_months": len(schedule),
        "total_repayment": total_repay,
        "paid_amount": paid_amount,
        "status": status,
        "borrower": {
            "name": name,
            "mobile": mobile,
            "avatar": None,
            "age": 34,
            "occupation": "Self-employed",
            "monthly_income": 50000.0,
            "employment_years": 4.0,
            "existing_debts": 5000.0,
            "credit_history_years": 6.0,
            "previous_defaults": 0,
        },
        "repayment_schedule": schedule,
        "purpose": "Scenario test loan",
        "seed": "scenario_test_v1",
    }


async def main() -> None:
    load_dotenv("/app/backend/.env")
    mongo = AsyncIOMotorClient(os.environ["MONGO_URL"])
    db = mongo[os.environ["DB_NAME"]]

    demo_user = await db.users.find_one({"mobile": DEMO_LENDER_MOBILE})
    if not demo_user:
        raise SystemExit(f"Demo lender (mobile {DEMO_LENDER_MOBILE}) not found — seed the demo user first.")
    lender_id = demo_user["user_id"]
    print(f"Demo lender user_id = {lender_id}")

    EMI = 5000.0
    PRINCIPAL = 14000.0

    scenarios = []

    # SCENARIO 1 — OVERDUE (MILD)
    # Month 1 paid, Month 2 (current month, past-due) unpaid, Month 3 future.
    sc1_sched = [
        _make_emi(1, _months_ago(1), EMI, paid=True, was_late=False),
        _make_emi(2, _this_month(day=1),  EMI),      # current month, day 1 already past → overdue mild
        _make_emi(3, _months_ahead(1, day=10), EMI),
    ]
    scenarios.append({
        "cid": f"{SCENARIO_PREFIX}_1_mild",
        "name": "Test Mild Overdue",
        "mobile": "9990000101",
        "pan": "TEST1MILD1M",
        "loan_id": "loan_test_scenario_1_mild",
        "schedule": sc1_sched,
        "principal": PRINCIPAL,
        "emi": EMI,
    })

    # SCENARIO 2 — HIGH RISK
    # Month 1 unpaid (2 months ago) + Month 2 unpaid (1 month ago) + Month 3 current (past-due)
    sc2_sched = [
        _make_emi(1, _months_ago(2), EMI),
        _make_emi(2, _months_ago(1), EMI),
        _make_emi(3, _this_month(day=1), EMI),
    ]
    scenarios.append({
        "cid": f"{SCENARIO_PREFIX}_2_high",
        "name": "Test High Risk",
        "mobile": "9990000102",
        "pan": "TEST2HIGH1H",
        "loan_id": "loan_test_scenario_2_high",
        "schedule": sc2_sched,
        "principal": PRINCIPAL,
        "emi": EMI,
    })

    # SCENARIO 3 — NEW-LOAN WARNING (mild: 1 overdue + history of late payments)
    # Shows up in the MILD warning modal with both `Late payments (history)` AND
    # `Missed months` populated so the reviewer can see every warning field render.
    sc3_sched = [
        _make_emi(1, _months_ago(2), EMI, paid=True, was_late=True),   # past paid-late
        _make_emi(2, _months_ago(1), EMI, paid=True, was_late=False),  # past paid on-time
        _make_emi(3, _this_month(day=1), EMI),                         # current month overdue
        _make_emi(4, _months_ahead(1, day=10), EMI),                   # future
    ]
    scenarios.append({
        "cid": f"{SCENARIO_PREFIX}_3_warning",
        "name": "Test Loan Warning",
        "mobile": "9990000103",
        "pan": "TEST3WARN1W",
        "loan_id": "loan_test_scenario_3_warning",
        "schedule": sc3_sched,
        "principal": PRINCIPAL,
        "emi": EMI,
    })

    # SCENARIO 4 — HIGH-RISK NEW LOAN WARNING (blocking modal)
    # Multiple unpaid past-due EMIs over the last 3 months.
    sc4_sched = [
        _make_emi(1, _months_ago(3), EMI),
        _make_emi(2, _months_ago(2), EMI),
        _make_emi(3, _months_ago(1), EMI),
        _make_emi(4, _this_month(day=1), EMI),
    ]
    scenarios.append({
        "cid": f"{SCENARIO_PREFIX}_4_high_loan",
        "name": "Test High Risk Loan",
        "mobile": "9990000104",
        "pan": "TEST4HRLNHR",
        "loan_id": "loan_test_scenario_4_highloan",
        "schedule": sc4_sched,
        "principal": PRINCIPAL * 1.5,
        "emi": EMI,
    })

    # SCENARIO 5 — CLEAN (ON TRACK, all paid)
    sc5_sched = [
        _make_emi(1, _months_ago(3), EMI, paid=True, was_late=False),
        _make_emi(2, _months_ago(2), EMI, paid=True, was_late=False),
        _make_emi(3, _months_ago(1), EMI, paid=True, was_late=False),
    ]
    scenarios.append({
        "cid": f"{SCENARIO_PREFIX}_5_clean",
        "name": "Test Clean Client",
        "mobile": "9990000105",
        "pan": "TEST5CLN1CL",
        "loan_id": "loan_test_scenario_5_clean",
        "schedule": sc5_sched,
        "principal": PRINCIPAL,
        "emi": EMI,
    })

    # Clean up any previous seeded docs so re-runs don't pile up.
    await db.clients.delete_many({"client_id": {"$regex": "^cli_test_scenario"}})
    await db.loans.delete_many({"loan_id": {"$regex": "^loan_test_scenario"}})

    inserted_clients, inserted_loans = 0, 0
    for s in scenarios:
        await db.clients.insert_one(
            _client_doc(
                client_id=s["cid"],
                name=s["name"],
                mobile=s["mobile"],
                pan=s["pan"],
                lender_id=lender_id,
            )
        )
        inserted_clients += 1
        await db.loans.insert_one(
            _loan_doc(
                loan_id=s["loan_id"],
                client_id=s["cid"],
                lender_user_id=lender_id,
                name=s["name"],
                mobile=s["mobile"],
                principal=s["principal"],
                emi_amount=s["emi"],
                schedule=s["schedule"],
            )
        )
        inserted_loans += 1

    print(f"Inserted: {inserted_clients} clients, {inserted_loans} loans.")
    for s in scenarios:
        print(f"  • {s['cid']:40s} → {s['name']}")

    mongo.close()


if __name__ == "__main__":
    asyncio.run(main())

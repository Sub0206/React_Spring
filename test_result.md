#====================================================================================================
# START - Testing Protocol - DO NOT EDIT OR REMOVE THIS SECTION
#====================================================================================================

# THIS SECTION CONTAINS CRITICAL TESTING INSTRUCTIONS FOR BOTH AGENTS
# BOTH MAIN_AGENT AND TESTING_AGENT MUST PRESERVE THIS ENTIRE BLOCK

# Communication Protocol:
# If the `testing_agent` is available, main agent should delegate all testing tasks to it.
#
# You have access to a file called `test_result.md`. This file contains the complete testing state
# and history, and is the primary means of communication between main and the testing agent.
#
# Main and testing agents must follow this exact format to maintain testing data. 
# The testing data must be entered in yaml format Below is the data structure:
# 
## user_problem_statement: {problem_statement}
## backend:
##   - task: "Task name"
##     implemented: true
##     working: true  # or false or "NA"
##     file: "file_path.py"
##     stuck_count: 0
##     priority: "high"  # or "medium" or "low"
##     needs_retesting: false
##     status_history:
##         -working: true  # or false or "NA"
##         -agent: "main"  # or "testing" or "user"
##         -comment: "Detailed comment about status"
##
## frontend:
##   - task: "Task name"
##     implemented: true
##     working: true  # or false or "NA"
##     file: "file_path.js"
##     stuck_count: 0
##     priority: "high"  # or "medium" or "low"
##     needs_retesting: false
##     status_history:
##         -working: true  # or false or "NA"
##         -agent: "main"  # or "testing" or "user"
##         -comment: "Detailed comment about status"
##
## metadata:
##   created_by: "main_agent"
##   version: "1.0"
##   test_sequence: 0
##   run_ui: false
##
## test_plan:
##   current_focus:
##     - "Task name 1"
##     - "Task name 2"
##   stuck_tasks:
##     - "Task name with persistent issues"
##   test_all: false
##   test_priority: "high_first"  # or "sequential" or "stuck_first"
##
## agent_communication:
##     -agent: "main"  # or "testing" or "user"
##     -message: "Communication message between agents"

# Protocol Guidelines for Main agent
#
# 1. Update Test Result File Before Testing:
#    - Main agent must always update the `test_result.md` file before calling the testing agent
#    - Add implementation details to the status_history
#    - Set `needs_retesting` to true for tasks that need testing
#    - Update the `test_plan` section to guide testing priorities
#    - Add a message to `agent_communication` explaining what you've done
#
# 2. Incorporate User Feedback:
#    - When a user provides feedback that something is or isn't working, add this information to the relevant task's status_history
#    - Update the working status based on user feedback
#    - If a user reports an issue with a task that was marked as working, increment the stuck_count
#    - Whenever user reports issue in the app, if we have testing agent and task_result.md file so find the appropriate task for that and append in status_history of that task to contain the user concern and problem as well 
#
# 3. Track Stuck Tasks:
#    - Monitor which tasks have high stuck_count values or where you are fixing same issue again and again, analyze that when you read task_result.md
#    - For persistent issues, use websearch tool to find solutions
#    - Pay special attention to tasks in the stuck_tasks list
#    - When you fix an issue with a stuck task, don't reset the stuck_count until the testing agent confirms it's working
#
# 4. Provide Context to Testing Agent:
#    - When calling the testing agent, provide clear instructions about:
#      - Which tasks need testing (reference the test_plan)
#      - Any authentication details or configuration needed
#      - Specific test scenarios to focus on
#      - Any known issues or edge cases to verify
#
# 5. Call the testing agent with specific instructions referring to test_result.md
#
# IMPORTANT: Main agent must ALWAYS update test_result.md BEFORE calling the testing agent, as it relies on this file to understand what to test next.

#====================================================================================================
# END - Testing Protocol - DO NOT EDIT OR REMOVE THIS SECTION
#====================================================================================================



#====================================================================================================
# Testing Data - Main Agent and testing sub agent both should log testing data below this section
#====================================================================================================

user_problem_statement: |
  Smart lending app "LendIQ powered by SKYNOTECH" for lenders: Mobile+OTP auth, clients (PAN, address),
  AI credit scoring, AI bank statement analysis, CIBIL score check, loan approve/reject (EMI keypad + proof upload),
  repayment schedule with custom date overrides (delayed = red), dashboard inflow/outflow charts + overdue,
  mock-payment subscriptions. Current iteration: dedicated CIBIL report page, remove client profile images,
  LendIQ branding, responsive menu.

backend:
  - task: "CIBIL check endpoint"
    implemented: true
    working: true
    file: "/app/backend/server.py"
    stuck_count: 0
    priority: "high"
    needs_retesting: false
    status_history:
      - working: "NA"
        agent: "main"
        comment: "Endpoint POST /api/loan-apps/check-cibil returns score, band, factors, on_time_payments_pct, credit_utilization_pct, total_accounts, active_loans, hard_enquiries_6m, summary. Now consumed by dedicated CIBIL report page on frontend."
      - working: true
        agent: "testing"
        comment: "PASS. Verified against live backend (mobile 9876543210). Response includes score=742 int in [300,900], band='good', band_color='green', on_time_payments_pct (float), credit_utilization_pct (float), total_accounts (int), active_loans (int), hard_enquiries_6m (int), summary (str), and factors array with 4 items each containing label/impact/detail. AI path via emergentintegrations returned valid JSON; fallback path also implemented correctly."

  - task: "Dashboard inflow/outflow + overdue"
    implemented: true
    working: true
    file: "/app/backend/server.py"
    stuck_count: 0
    priority: "high"
    needs_retesting: false
    status_history:
      - working: "NA"
        agent: "main"
        comment: "GET /api/dashboard returns inflow_chart and outflow_chart; GET /api/dashboard/overdue returns overdue_loans. Verify structure still matches frontend expectations."
      - working: true
        agent: "testing"
        comment: "PASS. GET /api/dashboard returns all required keys: inflow_chart (6 items with label/value), outflow_chart (6 items with label/value), overdue_count, overdue_amount, total_funded, total_repaid, current_month_disbursed, current_month_repaid, active_loans, expected_returns, default_rate. GET /api/dashboard/overdue returns {overdue_loans:[]} — response shape verified via code inspection: each entry contains loan_id, borrower_name, overdue_count, overdue_amount, principal, overdue_entries[{month,due_date,amount,days_late}]. Runtime list was empty for this user (no past-due EMIs yet)."
      - working: true
        agent: "testing"
        comment: "Iteration-10 regression PASS (lender 9876543210). GET /api/dashboard returns portfolio_health={'on_track':2,'overdue':7,'at_risk':4,'completed':3,'defaulted':1} with all 5 keys as integers. Sum(17) == lender's own loans (17 loans where funded_by=user_77a19af2901f). Business-logic re-derivation from the lender's repayment_schedule matches backend output EXACTLY for all 5 buckets. Concrete examples found in DB: on_track=loan_5cbcde14da (all unpaid but not yet past-due), overdue=loan_seed_l8_1_multi_a8f73d (unpaid past-due EMI), at_risk=loan_5b6c5f265e (paid-with-was_late=true AND no current overdue), completed=loan_338acb5076, defaulted=loan_seed_l10_default_644388. inflow_chart/outflow_chart still 6 {label,value} items. overdue_count/overdue_amount present. /api/dashboard/overdue returns 8 overdue loans. INFORMATIONAL ONLY (no regression, pre-existing): /api/loans has no funded_by filter so it returns 28 loans across all lenders while /api/dashboard is scoped to 17 for this lender — portfolio_health correctly matches the lender-scoped count, which is the intended behaviour."

  - task: "Mark-paid with override_date"
    implemented: true
    working: true
    file: "/app/backend/server.py"
    stuck_count: 0
    priority: "medium"
    needs_retesting: false
    status_history:
      - working: "NA"
        agent: "main"
        comment: "POST /api/loans/{loan_id}/repay/{month} should accept optional override_date and set is_delayed=true if paid after due_date."
      - working: true
        agent: "testing"
        comment: "PASS. All three scenarios verified on live backend: (a) no override → was_late=false, paid_at=now; (b) paid_date AFTER due_date → was_late=true; (c) paid_date BEFORE due_date → was_late=false. NOTE (non-blocking naming): backend query param is named `paid_date` (not `override_date`) and response field is `was_late` (not `is_delayed`). Functionally equivalent and already consistent with frontend usage."
      - working: true
        agent: "testing"
        comment: "Iteration-6 re-verification PASS. Using due_day-anchored loan, paid_date=(due-1day) → was_late=false; paid_date=(due+5days) → was_late=true. Responses 200, schedule entries correctly flip was_late flag."
      - working: true
        agent: "testing"
        comment: "Iteration-8 regression PASS. repay?paid_date=(due+5days) on loan_73b02748a7 month=5 → 200 OK, was_late=True, status='paid'. No regressions from new reschedule/undo-pay endpoints."

  - task: "Reschedule EMI (iteration 8)"
    implemented: true
    working: true
    file: "/app/backend/server.py"
    stuck_count: 0
    priority: "high"
    needs_retesting: false
    status_history:
      - working: "NA"
        agent: "main"
        comment: "POST /api/loans/{loan_id}/reschedule/{month}?new_due_date=<ISO> reschedules a single unpaid EMI to a new ISO due date. Rejects paid EMIs (400 'Cannot reschedule a paid EMI. Undo first.') and invalid ISO strings (400). Returns full updated Loan object."
      - working: true
        agent: "testing"
        comment: "PASS (3/3 cases) against live backend as lender 9876543210 on loan_73b02748a7. (a) Unpaid EMI (month=2) rescheduled to 2027-01-15T12:00:00Z → 200, full Loan returned, target entry's due_date exactly matches requested ISO. (b) Paid EMI reschedule → 400 with detail 'Cannot reschedule a paid EMI. Undo first.'. (c) Invalid ISO 'not-a-date' → 400 with detail 'Invalid new_due_date (expected ISO 8601).'."

  - task: "Undo-pay EMI (iteration 8)"
    implemented: true
    working: true
    file: "/app/backend/server.py"
    stuck_count: 0
    priority: "high"
    needs_retesting: false
    status_history:
      - working: "NA"
        agent: "main"
        comment: "POST /api/loans/{loan_id}/undo-pay/{month} rolls back a previously recorded payment: status→upcoming, paid_at=None, was_late=False, paid_amount decremented by EMI amount. Logs a reversal transaction (type='fee', amount=-EMI). Double-undo returns 400 'not marked as paid'."
      - working: true
        agent: "testing"
        comment: "PASS (3/3 cases). On loan_73b02748a7: (a) paid month=2 via /repay, then /undo-pay/2 → 200, paid_amount decremented from 46607.92→23303.92 (exact EMI subtracted), entry status='upcoming', paid_at=None, was_late=False. (b) Second /undo-pay/2 → 400 'This EMI is not marked as paid — nothing to undo.' (c) GET /api/transactions shows reversal entry: type='fee', amount=-23303.92, loan_id=loan_73b02748a7, description='Rollback of repayment #2 for Kaushik sekaran'."

  - task: "Create client without verification_id (iteration 6)"
    implemented: true
    working: true
    file: "/app/backend/server.py"
    stuck_count: 0
    priority: "high"
    needs_retesting: false
    status_history:
      - working: "NA"
        agent: "main"
        comment: "Allow POST /api/clients without verification_id field; return created client with otp_verified=false, pan_verified=true, aadhaar_verified=true."
      - working: false
        agent: "testing"
        comment: "FAIL. Two critical bugs in /app/backend/server.py client_create (around lines 620-672): (1) Line 621-623 still unconditionally requires a verified OTP record. (2) Line 672 references undefined variable `otp_verified_flag`, causing 500 Internal Server Error even when valid verification_id is supplied."
      - working: true
        agent: "testing"
        comment: "PASS after main-agent fix. Re-verified against live backend (mobile 9876543210). (a) POST /api/clients WITHOUT verification_id → 200 OK, response contains client_id=cli_3adbbd46107e, otp_verified=false, pan_verified=true, aadhaar_verified=true. (b) Backward-compat: /api/clients/send-otp → /api/clients/verify-otp → POST /api/clients with the returned verification_id → 200 OK (client cli_ac7aaabff056 created). Backend no longer raises NameError. client_create at lines 620-687 in server.py correctly initialises otp_verified_flag=False and only validates the OTP record when body.verification_id is provided."

  - task: "Approve loan with due_day (iteration 6)"
    implemented: true
    working: true
    file: "/app/backend/server.py"
    stuck_count: 0
    priority: "high"
    needs_retesting: false
    status_history:
      - working: "NA"
        agent: "main"
        comment: "POST /api/loan-apps/approve accepts optional due_day (1-28) to anchor repayment_schedule due_dates to that day-of-month. Without due_day, falls back to 30-day cadence."
      - working: true
        agent: "testing"
        comment: "PASS. Verified on live backend with client cli_cd90671802ac: (a) approve with due_day=5, amount=100000, term=6, rate=12 → all 6 schedule due_dates land on the 5th (days: [5,5,5,5,5,5]). (b) approve WITHOUT due_day (term=3) → 30-day cadence preserved (gaps: [30, 30]). Backward-compatible."

frontend:
  - task: "Dedicated CIBIL Report page"
    implemented: true
    working: true
    file: "/app/frontend/app/cibil-report/[clientId].tsx"
    stuck_count: 0
    priority: "high"
    needs_retesting: false
    status_history:
      - working: true
        agent: "main"
        comment: "New page shows score gauge (SVG half circle), payment history card, credit utilization card, account summary, score factors. Manually verified: Good(green 742), Fair(yellow 618), Excellent(blue 782) bands all render correctly."

  - task: "Initials avatar (remove client profile image)"
    implemented: true
    working: true
    file: "/app/frontend/src/ui.tsx + clients.tsx, client/[id].tsx, loan-new/[clientId].tsx"
    stuck_count: 0
    priority: "high"
    needs_retesting: false
    status_history:
      - working: true
        agent: "main"
        comment: "Added InitialsAvatar component. Replaced Image avatars in clients list, client detail hero, and loan-new screens. Verified on /clients (RK initials) and loan-new/[id] (RK initials)."

  - task: "Responsive tabs (Home/Requests/Loans/Clients/Profile)"
    implemented: true
    working: true
    file: "/app/frontend/app/(tabs)/_layout.tsx"
    stuck_count: 0
    priority: "medium"
    needs_retesting: false
    status_history:
      - working: true
        agent: "main"
        comment: "Tabs use useWindowDimensions to adapt: hide labels below 360px, smaller font below 380px, shortens 'Requests'→'Reqs' on narrow screens. Verified at 390x844 viewport."

  - task: "LendIQ / SKYNOTECH branding"
    implemented: true
    working: true
    file: "multiple"
    stuck_count: 0
    priority: "medium"
    needs_retesting: false
    status_history:
      - working: true
        agent: "main"
        comment: "Login shows 'LendIQ / Powered by SKYNOTECH' with LQ badge. Fixed 'LENDIFY' → Brand.name in downloadReport. Changed 'lendify@hdfcbank' → 'lendiq@hdfcbank' and terms reference."

backend:
  - task: "Enriched statement analyzer (iteration 11)"
    implemented: true
    working: true
    file: "/app/backend/server.py"
    stuck_count: 0
    priority: "high"
    needs_retesting: false
    status_history:
      - working: false
        agent: "testing"
        comment: |
          Iteration-11 FAIL on live backend (lender 9876543210).
          (A) PATH MISSING: POST /api/clients/{client_id}/analyze-statement → 404.
          (B) /api/loan-apps/analyze-statement LLM path returned OLD 13-field shape
              (17 required fields missing + chart.net missing).
          (C) Regressions PASS (dashboard/portfolio_health, reschedule, undo-pay).
      - working: false
        agent: "testing"
        comment: |
          Iteration-11 RE-TEST (after main-agent fix).
          Live backend at https://lending-hub-63.preview.emergentagent.com, lender
          9876543210, seeded client cli_seed_000.

          RESULT: 1/2 endpoints PASS.

          [FAIL] TEST 1 — POST /api/clients/cli_seed_000/analyze-statement (body={})
              HTTP 500 Internal Server Error.
              ROOT CAUSE (server.py:951):
                  payload = StatementAnalysisRequest(
                            ^^^^^^^^^^^^^^^^^^^^^^^^
                  NameError: name 'StatementAnalysisRequest' is not defined
              The correct class name is `AnalyzeStatementRequest` (defined at line 104).
              Main-agent typo in the new `analyze_statement_by_path` handler — the
              endpoint is registered but crashes on every invocation.
              Backend log (/var/log/supervisor/backend.err.log):
                  File "/app/backend/server.py", line 951, in analyze_statement_by_path
                      payload = StatementAnalysisRequest(
                  NameError: name 'StatementAnalysisRequest' is not defined

          [PASS] TEST 2 — POST /api/loan-apps/analyze-statement (legacy body endpoint)
              HTTP 200. All 30 required top-level fields present with correct types.
              Verified: months_analyzed (int), bank_detected, account_holder,
              account_number_masked, statement_period (str); opening_balance,
              closing_balance, total_credit, total_debit, avg_monthly_credit,
              avg_monthly_debit, avg_balance, highest_balance (numbers);
              bounced_transactions, salary_credits_detected (int); emi_load_pct (num);
              bounce_risk ∈ {low,medium,high}; risk_color ∈ {green,yellow,red};
              loan_eligibility ∈ {strong,moderate,weak};
              recommended_decision ∈ {approve,approve_with_caution,manual_review,reject};
              suggested_loan_amount, suggested_emi, repayment_capacity_pct (numbers);
              chart[] each has {label,credit,debit,net,bounces};
              balance_trend[] each has {label,value};
              categories[] each has {name,count,amount,share_pct,type};
              red_flags[] each has {severity,title,detail};
              behaviour {salary_consistency, spending_discipline, cash_dependence_pct,
                  unusual_spikes, frequent_transfers, risky_merchants};
              fraud_checks {edited_statement_likelihood, missing_pages_detected,
                  duplicate_txn_count, page_count, rotated_pages_fixed,
                  ocr_confidence_pct};
              summary (str), highlights (list[str]).
              The backend now merges enriched fallback as default and overlays LLM
              output — this works correctly.

          FIX REQUIRED (main agent, 1-character typo):
              At server.py:951, change `StatementAnalysisRequest(` to
              `AnalyzeStatementRequest(`. That is the only blocker for the NEW
              path-based endpoint; the schema logic is otherwise correct.

          Test script: /app/backend_test.py. No backend code modified.
      - working: true
        agent: "testing"
        comment: |
          Iteration-11 RE-TEST #2 (after main-agent typo fix) — PASS.
          Live backend, lender 9876543210, client cli_seed_000.
          POST /api/clients/cli_seed_000/analyze-statement (body={}) → HTTP 200.
          Top-level keys: 35 (all 30 required present, 0 missing).
          Shapes verified:
            chart[0] keys = {label, credit, debit, net, bounces}
            balance_trend[0] keys = {label, value}
            categories[0] keys = {name, count, amount, share_pct, type}
            red_flags[0] keys = {severity, title, detail}
            behaviour keys = {salary_consistency, spending_discipline,
              cash_dependence_pct, unusual_spikes, frequent_transfers,
              risky_merchants}
            fraud_checks keys = {edited_statement_likelihood, missing_pages_detected,
              duplicate_txn_count, page_count, rotated_pages_fixed, ocr_confidence_pct}
          Enums validated: bounce_risk=low, risk_color=green, loan_eligibility=moderate,
          recommended_decision=approve_with_caution. bank_detected='PNB'. highlights list populated.
          server.py:951 now correctly uses AnalyzeStatementRequest. Endpoint fully working.

  - task: "Branded PDF CIBIL report"
    implemented: true
    working: true
    file: "/app/backend/server.py"
    stuck_count: 0
    priority: "high"
    needs_retesting: false
    status_history:
      - working: "NA"
        agent: "main"
        comment: "NEW endpoint GET /api/clients/{client_id}/cibil-report.pdf (Iteration 13). Uses reportlab with same branded template: header strip, snapshot table, score hero card (color-coded by band), metrics, summary, key factors. Falls back to deterministic mock CIBIL if no saved report exists so the button never errors. Manually verified via curl (200, %PDF-1.4, 3930 bytes, Content-Disposition attachment)."
      - working: true
        agent: "testing"
        comment: |
          Iteration-13 PASS (9/9). Live backend, lender 9876543210.
          GET /api/clients/cli_seed_000/cibil-report.pdf:
            • Valid Bearer → HTTP 200, CT=application/pdf, 3930 bytes,
              magic=b'%PDF-1.4', CD='attachment; filename="LendIQ-CIBIL-Rajesh_Kumar-20260420.pdf"'.
            • No Authorization header → HTTP 401 {"detail":"Missing or invalid auth token"}.
            • Unknown client_id cli_does_not_exist → HTTP 404 {"detail":"Client not found"}.
          Fallback path: cli_seed_001 (no saved cibil_reports doc) → HTTP 200, 4413 bytes
            valid PDF (deterministic mock generated), CD='attachment; filename="LendIQ-CIBIL-Sneha_Reddy-20260420.pdf"'.
          After-save path: POST /api/loan-apps/check-cibil for cli_seed_001 → 200 (saves
            doc). Immediate GET /api/clients/cli_seed_001/cibil-report.pdf → HTTP 200,
            4379 bytes valid PDF (endpoint now reads saved doc).
          Regressions ALL PASS:
            • GET /api/clients/cli_seed_000/analysis-report.pdf?months=6 → 200, 9172 bytes, %PDF-1.4.
            • POST /api/clients/cli_seed_000/analyze-statement (body={}) → 200 with 35 top-level keys (all 30 required enriched fields present).
            • GET /api/dashboard → 200 with portfolio_health={on_track:3, overdue:5, at_risk:6, completed:3, defaulted:1} (all int).
            • GET /api/loans → 200, count=30.
          No backend code modified. Script: /app/backend_test.py.

  - task: "Branded PDF statement analysis report"
    implemented: true
    working: true
    file: "/app/backend/server.py"
    stuck_count: 0
    priority: "high"
    needs_retesting: false
    status_history:
      - working: "NA"
        agent: "main"
        comment: "NEW endpoint GET /api/clients/{client_id}/analysis-report.pdf?months=<3|6|12> (Iteration 12). Uses reportlab to emit a 6-page branded PDF (Cover+Summary, Cashflow, Behaviour, Decision, Red-Flags, Categories) pulling either the latest saved statement_analyses doc or a freshly-built fallback. Verified manually with curl: HTTP 200, returns a 9KB PDF magic-header %PDF-1.4, Content-Disposition=attachment. Needs regression tests around auth, 404 for wrong client_id, and payload correctness for the 6 sections."
      - working: true
        agent: "testing"
        comment: |
          Iteration-12 PASS (11/11). Live backend, lender 9876543210.
          GET /api/clients/cli_seed_000/analysis-report.pdf:
            • months=3 → 200, CT=application/pdf, 9156 bytes, magic=b'%PDF-1.4', CD='attachment; filename="LendIQ-Statement-Rajesh_Kumar-20260420.pdf"'.
            • months=6 → 200, 9156 bytes, same shape.
            • months=12 → 200, 9156 bytes, same shape.
          Negative paths:
            • No Authorization header → 401 {"detail":"Missing or invalid auth token"}.
            • Unknown client_id cli_does_not_exist → 404 {"detail":"Client not found"}.
          Fallback path verification: explicitly tested client cli_cd90671802ac (lender's client with NO saved statement_analyses doc in Mongo) → 200, 9226 bytes, valid PDF. _fallback_statement_analysis path executes cleanly without 500.
          Regressions PASS: POST /api/clients/cli_seed_000/analyze-statement (body={}) → 200 with 35 top-level keys (all 31 enriched fields present); GET /api/dashboard → 200 with portfolio_health={on_track:3, overdue:6, at_risk:5, completed:3, defaulted:1} (all ints); GET /api/loans → 200; POST /api/loans/loan_d55828a374/repay/1 → 200 followed by /undo-pay/1 → 200 (clean pay+undo cycle). No backend code modified. Script: /app/backend_test.py.

  - task: "Deterministic statement analysis engine (iteration 14)"
    implemented: true
    working: true
    file: "/app/backend/server.py"
    stuck_count: 0
    priority: "high"
    needs_retesting: false
    status_history:
      - working: true
        agent: "testing"
        comment: |
          Iteration-14 backend regression — 40/40 PASS on live preview backend (lender 9876543210, seeded client cli_seed_000).

          A. DETERMINISM + MONTH-SLICE CONSISTENCY (POST /api/clients/{id}/analyze-statement):
            • A1 Two calls with months=3, file_name='foo.pdf' return IDENTICAL values for bounced_transactions, avg_balance, total_credit, total_debit, avg_monthly_credit, bounce_risk, parse_source. Fully deterministic.
            • A2 chart lengths 3/6/12 correct. chart(3) == last 3 of chart(6) (label+credit+debit+bounces match exactly). chart(6) == last 6 of chart(12) (exact match).
            • A3 bounces(12) >= bounces(6) >= bounces(3). bounced_transactions == sum(chart[i].bounces) for all 3 windows.
            • A4 Different file_name (alpha.pdf vs beta.pdf) → different avg_balance (different 12-hex-digit seeds).

          B. TRANSPARENT RISK ENGINE:
            • B5 Response includes all required fields with correct types: risk_reasons (list of {severity,label}), parse_confidence in {high,medium,low}, parse_source in {parsed,mock}, rows_extracted (int), bounce_matches_found (int), months_covered_in_file (int), manual_review_recommended (bool).
            • B6 Rule consistency verified across multiple random clients & file_names: every probe where (bounces==0 AND emi_load_pct<30) has bounce_risk=='low'; every probe where (bounces>=3 OR multi-medium) has bounce_risk=='high'. Zero rule violations.

          C. BOUNCE-KEYWORD DETECTION (REAL PDF via reportlab):
            • C7 PDF built with reportlab containing 'CHQ RETN INSUFFICIENT FUNDS', 'RTN CHG CHEQUE BOUNCED', 'ECS RETURN INSUFFICIENT FUNDS' lines → parse_source='parsed', bounce_matches_found=3, bounced_transactions=3 (override applied correctly, matches bounce_matches_found exactly), rows_extracted=5.
            • C8 Invalid base64 ('not-a-real-base64$$$###') → graceful fallback: HTTP 200 with parse_source='mock'.

          D. PDF ENDPOINTS (with ?token= fallback):
            • D9 GET /api/clients/cli_seed_000/analysis-report.pdf?months=6 (Bearer): 200, Content-Type=application/pdf, magic=b'%PDF-1.', size=9605 bytes (>4KB), CD='attachment; filename=\"LendIQ-Statement-Rajesh_Kumar-20260420.pdf\"'.
            • D10 Same endpoint with ?token=<jwt> and NO Authorization header: 200, valid PDF, size=9605 bytes.
            • D11 GET /api/clients/cli_seed_000/cibil-report.pdf?token=<jwt> (no Authorization): 200, valid PDF, size=3930 bytes (>2KB), CD contains 'LendIQ-CIBIL-'.
            • D12 No auth at all → 401 on both PDF endpoints. Unknown client (cli_does_not_exist) → 404 on both.

          E. REGRESSIONS:
            • E13 GET /api/dashboard → 200. portfolio_health={on_track:4, overdue:4, at_risk:6, completed:3, defaulted:1} — all 5 values integers.
            • E14 GET /api/loans → 200, count=32.

          No backend code modified. Test script: /app/backend_test.py.

  - task: "Latest analyses endpoint (iteration 16)"
    implemented: true
    working: true
    file: "/app/backend/server.py"
    stuck_count: 0
    priority: "high"
    needs_retesting: false
    status_history:
      - working: true
        agent: "testing"
        comment: |
          Iteration-16 Section A — 10/10 PASS on live backend (lender 9876543210, client cli_seed_000).
          GET /api/clients/{id}/latest-analyses:
            • Bearer → HTTP 200 with all 4 keys {statement_analysis, cibil_report, has_statement, has_cibil}.
            • After POST /api/clients/{id}/analyze-statement (months=6, file_name='a.pdf') → has_statement=True.
            • After POST /api/loan-apps/check-cibil → has_cibil=True AND cibil_report.score=742 (int ∈ [300,900]).
            • Unknown client_id cli_does_not_exist → HTTP 404.
            • No Authorization header → HTTP 401.

  - task: "Audit summary endpoint (iteration 16)"
    implemented: true
    working: true
    file: "/app/backend/server.py"
    stuck_count: 0
    priority: "high"
    needs_retesting: false
    status_history:
      - working: true
        agent: "testing"
        comment: |
          Iteration-16 Section B — 19/19 PASS.
          GET /api/audit/summary?months=<3|6|12>&year=2026:
            • All 3 windows return HTTP 200 with ALL required top-level keys:
              period, inflow_total, outflow_total, net, overdue_total, funded_count,
              repaid_count, loans_funded, active_loans, monthly.
            • monthly length exactly matches months (3→3, 6→6, 12→12).
            • Every monthly entry has {label, inflow, outflow, net}.
            • net == inflow_total - outflow_total for all 3 windows.
            • sum(monthly[i].net) == net for all 3 windows.
            • Concrete values verified on lender: months=6 → net=-1,261,600 == inflow(2,690,000) - outflow(3,951,600) and sum-of-monthly = -1,261,600.
            • No Authorization header → HTTP 401.

  - task: "Audit summary PDF endpoint (iteration 16)"
    implemented: true
    working: true
    file: "/app/backend/server.py"
    stuck_count: 0
    priority: "high"
    needs_retesting: false
    status_history:
      - working: true
        agent: "testing"
        comment: |
          Iteration-16 Section C — 9/9 PASS.
          GET /api/audit/summary.pdf?months=6&year=2026:
            • Bearer → HTTP 200, Content-Type=application/pdf, magic=b'%PDF-1.4',
              size=2934 bytes (>2KB), Content-Disposition='attachment; filename="LendIQ-Audit-Nov2025-to-Apr2026.pdf"'.
            • ?token=<jwt> fallback (no Authorization) → HTTP 200, valid PDF (%PDF-1.4), 2934 bytes.
            • No auth at all → HTTP 401.

  - task: "Support chat endpoint (iteration 16)"
    implemented: true
    working: true
    file: "/app/backend/server.py"
    stuck_count: 0
    priority: "high"
    needs_retesting: false
    status_history:
      - working: true
        agent: "testing"
        comment: |
          Iteration-16 Section D — 8/9 PASS (1 minor cosmetic fail).
          POST /api/support/chat:
            • "How does EMI rollback work?" → 200; answer mentions 'Undo' and 'rollback'. PASS
            • "How to analyze a bank statement?" → 200; answer contains 'Upload statement' AND '3 / 6 / 12'. PASS
            • Empty question "" → 200 with helpful generic reply "Please ask a question — e.g. 'How do I add a client?'". PASS
            • No auth → HTTP 401. PASS
          Minor: "How do I add a client?" → 200; answer is
             "To add a new client:\\n1. Go to the **Clients** tab at the bottom. ..."
             — semantically references the Clients tab, but the literal substring
             "Clients tab" is broken by markdown bold markers ("**Clients** tab"),
             so the strict case-insensitive substring check "clients tab" in answer
             does NOT match. If the review agent's contract requires the bare
             substring, change "**Clients** tab" → "**Clients tab**" (or remove the
             asterisks) in server.py:2908. Otherwise functionally correct.
      - working: true
        agent: "testing"
        comment: |
          Iteration-18 HYBRID AI + FAQ SUPPORT CHAT — 6/6 test groups PASS on live preview backend (lender 9876543210, client cli_seed_000). All 17 individual assertions green.

          1. SHORT FAQ PATH (3/3):
            • POST {"question":"add client"} → 200, source='faq', answer contains 'Clients tab'. (Note: current server text is "**Clients tab**" — literal substring 'Clients tab' now matches.)
            • POST {"question":"how does EMI rollback work"} (5 words, keyword 'emi') → 200, source='faq', answer contains 'Undo' ("use the **Undo** button on the same row to rollback…").
            • POST {"question":""} → 200, source='empty', answer starts "Please ask a question — e.g. 'How do I add a client?'".

          2. LLM PATH (5/5):
            • POST {"question":"Explain the difference between At Risk and Overdue in portfolio health.","language":"en"} (11 words) → 200, source='ai' (NOT faq), answer mentions both 'At Risk' AND 'Overdue'. Preview: "In **Portfolio Health**: 1. **Overdue**: …at least one unpaid EMI past due. 2. **At Risk**: past payments were late…". LendIQ-specific and accurate.
            • POST {"question":"Why should I upload a bank statement before approving a loan, and what does the app look for?"} (19 words) → 200, source='ai', answer references bounce/risk/statement. Preview: "Uploading a bank statement…: 1. Bounces: …bounced payments. 2. NACH Fails…".

          3. LANGUAGE PATH (2/2):
            • POST {"question":"पोर्टफोलियो हेल्थ क्या है?","language":"hi"} → 200, source='ai', answer contains Devanagari script. Preview: "**पोर्टफोलियो हेल्थ** आपके लोन पोर्टफोलियो की स्थिति को दर्शाता है…".

          4. BACKWARD COMPAT (1/1):
            • POST {"question":"How do I check CIBIL?"} (no language / no history) → 200, source='faq', answer len=187. Request without the new optional fields works unchanged.

          5. AUTH (1/1):
            • POST /api/support/chat without Authorization header → HTTP 401.

          6. REGRESSIONS (3/3):
            • GET /api/dashboard (Bearer) → 200, portfolio_health={on_track:4, overdue:4, at_risk:6, completed:3, defaulted:1} (all 5 keys, int).
            • GET /api/audit/summary?months=3&year=2026 (Bearer) → 200, net=-627600, monthly.len=3.
            • POST /api/clients/cli_seed_000/analyze-statement {} (Bearer) → 200 (bounce_risk='medium', parse_source='mock').

          Routing rules verified end-to-end: short ≤8-word keyword hits → faq; long / keyword-miss → ai via Emergent GPT-4o-mini (LiteLLM calls visible in backend logs); empty → empty. No LLM failures observed so the 'fallback' branch was not exercised — endpoint is resilient in the happy path.

          No backend code modified. Test script: /app/backend_test.py.

      - working: "NA"
        agent: "main"
        comment: |
          Iteration 18 — upgraded /api/support/chat to be a HYBRID AI + keyword-FAQ bot.
          Behaviour:
            • Short (<=8 word) questions that hit a known keyword rule (add client, new loan, EMI,
              statement, CIBIL, language, subscription, audit, overdue, logout, pdf) → instant FAQ
              response with canned step-by-step answer. Response JSON now includes `source: "faq"`.
            • Longer / open-ended questions OR anything not in the keyword map → Emergent LLM
              (openai/gpt-4o-mini) with a strong LendIQ system prompt that describes every feature
              (tabs, flows, EMI rules, portfolio health logic, languages, PDFs, subscription).
              Response JSON includes `source: "ai"`.
            • LLM failure → deterministic fallback with `source: "fallback"`.
          New request fields (both optional):
            • `language` — "en"/"hi"/"ta"/"te"/"kn"/"ml" so the bot replies in the user's language.
            • `history` — list of recent {role, text} messages for multi-turn context.
          Manual smoke-test PASS:
            • "add client" (short) → source=faq with full step list.
            • "Explain the difference between At Risk and Overdue in portfolio health." (long)
              → source=ai with a correct LendIQ-specific comparison.
            • Hindi question about Portfolio Health → source=ai, answer returned in Hindi.
          Please verify:
            1. Existing iteration-16 regressions (empty Q → generic; "clients tab" substring; auth 401) still pass.
            2. Long-form questions return `source: "ai"` and relevant LendIQ text (not a hallucinated feature).
            3. Backward compat — requests without `language`/`history` still work.

metadata:
  created_by: "main_agent"
  version: "1.0"
  test_sequence: 9

test_plan:
  current_focus:
    - "Support chat endpoint (iteration 16)"
  stuck_tasks: []
  test_all: false
  test_priority: "high_first"

  - task: "Unicode ₹ PDF font fix (iteration 17)"
    implemented: true
    working: true
    file: "/app/backend/server.py"
    stuck_count: 0
    priority: "high"
    needs_retesting: false
    status_history:
      - working: true
        agent: "testing"
        comment: |
          Iteration-17 PDF Unicode ₹ fix validation — PASS on live preview backend (lender 9876543210, client cli_seed_000).

          A. ₹ UNICODE RENDERING + FONT CHECK:
            • GET /api/clients/cli_seed_000/analysis-report.pdf?months=6 (Bearer)
              → HTTP 200, Content-Type=application/pdf, magic=b'%PDF-1.', size=30521 bytes (>4KB).
              ₹ count on page 1 = 2. ₹ found on ≥1 page.
              Embedded fonts: {'AAAAAA+FreeSans', 'AAAAAA+FreeSansBold'}.
              No LiberationSans, no Helvetica.
            • GET /api/audit/summary.pdf?months=6&year=2026 (Bearer)
              → HTTP 200, CT=application/pdf, %PDF-1., 23903 bytes.
              ₹ count on page 1 = 22. ₹ found on ≥1 page.
              Embedded fonts: {'AAAAAA+FreeSans', 'AAAAAA+FreeSansBold'}. No Helvetica/LiberationSans.
            • GET /api/clients/cli_seed_000/cibil-report.pdf (Bearer)
              → HTTP 200, CT=application/pdf, %PDF-1., 25208 bytes.
              ₹ count = 0 in extracted text.
              Embedded fonts: {'AAAAAA+FreeSans', 'AAAAAA+FreeSansBold'}.
              EXPLANATION: The CIBIL report by DESIGN contains NO currency amounts —
              it shows only credit score (742 GOOD), on-time payment %, credit
              utilization %, total accounts, active loans, hard enquiries, summary
              text, and key factors. There is nothing to render with ₹.
              Verified full page 1 text: "CIBIL Score (300 – 900) ... On-time
              payments 94.5% ... Total accounts 8 ..." — no amounts.
              The font fix itself IS working (FreeSans embedded, no Helvetica
              fallback). This is a content-expectation mismatch in the review
              contract, not a font/rendering bug. If ₹ is required in CIBIL PDF,
              main agent must add a currency-bearing line (e.g. loan limit or
              estimated credit line) to the CIBIL template.

          B. ?token= FALLBACK — all 3 PDFs: HTTP 200, valid %PDF-1., >4KB
             (analysis=30521, cibil=25208, audit=23903). No Authorization header.

          C. REGRESSIONS — ALL PASS:
            • C1 /api/clients/{id}/analyze-statement determinism: 2× calls with
              {"months":6,"file_name":"same.pdf"} → bounced_transactions=0 identical,
              avg_balance=153101 identical.
            • C2 /api/clients/{id}/latest-analyses → 200 with all 4 keys
              {statement_analysis, cibil_report, has_statement, has_cibil}.
            • C3 /api/audit/summary?months=3&year=2026 → 200, monthly.length=3,
              net=-627600 == inflow_total(0) - outflow_total(627600).
            • C4 /api/support/chat {"question":"How do I add a new client?"} → 200,
              answer contains literal "Clients tab".
            • C5 /api/dashboard → 200, portfolio_health present
              ({on_track:4, overdue:4, at_risk:6, completed:3, defaulted:1}).

          No backend code modified. Test script: /app/backend_test.py.

agent_communication:
  - agent: "testing"
    message: |
      Iteration-17 validation complete.

      FONT FIX VERIFIED: All 3 PDF endpoints now embed FreeSans / FreeSansBold
      (no Helvetica, no LiberationSans). The two PDFs that actually display
      currency values (analysis-report and audit-summary) render the literal
      Unicode ₹ character correctly:
        • analysis-report.pdf → 2 ₹ on page 1
        • audit/summary.pdf   → 22 ₹ on page 1

      CIBIL-REPORT ₹ = 0 (BY DESIGN, NOT A BUG):
        The CIBIL PDF template contains NO currency amounts — only score (742),
        percentages (on-time 94.5%, utilization 38.2%), account counts, and
        textual summary. FreeSans is correctly embedded. If the review contract
        requires ₹ to appear in CIBIL PDF, main agent must add a currency line
        (e.g. "Suggested credit limit: ₹X"). Otherwise this endpoint is
        functioning correctly — the font fix itself is fully applied.

      All C-section regressions PASS (determinism, latest-analyses, audit
      summary JSON, support chat "Clients tab", dashboard portfolio_health).
      ?token= fallback PASS on all 3 PDFs.

      No backend code was modified. Script: /app/backend_test.py.

agent_communication:
  - agent: "testing"
    message: |
      Iteration-12 PDF endpoint — 11/11 PASS on live preview backend.

      [PASS] GET /api/clients/cli_seed_000/analysis-report.pdf?months=3|6|12
        200 OK, Content-Type=application/pdf, body starts with %PDF-1.4,
        size=9156 bytes (>4KB), Content-Disposition='attachment; filename="LendIQ-Statement-Rajesh_Kumar-20260420.pdf"'.
      [PASS] 401 when Authorization header is missing.
      [PASS] 404 for unknown client_id (cli_does_not_exist).
      [PASS] Fallback path (_fallback_statement_analysis) explicitly exercised:
        cli_cd90671802ac has NO saved statement_analyses doc in Mongo →
        endpoint returns 200 with 9226-byte valid PDF — NO 500.
      [PASS] Regressions:
        • POST /api/clients/cli_seed_000/analyze-statement (body={}) → 200 with 35 top-level keys (all 31 enriched fields present).
        • GET /api/dashboard → 200 with portfolio_health={on_track:3, overdue:6, at_risk:5, completed:3, defaulted:1} (all int keys).
        • GET /api/loans → 200.
        • POST /api/loans/loan_d55828a374/repay/1 → 200 followed by /undo-pay/1 → 200 (clean pay+undo cycle, no persistent mutation).

      No backend code modified. Script: /app/backend_test.py.

      [FAIL] POST /api/clients/cli_seed_000/analyze-statement → HTTP 500.
        NameError at /app/backend/server.py:951 —
        `payload = StatementAnalysisRequest(...)` but the class is named
        `AnalyzeStatementRequest` (defined at line 104). One-character typo in
        the new path-based handler. Fix: rename to `AnalyzeStatementRequest`.
        The endpoint registration, path-param extraction and delegation logic
        are otherwise correct — the same body-based handler it wraps works fine.

      [PASS] POST /api/loan-apps/analyze-statement → HTTP 200, all 30 enriched
        top-level fields present & correctly typed. chart[] has net; behaviour
        and fraud_checks have all sub-keys; categories/red_flags/balance_trend
        shapes validated. The "fallback-first, LLM overlay" pattern in
        analyze_statement() (server.py:917-926) successfully guarantees the
        enriched schema regardless of LLM output — this is the right approach.

      Backend log confirms:
        File "/app/backend/server.py", line 951, in analyze_statement_by_path
            payload = StatementAnalysisRequest(
        NameError: name 'StatementAnalysisRequest' is not defined

      Test script: /app/backend_test.py. No backend code modified.
  - agent: "main"
    message: |
      Iteration 6 (critical UX fixes) validated with testing agent:
      1) Active Loans avatar removal — done
      2) PAN flow OTP removal — POST /api/clients now accepts optional verification_id (backend tested OK)
      3) Mark-paid modal — date picker + overdue detection + "Overdue Paid" chip; backend was_late still works
      4) Approve loan — due_day (1-28) added; backend creates schedule anchored to chosen day-of-month (tested OK)
      5) Tab bar — safe-area aware (useSafeAreaInsets + min spacing); responsive on 320/360/390/iPhone
      All iteration 6 backend endpoints pass. Ready for user verification.
      1) POST /api/loan-apps/check-cibil — returns mock CIBIL JSON with score/band/factors/on_time/utilization/accounts.
         Auth as lender (mobile 9876543210, demo OTP from response) and create a client first if needed; then call with that client_id.
      2) GET /api/dashboard — must include inflow_chart (array of {label,value}) and outflow_chart; plus overdue_count, overdue_amount.
      3) GET /api/dashboard/overdue — returns overdue_loans array with loan_id, borrower_name, overdue_count, overdue_amount, overdue_entries.
      4) POST /api/loans/{loan_id}/repay/{month} with optional override_date — should mark paid with is_delayed computed vs due_date.
      Please use existing test credentials from /app/memory/test_credentials.md. Auth endpoint is POST /api/auth/send-otp then POST /api/auth/verify-otp.
  - agent: "testing"
    message: |
      Iteration-8 backend tests — 7/7 PASS against live preview backend (lender 9876543210, loan_73b02748a7).

      1) POST /api/loans/{id}/reschedule/{month}?new_due_date=ISO
         [PASS] Unpaid EMI (month=2) → 2027-01-15T12:00:00Z: 200 OK, full Loan returned, target entry's due_date matches requested ISO exactly.
         [PASS] Paid EMI reschedule: 400 with detail "Cannot reschedule a paid EMI. Undo first."
         [PASS] Invalid ISO ("not-a-date"): 400 with detail "Invalid new_due_date (expected ISO 8601)."
      2) POST /api/loans/{id}/undo-pay/{month}
         [PASS] After /repay/2, /undo-pay/2 → 200: paid_amount decremented from 46607.84→23303.92 (exact EMI 23303.92 subtracted); entry status='upcoming', paid_at=None, was_late=False.
         [PASS] Second /undo-pay/2 on same (now unpaid) EMI → 400 "This EMI is not marked as paid — nothing to undo."
         [PASS] GET /api/transactions returns reversal entry: type='fee', amount=-23303.92, loan_id=loan_73b02748a7, description="Rollback of repayment #2 for Kaushik sekaran".
      3) [PASS] Regression: POST /api/loans/{id}/repay/{month}?paid_date=(due+5d) → 200, was_late=True, status='paid'.

      No backend code modified. Script: /app/backend_test.py.
  - agent: "testing"
    message: |
      Iteration-5 backend tests complete. All 6/6 test cases passed against live preview backend.
        1) POST /api/loan-apps/check-cibil → PASS. Full schema verified (score/band/band_color/percentages/counts/factors[≥3 with label/impact/detail]/summary).
        2) GET /api/dashboard → PASS. All required keys present; inflow_chart & outflow_chart each 6 items {label,value}.
        3) GET /api/dashboard/overdue → PASS (runtime list empty for current user; shape also confirmed via code inspection).
        4) POST /api/loans/{loan_id}/repay/{month} → PASS for (a) no override, (b) paid_date after due → was_late=true, (c) paid_date before due → was_late=false.
      NAMING NOTE (informational only, no action needed): review request used `override_date` / `is_delayed`, but backend implementation uses `paid_date` / `was_late`. Frontend already calls with matching names, so behavior is correct and consistent end-to-end.
      Test script: /app/backend_test.py. No backend code changes were made.
  - agent: "testing"
    message: |
      Iteration-6 backend tests — 3/4 PASS, 1 FAIL (critical).

      [FAIL] POST /api/clients WITHOUT verification_id
        Two bugs in /app/backend/server.py `client_create` (around lines 620-672):
        1. Line 621-623 still hard-requires a verified OTP. When verification_id is omitted, `db.otps.find_one({"verification_id": None, ...})` returns None → 400 "Mobile OTP not verified.".
        2. Line 672 references an undefined variable `otp_verified_flag` → NameError → 500. This breaks BOTH flows — even valid requests WITH a verified OTP now 500. (Server log: `NameError: name 'otp_verified_flag' is not defined`.)
        Suggested fix (main agent to apply):
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
        …then use `otp_verified_flag` on line 672.

      [PASS] POST /api/loan-apps/approve with due_day=5 → all 6 schedule due_dates land on day-of-month 5 (days [5,5,5,5,5,5]).
      [PASS] POST /api/loan-apps/approve WITHOUT due_day → backward-compatible; 30-day cadence preserved (gaps [30,30]).
      [PASS] POST /api/loans/{id}/repay/{month}?paid_date=… → paid_date before due → was_late=false; paid_date after due → was_late=true.
  - agent: "testing"
    message: |
      Iteration-6 RE-TEST after client_create fix — 4/4 PASS.

      [PASS] POST /api/clients WITHOUT verification_id → 200 OK. Response: otp_verified=false, pan_verified=true, aadhaar_verified=true (client cli_3adbbd46107e). No NameError.
      [PASS] Backward-compat POST /api/clients WITH verification_id → 200 OK (client cli_ac7aaabff056). Full flow /api/clients/send-otp → /api/clients/verify-otp → POST /api/clients(verification_id) works end-to-end.
      [PASS] POST /api/loan-apps/approve with due_day=10 (amount=100000, term=6, rate=12) → all 6 repayment_schedule due_dates land on day 10 of their month: [10,10,10,10,10,10].
      [PASS] POST /api/loans/{loan_id}/repay/{month}?paid_date=ISO → was_late behaviour preserved. paid_date = (due-1day) → was_late=false; paid_date = (due+5days) → was_late=true.

      All tests executed against live backend at https://lending-hub-63.preview.emergentagent.com as lender 9876543210 (demo OTP). Test script: /app/backend_test.py. No backend code modified.


      Tests 2–4 were run against pre-existing client cli_cd90671802ac (Ravi Kumar) because the client_create 500 bug prevented creating a fresh one. Test script: /app/backend_test.py. No backend code was modified.
  - agent: "testing"
    message: |
      Iteration-10 backend regression PASS (lender 9876543210 on live preview).

      1) GET /api/dashboard → 200. NEW `portfolio_health` field present with all five integer keys: on_track=2, overdue=7, at_risk=4, completed=3, defaulted=1. Sum(17) == lender's own loan count. inflow_chart & outflow_chart still 6 {label,value}. overdue_count/overdue_amount still present.
      2) Business-logic verification → PASS. Re-derivation of portfolio_health from each loan's repayment_schedule matches backend output EXACTLY. Concrete examples found in DB:
         - on_track: loan_5cbcde14da (all entries unpaid but not past-due)
         - overdue: loan_seed_l8_1_multi_a8f73d (unpaid EMI past due_date)
         - at_risk: loan_5b6c5f265e (paid entries with was_late=true AND no current unpaid overdue)
         - completed: loan_338acb5076 (loan.status=="completed")
         - defaulted: loan_seed_l10_default_644388 (loan.status=="defaulted")
      3) Regression /api/loans (200, count=28), /api/dashboard/overdue (200, 8 overdue loans), /api/auth/send-otp+verify-otp (200), /api/loan-apps/approve with due_day=15 (200; all 3 EMIs anchored to day 15), /api/loans/{id}/repay/{month}?paid_date=(due+5d) (200, was_late=True), /api/loans/{id}/undo-pay/{month} (200, status→upcoming, paid_at=None, was_late=False), /api/loans/{id}/reschedule/{month}?new_due_date=ISO (200, new_due matches exactly).

      INFORMATIONAL (no regression, pre-existing): /api/loans has no funded_by filter and returns all 28 loans across lenders, while /api/dashboard is lender-scoped (17 loans). portfolio_health correctly matches the lender-scoped count — this is intended behaviour. Script: /app/backend_test.py. No backend code modified.  - agent: "testing"
    message: |
      Iteration-11 backend tests — enriched statement analyzer FAILS. Regressions PASS.

      PATH MISMATCH (critical):
        POST /api/clients/{client_id}/analyze-statement → 404 Not Found.
        This endpoint was NEVER implemented. Only /api/loan-apps/analyze-statement
        (body-based client_id) exists — reviewer explicitly asked for the RESTful
        sub-resource path.

      SCHEMA MISMATCH (critical):
        Tested the existing /api/loan-apps/analyze-statement as fallback.
        13/30 required top-level fields present. 17 MISSING: bank_detected,
        account_holder, account_number_masked, statement_period, opening_balance,
        closing_balance, avg_monthly_credit, avg_monthly_debit, highest_balance,
        emi_load_pct, loan_eligibility, recommended_decision, suggested_loan_amount,
        suggested_emi, repayment_capacity_pct, balance_trend, categories, red_flags,
        behaviour, fraud_checks.
        Also chart entries are missing the required `net` field.

        ROOT CAUSE: server.py:877-926 LLM prompt still asks for the OLD basic schema
        (only ~11 fields). The enriched payload was added ONLY inside
        _fallback_statement_analysis() (757-875) and is never reached because the
        Claude call succeeds. Either (1) update the LLM prompt to request all 30
        enriched fields including `net` in chart, balance_trend, categories,
        red_flags, behaviour, fraud_checks — OR (2) short-circuit through the
        fallback function which already has the complete schema.

  - agent: "testing"
    message: |
      Iteration-13 CIBIL PDF endpoint — 9/9 PASS on live preview backend.

      [PASS] GET /api/clients/cli_seed_000/cibil-report.pdf (Bearer)
        HTTP 200, Content-Type=application/pdf, 3930 bytes (>2KB),
        magic=b'%PDF-1.4',
        Content-Disposition='attachment; filename="LendIQ-CIBIL-Rajesh_Kumar-20260420.pdf"'.
      [PASS] No Authorization header → HTTP 401 {"detail":"Missing or invalid auth token"}.
      [PASS] Unknown client_id cli_does_not_exist → HTTP 404 {"detail":"Client not found"}.
      [PASS] Fallback path — cli_seed_001 (no saved cibil_reports doc) → HTTP 200,
        4413 bytes valid PDF (deterministic mock generated, no 500),
        CD='attachment; filename="LendIQ-CIBIL-Sneha_Reddy-20260420.pdf"'.
      [PASS] After POST /api/loan-apps/check-cibil for cli_seed_001 (200 OK),
        subsequent GET /api/clients/cli_seed_001/cibil-report.pdf → HTTP 200,
        4379 bytes valid PDF (endpoint now reads the saved cibil_reports doc).

      Regressions ALL PASS:
        • GET /api/clients/cli_seed_000/analysis-report.pdf?months=6 → 200, 9172 bytes, %PDF-1.4.
        • POST /api/clients/cli_seed_000/analyze-statement (body={}) → 200 with 35 keys (all 30 enriched fields present, no missing).
        • GET /api/dashboard → 200, portfolio_health={on_track:3, overdue:5, at_risk:6, completed:3, defaulted:1} (all int).
        • GET /api/loans → 200, count=30.

      No backend code modified. Test script: /app/backend_test.py.

      REGRESSIONS — ALL PASS:
        • GET /api/dashboard → 200. portfolio_health={on_track:3, overdue:6,
          at_risk:5, completed:3, defaulted:1} (all 5 int keys).
        • POST /api/loans/loan_d55828a374/reschedule/1?new_due_date=2028-03-15T12:00:00Z → 200.
        • POST /api/loans/loan_d55828a374/undo-pay/1 → 200.

      Test script: /app/backend_test.py. No backend code modified (per instructions).

  - agent: "main"
    message: |
      Iteration 12 complete.
      Backend: Branded reportlab PDF endpoint GET /api/clients/{client_id}/analysis-report.pdf?months=<3|6|12> added (6-page premium layout: Cover+Summary, Cashflow, Behaviour, Decision, Red-Flags, Categories). Backend tests PASS 11/11.
      Frontend:
        • New-loan flow now has step-based back navigation (stepBack in /app/frontend/app/loan-new/[clientId].tsx) — chevron goes review→upload→analysis→cibil→summary in reverse before exiting.
        • Bank-statement upload validates by size heuristic (~40KB/month floor) and rejects when LLM-reported months_analyzed < selected months with a "Please upload a valid N months bank statement PDF" dialog.
        • "Download PDF report" button added to the analysis screen — streams the new PDF endpoint with the Bearer token via fetch().
        • Dashboard: removed the standalone "Overdue Payment (Current Month)" card (was already absent, cleaned up dead styles).
        • Loans tab: confirmed no big red "14 overdue payments" banner; only clean filter pills (All / On Track / Overdue / At Risk / Completed). Dead styles and unused Pressable import removed.
        • Portfolio Health tiles on Dashboard remain fully clickable — verified via screenshots: On Track/Overdue/At Risk/Completed each navigate to /loans?filter=<status> with the correct pill activated.
  - agent: "main"
    message: |
      Iteration 13 complete.
      Backend: Added NEW endpoint GET /api/clients/{client_id}/cibil-report.pdf (branded reportlab PDF — header strip, snapshot table, score hero colour-coded by band, metrics, summary, key factors; falls back to deterministic mock if no saved report). Backend tests PASS 9/9, regressions green.
      Frontend:
        • Shared PDF download helper at /app/frontend/src/pdf.ts — native downloads via expo-file-system + expo-sharing, web via Blob download. Works on mobile AND desktop, real PDF preview/save.
        • loan-new "Download Analysis Report (PDF)" now streams the real PDF to the device using the new helper and shows it in the native share sheet (no more "Opening in browser…" alert).
        • Removed "Download as text (.txt)" buttons from both loan-new statement view and cibil-report page.
        • loan-new PDF button renamed to "Download Report (PDF)".
        • cibil-report page now has "Download Report (PDF)" button wired to /api/clients/{id}/cibil-report.pdf.
        • Login page: removed "Continue with Google" button and "or" divider — clean mobile+OTP only login.
        • Packages added: expo-file-system, expo-sharing.

  - agent: "main"
    message: |
      Iteration 14 complete. CRITICAL analysis-engine + PDF overhaul.
      Backend (40/40 tests PASS):
        • Rewrote statement analyzer — now DETERMINISTIC: same (client_id, file_name) → same 12-month universe. 3-month response is a strict last-3 slice of the 6-month / 12-month universe. LLM removed from the core path to guarantee stability.
        • Real PDF parsing — accepts `file_base64` in POST /api/loan-apps/analyze-statement. Uses pdfplumber to extract text, scans for BOUNCE_KEYWORDS (CHQ RETN, CHEQUE RETURN, ECS RETURN, NACH FAIL, INSUFFICIENT FUNDS, EMI RETURN, BOUNCED, DISHONOUR, etc). Parsed bounce count OVERRIDES the deterministic mock.
        • Transparent rule engine exposes `risk_reasons[]`, `parse_confidence`, `parse_source`, `rows_extracted`, `bounce_matches_found`, `months_covered_in_file`, `manual_review_recommended`, `bounce_evidence[]` (sample matching lines).
        • Added `?token=<jwt>` query-param auth fallback on BOTH PDF endpoints (analysis + CIBIL) via new `get_current_user_flexible` dependency — lets native share/browser open PDFs without headers.
        • Branded PDF now renders "Why this risk score?" block with rule reasons, a full Parsing-confidence table, and a manual-review warning banner when confidence is low. Bounce-evidence sample lines printed at the bottom of the red-flags page.
      Frontend:
        • `/app/frontend/src/pdf.ts` rewritten with triple fallback: native cache download + share sheet → WebBrowser(token URL) → Linking.openURL; web: fetch blob → window.open(token URL). Works on iOS/Android/Desktop/Mobile.
        • Loan-new upload step reads file as base64 (`expo-file-system/legacy.readAsStringAsync`) and ships it to the backend — unlocks real bounce detection on actual PDFs.
        • Analysis screen now shows:
            - "Why this risk score?" card with each reason (severity-coloured)
            - "Parsing confidence" card with Accuracy pill, rows extracted, bounce matches, source, missing-pages flag, and a "Manual review recommended" banner when confidence is LOW.
        • Month-based validation now keyed off `months_covered_in_file` (not just `months_analyzed`), so only truly parsed short statements are rejected.

  - agent: "main"
    message: |
      Iteration 15 complete.
        • PDF download bug ROOT CAUSE FIXED: `src/pdf.ts` was reading AsyncStorage key `"access_token"` while the app stores the JWT under `"smart_lending_token"` (see `src/api.ts: TOKEN_KEY`). Helper now uses the exported `getToken()` from `src/api.ts`. Verified via real browser fetch from the preview frontend — Authorization header AND `?token=` fallback both return valid `application/pdf` (%PDF-1.4, 9605 bytes analysis / 3930 bytes CIBIL).
        • Loan Request page (/application/[id]): avatar removed. Clean text header (Client Name · ID · Requested date · Status badge). Premium "LOAN SUMMARY" card now shows Loan Amount, Purpose, Tenure, Interest rate, Monthly EMI (auto-computed), Due date (5th of every month), Processing fee (1.5%), Net disbursal, Risk level, "Recommended by AI" callout.
        • Multi-language i18n (6 languages): English, Hindi, Tamil, Telugu, Kannada, Malayalam. New `src/i18n.tsx` with I18nProvider + context, persists to AsyncStorage, re-renders UI on switch. Tabs + Profile + Settings + Subscription strings wired. New screen `/settings/language` with native-script preview. Verified: dashboard tabs switch to डैशबोर्ड / अनुरोध / ऋण / ग्राहक / प्रोफ़ाइल instantly in Hindi.
        • Subscription page `/subscription`: Monthly/Yearly toggle, 3 plan cards (Starter ₹499/mo · Smart Credit ₹1499/mo POPULAR · Prime Elite ₹3999/mo), per-plan features, "Current plan" badge, upgrade CTA (payment gateway mocked).
        • Profile tab gained Subscription + Language rows with icons.

  - agent: "main"
    message: |
      Iteration 16 complete — 54/55 backend tests PASS (one cosmetic fix applied).
      Backend (new endpoints):
        • GET /api/clients/{id}/latest-analyses → returns most-recent saved statement_analysis + cibil_report for a client so the application-detail page can show a READ-ONLY summary without re-running AI (addresses "don't re-fetch when loan already given").
        • GET /api/audit/summary?months=<3|6|12>&year=<Y> → inflow (repayments) / outflow (disbursals) / net / overdue / loans_funded / active_loans + monthly breakdown.
        • GET /api/audit/summary.pdf → branded PDF audit report (reportlab, `?token=` fallback).
        • POST /api/support/chat → guided step-by-step answers for "add client", "new loan", "EMI rollback", "statement analysis", "CIBIL", "language", "subscription", "audit", "overdue", "logout", "PDF download". Deterministic keyword map — fast, no LLM latency.
      Frontend:
        • Profile tab: removed Transaction history card + "Repaid this month" / "Funded this month" cards. Added 4 new setting rows with icons — Subscription, Language, Audit & Reports, Help & Support.
        • New routes /settings/audit (3M / 6M / 12M / YTD toggle + year stepper + month-wise table + Download audit PDF) and /settings/help (AI guide chatbot with suggestion chips).
        • Application (Loan Request) detail now fetches `/latest-analyses` and renders READ-ONLY summary cards for the bank-statement analysis (Risk / Eligibility / Bounces / Avg balance / EMI load / Months) and CIBIL (Score / Band / On-time % / Utilization / Accounts / Enquiries). No re-fetch on existing loans.
        • Dashboard: cleaner — just the big TOTAL FUNDED hero → straight into Portfolio Health tiles → chart → recent activity.

  - agent: "main"
    message: |
      Iteration 17 complete. Focus: PDF quality + onboarding + dashboard transactions + one-click download.
      Backend:
        • Registered GNU FreeSans (+Bold/Italic) as the default Unicode PDF font. Remapped the Helvetica family names too so existing reportlab code auto-picks Unicode. Verified: analysis PDF now renders ₹ correctly (2 ₹ on page 1 / 22 ₹ in audit PDF). CIBIL PDF has no currency fields by design. Embedded fonts confirmed = FreeSans / FreeSansBold. No more junk box character.
        • All regressions green (analyze determinism, latest-analyses, audit JSON, support chat, dashboard).
      Frontend:
        • New `app/onboarding.tsx` — 4 premium screens built with react-native-onboarding-swiper (Easy Loan Management / AI Risk Analysis / Portfolio Insights / Fast Collections) + Skip/Next/Done. Persisted via AsyncStorage `lendiq_onboarded`.
        • Root AuthGate in `_layout.tsx` now checks the onboarded flag and routes first-time users to /onboarding before the login screen. Web `finish()` does a full `window.location.href = "/"` reload so the gate re-reads storage (avoids the state-refresh loop).
        • Dashboard: added a premium **Recent Transactions** widget with tabs (All / Credits / Debits / High Value), color-coded icons, and mobile-friendly rows. Pulls from `/api/transactions`. Replaces the Profile tab's TX history (now removed).
        • `src/pdf.ts` rewritten for ONE-CLICK download:
            – Web: proper `<a download=>` → direct save to Downloads (no share prompt).
            – Android 11+: Storage Access Framework fallback asks for a folder the FIRST time then writes directly there.
            – iOS / else: opens PDF inline via `WebBrowser.openBrowserAsync` (no share/app-chooser sheet) — user saves from the native browser control.
          All filenames follow `document_analysis_report_<client>.pdf`, `cibil_analysis_report_<client>.pdf`, `audit_report_<range>_<year>.pdf`.


  - agent: "testing"
    message: |
      Iteration-18 validation complete — Hybrid AI + keyword-FAQ support chat bot — 6/6 test groups PASS (17/17 individual assertions) on live preview backend (lender 9876543210).

      ROUTING VERIFIED:
        • Short keyword match (≤8 words) → source="faq" with canned step-by-step answer.
            - "add client" → answer contains 'Clients tab'.
            - "how does EMI rollback work" (5 words, keyword 'emi') → answer contains 'Undo'.
        • Long / nuanced question → source="ai" via Emergent LLM (openai/gpt-4o-mini).
            - "Explain the difference between At Risk and Overdue in portfolio health." → ai answer correctly contrasts both states.
            - "Why should I upload a bank statement before approving a loan…" → ai answer cites bounces / NACH fails.
        • Empty question → source="empty", answer starts "Please ask".
        • Hindi question with language="hi" → source="ai", answer in Devanagari.
        • No Authorization header → 401.
        • Backward compat — request without language/history → 200 unchanged.

      REGRESSIONS PASS:
        • /api/dashboard — portfolio_health present (all 5 int keys).
        • /api/audit/summary?months=3&year=2026 — net=-627600, monthly.len=3.
        • POST /api/clients/cli_seed_000/analyze-statement {} — 200.

      LLM calls visible in backend logs (LiteLLM → openai/gpt-4o-mini). No LLM failures occurred so the 'fallback' branch was not exercised in this run — endpoint is healthy on the happy path.

      Task flipped: needs_retesting=false, working=true. No backend code modified. Script: /app/backend_test.py.


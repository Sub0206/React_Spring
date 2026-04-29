# LendIQ — FlutterFlow Build Book

> **Complete specification for rebuilding the LendIQ lender app in FlutterFlow (flutterflow.io) while keeping the existing FastAPI + MongoDB backend live on Emergent.**
>
> Version: 1.0 · Author: LendIQ Engineering · Target: FlutterFlow v4+, Flutter 3.24+

---

## 0. How to use this document

1. Skim **§1 App Summary** and **§2 Theme System** first — they anchor the whole build.
2. Paste the **Theme tokens (§2.3 / §2.4)** into FlutterFlow → **Theme Settings → Colors / Typography**.
3. Use **§6 Navigation** to create the Stack + Tab structure.
4. Work through each **Screen spec in §7** top-to-bottom — every screen has layout tree, components, states, bindings and nav links.
5. Connect each API in **§10 API Integration** via FlutterFlow → **API Calls** (bearer token variable = `AppState.accessToken`).
6. Drop the custom-code snippets in **§11** into FlutterFlow **Custom Actions / Custom Functions**.
7. Publish & test against the live backend URL from Emergent (swap in your own once stable).

**Backend stays on Emergent.** Point every FlutterFlow API call at `https://<your-emergent-preview-host>/api/*`. No backend migration needed.

---

## 1. App Summary

**Name:** LendIQ — *Powered by SKYNOTECH*
**Category:** Private / SMB Lending Operations Platform (not for borrowers — for lenders).

**Core user journeys**
1. **Lender signs in** → Mobile + OTP → optional Passcode/Biometric gate
2. **Manages clients** → adds with Aadhaar/PAN KYC
3. **Issues a loan** → uploads bank statement → AI risk analysis → pulls CIBIL → sets amount/tenure/rate → disburses now or "Fund Later"
4. **Tracks repayments** → month-wise EMI schedule → Mark paid / Reschedule / Undo payment
5. **Audits & reports** → inflow/outflow, PDF reports with reconciliation
6. **Queries data** via the AI Business Assistant ("Which loans are overdue?", "Inflow this month?")

**Bottom-nav tabs (5):** Dashboard · Requests · Loans · Clients · Profile
**Root routes outside tabs:** Login, Notifications, Passcode, Assistant, Application Summary, Loan Track, Client Detail, New Loan, CIBIL Report, plus settings sub-routes (appearance, security, language, subscription, audit, help).

**Target devices:** iPhone 390×844, Android 360×800, tablets scaled.

---

## 2. Theme System (Light + Dark)

Create **two Theme Modes** in FlutterFlow Theme Settings. Primary brand is Royal Blue. Status colours are semantic (green on-track / amber at-risk / red overdue / teal accent).

### 2.1 Color tokens (paste into FlutterFlow Theme → Custom Colors)

| Token          | Light        | Dark         | Purpose                             |
|----------------|--------------|--------------|--------------------------------------|
| `primary`      | `#1E40AF`    | `#3B82F6`    | Brand / primary CTAs                 |
| `primaryDark`  | `#1E3A8A`    | `#2563EB`    | Pressed / darker variant             |
| `primaryLight` | `#3B82F6`    | `#60A5FA`    | Lighter variant                      |
| `primarySoft`  | `#DBEAFE`    | `#1E3A5F`    | Tinted bg behind primary text/pills  |
| `secondary`    | `#10B981`    | `#10B981`    | Secondary / success                  |
| `secondarySoft`| `#D1FAE5`    | `#0B3F2E`    | Soft success tint                    |
| `accent`       | `#0D9488`    | `#14B8A6`    | Premium teal highlight               |
| `accentSoft`   | `#CCFBF1`    | `#0F3D3A`    | Soft teal tint                       |
| `gold`         | `#D4AF37`    | `#FBBF24`    | Premium / loyalty                    |
| `goldSoft`     | `#FEF3C7`    | `#78350F`    | Gold tint                            |
| `success`      | `#059669`    | `#10B981`    | Positive state                       |
| `successSoft`  | `#D1FAE5`    | `#0B3F2E`    | Soft success                         |
| `warning`      | `#D97706`    | `#F59E0B`    | At-risk / awaiting                   |
| `warningSoft`  | `#FEF3C7`    | `#7C4A10`    | Soft amber                           |
| `danger`       | `#DC2626`    | `#EF4444`    | Overdue / error                      |
| `dangerDark`   | `#B91C1C`    | `#DC2626`    | Pressed danger                       |
| `dangerSoft`   | `#FEE2E2`    | `#5A1A1A`    | Soft red                             |
| `info`         | `#0EA5E9`    | `#22D3EE`    | Informational                        |
| `infoSoft`     | `#E0F2FE`    | `#113F4B`    | Soft cyan                            |
| `bg`           | `#F8FAFC`    | `#0B1220`    | Page background                      |
| `bgAlt`        | `#F1F5F9`    | `#131C2E`    | Secondary panel                      |
| `surface`      | `#FFFFFF`    | `#1B273F`    | Card background                      |
| `surfaceAlt`   | `#FAFBFE`    | `#243049`    | Elevated / selected card             |
| `textPrimary`  | `#0F172A`    | `#F8FAFC`    | Body / headings                      |
| `textSecondary`| `#475569`    | `#CBD5E1`    | Secondary text                       |
| `textMuted`    | `#94A3B8`    | `#94A3B8`    | Muted labels                         |
| `border`       | `#E2E8F0`    | `#334155`    | Strong borders                       |
| `borderLight`  | `#F1F5F9`    | `#263149`    | Card / subtle borders                |
| `borderSubtle` | `#EDF2F7`    | `#1D2740`    | Hairline                             |

> In FlutterFlow, map these to `Theme → Custom Colors` with Light + Dark values. Then use `FlutterFlow Theme: Color → primary` bindings on every component.

### 2.2 Typography (FlutterFlow → Theme → Typography)

| Token        | Font family     | Size | Weight | Used for                             |
|--------------|-----------------|------|--------|--------------------------------------|
| `displayLg`  | Inter           | 30   | 800    | Screen hero title                    |
| `headingXL`  | Inter           | 26   | 800    | Dashboard hero number                |
| `heading`    | Inter           | 22   | 800    | Section title                        |
| `subheading` | Inter           | 18   | 800    | Sub-section                          |
| `body`       | Inter           | 14   | 500    | Regular paragraph                    |
| `bodyBold`   | Inter           | 14   | 800    | Emphasised body                      |
| `caption`    | Inter           | 12   | 600    | Table rows / helper                  |
| `label`      | Inter           | 11   | 800    | UPPERCASE section labels (letter-sp 0.5) |
| `micro`      | Inter           | 10   | 700    | Pills & badges                       |

> Use **Google Fonts → Inter**. For Indian-language glyphs also add **Noto Sans** as fallback.

### 2.3 Spacing, Radii, Shadows

| Spacing  | Value |
|----------|-------|
| `xs`     | 4 dp  |
| `sm`     | 8 dp  |
| `md`     | 16 dp |
| `lg`     | 24 dp |
| `xl`     | 32 dp |
| `xxl`    | 48 dp |

| Radius   | Value  |
|----------|--------|
| `sm`     | 8 dp   |
| `md`     | 14 dp  |
| `lg`     | 20 dp  |
| `xl`     | 28 dp  |
| `pill`   | 999 dp |

| Shadow     | Offset y | Blur | Opacity (light / dark) |
|------------|----------|------|------------------------|
| `card`     | 3        | 14   | 0.10 / 0.25            |
| `cardHigh` | 10       | 30   | 0.14 / 0.35            |
| `button`   | 6        | 18   | 0.25 (primary-tinted)  |

### 2.4 Icons
Use **Ionicons** (FlutterFlow supports it out of the box). Specific names used below:
`chevron-back`, `keypad`, `finger-print`, `sparkles`, `shield-checkmark`, `color-palette`, `trending-up`, `time-outline`, `trash`, `bar-chart`, `chatbubbles`, `notifications`, `notifications-off-outline`, `arrow-forward`, `flash`, `send`, `send`, `document-text`, `moon`, `sunny`, `phone-portrait`.

---

## 3. App Assets

| Asset             | Where                                      |
|-------------------|--------------------------------------------|
| Logo (icon only)  | Unsplash premium placeholder — replace with SKYNOTECH logo PNG (square, transparent) |
| Splash bg         | Gradient `#0B1220 → #1E3A8A`               |
| Empty-state art   | Ionicons inside a soft primary circle      |
| Flags (for i18n)  | `emoji_flag` SVG set                       |

Embed one custom font if `₹` is mis-rendering in PDFs: **FreeSans.ttf** (already used in backend for reportlab).

---

## 4. Global App State (FlutterFlow → App State)

| Variable              | Type            | Initial | Persisted |
|-----------------------|-----------------|---------|-----------|
| `accessToken`         | String          | ""      | ✅        |
| `userId`              | String          | ""      | ✅        |
| `userName`            | String          | ""      | ✅        |
| `userMobile`          | String          | ""      | ✅        |
| `subscriptionTier`    | String          | "starter" | ✅      |
| `themeMode`           | String          | "system" (values: `light`/`dark`/`system`) | ✅ |
| `locale`              | String          | "en" (en/hi/ta/te/kn/ml) | ✅ |
| `isUnlocked`          | Boolean         | false   | ❌ (per session) |
| `biometricEnabled`    | Boolean         | false   | ✅        |
| `passcodeSet`         | Boolean         | false   | ✅        |
| `notificationUnread`  | Integer         | 0       | ❌        |

> `accessToken` drives every authed API call. After login success, set it; on logout clear it.

---

## 5. Secure Storage (Custom Auth or secure_storage package)

Use FlutterFlow's **Flutter Secure Storage Custom Action** (or install `flutter_secure_storage`):
- `lendiq_passcode_hash` — SHA-256 hash of passcode
- `lendiq_biometric_enabled` — "true" / "false"
- `lendiq_pass_fail_count` — integer string
- `lendiq_pass_lock_until` — ISO timestamp string
- `lendiq_theme_mode` — "light" / "dark" / "system"
- `lendiq_locale` — "en" / "hi" / "ta" / "te" / "kn" / "ml"

See §11.1 for the required Custom Actions (hashPasscode, verifyPasscode, setPasscode).

---

## 6. Navigation Structure

### 6.1 Route list

| Route                                 | Type       | Auth required | Notes |
|---------------------------------------|------------|---------------|-------|
| `/`                                   | Page       | ❌            | Login (Mobile + OTP) |
| `/passcode/:mode`                     | Page       | ✅ partial    | mode = `verify` / `create` / `confirm` |
| `/tabs`                               | TabHost    | ✅            | 5 bottom tabs (see below) |
| `/notifications`                      | Page       | ✅            | |
| `/assistant`                          | Page       | ✅            | AI chat |
| `/application/:id`                    | Page       | ✅            | **Application Summary** |
| `/loan/:id`                           | Page       | ✅            | Loan Track / Repayment |
| `/client/:id`                         | Page       | ✅            | Client detail |
| `/client/add`                         | Page       | ✅            | Add client with KYC |
| `/loan-new/:clientId`                 | Page       | ✅            | New loan wizard (4 steps) |
| `/cibil-report/:clientId`             | Page       | ✅            | CIBIL detail |
| `/settings/appearance`                | Page       | ✅            | Theme toggle |
| `/settings/security`                  | Page       | ✅            | Passcode + biometric |
| `/settings/language`                  | Page       | ✅            | i18n picker |
| `/settings/subscription`              | Page       | ✅            | Plans |
| `/settings/audit`                     | Page       | ✅            | Audit + PDF |
| `/settings/help`                      | Page       | ✅            | Help chatbot |

### 6.2 Tab Host (`/tabs`)

```
BottomNavigation
├─ Dashboard   (ionicon: home, text: tDashboard)
├─ Requests    (ionicon: document-text, text: tRequests, badge: countPending)
├─ Loans       (ionicon: cash, text: tLoans)
├─ Clients     (ionicon: people, text: tClients)
└─ Profile     (ionicon: person, text: tProfile)
```

### 6.3 App launch flow (InitialRoute logic — put in FF `onAppOpen` Action):

```
if (AppState.accessToken == "")  → push /
else if (AppState.passcodeSet && !AppState.isUnlocked) → push /passcode/verify
else → push /tabs
```

---

## 7. Screens

For every screen below: **Tree** (visual layout), **Data** (API call), **Actions** (navigation/state), **Validation**, **Theme-aware bindings**.

> All background colours use `bg`. Cards use `surface` + 1 px `borderLight` + `card` shadow. Every Text picks its colour from `textPrimary` / `textSecondary` / `textMuted`.

---

### 7.1 Login (`/`)

**Tree**
```
SafeArea
  Column (padding lg, mainAxisAlignment: spaceBetween)
    ▸ Top branding
        Image (logoUrl) 72×72 roundedFull
        Text "LendIQ" displayLg primary
        Text "Powered by SKYNOTECH" caption textSecondary
    ▸ Card (primarySoft tint, radius xl, padding lg)
        Column
          Text "Welcome back" heading
          Text "Sign in with your mobile number" body textSecondary
          TextField mobile (prefix: +91, keyboardType: phone, maxLen: 10)
          Button "Send OTP" primary → calls sendOtp(mobile) → on success show OTP field
          (conditional) Text "Demo OTP: {demo_otp}" caption warning
          TextField otp (keyboardType: number, maxLen: 6)
          Button "Verify & continue" primary → calls verifyOtp(mobile, otp) → on success save token, route
```

**Actions**
- On "Send OTP": API `POST /auth/send-otp` → store `demo_otp` for copy-paste convenience in dev
- On "Verify": API `POST /auth/verify-otp` → save `accessToken`, `userId`, `userName` → check passcode / route to `/tabs`

**Validation:** mobile length == 10 digits, OTP length == 6 digits.

---

### 7.2 Passcode screen (`/passcode/:mode`)

See reference mockup — same for Verify / Create / Confirm.

**Tree**
```
SafeArea
  Column (padding lg)
    ▸ Row(end)
        IconButton (log-out-outline) → signOut
    ▸ Spacer
    ▸ Text title displayLg textPrimary            // "Enter passcode" / "Create passcode" / "Confirm passcode"
    ▸ Text subtitle body textSecondary
    ▸ Row (gap 14, marginTop xl)
        4× Container 56×60 radius md surface border:borderLight
           (when filled → dot 14×14 primary, when error → borderDanger + shakeAnimation)
    ▸ TextField hidden (opacity 0, secure, maxLen 4, autoFocus) → on length==4 call submit
    ▸ (verify mode) TextButton "Forgot Passcode?" primary → signOut+route '/'
    ▸ (verify mode & biometric on) Ionicon finger-print 44px primary → triggers LocalAuth
    ▸ Text errorMsg danger (if any)
    ▸ Spacer
    Button (sticky footer) "Verify" | "Next" | "Confirm"
```

**Data**
- Uses Custom Action `verifyPasscode(code)` / `setPasscode(code)` / `hasPasscode()` (§11)
- On 5 fails → 30s lockout with countdown Text

**Bindings**
- Box borders: filled → `primary`; error → `danger`.

---

### 7.3 Dashboard tab

**API:** `GET /dashboard`
**Response fields used:** `total_funded`, `active_loans`, `expected_returns`, `portfolio_health{on_track, overdue, at_risk, completed}`, `monthly_inflow[]`, `monthly_outflow[]`.

**Tree**
```
Scroll (padding md)
  ▸ Row header → Text "Good morning {userName}", IconButton notifications (badge=unread)
  ▸ Hero Card (primary bg, radius xl, padding md)
       Text "TOTAL FUNDED" label rgba(255,255,255,0.78)
       Text "₹{total_funded|number_format_inr}" headingXL white
       Text "Active: {active_loans} · Returns: ₹{expected_returns}" body white
  ▸ Text "Portfolio Health" heading marginTop md
  ▸ Grid 2 cols (gap 10)
       4 Tiles: OnTrack (success), Overdue (danger), AtRisk (warning), Completed (accent)
       Each tile: onTap push /tabs with Loans-filter=status
  ▸ Card "Inflow / Outflow" with LineChart (FlutterFlow Chart widget) using monthly_inflow + monthly_outflow
  ▸ Card "Recent Transactions" — GET /transactions?limit=10; tabbed filter (All/Credits/Debits/High Value)
  ▸ Floating Action Button ✨ Assistant → push /assistant
```

---

### 7.4 Requests tab (`/tabs` → Requests)

**Filter pills:** Pending · Funded · Rejected
- **Pending** merges `status=pending` + `status=approved` (Fund Later) via 2 parallel API calls + de-dup on `application_id`.

**Row component**
```
Card surface border
  Row
    InitialsAvatar 40 (from borrower.name)
    Column
      Text borrower.name bodyBold
      Text "₹{amount} · {term_months} mo · {interest_rate}% p.a." caption textSecondary
      Row pills
        StatusPill (see mapping below)
        AIRisk pill (optional if ai_risk set): color green/yellow/red
    Icon chevron-forward textMuted
```

**Status pill mapping**

| status     | pill text         | color       |
|------------|-------------------|-------------|
| `pending`  | AWAITING REVIEW   | warning     |
| `approved` | READY TO FUND     | accent      |
| `funded`   | FUNDED            | success     |
| `rejected` | REJECTED          | danger      |

Row onTap → push `/application/{application_id}`.

---

### 7.5 Application Summary (`/application/:id`)

**API:** `GET /applications/{id}` + `GET /clients/{client_id}` + `GET /clients/{client_id}/latest-analyses`
**Response key fields:** everything from App model plus `loan_id` (present when funded).

**Tree**
```
SafeArea(top)
  TopNav (back chevron + "Application Summary")
  Scroll (padding lg, paddingBottom = actionBarHeight + safeAreaBottom)
    Text "Application summary" displayLg
    Text subtitle body textSecondary   // dynamic per status
    ▸ IF isDecided — Audit Stamp Card
        Title "Loan Approved" | "Loan Rejected" | "Loan Funded" + date
        Grid: Decision By, Status
        Reason block (optional)
    ▸ Client Header Card
        InitialsAvatar 48 + name + "+91 {mobile} · {panMasked}"
    ▸ Bank Statement Risk Card (tinted by risk_color or placeholder)
    ▸ CIBIL Score Card (tinted by band_color or placeholder, onTap → /cibil-report/{client_id})
    ▸ Overall Client Risk Card with 0-100 gauge + LOW/MODERATE/HIGH pill
    ▸ Loan Summary Card (big ₹amount, purpose · N mo · X% p.a.)
        Grid 2col: Monthly EMI (highlighted), Tenure, Interest rate, Due date, Processing fee, Net disbursal
  StickyActionBar (position bottom, paddingBottom = safeArea)
      IF status=pending:
          Row: [Reject danger flex 1] [Approve & Disburse success flex 1.35]
          Ghost button row: [time-outline · "Fund later · keep in Pending Requests"]
      IF status=approved & no loan_id:
          [Fund ₹{amount} primary full-width]
      IF status=funded:
          [Loan Track card button primary: trending-up + "Loan Track" + chevron]
```

**Actions**
- **Reject** → opens BottomSheet with multi-line TextField → POST `/applications/{id}/reject` body `{reason}` → reload
- **Approve & Disburse** → POST `/applications/{id}/approve` then POST `/applications/{id}/fund` → success toast → push `/tabs` (Loans)
- **Fund later** → POST `/applications/{id}/approve` only → push `/tabs` (Requests)
- **Loan Track** → push `/loan/{loan_id}`

---

### 7.6 Loan Track (`/loan/:id`)

**API:** `GET /loans/{id}`

**Tabs:** Current month · Past · Future

**Row component** (EMI entry)
```
Card surface
  Row
    Column (flex)
       Text "Month {n} · Due {date}" body
       Text "₹{amount} · {status}" caption
    StatusPill: paid(success) / pending(warning) / overdue(danger)
    IF status==paid: Button "Undo" secondary → POST /loans/{id}/undo-pay/{month}
    IF current month & unpaid: Button "Mark paid" primary → POST /loans/{id}/repay/{month}
    IF current month & unpaid: Button "Reschedule" ghost → POST /loans/{id}/reschedule/{month}
```

Rule: **only current month** may be Marked Paid / Rescheduled. Past/future locked.

---

### 7.7 Clients tab

**API:** `GET /clients`

**Row**
```
Card surface
  Row
    InitialsAvatar 40
    Column
      Text name bodyBold
      Text "+91 {mobile}" caption textSecondary
    RiskPill (risk_color)
    Icon chevron-forward
```

Header:
- Search bar (filters by name or mobile — local)
- Button "+ Add" → push `/client/add`

---

### 7.8 Client Add (`/client/add`)

**Tree**
```
Scroll
  Card: Personal
    TextField name (required)
    TextField mobile (len 10) → button "Send OTP" → OTP verify flow
    TextField email (optional)
  Card: KYC
    TextField aadhaar (len 12) + button "Verify Aadhaar" → POST /clients/verify-aadhaar
    TextField pan (len 10 [A-Z]{5}[0-9]{4}[A-Z]{1}) + button "Verify PAN" → POST /clients/verify-pan
  Card: Address
    TextField address line 1 (required)
    TextField line 2
    TextField city, state, pincode
  Sticky Button "Save client" primary → POST /clients
```

**Validation:** mobile==10 digits, aadhaar==12 digits, pan regex.

---

### 7.9 Client Detail (`/client/:id`)

Shows:
- Header card (avatar + name + mobile + PAN masked + risk pill + CIBIL score)
- Button "New loan" → push `/loan-new/{clientId}`
- List "Loans / Applications" → each row → `/application/{application_id}`
- Latest analyses summary (Statement + CIBIL) pulled from `GET /clients/{id}/latest-analyses`

---

### 7.10 New Loan Wizard (`/loan-new/:clientId`)

**4 steps** (TabView or StepIndicator)
1. **Client snapshot** (read-only Card) → Continue
2. **Bank Statement** → DropdownButton months (3/6/12) + PickFile (pdf) → POST `/loan-apps/analyze-statement` (multipart) → show risk card
3. **CIBIL** → Button "Pull CIBIL" → POST `/loan-apps/check-cibil` → show score card
4. **Loan details** → Fields amount, tenure (months), interest rate (% p.a.), due_day (1–28) → Summary card with EMI (computed, see §11.2) → Button "Fund" → POST `/loan-apps/approve`

---

### 7.11 CIBIL Report (`/cibil-report/:clientId`)

**API:** `GET /clients/{clientId}/latest-analyses` (uses `cibil_report` sub-object)

Shows:
- Big score gauge (band-coloured 300–900)
- Factor grid: On-time %, Credit Utilization %, Credit Age, Hard Enquiries
- Button **Download Report (PDF)** → opens `GET /clients/{clientId}/cibil-report.pdf?token=<accessToken>` via Url Launcher (see §11.3)

---

### 7.12 Notifications (`/notifications`)

**Persistent header: back button ALWAYS visible** (even in empty state).

**API:** `GET /notifications`
**Actions:**
- Swipe-left any row → reveal red Delete action → `DELETE /notifications/{id}`
- Swipe-right unread → reveal green Mark Read → `POST /notifications/{id}/read`
- Header pill:
  - `unread > 0` → blue "Mark all read" → `POST /notifications/read-all`
  - After all read → red outlined "Clear all" → confirm dialog → `DELETE /notifications`
- Empty state: Ionicon notifications-off-outline circle + Text "No notifications available"

Use FlutterFlow's **Slidable** component for swipe gestures.

---

### 7.13 Profile tab

**API:** `GET /auth/me` for header

**Tree**
```
Scroll
  Card header: Avatar with initial + name + "Verified Lender" pill
  Card settings (group):
    Row → Subscription       (diamond icon, route /settings/subscription)
    Row → Language           (translate icon, route /settings/language)
    Row → Appearance         (color-palette, route /settings/appearance)
    Row → Security & Passcode (shield, route /settings/security)
    Row → AI Assistant       (sparkles, route /assistant)
    Row → Audit & Reports    (bar-chart, route /settings/audit)
    Row → Help & Support     (chatbubbles, route /settings/help)
  Button "Logout" danger full-width → clear AppState + clear token + clear passcode unlock → push /
```

---

### 7.14 Appearance (`/settings/appearance`)

Radio list 3 rows:
- Match system (phone-portrait)
- Light (sunny)
- Dark (moon)

On tap: persist to AppState `themeMode` + Secure Storage. Rebuild app (FlutterFlow auto-applies if theme tokens are bound).
Preview Card at bottom shows TOTAL FUNDED hero + Portfolio Health tiles in active theme.

---

### 7.15 Security & Passcode (`/settings/security`)

Rows:
- Create/Change passcode → `/passcode/create`
- Biometric unlock switch (disabled if biometric hardware not enrolled)
- Remove passcode (confirm dialog)
- Info card explaining SHA-256 hashing + 30s lockout after 5 fails

---

### 7.16 Language (`/settings/language`)

6 rows with flag emojis + native language name:
- 🇬🇧 English · 🇮🇳 हिन्दी · 🇮🇳 தமிழ் · 🇮🇳 తెలుగు · 🇮🇳 ಕನ್ನಡ · 🇮🇳 മലയാളം

Selected → saved to AppState `locale` + Secure Storage. Use FlutterFlow's **Localization** with one translation entry per string.

---

### 7.17 Subscription (`/settings/subscription`)

**API:** `GET /subscriptions/plans`
- Toggle Monthly / Yearly
- 3 plan cards: Starter ₹499/mo · Smart Credit ₹1499/mo (POPULAR) · Prime Elite ₹3999/mo
- Button "Upgrade" → POST `/subscriptions/subscribe` → success toast

---

### 7.18 Audit & Reports (`/settings/audit`)

**API:** `GET /audit/summary?months={3|6|12|YTD}&year={YYYY}`

Tree:
- Period segment: 3M / 6M / 12M / YTD
- Year stepper: ◀ {year} ▶
- Period Summary grid (Inflow, Outflow, Net, Overdue, Loans funded, Active loans)
- Month-wise cashflow Table (Month · Inflow · Outflow · Net)
- Info hint: "Full reconciliation, variance & exception ledger in the downloadable PDF"
- Button "Download audit report (PDF)" → `GET /audit/summary.pdf?...&token=<accessToken>` via Url Launcher

---

### 7.19 Help & Support (`/settings/help`)

Chat UI calling `POST /support/chat` body `{question, language, history}`.
Suggestion chips: "How do I add a new client?", "How to issue a new loan?", "How does month-wise EMI work?", "How to analyze a bank statement?", "How to change the language?"

---

### 7.20 AI Business Assistant (`/assistant`)

Premium chat UI (same as §7.19 but different backend).
**API:** `POST /assistant/query` body `{question, history:[{role,text},…]}`

**Suggestion chips (horizontal scroll):**
- What is my inflow today?
- Which loans are overdue today?
- Loans funded this month?
- Show top 5 risky borrowers
- Pending approvals count?
- Total active loans?

**Bubble renderer:** Render `**bold**` Markdown by detecting `\*\*([^*]+)\*\*` and applying FontWeight 800 to captured spans — build as **Custom Widget** (`MarkdownBubble`).

**Typing indicator:** 3 animated dots (FlutterFlow Animations → opacity loop).

---

## 8. Reusable Widgets (create once, re-use)

| Widget             | Props                                           | Location            |
|--------------------|-------------------------------------------------|---------------------|
| `PrimaryButton`    | title, variant (primary/secondary/success/danger/ghost), loading, disabled, onPress, testId | Component |
| `Card`             | child, padding, radius                          | Component           |
| `InitialsAvatar`   | name, size, bgColor?                            | Component           |
| `StatusPill`       | text, fg, bg                                    | Component           |
| `SectionHeader`    | title, sub?                                     | Component           |
| `RiskGauge`        | score 0-100, color                              | Component           |
| `EmptyState`       | icon, title, subtitle                           | Component           |
| `TopNav`           | title, onBack, rightChild                       | Component           |
| `ChatBubble`       | role (user/bot), text (MD), ts                  | Component           |

---

## 9. API Integration

### 9.1 Base
**Base URL:** `https://<your-emergent-host>`  (FlutterFlow → API Calls → Base URL variable)
**Common headers:** `Authorization: Bearer <AppState.accessToken>` (for all non-auth endpoints)

### 9.2 Endpoint catalog

| # | Method | Path | Auth | Purpose | Key request body / params | Used in screen |
|---|--------|------|------|---------|----------------------------|----------------|
| 1 | POST | `/api/auth/send-otp` | ❌ | Send OTP to mobile | `{mobile}` | 7.1 |
| 2 | POST | `/api/auth/verify-otp` | ❌ | Exchange OTP for access token | `{mobile, otp}` → `{access_token, user:{user_id, name, mobile, subscription_tier}}` | 7.1 |
| 3 | GET  | `/api/auth/me` | ✅ | Fetch current user | — | 7.13 |
| 4 | GET  | `/api/clients` | ✅ | List clients | — | 7.7 |
| 5 | GET  | `/api/clients/{id}` | ✅ | Client detail | path id | 7.5, 7.9 |
| 6 | POST | `/api/clients` | ✅ | Create client | `{name, mobile, email?, aadhaar, pan, address{...}}` | 7.8 |
| 7 | POST | `/api/clients/verify-aadhaar` | ✅ | Validate Aadhaar | `{aadhaar}` | 7.8 |
| 8 | POST | `/api/clients/verify-pan` | ✅ | Validate PAN | `{pan, name}` | 7.8 |
| 9 | POST | `/api/clients/send-otp` | ✅ | Send OTP to client mobile | `{mobile}` | 7.8 |
| 10 | POST | `/api/clients/verify-otp` | ✅ | Verify client mobile OTP | `{mobile, otp}` | 7.8 |
| 11 | GET  | `/api/clients/{id}/loans` | ✅ | Client's application list | path id | 7.9 |
| 12 | GET  | `/api/clients/{id}/latest-analyses` | ✅ | Cached Statement + CIBIL | path id | 7.5, 7.11 |
| 13 | POST | `/api/loan-apps/analyze-statement` | ✅ | Upload PDF for AI analysis | multipart: `file`, `client_id`, `months` | 7.10 step 2 |
| 14 | POST | `/api/loan-apps/check-cibil` | ✅ | Pull CIBIL | `{client_id}` | 7.10 step 3 |
| 15 | POST | `/api/loan-apps/approve` | ✅ | Create funded loan | `{client_id, amount, term_months, interest_rate, due_day}` → Loan | 7.10 step 4 |
| 16 | POST | `/api/loan-apps/reject` | ✅ | Reject loan app | `{application_id, reason}` | — |
| 17 | GET  | `/api/applications?status=…` | ✅ | List applications | query `status` (`pending|approved|funded|rejected`) | 7.4 |
| 18 | GET  | `/api/applications/{id}` | ✅ | App detail (includes `loan_id` when funded) | path id | 7.5 |
| 19 | POST | `/api/applications/{id}/approve` | ✅ | Approve (no fund) | — | 7.5 |
| 20 | POST | `/api/applications/{id}/reject` | ✅ | Reject with reason | `{reason}` | 7.5 |
| 21 | POST | `/api/applications/{id}/fund` | ✅ | Disburse the approved app | — | 7.5 |
| 22 | GET  | `/api/loans` | ✅ | List active loans | optional `status` filter | Loans tab |
| 23 | GET  | `/api/loans/{id}` | ✅ | Loan + schedule | path id | 7.6 |
| 24 | POST | `/api/loans/{id}/repay/{month}` | ✅ | Mark paid current month | — | 7.6 |
| 25 | POST | `/api/loans/{id}/undo-pay/{month}` | ✅ | Rollback a payment | — | 7.6 |
| 26 | POST | `/api/loans/{id}/reschedule/{month}` | ✅ | Push due date forward | `{new_due_date}` | 7.6 |
| 27 | GET  | `/api/transactions` | ✅ | Recent tx list | optional `limit`, `type` | Dashboard |
| 28 | GET  | `/api/notifications` | ✅ | List notifications | — | 7.12 |
| 29 | POST | `/api/notifications/{id}/read` | ✅ | Mark single read | — | 7.12 |
| 30 | POST | `/api/notifications/read-all` | ✅ | Mark all read | — | 7.12 |
| 31 | DELETE | `/api/notifications/{id}` | ✅ | Delete one | — | 7.12 |
| 32 | DELETE | `/api/notifications` | ✅ | Clear all for user | — | 7.12 |
| 33 | GET  | `/api/dashboard` | ✅ | Aggregate tiles + charts | — | Dashboard |
| 34 | GET  | `/api/dashboard/overdue` | ✅ | Overdue list | — | Dashboard drill-down |
| 35 | GET  | `/api/audit/summary` | ✅ | Monthly inflow/outflow + reconciliation | query `months=3|6|12|YTD`, `year` | 7.18 |
| 36 | GET  | `/api/audit/summary.pdf` | ✅ | Audit PDF | query `months`, `year`, `token` | 7.18 |
| 37 | GET  | `/api/clients/{id}/analysis-report.pdf` | ✅ | Statement analysis PDF | query `token` | 7.5 |
| 38 | GET  | `/api/clients/{id}/cibil-report.pdf` | ✅ | CIBIL PDF | query `token` | 7.11 |
| 39 | GET  | `/api/subscriptions/plans` | ✅ | Plan catalog | — | 7.17 |
| 40 | POST | `/api/subscriptions/subscribe` | ✅ | Subscribe | `{plan_id, cycle}` | 7.17 |
| 41 | GET  | `/api/subscriptions/me` | ✅ | Current plan | — | 7.17 |
| 42 | POST | `/api/support/chat` | ✅ | Help chatbot | `{question, language?, history?}` → `{answer, source}` | 7.19 |
| 43 | POST | `/api/assistant/query` | ✅ | AI Business Assistant | `{question, history?}` → `{answer, source}` | 7.20 |

---

## 10. Key Response Schemas (so you can model Data Types in FlutterFlow)

### `LoanApplication`
```
{
  application_id: string,
  client_id: string,
  borrower: { name, age, occupation, monthly_income, employment_years, existing_debts, credit_history_years, previous_defaults },
  amount: number,
  purpose: string,
  term_months: int,
  interest_rate: number,
  status: "pending" | "approved" | "funded" | "rejected",
  loan_id: string | null,   // present when funded
  created_at: datetime,
  requested_at: datetime | null,
  decided_at: datetime | null,
  decided_by: string | null,
  decided_by_name: string | null,
  decision_reason: string | null,
  approved_amount: number | null,
  approved_tenure: int | null,
  approved_rate: number | null,
  ai_score: int | null,
  ai_risk: "low" | "medium" | "high" | null,
  ai_recommendation: string | null
}
```

### `Loan`
```
{
  loan_id, application_id, client_id, principal, term_months, interest_rate,
  due_day: 1..28,
  status: "active" | "completed" | "defaulted",
  paid_amount, total_repayment, created_at, funded_by,
  repayment_schedule: [
    { month, due_date, amount, status:"paid"|"pending"|"overdue", paid_at, was_late, paid_amount }
  ]
}
```

### `Notification`
```
{ notification_id, title, body, type: "application"|"repayment"|"system"|"alert", read, created_at }
```

### `Assistant query response`
```
{ answer: string (markdown), source: "ai" | "faq" | "fallback" | "empty" }
```

### `Statement Analysis (latest-analyses.statement_analysis)`
```
{
  confidence: number,
  bounce_risk: "low"|"medium"|"high",
  risk_color: "green"|"yellow"|"red",
  bounced_transactions: int,
  avg_balance: number,
  risk_reasons: string[],
  bounce_evidence: string[],
  totals: { credit, debit },
  balances: { opening, closing }
}
```

### `CIBIL Report (latest-analyses.cibil_report)`
```
{
  score: int (300–900),
  band: "Poor"|"Fair"|"Good"|"Excellent",
  band_color: "red"|"yellow"|"green"|"blue",
  on_time_payments_pct: int,
  credit_utilization_pct: int,
  credit_age_years: number,
  hard_enquiries: int,
  factors: string[]
}
```

---

## 11. Custom Code Snippets (paste into FlutterFlow Custom Actions / Functions)

### 11.1 Passcode helpers

```dart
import 'dart:convert';
import 'package:crypto/crypto.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';

const _store = FlutterSecureStorage();
const _keyHash   = 'lendiq_passcode_hash';
const _keyFail   = 'lendiq_pass_fail_count';
const _keyLock   = 'lendiq_pass_lock_until';
const _maxFails  = 5;
const _lockMs    = 30000;

String _hash(String code) => sha256.convert(utf8.encode('lendiq::$code')).toString();

Future<bool> hasPasscode() async => (await _store.read(key: _keyHash))?.isNotEmpty == true;

Future<void> setPasscode(String code) async {
  if (!RegExp(r'^\d{4}$').hasMatch(code)) throw 'Passcode must be 4 digits';
  await _store.write(key: _keyHash, value: _hash(code));
  await _store.write(key: _keyFail, value: '0');
  await _store.delete(key: _keyLock);
}

Future<Map<String, dynamic>> verifyPasscode(String code) async {
  final lockStr = await _store.read(key: _keyLock);
  final lockUntil = int.tryParse(lockStr ?? '') ?? 0;
  if (lockUntil != 0 && DateTime.now().millisecondsSinceEpoch < lockUntil) {
    return {'ok': false, 'error': 'locked', 'unlockAt': lockUntil};
  }
  final stored = await _store.read(key: _keyHash);
  if (stored == null) return {'ok': false, 'error': 'wrong'};
  if (_hash(code) == stored) {
    await _store.write(key: _keyFail, value: '0');
    await _store.delete(key: _keyLock);
    return {'ok': true};
  }
  var fc = (int.tryParse(await _store.read(key: _keyFail) ?? '0') ?? 0) + 1;
  await _store.write(key: _keyFail, value: fc.toString());
  if (fc >= _maxFails) {
    final until = DateTime.now().millisecondsSinceEpoch + _lockMs * (1 << (fc - _maxFails).clamp(0, 4));
    await _store.write(key: _keyLock, value: until.toString());
    return {'ok': false, 'error': 'locked', 'unlockAt': until};
  }
  return {'ok': false, 'error': 'wrong', 'attemptsLeft': _maxFails - fc};
}

Future<void> clearPasscode() async {
  await _store.delete(key: _keyHash);
  await _store.write(key: 'lendiq_biometric_enabled', value: 'false');
  await _store.delete(key: _keyFail);
  await _store.delete(key: _keyLock);
}
```

### 11.2 EMI calculator (Custom Function)
```dart
double computeEmi(double principal, int termMonths, double rateAnnualPct) {
  if (termMonths <= 0) return 0;
  final r = rateAnnualPct / 1200.0;
  if (r == 0) return principal / termMonths;
  final pow = (1 + r);
  double p = 1;
  for (int i = 0; i < termMonths; i++) p *= pow;
  return (principal * r * p) / (p - 1);
}
```

### 11.3 PDF download (Custom Action)
```dart
import 'package:url_launcher/url_launcher.dart';
Future<void> openPdf(String pathWithToken) async {
  final base = FFAppState().apiBaseUrl;          // e.g. https://your-host
  final uri  = Uri.parse('$base$pathWithToken'); // path like /api/audit/summary.pdf?months=3&year=2026&token=xxx
  await launchUrl(uri, mode: LaunchMode.externalApplication);
}
```

### 11.4 Biometric unlock (Custom Action)
```dart
import 'package:local_auth/local_auth.dart';
Future<bool> promptBiometric() async {
  final auth = LocalAuthentication();
  final has = await auth.canCheckBiometrics && await auth.isDeviceSupported();
  if (!has) return false;
  return auth.authenticate(
    localizedReason: 'Unlock LendIQ',
    options: const AuthenticationOptions(biometricOnly: false, stickyAuth: true),
  );
}
```

### 11.5 Markdown bubble (Custom Widget snippet)
Use `flutter_markdown` package → the bubble is a simple `MarkdownBody(data: text, styleSheet: ...)`.

---

## 12. Localization (FlutterFlow → Settings → Languages)

Enable 6 languages. String keys (add via FF Localization or a Google Sheet import):
- `dashboard`, `requests`, `loans`, `clients`, `profile`, `welcomeBack`, `signIn`, `sendOtp`, `verifyAndContinue`, `addClient`, `saveClient`, `newLoan`, `approveAndDisburse`, `fundLater`, `reject`, `loanTrack`, `markPaid`, `reschedule`, `undo`, `noNotifications`, `clearAll`, `markAllRead`, `enterPasscode`, `createPasscode`, `confirmPasscode`, `forgotPasscode`, `biometricPrompt`, `logout`, `language`, `subscription`, `appearance`, `security`, `assistant`, `audit`, `help`, `total_funded`, `inflow`, `outflow`, `overdue`, `onTrack`, `atRisk`, `completed`, `readyToFund`, `awaitingReview`, `funded`, `rejected`.

Fill the Hindi / Tamil / Telugu / Kannada / Malayalam translations (existing JSON lives in the React Native app's `/app/frontend/src/i18n.tsx` — it can be exported to a spreadsheet for FlutterFlow).

---

## 13. Theme switching implementation (FlutterFlow)

1. Enable Dark mode in Theme Settings (both palette values populated per §2.1).
2. Add a Custom Function `applyThemeMode(String mode)` that sets `FFAppState.themeMode` + writes Secure Storage + calls `setState(...)`.
3. Wrap app (App-level) with a listener: whenever `themeMode` changes, update `MaterialApp.themeMode` accordingly.
4. The Appearance screen's 3 radio rows call `applyThemeMode('system' | 'light' | 'dark')`.

---

## 14. Firebase / Supabase alternative (only if you want to drop MongoDB)

Not recommended (you lose the PDF/AI backend), but if you insist:

| Current collection      | Firestore collection name | Equivalent fields                        |
|--------------------------|---------------------------|------------------------------------------|
| users                    | users                     | user_id, name, mobile, subscription_tier |
| clients                  | clients                   | client_id, name, mobile, aadhaar, pan, address, risk_color, cibil_score |
| applications             | applications              | all LoanApplication fields               |
| loans                    | loans                     | all Loan fields (repayment_schedule as array of maps) |
| transactions             | transactions              | type, amount, date, related_loan, related_client |
| notifications            | notifications             | user_id, title, body, type, read, created_at |

If you migrate, re-implement §§ 13–14 (audit-PDF, bank-statement analysis, AI assistant) on Firebase **Cloud Functions** — substantial work.

---

## 15. Testing Checklist (before releasing)

- ✅ Login with seeded **9876543210** OTP works end-to-end
- ✅ Create passcode flow → re-enter → confirm saves hash
- ✅ Enter wrong passcode 5× → 30-second lockout screen
- ✅ Biometric toggle (native only) enables fingerprint fallback
- ✅ Add a client with KYC (valid Aadhaar + PAN) saves
- ✅ New Loan → analyze PDF → CIBIL → Approve & Disburse creates loan + appears in Loans tab
- ✅ Application Summary Fund Later → application shows as **READY TO FUND** in Requests
- ✅ Loan Track → Mark paid on current month reflects instantly; Undo rolls back
- ✅ Audit PDF downloads with correct `₹` rendering
- ✅ Notifications: swipe-delete, Mark all read → Clear all → empty state
- ✅ Theme toggle (Light / Dark / System) persists across restarts
- ✅ Locale switcher re-labels tab bar instantly
- ✅ AI Assistant: "Which loans are overdue today?" returns real borrower names

---

## 16. Deployment Notes

- **Backend:** already deployed on Emergent. Use its HTTPS host as your FlutterFlow API Base URL.
- **Frontend (FF):** Test in FlutterFlow's Run mode → then **Download → Android Studio project** → assemble release → publish to Play Store / App Store.
- **Subscription gateway:** You'll still need to integrate Razorpay (mocked in current MVP). FlutterFlow's Razorpay Action plugin is the fastest path.
- **Push notifications:** FlutterFlow → Push Notifications (Firebase Cloud Messaging) — you'd add a backend endpoint later to dispatch EMI due reminders.

---

## 17. Appendix — Visual cheat-sheet (use this in PR reviews)

### Sticky-footer safe-area pattern (applies everywhere)
```
Column:
  Scroll (expanded, contentPadding.bottom = footerHeight + MediaQuery.padding.bottom)
  Container footer (padding.bottom = MediaQuery.padding.bottom + 12)
```

### Status-to-color map (single source of truth)
- on_track → success
- overdue  → danger
- at_risk  → warning
- completed → accent
- defaulted → danger (darker)
- pending (application) → warning
- approved (application, fund-later) → accent
- funded → success
- rejected → danger

---

**End of Build Book.** If anything here is unclear, the original React Native source in `/app/frontend/app/` is 1-to-1 with every screen described above — use it as the visual reference file.

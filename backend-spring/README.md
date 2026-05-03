# LendIQ Spring Boot skeleton

A minimal Spring Boot 3 scaffold that runs **alongside** the existing FastAPI
backend and exposes:

| Method | Path                     | Purpose                            |
|--------|--------------------------|------------------------------------|
| POST   | /api/v1/auth/send-otp    | Generate + store a 6-digit OTP     |
| POST   | /api/v1/auth/verify-otp  | Exchange OTP for a 30-day JWT      |
| GET    | /api/v1/auth/me          | Resolve the JWT → user             |
| GET    | /api/v1/clients          | Sample — list lender’s clients     |
| GET    | /api/v1/loans            | Sample — list lender’s loans       |

It deliberately does **NOT** try to replace the full FastAPI surface — it is a
starting point you can grow module-by-module while the production workload
stays on FastAPI.

## Project layout

```
backend-spring
├── pom.xml
└── src/main
    ├── java/tech/skyno/lendiq
    │   ├── LendiqApplication.java
    │   ├── auth/                 ← OtpService + JwtService
    │   ├── config/               ← JwtAuthenticationFilter
    │   └── controller/           ← AuthController, ClientController, LoanController
    └── resources/
        └── application.properties
```

## Prerequisites

* **JDK 17+** (`java --version`)
* **Maven 3.9+** (`mvn --version`) — or use the bundled Spring Boot wrapper via `./mvnw`
* MongoDB reachable at `${MONGO_URL}` — usually `mongodb://localhost:27017`

## Running locally

```bash
cd /app/backend-spring

# 1. Build
mvn -q -DskipTests package

# 2. Run (reads MONGO_URL from the environment; falls back to localhost)
MONGO_URL="mongodb://localhost:27017" DB_NAME="test_database" \
  mvn -q spring-boot:run
```

Server boots on **`http://localhost:8080`**.  
(The FastAPI backend keeps running on port 8001 in parallel.)

### Sanity check with curl

```bash
# 1. Send OTP
curl -s http://localhost:8080/api/v1/auth/send-otp \
  -H "Content-Type: application/json" \
  -d '{"mobile":"9876543210","purpose":"login"}'
# {"ok":true,"mobile":"9876543210","message":"...","demo_otp":"123456"}

# 2. Verify OTP (use the demo_otp returned above)
curl -s http://localhost:8080/api/v1/auth/verify-otp \
  -H "Content-Type: application/json" \
  -d '{"mobile":"9876543210","otp":"123456"}'
# {"access_token":"eyJ...", "user":{...}, "has_passcode":false}

# 3. Hit a protected endpoint
TOKEN="<access_token from step 2>"
curl -s http://localhost:8080/api/v1/clients -H "Authorization: Bearer $TOKEN"
```

## How to extend

1. Pick an endpoint from the FastAPI `/app/backend/server.py` (e.g. `/dashboard`).
2. Create `service/DashboardService.java` + `controller/DashboardController.java`
   following the patterns in `OtpService` / `LoanController`.
3. Re-use the same Mongo collections (`loans`, `clients`, `notifications`,
   `applications`, `repayments`, `audit_logs`). Field names are already stable.
4. Add an integration test under `src/test/java` using
   `@SpringBootTest` + Testcontainers MongoDB.

## Intentional scope limits

The following are **not** implemented here (on purpose, to keep the scaffold
tight):

* PDF report rendering (FastAPI uses reportlab)
* Emergent LLM / AI Assistant integration
* CIBIL simulation
* Rate-limiter for OTP login attempts (the service has a send-cooldown; a
  per-mobile verify-limiter lives as a TODO in `OtpService`)
* Expo push-notification fanout
* Spring Security (the filter is a thin JWT reader only — swap in Spring
  Security if you want role-based access)

## Why a skeleton and not a full migration?

The existing FastAPI server is ~4,200 LOC with PDF generation, AI integration,
statement analysis, risk classification and audit ledger. Porting all of it in
one sitting guarantees regressions. Running Spring next to FastAPI lets you
move one module at a time and delete the Python side only once the Java side
has reached parity for that module.

# BenefitsGraph

**Live demo:** <https://bella.taile86535.ts.net> — landing page, one-click guest sandbox, and an interactive API explorer at [`/docs`](https://bella.taile86535.ts.net/docs).

A backend service that adjudicates employee health insurance claims against a versioned, per-employer policy rules engine — deductibles, co-pay, waiting periods, annual and sub-limits — with idempotent claim submission, a full audit trail, and integration against two independent mock upstream services (insurer + provider) with deliberately different schemas.

## Tech stack

- **Node.js + TypeScript + Express**
- **PostgreSQL** — employees, policies (versioned rules as JSONB), claims, append-only audit log
- **Redis** — idempotency-key locking/caching, fixed-window rate limiting
- **Docker Compose** — API, Postgres, Redis, and two standalone mock upstream services
- **Vitest + Supertest** — unit tests for the rules engine, integration tests for the API
- **Zod** — request validation

## Architecture

```
Client → Express API ──┬──▶ PostgreSQL (employees, policies, claims, audit_log)
                        ├──▶ Redis (idempotency keys, rate limiting)
                        ├──▶ mock-insurer service  (policy status, different schema)
                        └──▶ mock-provider service (provider network verification)
```

The rules engine (`src/rules/evaluator.ts`) is a pure function: policy rules in, adjudication result out. It's deliberately kept separate from HTTP/DB concerns so it can be unit tested without any infrastructure and so a rule change never risks touching request handling. Policies are versioned rows in Postgres (`policies.rules` JSONB), so adjudication logic for an existing employer's plan can change without a code deploy.

Claim submission requires an `Idempotency-Key` header. The key is used to acquire a short-lived Redis lock (rejecting concurrent duplicates with `409`) and to cache the response so retries replay the original result instead of double-adjudicating — this matters because claim submission has a real financial side effect (an approved amount), and network retries are common in production.

Two separate mock services (`mock-insurer`, `mock-provider`) stand in for real third-party integrations, each with its own field-naming convention (snake_case, different enums) to simulate integrating genuinely independent data sources rather than one convenient internal API.

This stack was chosen over a single-service design because it's what the target role's day-to-day actually looks like: a low-latency API with request validation, a scalable data layer (Postgres + Redis), and integration across multiple external systems — not a demo trick.

## Key features

- Deterministic, versioned policy rules engine (deductible → co-pay → sub-limit → annual-limit, in order) producing machine-readable reason codes (`WAITING_PERIOD_NOT_MET`, `ANNUAL_LIMIT_CAPPED`, etc.)
- Idempotent claim submission via `Idempotency-Key` with Redis-backed locking and response replay
- Append-only audit log per claim, queryable via `/audit/claims/:claimId`
- Redis-backed fixed-window rate limiting (works across horizontally scaled instances, not per-process)
- Integration against two independent mock upstream services with differing schemas
- 3 seeded employer policies with different rule shapes (deductible/co-pay plan, zero-cost-share premium plan, tightly capped basic plan)
- One-click **guest API keys** (`POST /auth/guest`) — API-key auth with per-account data isolation, no signup or password
- **Ephemeral sandboxes**: each key and all its data auto-prune 48h after last use (background sweeper), so the demo stays clean and holds no long-lived PII
- Polished landing page plus an interactive Swagger UI at `/docs` with pre-filled request examples

## Authentication & sandboxes

Protected endpoints (`/employees`, `/claims`, `/audit`) require an API key sent as an `X-API-Key` header. `POST /auth/guest` mints an ephemeral key with **no signup and no password** — each key is an isolated sandbox, so two callers can enrol the same `externalId` without colliding. Keys and all their data are automatically pruned 48 hours after last use. `GET /policies` and `POST /auth/guest` are open.

> The demo enforces the key at the application layer (`src/middleware/apiKey.ts`) — there is no > separate gateway password, so the access-control logic is visible in the codebase. Keys are stored > only as SHA-256 hashes, never in plaintext.

## Setup / run

### With Docker Compose (full stack)

```bash
docker compose up --build
# API on :3000, mock-insurer on :4001, mock-provider on :4002
docker compose exec api node dist/db/migrate.js
docker compose exec api node dist/db/seed.js
```

### Locally

```bash
npm install
cp .env.example .env
# start postgres + redis + mock services however you prefer, or:
docker compose up postgres redis mock-insurer mock-provider

npm run migrate
npm run seed
npm run dev
```

### Tests

```bash
npm test                        # unit tests (rules engine) — no infra required
RUN_INTEGRATION_TESTS=1 npm test   # also runs API integration tests against a live DB/Redis
```

### API docs

See [`openapi.yaml`](./openapi.yaml), or paste it into the [Swagger Editor](https://editor.swagger.io/).

### Example request

```bash
# 1. Get a sandbox key (no signup)
KEY=$(curl -s -X POST http://localhost:3000/auth/guest | jq -r .apiKey)

# 2. Enrol an employee against a seeded policy
curl -X POST http://localhost:3000/employees \
  -H "X-API-Key: $KEY" -H "Content-Type: application/json" \
  -d '{"externalId":"EMP-1001","fullName":"Ada Lovelace","employerName":"Contoso Labs","planName":"Premium"}'

# 3. Submit a claim (denied WAITING_PERIOD_NOT_MET right after enrolment - the engine working)
curl -X POST http://localhost:3000/claims \
  -H "X-API-Key: $KEY" -H "Content-Type: application/json" \
  -H "Idempotency-Key: $(uuidgen)" \
  -d '{"employeeExternalId":"EMP-1001","claimType":"opd","billedAmountPaise":250000}'
```

## Stretch goals (not yet built)

- Load test (k6 or autocannon) with p50/p95/p99 latency results under concurrent claim submission, published in this README
- Webhook notification on claim status transitions

## Why I built this

I built this while applying for a backend role at [Plum](https://plumhq.com), an employee health benefits platform. Rather than a generic CRUD demo, I wanted something that reflects the actual shape of that problem space — policy rules that vary per employer, financial correctness under retries (idempotency), and stitching together data from more than one system of record.

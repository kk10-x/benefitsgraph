import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { randomUUID } from "node:crypto";
import request from "supertest";
import { createApp } from "../src/app.js";
import { pool } from "../src/db/pool.js";

// Requires postgres + redis reachable via DATABASE_URL / REDIS_URL (see docker-compose.yml)
// and the schema migrated + seeded: `npm run migrate && npm run seed`.
const RUN_INTEGRATION = process.env.RUN_INTEGRATION_TESTS === "1";

describe.skipIf(!RUN_INTEGRATION)("claims API", () => {
  const app = createApp();
  const externalId = `test-emp-${randomUUID()}`;
  let apiKey: string;

  beforeAll(async () => {
    // Mint an ephemeral guest sandbox and enrol a test employee into it.
    const guest = await request(app).post("/auth/guest").expect(201);
    apiKey = guest.body.apiKey;

    await request(app)
      .post("/employees")
      .set("X-API-Key", apiKey)
      .send({
        externalId,
        fullName: "Test Employee",
        employerName: "Contoso Labs",
        planName: "Premium",
      })
      .expect(201);
  });

  afterAll(async () => {
    await pool.end();
  });

  it("rejects protected routes without an API key", async () => {
    await request(app)
      .post("/claims")
      .set("Idempotency-Key", randomUUID())
      .send({ employeeExternalId: externalId, claimType: "opd", billedAmountPaise: 5_000_00 })
      .expect(401);
  });

  it("submits and adjudicates a claim", async () => {
    const res = await request(app)
      .post("/claims")
      .set("X-API-Key", apiKey)
      .set("Idempotency-Key", randomUUID())
      .send({ employeeExternalId: externalId, claimType: "opd", billedAmountPaise: 5_000_00 })
      .expect(201);

    expect(["approved", "partial", "denied"]).toContain(res.body.status);
  });

  it("replays the cached response for a duplicate idempotency key", async () => {
    const key = randomUUID();
    const first = await request(app)
      .post("/claims")
      .set("X-API-Key", apiKey)
      .set("Idempotency-Key", key)
      .send({ employeeExternalId: externalId, claimType: "opd", billedAmountPaise: 1_000_00 })
      .expect(201);

    const second = await request(app)
      .post("/claims")
      .set("X-API-Key", apiKey)
      .set("Idempotency-Key", key)
      .send({ employeeExternalId: externalId, claimType: "opd", billedAmountPaise: 1_000_00 })
      .expect(201);

    expect(second.body.id).toBe(first.body.id);
  });

  it("isolates sandboxes — another key cannot see this employee", async () => {
    const other = await request(app).post("/auth/guest").expect(201);
    await request(app)
      .get(`/employees/${externalId}`)
      .set("X-API-Key", other.body.apiKey)
      .expect(404);
  });

  it("rejects a claim submission without an Idempotency-Key header", async () => {
    await request(app)
      .post("/claims")
      .set("X-API-Key", apiKey)
      .send({ employeeExternalId: externalId, claimType: "opd", billedAmountPaise: 1_000_00 })
      .expect(400);
  });
});

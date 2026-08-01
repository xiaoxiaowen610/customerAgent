import { createRequire } from "node:module";
import { Test } from "@nestjs/testing";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const require = createRequire(import.meta.url);
const { AppModule } = require("../dist/app.module.js");
const { configureApp } = require("../dist/app.setup.js");
const { PrismaService } = require("../dist/prisma/prisma.service.js");

describe("FinServe core journey (PostgreSQL)", () => {
  let app;
  let prisma;
  let userToken;
  let agentToken;
  const password = process.env.DEMO_PASSWORD ?? "";

  beforeAll(async () => {
    if (!process.env.DATABASE_URL || !password) throw new Error("DATABASE_URL and DEMO_PASSWORD are required");
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    configureApp(app);
    await app.init();
    prisma = app.get(PrismaService);
    userToken = await login("user@finserve.dev");
    agentToken = await login("agent@finserve.dev");
  });

  afterAll(async () => app?.close());

  async function login(email) {
    const response = await request(app.getHttpServer()).post("/api/auth/login").send({ email, password }).expect(201);
    return response.body.token;
  }

  it("reports liveness and database readiness", async () => {
    await request(app.getHttpServer()).get("/api/health/live").expect(200).expect(({ body }) => expect(body.status).toBe("ok"));
    await request(app.getHttpServer()).get("/api/health/ready").expect(200).expect(({ body }) => expect(body.database).toBe("up"));
  });

  it("keeps seed idempotent", async () => {
    expect(await prisma.ticket.count({ where: { ticketNo: "FS-260731-1032" } })).toBe(1);
  });

  it("streams a grounded tool result with request lineage", async () => {
    const conversation = await request(app.getHttpServer()).post("/api/conversations").set("Authorization", `Bearer ${userToken}`).expect(201);
    const requestId = `req_integration_${Date.now()}`;
    const response = await request(app.getHttpServer())
      .post(`/api/conversations/${conversation.body.id}/messages`)
      .set("Authorization", `Bearer ${userToken}`)
      .set("x-request-id", requestId)
      .send({ content: "帮我查一下借款审核进度" })
      .expect(201);
    expect(response.text).toContain("event: tool");
    expect(response.text).toContain("queryLoanStatus");
    expect(response.text).toContain("审核中");
    expect(response.text).toContain("event: done");
    const run = await prisma.aiRun.findFirstOrThrow({ where: { requestId }, include: { toolCalls: true } });
    expect(run.toolCalls).toHaveLength(1);
    expect(run.toolCalls[0].requestId).toBe(requestId);
  });

  it("transfers to an agent, records lineage and enforces ticket transitions", async () => {
    const conversation = await request(app.getHttpServer()).post("/api/conversations").set("Authorization", `Bearer ${userToken}`).expect(201);
    const requestId = `req_transfer_${Date.now()}`;
    const stream = await request(app.getHttpServer())
      .post(`/api/conversations/${conversation.body.id}/messages`)
      .set("Authorization", `Bearer ${userToken}`)
      .set("x-request-id", requestId)
      .send({ content: "我要转人工" })
      .expect(201);
    const ticketId = stream.text.match(/"ticketId":"([^"]+)"/)?.[1];
    expect(ticketId).toBeTruthy();
    const detail = await request(app.getHttpServer()).get(`/api/admin/tickets/${ticketId}`).set("Authorization", `Bearer ${agentToken}`).expect(200);
    expect(detail.body.events.some((event) => event.payload?.requestId === requestId)).toBe(true);

    await request(app.getHttpServer())
      .post(`/api/admin/tickets/${ticketId}/replies`)
      .set("Authorization", `Bearer ${agentToken}`)
      .send({ content: "已接单，正在核验。", nextStatus: "PROCESSING" })
      .expect(201);
    await request(app.getHttpServer())
      .patch(`/api/admin/tickets/${ticketId}/status`)
      .set("Authorization", `Bearer ${agentToken}`)
      .send({ status: "CLOSED" })
      .expect(400);
    const unchanged = await prisma.ticket.findUniqueOrThrow({ where: { id: ticketId } });
    expect(unchanged.status).toBe("PROCESSING");
  });

  it("blocks cross-user conversation access and returns pagination metadata", async () => {
    const conversation = await request(app.getHttpServer()).post("/api/conversations").set("Authorization", `Bearer ${userToken}`).expect(201);
    const otherToken = await login("other@finserve.dev");
    await request(app.getHttpServer()).get(`/api/conversations/${conversation.body.id}/messages`).set("Authorization", `Bearer ${otherToken}`).expect(403);
    const page = await request(app.getHttpServer()).get("/api/admin/tickets?page=1&pageSize=1").set("Authorization", `Bearer ${agentToken}`).expect(200);
    expect(page.body.items).toHaveLength(1);
    expect(page.body).toMatchObject({ page: 1, pageSize: 1 });
    expect(page.body.total).toBeGreaterThanOrEqual(1);
  });
});

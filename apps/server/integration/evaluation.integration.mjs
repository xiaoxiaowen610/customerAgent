import { createRequire } from "node:module";
import { Test } from "@nestjs/testing";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const require = createRequire(import.meta.url);
const { AppModule } = require("../dist/app.module.js");
const { configureApp } = require("../dist/app.setup.js");
const { PrismaService } = require("../dist/prisma/prisma.service.js");

describe("B04 evaluation and governance (PostgreSQL)", () => {
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

  it("runs the seeded golden suite and exposes regression metrics", async () => {
    const cases = await request(app.getHttpServer())
      .get("/api/admin/evaluation/cases")
      .set("Authorization", `Bearer ${agentToken}`)
      .expect(200);
    expect(cases.body.length).toBeGreaterThanOrEqual(3);

    const suite = await request(app.getHttpServer())
      .post("/api/admin/evaluation/run-suite")
      .set("Authorization", `Bearer ${agentToken}`)
      .send({})
      .expect(201);
    expect(suite.body.total).toBeGreaterThanOrEqual(3);
    expect(suite.body.passed).toBe(suite.body.total);
    expect(suite.body.passRate).toBe(1);

    const dashboard = await request(app.getHttpServer())
      .get("/api/admin/evaluation/dashboard")
      .set("Authorization", `Bearer ${agentToken}`)
      .expect(200);
    expect(dashboard.body.metrics.caseRunCount).toBeGreaterThanOrEqual(3);
    expect(dashboard.body.metrics.regressionPassRate).toBe(1);
  });

  it("automatically evaluates successful runs and queues escalations for review", async () => {
    const conversation = await request(app.getHttpServer())
      .post("/api/conversations")
      .set("Authorization", `Bearer ${userToken}`)
      .expect(201);
    const requestId = `req_b04_success_${Date.now()}`;
    await request(app.getHttpServer())
      .post(`/api/conversations/${conversation.body.id}/messages`)
      .set("Authorization", `Bearer ${userToken}`)
      .set("x-request-id", requestId)
      .send({ content: "帮我查一下贷款审核进度" })
      .expect(201);
    const successfulRun = await prisma.aiRun.findFirstOrThrow({ where: { requestId }, include: { evaluation: true } });
    expect(successfulRun.status).toBe("COMPLETED");
    expect(successfulRun.evaluation?.passed).toBe(true);

    const transferConversation = await request(app.getHttpServer())
      .post("/api/conversations")
      .set("Authorization", `Bearer ${userToken}`)
      .expect(201);
    const transferRequestId = `req_b04_review_${Date.now()}`;
    await request(app.getHttpServer())
      .post(`/api/conversations/${transferConversation.body.id}/messages`)
      .set("Authorization", `Bearer ${userToken}`)
      .set("x-request-id", transferRequestId)
      .send({ content: "我要投诉并转人工客服" })
      .expect(201);
    const escalatedRun = await prisma.aiRun.findFirstOrThrow({
      where: { requestId: transferRequestId },
      include: { evaluation: true, reviewTask: true }
    });
    expect(escalatedRun.status).toBe("ESCALATED");
    expect(escalatedRun.evaluation).toBeTruthy();
    expect(escalatedRun.reviewTask?.status).toBe("PENDING");
  });

  it("creates, activates and archives prompt versions", async () => {
    const created = await request(app.getHttpServer())
      .post("/api/admin/evaluation/prompts")
      .set("Authorization", `Bearer ${agentToken}`)
      .send({
        name: "customer-service",
        content: "你是受控消费金融客服 Agent。必须选择白名单工具，不得编造业务事实，遇到投诉或未知问题必须转人工。"
      })
      .expect(201);
    expect(created.body.status).toBe("DRAFT");

    const activated = await request(app.getHttpServer())
      .post(`/api/admin/evaluation/prompts/${created.body.id}/activate`)
      .set("Authorization", `Bearer ${agentToken}`)
      .send({})
      .expect(201);
    expect(activated.body.status).toBe("ACTIVE");

    const prompts = await request(app.getHttpServer())
      .get("/api/admin/evaluation/prompts")
      .set("Authorization", `Bearer ${agentToken}`)
      .expect(200);
    expect(prompts.body.filter((prompt) => prompt.status === "ACTIVE")).toHaveLength(1);
  });
});

# FinServe AI

消费金融智能客服与工单协同平台 MVP。项目重点展示：流式 AI 会话、工具事实查询、人工兜底、工单状态机、AI/tool 审计轨迹。

## 技术栈

- Web：Next.js、React、TypeScript、CSS variables
- Server：NestJS、Prisma、PostgreSQL
- AI 流程：显式 Orchestrator、结构化意图识别、白名单 Tool Registry
- 部署：Docker Compose

## 演示账号

| 角色 | 邮箱 | 密码 |
|---|---|---|
| 用户 | `user@finserve.dev` | `Password123!` |
| 客服 | `agent@finserve.dev` | `Password123!` |

## 本地启动

```bash
pnpm install
cp .env.example .env
docker compose up -d postgres
pnpm db:generate
pnpm --filter @finserve/server prisma:push
pnpm db:seed
pnpm dev
```

- Web: http://localhost:3000
- API: http://localhost:3001/api
- Swagger: http://localhost:3001/docs

## Docker Compose 启动

```bash
docker compose up --build
```

Compose 会启动 PostgreSQL、Server、Web，并用 `prisma db push` 初始化演示库。

## 核心流程

1. 用户登录并进入 `/chat`。
2. 发送“帮我查一下借款审核进度”，后端识别 `loan_status`，调用 `queryLoanStatus`，流式返回业务事实。
3. 发送“为什么还款失败”，后端识别 `repayment_failed`，调用 `queryRepaymentRecord`。
4. 发送“我要转人工”，后端创建幂等工单，并记录 AI run、tool call、ticket event。
5. 客服登录进入 `/admin/tickets`，查看原始会话、AI 判断、工具调用和审计事件，回复并更新状态。

## API 摘要

用户端：

- `POST /api/auth/login`
- `GET /api/auth/me`
- `POST /api/conversations`
- `GET /api/conversations/:id/messages`
- `POST /api/conversations/:id/messages`
- `GET /api/tickets`
- `GET /api/tickets/:id`

客服端：

- `GET /api/admin/tickets`
- `GET /api/admin/tickets/:id`
- `POST /api/admin/tickets/:id/replies`
- `PATCH /api/admin/tickets/:id/status`

## 验证

```bash
pnpm build
pnpm test
```

测试覆盖：工单状态机、意图结构校验、低置信度转人工、幂等 key、AI 编排主流程。

## 面试讲法

- 模型不直接查数据库，只能调用白名单工具。
- 业务事实、AI 判断、人工结论分层记录。
- 转人工写入事务：Ticket、TicketEvent、Conversation 状态、AI Run 状态保持一致。
- 重复转人工通过 `idempotencyKey` 返回已有工单。
- MVP 不上 LangGraph，先用显式流程保证可解释和可调试。

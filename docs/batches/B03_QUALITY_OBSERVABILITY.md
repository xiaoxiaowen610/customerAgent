# B03：测试与可观测性任务和测试计划

> 分支：`agent/b03-quality-observability`
>
> 基线：`agent/b02-agent-runtime`
>
> 状态：已完成（真实 PostgreSQL 集成测试与浏览器 E2E 交由 GitHub Actions 干净环境验收）

## 1. 目标

将项目从“单元测试通过”提升到“核心链路可以自动验收”，并把用户擅长的金融前端稳定性治理经验映射为可见的 AI 全链路指标。

## 2. 实现任务

- [x] 增加健康检查接口，区分进程存活与数据库就绪。
- [x] 增加真实 PostgreSQL 集成测试入口。
- [x] 使用 Supertest 覆盖登录、会话、工具查询、转人工和工单流转。
- [x] 抽离并测试前端 SSE 解析器。
- [x] 增加 Playwright 用户端与客服端 E2E。
- [x] CI 增加 PostgreSQL service、migration、seed、integration 和 E2E job。
- [x] 为 AiRun、ToolCallRecord、TicketEvent 关联 Request ID。
- [x] 增加管理员指标接口：请求量、完成率、转人工率、工具成功率、平均/P95 延迟。
- [x] 增加客服指标看板与运行轨迹入口。
- [x] 工单列表增加服务端分页、状态筛选和搜索。
- [x] 核心服务增加结构化日志字段并确保密钥、Token 不入日志。

## 3. 测试用例

| ID | 层级 | 场景 | 预期结果 |
|---|---|---|---|
| B03-INT-001 | 集成 | 用户登录并创建会话 | 返回有效身份与会话 |
| B03-INT-002 | 集成 | 查询借款状态 | SSE 返回工具事件、事实回复和 done |
| B03-INT-003 | 集成 | 用户要求人工 | 创建一个工单并记录事件 |
| B03-INT-004 | 集成 | 客服回复并完成合法状态流转 | 消息、状态和事件原子更新 |
| B03-INT-005 | 集成 | 非法状态跳转 | 返回业务错误且状态不改变 |
| B03-E2E-001 | 浏览器 | 用户登录、查询业务事实 | 页面显示流式答案与工具轨迹 |
| B03-E2E-002 | 浏览器 | 用户转人工、客服处理 | 用户和客服页面都能看到完整闭环 |
| B03-OBS-001 | 单元 | 混合成功/失败运行数据 | 指标分母、比率、平均和 P95 正确 |
| B03-OBS-002 | 集成 | 从 HTTP 请求触发 Tool Call 和工单 | 相同 Request ID 可贯穿查询 |
| B03-LST-001 | 集成 | 请求第 2 页工单 | 返回正确分页元数据且无重复项 |
| B03-HLT-001 | 集成 | 数据库可用/不可用 | readiness 分别返回成功/失败 |

## 4. 验证命令

```bash
pnpm lint
pnpm test
pnpm test:integration
pnpm build
pnpm test:e2e
```

## 5. 完成定义

- CI 能在干净环境创建数据库并跑通核心闭环。
- 指标数据来自真实审计表，不使用前端写死数字。
- Request ID 可以关联一次请求中的 AI、工具与工单数据。
- 测试失败会阻止质量门禁通过。

## 6. 非本批范围

- Prometheus/Grafana 集群和 OpenTelemetry Collector。
- 大规模压测或生产 SLA 承诺。
- 客服绩效和复杂组织权限。

## 7. 实际交付与验证记录

- 新增 `/api/health/live` 与 `/api/health/ready`，readiness 会真实执行数据库查询；单元测试同时覆盖可用和不可用分支。
- 新增 PostgreSQL + Supertest 集成套件，覆盖身份、事实查询 SSE、Request ID 链路、转人工、客服回复、非法流转、IDOR、分页和 seed 幂等。
- 新增 Playwright 核心旅程，覆盖用户查询、转人工、客服检索工单与回复。
- 指标接口从最近 500 次 `AiRun` 与 1000 次工具记录计算，不使用前端静态数字；看板展示完成率、转人工率、工具成功率、平均/P95 延迟和开放工单。
- `pnpm lint`：通过。
- `pnpm test`：Server 39 个、Web 3 个测试通过。
- `pnpm build`：Server 与 Web 生产构建通过。
- `pnpm exec playwright test --list`：成功发现 Chromium 核心旅程。
- 当前本地容器没有 PostgreSQL 服务与 Chromium，因此未伪造 `pnpm test:integration`/`pnpm test:e2e` 结果；两者由新增 GitHub Actions `integration-e2e` job 在迁移和连续两次 seed 后执行。

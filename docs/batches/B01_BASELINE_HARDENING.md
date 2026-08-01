# B01：可信基线加固任务与测试计划

> 分支：`agent/b01-hardening`
>
> 状态：已完成

## 1. 目标

消除会直接损害面试可信度的安全和工程问题，建立后续批次可持续迭代的数据库、配置和 CI 基线。

## 2. 实现任务

- [x] 移除浏览器模型 API Key、Base URL 和 Model 配置。
- [x] 模型配置只从服务端环境变量读取，生产环境缺少关键配置时快速失败。
- [x] 修复手工创建工单时未校验 `conversationId` 所有权的问题。
- [x] 限制普通客服通过会话接口任意读取不相关会话。
- [x] JWT 生产环境禁止使用默认密钥。
- [x] 增加统一错误响应，返回 `code`、`message`、`requestId`。
- [x] 提交初始 Prisma migration，Compose 改为 `migrate deploy`。
- [x] 将 seed 改为可重复执行，避免每次启动生成重复会话和工单。
- [x] Docker 构建使用锁文件和 frozen install。
- [x] 新增 GitHub Actions，执行 generate、lint、unit test、build。
- [x] 补充权限、配置和统一错误相关单元测试；seed 重复执行由 B03 数据库集成测试继续验证。

## 3. 测试用例

| ID | 层级 | 场景 | 预期结果 |
|---|---|---|---|
| B01-SEC-001 | 单元 | 用户用他人 `conversationId` 创建工单 | 返回禁止访问，不创建工单 |
| B01-SEC-002 | 单元 | 用户用不存在的 `conversationId` 创建工单 | 返回会话不存在 |
| B01-SEC-003 | 单元 | 客服通过普通会话接口读取任意会话 | 被拒绝，客服只能通过工单详情查看关联会话 |
| B01-CFG-001 | 单元 | 生产环境未配置 JWT_SECRET | 应用配置快速失败 |
| B01-CFG-002 | 静态 | Web 源码搜索 `apiKey`/模型 Base URL 输入 | 不存在浏览器模型密钥输入与持久化 |
| B01-DB-001 | 数据库 | 在空库执行 migration | 所有表、索引和约束创建成功 |
| B01-DB-002 | 数据库 | 连续执行两次 seed | 演示用户、会话和工单数量不重复增长 |
| B01-API-001 | 单元 | API 抛出业务异常 | 返回统一错误结构并包含 Request ID |
| B01-CI-001 | CI | 推送批次分支 | generate、lint、test、build 全部执行 |
| B01-DOC-001 | 文档 | README 与代码配置对照 | 不再要求用户在浏览器输入模型密钥 |

## 4. 验证命令

```bash
pnpm db:generate
pnpm lint
pnpm test
pnpm build
```

数据库与 CI 验证在具备 PostgreSQL/Docker 或 GitHub Actions 的环境执行。

## 5. 完成定义

- 所有实现任务完成并同步勾选。
- 本地 lint、unit、build 通过。
- migration 文件进入版本控制。
- 安全测试能覆盖越权入口。
- 分支提交并推送，不修改 `main`。

## 6. 非本批范围

- 原生 LLM `tool_calls`。
- token 级模型流式响应。
- 指标看板和 Playwright E2E。
- AI 离线评估与演示材料。

## 7. 执行结果

- `pnpm db:generate`：通过。
- `pnpm lint`：通过。
- `pnpm test`：通过，新增后端安全与配置测试后共 19 个测试。
- `pnpm build`：通过。
- 静态密钥检查：Web 与 shared-types 中不再存在浏览器 `llmConfig`、DeepSeek Key 输入或对应 localStorage key。
- 当前执行环境没有 Docker/PostgreSQL；migration 与 seed 的真实数据库验证纳入 B03 CI integration job，未虚构本地执行结果。

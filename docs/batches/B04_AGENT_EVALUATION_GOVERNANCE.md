# B04 Agent Evaluation & Governance

## 目标

将 B01–B03 已完成的安全基线、Agent Runtime、质量门禁和可观测性扩展为可持续治理闭环：每次 Agent 运行可评分、低质量运行可人工复核、Prompt 可版本化、Golden Dataset 可回归。

## 功能范围

### B04-2 后端治理能力

- `PromptVersion`：Prompt 草稿、激活、归档与单一活跃版本。
- `EvaluationCase`：Golden Dataset 用例和期望路由。
- `EvaluationCaseRun`：离线回归结果与 Prompt 版本关联。
- `AgentEvaluation`：在线运行的正确性、工具、延迟、安全和综合评分。
- `AgentReviewTask`：低分、失败和转人工运行的 Human Review 队列。
- 管理 API：质量总览、用例、回归、Prompt、运行评分和复核决策。

### B04-3 Agent Runtime 接入

- 确定性和 LLM 模式完成后自动评估。
- 失败、取消、转人工均生成对应评分。
- 低于 80 分或发生转人工时自动创建复核任务。
- Evaluation 为旁路能力，失败不会中断用户响应。
- 激活的 Prompt 版本真实进入 LLM 工具规划和回答生成请求。

### B04-4 管理端

路由：`/admin/evaluation`

- 在线评估总量、通过率、平均质量分。
- 工具使用分、安全分、待复核数。
- Golden Suite 一键执行与回归通过率。
- Prompt 草稿创建、版本激活和旧版本归档。
- Human Review 通过/拒绝。
- 最近在线运行评分和回归明细。

### B04-5 测试

- 单元测试：评分边界、低分入队、转人工入队、Golden Suite。
- PostgreSQL 集成测试：Seed、回归、在线自动评分、Prompt 激活和复核队列。
- Playwright E2E：客服登录、质量治理页面、运行回归、创建并激活 Prompt。

## 评分规则

| 维度 | 权重 |
|---|---:|
| 正确性 | 40% |
| 工具使用 | 30% |
| 延迟 | 15% |
| 安全 | 15% |

综合分达到 80 分视为通过。转人工即使评分通过，也会进入人工复核，用于形成 Human-in-the-loop 数据闭环。

## 验收标准

- Prisma migration 可重复部署。
- Seed 可重复执行并只保留一个活跃 Prompt。
- `pnpm lint`、`pnpm test`、`pnpm build` 全部通过。
- PostgreSQL integration 和 Playwright E2E 全部通过。
- B04 PR 仅从 `agent/b04-evaluation-governance` 合并到 `main`。

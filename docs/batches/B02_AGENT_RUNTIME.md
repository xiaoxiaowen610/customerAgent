# B02：Agent 运行时任务与测试计划

> 分支：`agent/b02-agent-runtime`
>
> 基线：`agent/b01-hardening`
>
> 状态：已完成

## 1. 目标

把“结构化意图后由代码固定选工具”升级为可解释、受约束的标准 Tool Calling 运行时，并让 SSE 承载真实模型增量输出。

## 2. 实现任务

- [x] 定义 OpenAI 兼容的工具描述、JSON Schema 和 Tool Call 消息类型。
- [x] 模型返回 `tool_calls` 后校验工具名、参数 JSON 和参数 Schema。
- [x] Tool Registry 增加定义查询、上下文权限、执行超时和统一结果。
- [x] 单轮严格限制为一个 Tool Call，模型最终回答阶段禁用继续调用工具。
- [x] 工具结果作为 `tool` 消息回传模型，再生成最终答案。
- [x] 第二阶段使用 `stream: true`，解析 SSE delta 并实时转发。
- [x] 前端 SSE 解析器处理半包、CRLF、非法 JSON 和尾包。
- [x] 前端支持主动取消；服务端将连接关闭转换为 AbortSignal。
- [x] 模型超时、未知工具、非法参数、无可靠事实统一降级转人工。
- [x] 无服务端模型密钥时保留确定性演示模式。
- [x] AI Run 和 Tool Call 状态在成功、失败、取消、拒绝、转人工时闭合。

## 3. 测试用例

| ID | 层级 | 场景 | 预期结果 |
|---|---|---|---|
| B02-TC-001 | 单元 | 模型返回合法 `queryLoanStatus` Tool Call | 工具执行并把结果回传模型 |
| B02-TC-002 | 单元 | 模型返回未注册工具 | 不执行，记录失败并转人工 |
| B02-TC-003 | 单元 | Tool Call arguments 不是合法 JSON | 不执行，记录参数错误并转人工 |
| B02-TC-004 | 单元 | Tool Call 参数不满足 Schema | 不执行并返回可审计错误 |
| B02-TC-005 | 单元 | 超过最大步骤 | 终止循环并转人工 |
| B02-STR-001 | 单元 | 模型流分多次返回 delta | 按顺序拼接并逐段 emit |
| B02-STR-002 | 单元 | SSE 数据被拆成半包 | 不丢字符、不重复事件 |
| B02-STR-003 | 单元 | SSE 使用 CRLF | 正确识别事件边界 |
| B02-ABT-001 | 单元 | 用户取消请求 | 上游 fetch 被中止，运行状态为取消或降级 |
| B02-FBK-001 | 单元 | 未配置模型密钥 | 使用规则模式完成两个查询与人工兜底 |
| B02-FBK-002 | 单元 | 工具无数据或执行失败 | 不编造答案，创建幂等工单 |

## 4. 验证命令

```bash
pnpm lint
pnpm test
pnpm build
```

## 5. 完成定义

- 标准 `tool_calls → validate → execute → tool result → final answer` 闭环可由测试证明。
- 模型最终回复不是后端收到完整文本后再人工切片。
- 异常路径有测试和审计状态。
- 本批提交只包含 B02 增量并推送独立远程分支。

## 6. 非本批范围

- LangGraph、多 Agent、动态代码执行。
- 任意 SQL、终端命令或用户自定义工具。
- 向量知识库。

## 7. 执行结果

- `pnpm lint`：通过。
- `pnpm test`：通过，Server 34 个测试、Web 3 个测试。
- `pnpm build`：通过。
- Tool Calling 覆盖：合法调用、未注册工具、非法 JSON、非法参数、单轮超限、服务端身份上下文、人工工单工具。
- Streaming 覆盖：真实 `stream: true`、半包、CRLF、尾包、非法 JSON、取消和模型超时。
- 降级覆盖：无模型密钥、工具失败、模型规划失败均不编造事实。

---
name: review
description: 对当前代码改动进行只读、发现优先的工程审查，覆盖正确性、回归、安全、性能、数据一致性和测试缺口。
type: flow
whenToUse: 当用户要求 review、代码审查、检查当前改动、评估提交质量或寻找潜在问题时。
---

只读审查 `$ARGUMENTS`（若为空则审查当前工作区改动）。参数可指定 `staged`、Git ref/range、文件路径或安全、测试、性能、并发等关注点。

Anti-rationalization **ID 释义以 `test-changed` 为 SSOT**（AR-1–AR-8）；本 Skill 只写适用 ID 与结论连动。

## 范围确定

1. 读取适用的 AGENTS.md 和项目开发规则。
2. 解析参数：空=工作区，`staged`=暂存区，ref/range=对应提交，路径=对应文件/目录；纯流程/设计问题且无代码范围时声明为非 diff review。
3. 同时检查未暂存、已暂存与 untracked，除非用户限定范围。
4. **Contract resolution**（同会话、不落盘；通例同 `test-changed`）：
   - 优先级：`explicit-handoff` → `user-pinned` → `rebuilt-from-context` → `unavailable`。
   - 重建不编造 Acceptance；无 explicit/user-pinned 不得 `aligned`。`rebuilt` → 最多 `partial`/`rebuilt`；`unavailable` → `no plan`/`unavailable`，仍可做 diff 审查。
5. 阅读调用方、类型、配置、测试与错误处理，不只看 diff 表面。
6. 可用时：`codesearch` 核公共 API 调用方；删除/搬迁可用 `dead_code` 作候选（非删除证明）。不可用则写 unavailable，不得假装已机器分析。
7. **Anti-rationalization**：适用 AR-1, AR-3, AR-4, AR-5, AR-7, AR-8（有测试主张时加 AR-2, AR-6）。`FAIL` → 不得把「无 Findings」暗示可合；无 L1 逐条对照时 alignment 不得 `aligned`；须有证据/范围相关 P2，或缺口写入 Residual risks 且不暗示可合。

## 审查重点

按风险优先：正确性与失败路径；回归/兼容/公共 API；权限与注入/敏感信息/XSS；并发/事务/幂等/缓存/时区/字符集/数据一致；性能（N+1、无界、全表、热路径阻塞）；测试是否覆盖关键性质/边界/失败路径；可维护性与调试残留；相对契约的 Must-have 缺口、Out of scope 扩张、Acceptance 无证据。

## 输出规则

发现在总结之前，按 P0–P3 排序。每条含：严重度与标题、`path:line`、行为影响、证据等级、最小修复、反例或不确定性。

- P0：生产破坏、严重泄露、RCE、不可逆数据丢失。
- P1：合并前必修的功能错误、严重安全或数据一致问题。
- P2：中等边界/性能/错误处理/重要测试缺口。
- P3：可维护性与非关键优化。

无 L1/L2 验证证据时，不得把「无 Findings」写成「验收已满足」。无阻塞问题须写 `No blocking findings`。

## 输出格式

```markdown
## Findings

### P1 — title
`path/to/file.ts:42`

影响：...
证据等级：L1/L2/L3/L4
建议：...

## No blocking findings

## Contract resolution
source: explicit-handoff | user-pinned | rebuilt-from-context | unavailable
confidence: L1/L2/L3/L4
- Goal / Must-have / Out of scope / Acceptance:

## Plan alignment
aligned / partial / rebuilt / no plan / unavailable / not applicable
- Must-have gaps / Out-of-scope expansions / Acceptance without evidence:

## Anti-rationalization
Result: PASS | FAIL
Triggered: none | AR-n, …（释义见 test-changed）

## Tooling
codesearch: used / unavailable — summary
dead_code: used / unavailable / not needed — summary

## Verified areas

## Unverified items

## Residual risks
```

不要修改文件、提交、推送，或把风格偏好伪装成功能缺陷。

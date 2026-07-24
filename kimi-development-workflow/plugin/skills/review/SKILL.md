---
name: review
description: 对当前代码改动进行只读、发现优先的工程审查，覆盖正确性、回归、安全、性能、数据一致性和测试缺口。
type: flow
whenToUse: 当用户要求 review、代码审查、检查当前改动、评估提交质量或寻找潜在问题时。
---

只读审查 `$ARGUMENTS`（若为空则审查当前工作区改动）。参数可指定 `staged`、Git ref/range、文件路径或安全、测试、性能、并发等关注点。

## 范围确定

1. 读取适用的 AGENTS.md 和项目开发规则。
2. 解析参数：空值=工作区改动，`staged`=暂存区，Git ref/range=对应提交，路径=对应文件/目录；若参数是产品/流程完备性问题且无代码范围，声明为流程/设计审查而非 diff review；无法判断时向用户说明。
3. 同时检查未暂存 diff、已暂存 diff 和 untracked 文件，除非用户明确限定范围。
4. 若当前会话已有 `change-plan` 输出或等价计划，提取 Handoff contract（Must-have、Out of scope、Acceptance criteria）；审查时对照实现是否越界或漏做。无 plan 时写「无既有 plan，仅按 diff/调用链审查」。
5. 阅读相关调用方、类型、配置、测试和错误处理，不只审查 diff 表面。
6. 若当前会话可用 `kimi-engineering-tools` 的 MCP 工具：对公共 API、关键调用形态用 `codesearch` 核对调用方；对删除/搬迁模块用 `dead_code` 作候选提示（不是删除证明）。工具不可用时明确写「codesearch/dead_code 不可用，仅静态 diff/调用链审查」，不得假装已做机器分析。

## 审查重点

按风险优先检查：

1. 正确性和失败路径。
2. 行为回归、兼容性和公共 API。
3. 权限边界、路径/命令/SQL 注入、敏感信息和 XSS。
4. 并发、事务、幂等性、缓存、时区、字符集和数据一致性。
5. 性能：N+1、无界结果、全量扫描、重复计算和阻塞热路径。
6. 测试是否覆盖关键性质、边界和失败路径。
7. 可维护性、无关改动、调试残留和错误信息质量。
8. 相对 plan 的范围漂移：Must-have 未完成、Out of scope 被实现、Acceptance 无对应证据。

## 输出规则

发现必须放在总结之前，并按严重度排序：

- P0：立即阻止，生产破坏、严重泄露、远程执行或不可逆数据丢失。
- P1：合并前必须修复，明确功能错误、严重安全或数据一致性问题。
- P2：应当修复，中等影响边界、性能、错误处理或重要测试缺口。
- P3：改进建议，可维护性、命名和非关键优化。

每条发现必须包含：严重度和标题、文件路径及行号、可复现的行为影响、证据等级、最小修复建议，以及最可能的反例或残余不确定性。

## 输出格式

```markdown
## Findings

### P1 — title
`path/to/file.ts:42`

影响：...
证据等级：L1/L2/L3/L4
建议：...

## No blocking findings

## Plan alignment
aligned / partial / no plan / not applicable
- Must-have gaps:
- Out-of-scope expansions:

## Tooling
codesearch: used / unavailable — summary
dead_code: used / unavailable / not needed — summary

## Verified areas

## Unverified items

## Residual risks
```

不要修改文件、运行提交、推送或把风格偏好伪装成功能缺陷。没有阻塞问题时必须明确写 `No blocking findings`。

---
name: review
description: 检查代码改动、找潜在问题、评估能不能合并时使用。主人说「帮我 review 一下」「看看这次改动有没有问题」「这段逻辑对不对」「提交前帮我看看」「有没有坑」时加载。不用于：已经明确的单行修改。
---

只读审查 `$ARGUMENTS`（若为空则审查当前工作区改动）。参数可指定 `staged`、Git ref/range、文件路径或安全、测试、性能、并发等关注点。

## 范围确定

1. 读取适用的 AGENTS.md 和项目开发规则。
2. 解析参数：空=工作区，`staged`=暂存区，ref/range=对应提交，路径=对应文件/目录；纯流程或设计问题且无代码范围时，声明为非 diff review。
3. 同时检查未暂存、已暂存与 untracked，除非主人限定范围。
4. **对照验收依据**：优先读项目内 `.devflow/<slug>.md`；其次是主人本轮明确写下的范围；再次从 diff 意图重建（缺的写 `unknown`）；都没有则只做 diff 审查，不得声称与计划一致。
5. 阅读调用方、类型、配置、测试与错误处理，不只看 diff 表面。
6. 需要时用结构化搜索核实公共 API 调用方；工具不可用时写明「文本搜索」，不假装已做机器分析。

## 审查重点

按风险优先：正确性与失败路径；回归/兼容/公共 API；权限与注入/敏感信息/XSS；并发/事务/幂等/缓存/时区/字符集/数据一致；性能（N+1、无界、全表、热路径阻塞）；测试是否覆盖关键性质/边界/失败路径；可维护性与调试残留；相对验收依据的 Must-have 缺口、Out of scope 扩张、Acceptance 无证据。

## 输出规则

发现在总结之前，按 P0–P3 排序。每条含：严重度与标题、`path:line`、行为影响、证据等级、最小修复、反例或不确定性。

- P0：生产破坏、严重泄露、RCE、不可逆数据丢失。
- P1：合并前必修的功能错误、严重安全或数据一致问题。
- P2：中等边界/性能/错误处理/重要测试缺口。
- P3：可维护性与非关键优化。

无 L1/L2 验证证据时，不得把「无 Findings」写成「验收已满足」。无阻塞问题须写 `No blocking findings`。不得把风格偏好伪装成功能缺陷。

## 输出格式

```markdown
## Findings

### P1 — title
`path/to/file.ts:42`

影响 / 证据等级 / 建议

## Basis
source: explicit-handoff | user-pinned | rebuilt-from-context | unavailable
plan alignment: aligned | partial | rebuilt | no plan | unavailable / not applicable
（Must-have 缺口 / Out of scope 扩张 / 无证据的 Acceptance）

## Unverified
未验证项与原因

## Conclusion
No blocking findings / Findings remain / Blocked
（结案自查：无 L1/L2 证据不得声称验收已满足；看起来合理不算证据；主人说测过了只是口述）
```

不要修改文件、提交或推送。

---
name: review
description: 检查代码改动、找潜在问题、评估能不能合并时使用。用户说「帮我 review 一下」「看看这次改动有没有问题」「这段逻辑对不对」「提交前帮我看看」「有没有坑」时加载。不用于：已经明确的单行修改。
---

只读审查 `$ARGUMENTS`（若为空则审查当前工作区改动）。参数可指定 `staged`、Git ref/range、文件路径或安全、测试、性能、并发等关注点。

## 范围确定

1. 读取适用的 AGENTS.md、项目级 `REVIEW.md`（存在时）和项目开发规则。
2. 解析参数：空=工作区，`staged`=暂存区，ref/range=对应提交，路径=对应文件/目录；纯流程或设计问题且无代码范围时，声明为非 diff review。
3. 同时检查未暂存、已暂存与 untracked，除非用户限定范围。
4. **对照验收依据**：优先读项目内 `.devflow/<slug>.md`；其中有 `Plan:` 指针、或 `.devflow` 不存在但 `docs/plans/` 下有相关计划（Status 为 draft/active）时，以 `docs/plans/<slug>.md` 为准；其次是用户本轮明确写下的范围；再次从 diff 意图重建（缺的写 `unknown`）；都没有则只做 diff 审查，不得声称与计划一致。
5. 阅读调用方、类型、配置、测试与错误处理，不只看 diff 表面。
6. 需要时用文本搜索核实公共 API 调用方，记录搜索范围与 pattern，不假装已做机器分析。

## 深度与收敛

- 风险分级按改动内容，不按任务大小：认证、支付、密钥、迁移、CI workflow、公共 API 与不可逆数据操作按 high 走全量审查（必要时建议 `guard`）；文档、文案、开关后的增量改动按 low 只做必要检查。
- 新增依赖或新抽象时，要求说明「为什么现有实现或平台原生能力不够」；答不上来就列为 finding。这类扩张是最常见的过度设计来源。
- 每条 finding 标注 `introduced` 或 `pre-existing`（改动前就存在）；纯风格与诊断类标 `nit`，默认不计入阻塞项。
- 收敛：记录本次是第几轮；第 3 轮仍未收敛就停止并建议重新审视方案。首轮之后只审新增 diff；同类缺陷报类别与全部实例；已解决的 finding 不重复报。
- 发布前复核每条 finding（重新打开代码确认）；有条件时派独立子代理复核，复核不通过的条目直接丢弃。
- 同一类审查意见反复出现时，改到源头：`AGENTS.md`、`REVIEW.md`、lint 规则或 skill。

## 多轮收敛（Round ≥ 2 或高风险）

单轮低风险审查用上面的流程即可。进入第二轮，或改动为 high 风险时按本协议执行，细则见 `references/convergence-protocol.md`。

- **角色分离**：高风险或多轮时必须派 `reviewer` subagent，只产出 findings 与证据；主会话逐条打开代码核实并写裁决；用户只在确认闸回答。主会话不得同时产出 findings 和写 decision；低风险单轮可一次完成，但要写明未使用独立审计方。
- **每轮状态文件**：`.devflow/<slug>/review-<round>.json`，记录 `round`、`max_rounds`、`findings[]`（id/severity/original_severity/decision/repeat_count/confirmed/verified_fixed）、`baseline_finding_ids`、`structure_comparison`、`context_not_read`、`status_inconsistent`、`manual_stop_count`、`clean_rounds`、`baseline_frozen`。
- **裁决值**：`pending` / `accepted` / `rejected` / `downgraded` / `intentional`；每条 finding 必须有裁决，不能沉默携带。`accepted` 表示承诺修复，任何 accepted 未 `verified_fixed` 都算未闭合；不修的用 `intentional`（附理由）或 `rejected`。
- **闸门顺序**（first-match-wins）：blocking 被驳回/降级/标 intentional 未确认 → 交用户；重复 finding → 交用户；Round > 1 结构对比未通过 → 交用户；上下文未读或状态不一致 → 交用户；手动停止达上限 → 交用户；连续干净轮 + 冻结基线 + 无未闭合条目 + 结构通过 → `converged`；`round ≥ max_rounds` → `stop_max_rounds`；其余 → `continue`。
- **脚本**：`node <skill 目录>/scripts/review-gate.mjs .devflow/<slug>/review-<round>.json`；输出 `action`、`gate`、`open_items`、`blocking_open`、`blocking_total`。脚本会交叉校验 `clean_rounds ≤ round`、`baseline_finding_ids` 全部闭合、`new_blocking_count` 与 findings 推导一致；不一致即 `invalid_state`。没有 Node 时按同一顺序人工判定并写明「闸门为人工判定」。
- **clean_rounds 重置**：任何闸门 1–5 命中，或本轮有新 blocking，重置为 0；不得跨轮累计。
- 收敛时输出边界声明：未覆盖范围、未验证假设、残余风险。

## 审查标准

- 批准门槛：改动确实改善所触及系统的代码健康即可批准，不要求完美；让系统变差的改动不批准，除非是真紧急且写明跟进清理。
- 结论按四档给出：`APPROVE`（可合并）、`APPROVE_WITH_COMMENTS`（仅剩非阻塞项）、`REQUEST_CHANGES`（仍有阻塞项）、`NEEDS_SPECIALIST`（安全、并发、迁移等超出本轮能力，转 `guard` 或专项审查）。
- 需求或验收标准缺失时，停下索取，不拿风格检查冒充审查结论。
- 高风险或 UI 改动要求行为证据：探针输出、可重复脚本、截图/录屏、迁移 dry-run；只有测试通过不算证据。脚本留在仓库，截图不能替代脚本。检查写法见 `change-plan` skill 的 `references/deterministic-checks.md`。
- 注释只解释设计意图或非显然约束；用注释解释一个 workaround 却没有对应检查时列为 finding，建议改成 lint、类型、测试或 API 约束。
- 被拒绝的 finding 记录原因，下一轮不再重复提。

## 审查重点

按风险优先：正确性与失败路径；回归/兼容/公共 API；权限与注入/敏感信息/XSS；并发/事务/幂等/缓存/时区/字符集/数据一致；性能（N+1、无界、全表、热路径阻塞）；测试是否覆盖关键性质/边界/失败路径；可维护性与调试残留；相对验收依据的 Must-have 缺口、Out of scope 扩张、Acceptance 无证据。

## 输出规则

发现在总结之前，按 P0–P3 排序。每条含：严重度与标题、`path:line`、行为影响、证据等级、最小修复、反例或不确定性。

- P0：生产破坏、严重泄露、RCE、不可逆数据丢失。
- P1：合并前必修的功能错误、严重安全或数据一致问题。
- P2：中等边界/性能/错误处理/重要测试缺口。
- P3：可维护性与非关键优化。

无 L1/L2 验证证据时，不得把「无 Findings」写成「验收已满足」。无阻塞问题须写 `No blocking findings`，结论用四档 verdict。不得把风格偏好伪装成功能缺陷。

## 输出格式

```markdown
## Findings
round: N（本次是第几轮）

### P1 — title
`path/to/file.ts:42` — introduced | pre-existing

影响 / 证据等级 / 建议 / nit（如适用）

## Basis
source: explicit-handoff | user-pinned | rebuilt-from-context | unavailable
plan alignment: aligned | partial | rebuilt | no plan | unavailable / not applicable
（Must-have 缺口 / Out of scope 扩张 / 无证据的 Acceptance）

## Unverified
未验证项与原因

## Conclusion
APPROVE / APPROVE_WITH_COMMENTS / REQUEST_CHANGES / NEEDS_SPECIALIST
（无阻塞时写 No blocking findings；被拒绝的 finding 列出原因）
（结案自查：无 L1/L2 证据不得声称验收已满足；看起来合理不算证据；用户说测过了只是口述）

## Boundary（仅 converged）
未覆盖范围 / 未验证假设 / 残余风险
```

不要修改文件、提交或推送。

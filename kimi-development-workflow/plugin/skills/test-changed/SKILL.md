---
name: test-changed
description: 根据当前代码改动选择最小但足够的测试范围，执行并解释测试结果与覆盖缺口。
type: flow
whenToUse: 当用户要求为当前改动运行测试、补充回归验证或判断哪些测试受影响时。
---

请为 `$ARGUMENTS`（若为空则使用当前工作区改动）设计并执行最小有效验证。

本 Skill 是同插件内 **Anti-rationalization ID 释义** 与 **Contract resolution 通例** 的 SSOT；`review` / `commit-review` / `release-check` 引用此处 ID，不重复贴全表。

## 流程

1. 读取 AGENTS.md、package/build/test 配置和当前 `git status`。
2. **Contract resolution**（同会话、不落盘）：
   - 优先级：`explicit-handoff`（本会话 `change-plan` 的 Handoff contract）→ `user-pinned`（用户当前明确写下的 Goal / Must-have / Out of scope / Acceptance / 验证命令，例如"按这几条验收"或"我们定好的范围是…"）→ `rebuilt-from-context`（从压缩后工作摘要中的目标与约束、当前 diff 意图、已讨论但未写成 Handoff 的边界重建最小集）→ `unavailable`。
   - 重建只填有依据字段，缺则 `unknown`，不编造 Acceptance；写 source 与 confidence（L2/L3 为主）。压缩摘要不证明 Acceptance 已满足。
   - 无 `explicit-handoff` / `user-pinned` 时 Plan alignment 不得为 `aligned`（最多 `partial` / `rebuilt` / `no plan` / `unavailable`）。`rebuilt` 优先跑可证伪 Acceptance 的命令；`unavailable` 仅按 diff 风险验证。
3. 列出行为主张（来自 Acceptance 或 diff），每条对应最短命令。
4. 收集未暂存、已暂存与 untracked；勿漏 untracked。
5. 映射改动到模块/API/测试；有契约则优先 Acceptance 与 Verification commands，并标 Out of scope 改动。
6. 选最快能证伪主张的检查（类型/单测/包测/集成/构建/smoke）。
7. 确认已有测试按 Arrange/Act/Assert 断言行为，而非仅不抛错。
8. 执行并记录命令、退出码、环境、耗时、失败摘要；结果回指主张或 Acceptance。
9. 失败时区分产品/测试/环境/flaky；不为绿测改断言逃避。
10. 按风险决定是否扩大范围；列出未跑高风险路径与未满足验收项。
11. **Anti-rationalization**：适用全表 AR-1~AR-10。`FAIL` → Recommendation 不得写可合并/可提交，须列 missing acceptance 或证据缺口。
12. 检查副作用、临时文件、生成物与工作区变化。

## Anti-rationalization（插件 SSOT）

| ID | 不得当作通过的理由 | 正确处理 |
|----|-------------------|----------|
| AR-1 | 类型检查/构建/测试绿了 | 只证明执行过命令；须映射到 Acceptance 或行为主张 |
| AR-2 | 历史 CI / 上次会话已过 | 不等于当前工作区；须本轮证据或标 Unverified |
| AR-3 | 改动很小 / 只改文档 | 不跳过 Contract resolution 与必要检查 |
| AR-4 | MCP / 工具不可用 | 降级并写 unavailable；不得暗示已机器分析 |
| AR-5 | 看起来合理 / 应该没问题 | L3/L4 不得结案为可合并/可提交 |
| AR-6 | 用户说测过了 | 无命令+退出码则非 L1；标口述 |
| AR-7 | 与 plan 大方向一致 | 无逐条 Acceptance 对照不得 `aligned` |
| AR-8 | Out of scope 是顺手小改 | 记入 Out-of-scope changes；影响结论则升级 |
| AR-9 | 部分测试通过即声称全部 | 须列出跳过/忽略的测试数及理由 |
| AR-10 | AI 自称已确认逻辑正确 | 须有外部命令证据或 file:line 引用 |

- **PASS**：未用红旗理由放行（场景存在但已正确降级亦可 PASS）。
- **FAIL**：用红旗当通过依据，或结论与证据等级矛盾。

## 输出格式

```markdown
## Contract resolution
source: explicit-handoff | user-pinned | rebuilt-from-context | unavailable
confidence: L1/L2/L3/L4
- Goal / Must-have / Out of scope / Acceptance / Verification commands:

## Plan alignment
aligned / partial / rebuilt / no plan / unavailable
- Covered / Missing acceptance:
- Out-of-scope changes:

## Claims to verify
| Claim | Derived from | Command | Result |
|---|---|---|---|

## Change-to-test map
| Change | Risk | Test |
|---|---|---|

## Executed
- `command` — PASS/FAIL — exit code

## Result

## Anti-rationalization
Result: PASS | FAIL
Triggered: none | AR-n, …（仅列触发项；释义见上表）

## Coverage gaps

## Residual risks

## Recommendation
```

默认只跑安全可重复验证。不删除用户文件、不重置 Git、不提交/推送。用户未要求则不擅自补实现；只列缺失测试与最小建议。`source=unavailable` 且有非平凡代码改动时，Recommendation 须说明仅完成 diff 风险冒烟。

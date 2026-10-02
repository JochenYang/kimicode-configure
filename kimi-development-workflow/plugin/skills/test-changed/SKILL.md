---
name: test-changed
description: 改完代码想验证、不确定该跑哪些测试、或需要回归验证时使用。用户说「跑一下测试」「验证一下改动」「这样改会不会影响别的」「确保没问题」「测试还过吗」时加载。
---

请为 `$ARGUMENTS`（若为空则使用当前工作区改动）设计并执行最小有效验证。

## 流程

1. 读取 AGENTS.md、package/build/test 配置和当前 `git status`。
2. **确定验收依据**，按优先级：
   - `explicit-handoff`：读项目内 `.devflow/<slug>.md`（由 `change-plan` 写入）；其中有 `Plan:` 指针、或 `.devflow` 不存在但 `docs/plans/` 下有相关计划（Status 为 draft/active）时，以 `docs/plans/<slug>.md` 为准
   - `user-pinned`：用户在本轮明确写下的 Goal / Must-have / Out of scope / Acceptance
   - `rebuilt-from-context`：从当前 diff 意图和已讨论的边界重建最小集；只填有依据的字段，缺的写 `unknown`，不编造 Acceptance
   - `unavailable`：都没有
3. 列出行为主张（来自 Acceptance、Test plan 或 diff），每条对应最短命令。
4. 收集未暂存、已暂存与 untracked；勿漏 untracked。
5. 映射改动到模块/API/测试；有依据时优先 Acceptance 与 Verification commands，并标出 Out of scope 改动。
6. 选最快能证伪主张的检查（类型/单测/包测/集成/构建/smoke）。
7. 确认已有测试按 Arrange/Act/Assert 断言行为，而非仅不抛错。
8. 执行并记录命令、退出码、环境、耗时、失败摘要；结果回指对应主张或验收项。
9. **回写持久计划**：验收依据是 `docs/plans/<slug>.md` 时，把 Test plan 表中执行过的条目结果列从 `pending` 更新为 `PASS (command, YYYY-MM-DD)` 或 `FAIL (...)`，未执行的保持 `pending`。这是本 Skill 唯一允许的文件修改；不改计划的其他字段，不把 FAIL 改成 PASS。
10. 失败时区分产品/测试/环境/flaky；不为绿测改断言逃避。
11. 按风险决定是否扩大范围；列出未跑的高风险路径与未满足的验收项。
12. **结案自查**：命令绿了不等于验收满足，必须逐条对应 Acceptance 或行为主张；看起来合理不算证据；用户说测过了只是口述，没有命令和退出码不构成执行证据；部分测试通过必须写出跳过的数量与理由。以上任一条不满足时，结论不得写可合并/可提交。
13. 检查副作用、临时文件、生成物与工作区变化。

## 输出格式

```markdown
## Basis
source: explicit-handoff | user-pinned | rebuilt-from-context | unavailable
plan alignment: aligned | partial | rebuilt | no plan | unavailable
（有依据时列出 Goal / Acceptance / Out of scope）

## Executed
- `command` — PASS/FAIL — exit code
（每条注明它验证的是哪条主张或验收项；没跑的要说明原因）

## Result
主张与结果的对应；失败时分清产品/测试/环境/flaky

## Gaps and recommendation
未跑的高风险路径、未满足的验收项、残余风险、结论
```

无 `explicit-handoff` / `user-pinned` 时，plan alignment 不得写 `aligned`。

持久计划含 Phases 表时按阶段执行：当前阶段的 Test plan 条目存在 FAIL 或 `pending` 时，结论必须写 `Gate 未过，不得进入下一阶段`；全部 PASS 时写 `Gate 通过` 并注明可进入的下一阶段。Work items 里存在 `[~]` 或 `[?]` 时同样不得放行下一阶段。

默认只跑安全可重复验证。不删除用户文件、不重置 Git、不提交/推送；唯一的文件修改是按第 9 步回写 `docs/plans/<slug>.md` 的 Test plan 结果列。用户未要求则不擅自补实现；只列缺失测试与最小建议。

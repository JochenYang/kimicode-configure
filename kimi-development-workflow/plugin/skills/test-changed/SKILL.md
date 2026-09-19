---
name: test-changed
description: 改完代码想验证、不确定该跑哪些测试、或需要回归验证时使用。主人说「跑一下测试」「验证一下改动」「这样改会不会影响别的」「确保没问题」「测试还过吗」时加载。
---

请为 `$ARGUMENTS`（若为空则使用当前工作区改动）设计并执行最小有效验证。

## 流程

1. 读取 AGENTS.md、package/build/test 配置和当前 `git status`。
2. **确定验收依据**，按优先级：
   - `explicit-handoff`：读项目内 `.devflow/<slug>.md`（由 `change-plan` 写入）
   - `user-pinned`：主人在本轮明确写下的 Goal / Must-have / Out of scope / Acceptance
   - `rebuilt-from-context`：从当前 diff 意图和已讨论的边界重建最小集；只填有依据的字段，缺的写 `unknown`，不编造 Acceptance
   - `unavailable`：都没有
3. 列出行为主张（来自 Acceptance 或 diff），每条对应最短命令。
4. 收集未暂存、已暂存与 untracked；勿漏 untracked。
5. 映射改动到模块/API/测试；有依据时优先 Acceptance 与 Verification commands，并标出 Out of scope 改动。
6. 选最快能证伪主张的检查（类型/单测/包测/集成/构建/smoke）。
7. 确认已有测试按 Arrange/Act/Assert 断言行为，而非仅不抛错。
8. 执行并记录命令、退出码、环境、耗时、失败摘要；结果回指对应主张或验收项。
9. 失败时区分产品/测试/环境/flaky；不为绿测改断言逃避。
10. 按风险决定是否扩大范围；列出未跑的高风险路径与未满足的验收项。
11. **结案自查**：命令绿了不等于验收满足，必须逐条对应 Acceptance 或行为主张；看起来合理不算证据；主人说测过了只是口述，没有命令和退出码不构成执行证据；部分测试通过必须写出跳过的数量与理由。以上任一条不满足时，结论不得写可合并/可提交。
12. 检查副作用、临时文件、生成物与工作区变化。

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

默认只跑安全可重复验证。不删除主人文件、不重置 Git、不提交/推送。主人未要求则不擅自补实现；只列缺失测试与最小建议。

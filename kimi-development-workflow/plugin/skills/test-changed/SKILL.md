---
name: test-changed
description: 根据当前代码改动选择最小但足够的测试范围，执行并解释测试结果与覆盖缺口。
type: flow
whenToUse: 当用户要求为当前改动运行测试、补充回归验证或判断哪些测试受影响时。
---

请为 `$ARGUMENTS`（若为空则使用当前工作区改动）设计并执行最小有效验证。

## 流程

1. 读取 AGENTS.md、package/build/test 配置和当前 `git status`。
2. 若当前会话已有 `change-plan` 输出或等价计划，先提取其 Handoff contract（Acceptance criteria、Verification plan/commands、Out of scope）；没有则写「无既有 plan，仅按 diff 验证」。
3. 获取未暂存、已暂存和新增文件；不要只看 `git diff` 而漏掉 untracked 文件。
4. 将改动映射到模块、公共 API、数据流和已有测试；若有 plan，优先覆盖 Acceptance criteria 与 Verification commands，并标出落在 Out of scope 的改动。
5. 先选择最快能证明主张的测试：类型检查、单测、目标包测试、集成测试、构建或运行 smoke test。
6. 按 Arrange、Act、Assert 检查已有测试是否真的断言行为，而不是只断言不抛错。
7. 执行测试并记录命令、退出码、环境、耗时和失败摘要。
8. 若失败，区分产品失败、测试失败、环境失败和 flaky；不要为了绿测修改断言逃避问题。
9. 根据风险决定是否扩大测试范围；说明未运行的高风险路径，以及 plan 中尚未满足的验收项。
10. 测试结束后检查副作用、临时文件、生成物和工作区变化。

## 输出格式

```markdown
## Plan alignment
aligned / partial / no plan
- Covered acceptance:
- Missing acceptance:
- Out-of-scope changes:

## Change-to-test map

| Change | Risk | Test |
|---|---|---|

## Executed
- `command` — PASS/FAIL — exit code

## Result

## Coverage gaps

## Residual risks

## Recommendation
```

默认只运行安全、可重复的验证命令。不要自动删除用户文件、重置 Git、提交或推送。若用户没有要求补测试，不要擅自扩大实现范围；只列出缺失测试和最小建议。

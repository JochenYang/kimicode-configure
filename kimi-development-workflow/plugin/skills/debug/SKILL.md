---
name: debug
description: 按复现、隔离、可证伪假设、验证和最小修复流程处理开发问题，避免凭猜测直接改代码。
type: flow
whenToUse: 当用户报告 bug、测试失败、构建失败、运行时错误、性能退化或行为与预期不一致时。
---

请调试 `$ARGUMENTS`（若为空则使用用户当前报告）。用户可在参数中指定 `diagnose`、`fix` 或 `verify`；未提供时根据用户意图判断。

## 强制流程

1. 读取适用的 AGENTS.md、错误日志、调用方和最近改动。
2. 先写出要验证的行为主张，以及主张为假时会失败的最短检查。
3. 复现失败路径；如果不能复现，明确记录环境、输入、版本和阻塞原因。
4. 隔离变量：缩小到最小输入、最小文件、最小调用链或最小测试。
5. 若当前会话可用 `kimi-engineering-tools` 的 MCP 工具 `codesearch`：在隔离阶段优先用 AST 搜索定位符号定义、调用方和异常处理形态，再缩小假设空间。工具不可用时明确写「codesearch 不可用，仅文本搜索/手工调用链」，不得假装已做结构搜索。`dead_code` 仅在怀疑错误引用了已死模块或删除路径时可选使用，且结果只作候选。
6. 提出 1-3 个可证伪假设，按概率和验证成本排序。
7. 执行最短验证，不把静态猜测当成结论。
8. 若用户要求修复：只做最小正确改动，检查所有调用方和失败路径。
9. 复验原失败路径、正常路径和至少一个边界路径。
10. 检查是否留下调试日志、临时文件或无关改动。

## 输出格式

```markdown
## Symptom

## Reproduction
- Command/input:
- Result:

## Isolation

## Tooling
codesearch: used / unavailable — summary
dead_code: used / unavailable / not needed — summary

## Hypotheses
1. [status] ...

## Root cause
证据等级：L1/L2/L3/L4

## Fix

## Verification
- [ ] 原失败路径
- [ ] 正常路径
- [ ] 边界/失败路径

## Residual risks
```

`diagnose` 模式只诊断不修改；`fix` 模式可以修改代码但不能自动提交；`verify` 模式优先复查已有修复，不重复无关重构。无法执行关键验证时，不得宣称修复完成。

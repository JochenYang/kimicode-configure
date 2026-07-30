---
name: doc-gen
description: 生成或更新 API 文档、CHANGELOG、README、用户文档和迁移指南，确保文档与代码一致且可验证。
type: flow
whenToUse: 当用户要求写文档、更新 CHANGELOG、生成 API 参考、补 README 或为 breaking change 写迁移指南时。
---

请为 `$ARGUMENTS`（指定文档类型与范围；若为空则根据当前改动判断最需要的文档）生成或更新文档。

Anti-rationalization **ID 释义以 `test-changed` 为 SSOT**（AR-1–AR-10）。本 Skill 结论连动：`FAIL` → 不得声称文档已与代码对齐。

## 流程

1. 读取适用的 AGENTS.md、现有文档结构、package/构建配置和当前 `git status`。
2. **Contract resolution**（同会话、不落盘；通例同 `test-changed`）：
   - 优先级：`explicit-handoff` → `user-pinned` → `rebuilt-from-context` → `unavailable`。
   - 重建不编造 Acceptance；无 explicit/user-pinned 时文档范围标注 `rebuilt`/`unavailable`，仍可基于 diff 生成。
3. 确定文档类型与受众：
   - API 文档：从类型签名、路由定义、导出符号生成；标注来源 `file:line`。
   - CHANGELOG：按 Keep a Changelog 规范，区分 Added/Changed/Deprecated/Removed/Fixed/Security。
   - README：项目概述、安装、快速上手、配置、贡献入口。
   - 用户文档：面向最终用户的使用指南、FAQ、故障排查。
   - 迁移指南：breaking change 配套，含影响、升级步骤、回滚。
4. **证据约束**：每条文档声明须可回指代码或提交。无依据的描述标注 `unverified`，不得编造 API 行为、参数或返回值。
5. 检查文档与代码一致性：签名、默认值、副作用、错误码、版本号；不一致列为缺口。
6. 复用项目既有文档风格与结构；新建文档前确认无重复。
7. CHANGELOG 条目须对应实际提交或 diff；不得凭意图编造未发生的变更。
8. 迁移指南须与 release-check 的 breaking change 清单一致；遗漏 breaking 项为 AR-5 红旗。
9. **Anti-rationalization**：适用 AR-3, AR-4, AR-5, AR-7, AR-9, AR-10。`FAIL` → 不得声称文档准确或已对齐。

## 输出规则

- 先列文档类型、受众、来源范围（diff/refs/签名扫描）。
- 每段 API 描述附 `path:line`；无依据的标注 `unverified`。
- 不修改代码逻辑；仅写文档文件（README/CHANGELOG/docs/*）。
- 未经授权不执行提交、推送或发布。

## 输出格式

```markdown
## Document type
API 文档 / CHANGELOG / README / 用户文档 / 迁移指南

## Audience

## Source
diff range / refs / signature scan / 现有文档

## Contract resolution
source: explicit-handoff | user-pinned | rebuilt-from-context | unavailable

## Generated content
（文档正文，API 条目附 path:line）

## Consistency check
| 文档声明 | 代码来源 | 状态 |
|---|---|---|

## Anti-rationalization
Result: PASS | FAIL
Triggered: none | AR-n, …
ID 标签速查：AR-1(命令绿≠验收) AR-2(历史≠当前) AR-3(小改不跳过) AR-4(工具不可用降级) AR-5(看似合理≠结案) AR-6(口述≠L1) AR-7(大方向≠aligned) AR-8(顺手小改记录) AR-9(部分≠全部) AR-10(AI自证需外部证据)；释义见 test-changed

## Unverified items

## Residual risks
```

默认只生成或更新文档文件，不改代码逻辑。`source=unavailable` 时基于 diff 生成并标注范围限制；不得声称完整覆盖未审查的代码。

---
name: doc-gen
description: 写或更新 API 文档、CHANGELOG、README、用户文档、迁移指南时使用。主人说「写个文档」「更新一下 CHANGELOG」「补个 README」「这个接口怎么用」「写个升级说明」时加载。
---

请为 `$ARGUMENTS`（指定文档类型与范围；若为空则根据当前改动判断最需要的文档）生成或更新文档。

## 流程

1. 读取适用的 AGENTS.md、现有文档结构、package/构建配置和当前 `git status`。
2. **对照验收依据**：有项目内 `.devflow/<slug>.md` 或主人本轮明确写下的范围时，用它界定文档范围；都没有则基于 diff 生成，并标注范围限制，不声称完整覆盖未审查的代码。
3. 确定文档类型与受众：
   - API 文档：从类型签名、路由定义、导出符号生成；标注来源 `file:line`。
   - CHANGELOG：按 Keep a Changelog 规范，区分 Added/Changed/Deprecated/Removed/Fixed/Security。
   - README：项目概述、安装、快速上手、配置、贡献入口。
   - 用户文档：面向最终用户的使用指南、FAQ、故障排查。
   - 迁移指南：breaking change 配套，含影响、升级步骤、回滚。
4. **证据约束**：每条文档声明须可回指代码或提交。无依据的描述标注 `unverified`，不得编造 API 行为、参数或返回值。
5. CHANGELOG 条目须对应实际提交或 diff；不得凭意图编造未发生的变更。
6. 迁移指南须与 `release-check` 的 breaking change 清单一致；遗漏 breaking 项是常见错误。
7. 复用项目既有文档风格与结构；新建文档前确认无重复。
8. 检查文档与代码一致性：签名、默认值、副作用、错误码、版本号；不一致列为缺口。

## 输出规则

- 先列文档类型、受众、来源范围（diff/refs/签名扫描）。
- 每段 API 描述附 `path:line`；无依据的标注 `unverified`。
- 不修改代码逻辑；仅写文档文件（README/CHANGELOG/docs/*）。
- 未经授权不执行提交、推送或发布。
- 结案自查：没有代码或提交依据的声明不得写成已确认；看起来合理不算证据。

## 输出格式

```markdown
## Document
类型 / 受众 / 来源范围

## Content
文档正文（API 条目附 path:line）

## Consistency
| 文档声明 | 代码来源 | 状态 |
|---|---|---|
未验证项
```

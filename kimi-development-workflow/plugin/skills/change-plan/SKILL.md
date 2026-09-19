---
name: change-plan
description: 在动手改代码前理清范围、验收标准和实现步骤时使用。主人说「我想加个功能」「这个得重构一下」「先想想怎么做」「别急着写代码」「这个需求怎么拆」时加载。不用于：单行修复、已经在 feature-dev-pipeline 里按 PRD 或工单推进的需求。
---

请为主人指定的开发目标 `$ARGUMENTS`（若为空则使用主人当前请求）建立最小正确的实现计划。

## 与 Plan mode 的关系

- Plan mode 控制当前会话是否直接进入实现以及如何与主人确认。
- 本 Skill 规定计划本身应包含的工程信息和验收证据。
- 在普通模式调用时，只输出计划，除 Handoff 文件外不修改任何文件，也不会自动切换到 Plan mode。
- 已处于 Plan mode 时，复用当前模式，不重复生成空泛计划；重点补齐范围、调用链、风险、验收和验证步骤。

## 流程

1. 读取当前项目结构、相关文档、AGENTS.md、package/build/test 配置和最近的调用方。
2. 用一句话明确目标、非目标和成功标准；不要扩展主人没有提出的需求。
3. 定位直接相关的文件、入口、调用链、数据流和所有权边界。
4. 区分 Must-have、Nice-to-have 和明确排除项。
5. 识别依赖、兼容性、并发、时区、字符集、权限、缓存和数据一致性风险。
6. 提出 1 个推荐方案；只有存在实质范围或风险差异时才列备选方案。
7. 把实现拆成可独立验证的步骤，每一步写明预计变更和验证命令。
8. 给出失败路径、回滚/恢复方式和残余风险。
9. **写入 Handoff 文件**（见下节），并在输出里给出文件路径。

## Handoff 文件

路径：项目内 `.devflow/<slug>.md`，slug 用 kebab-case 的任务名；同时把 `.devflow/` 加进 `.gitignore`。

这是下游 `test-changed` / `review` / `commit-review` / `release-check` / `doc-gen` 读取的验收依据。会话压缩、换会话、跨工具都靠它传递，所以字段必须可直接勾选，不写空泛描述。

```markdown
# <任务名>

- Goal: ...
- Must-have: ...
- Out of scope: ...
- Acceptance criteria:
  - [ ] ...
- Verification commands:
  - `...`
- Do not expand into: ...
```

## 输出格式

```markdown
## Goal and scope
目标 / Must-have / Nice-to-have / Out of scope

## Approach
推荐方案与关键取舍

## Files and steps
相关文件与调用链；实现步骤，每步附验证命令

## Acceptance
- [ ] ...

## Risks
风险、回滚方式、待定决策
```

除 `.devflow/<slug>.md` 外不要修改文件，不要执行提交。若已有明确计划，先指出与当前请求的差异，再给出最小补充计划。

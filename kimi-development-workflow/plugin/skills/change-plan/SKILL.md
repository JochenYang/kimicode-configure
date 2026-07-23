---
name: change-plan
description: 将一个开发需求转化为可执行、可验证的最小实现计划，明确范围、影响、依赖、风险和验收标准。
type: flow
whenToUse: 当用户提出新功能、重构、架构调整或复杂 bug 修复，但还没有明确实现边界和验证方案时。
---

请为用户指定的开发目标 `$ARGUMENTS`（若为空则使用用户当前请求）建立最小正确的实现计划。

## 与 Plan mode 的关系

- Plan mode 控制当前会话是否直接进入实现以及如何与用户确认。
- 本 Skill 规定计划本身应包含的工程信息和验收证据。
- 在普通模式调用时，只输出计划，不修改文件，也不会自动切换到 Plan mode。
- 已处于 Plan mode 时，复用当前模式，不重复生成空泛计划；重点补齐范围、调用链、风险、验收和验证步骤。

## 流程

1. 读取当前项目结构、相关文档、AGENTS.md、package/build/test 配置和最近的调用方。
2. 用一句话明确目标、非目标和成功标准；不要扩展用户没有提出的需求。
3. 定位直接相关的文件、入口、调用链、数据流和所有权边界。
4. 区分 Must-have、Nice-to-have 和明确排除项。
5. 识别依赖、兼容性、并发、时区、字符集、权限、缓存和数据一致性风险。
6. 提出 1 个推荐方案；只有存在实质范围或风险差异时才列备选方案。
7. 把实现拆成可独立验证的步骤，每一步写明预计变更和验证命令。
8. 给出失败路径、回滚/恢复方式和残余风险。

## 输出格式

```markdown
## Goal

## Scope
### Must-have
### Nice-to-have
### Out of scope

## Current context

## Recommended approach

## Files and call chain

## Implementation steps
1. ...

## Acceptance criteria
- [ ] ...

## Verification plan

## Risks and rollback

## Open decisions
```

不要修改文件，不要执行提交。若已有明确计划，先指出与当前请求的差异，再给出最小补充计划。

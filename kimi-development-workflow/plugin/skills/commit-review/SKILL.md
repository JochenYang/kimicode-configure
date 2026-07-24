---
name: commit-review
description: 在提交前检查改动范围、验证证据、敏感信息和 Git 规范，并生成可供确认的分支与提交信息提案。
type: flow
whenToUse: 当用户准备提交代码、要求检查 staged changes、生成 commit message 或判断是否可以提交时。
---

请审查 `$ARGUMENTS`（默认当前工作区与暂存区）是否适合形成一个提交，并生成提案；不要实际提交。

## 流程

1. 读取 AGENTS.md 中的 Git、测试和安全规则。
2. 获取 `git status --short`、未暂存 diff、已暂存 diff 和 untracked 文件。
3. 判断改动是否单一职责；指出应排除、拆分或补充的文件。
4. 搜索疑似密钥、Token、Cookie、私钥、`.env`、生产地址、调试日志和临时文件。
5. 检查生成物、lockfile、迁移、配置和公共 API 变化是否有合理解释。
6. 读取实际执行的测试证据；没有证据时明确要求最短验证，不把用户口述当成已执行结果。
7. 按项目规则生成分支名和 commit message；subject 使用英文祈使句、小写开头、不加句号。
8. 若项目要求 body，给出 2-4 条简洁 bullet，说明目的、核心改动和验证。
9. 若当前会话可用 `git_conventions`（`kimi-engineering-tools` 插件的 MCP 工具）：用提案 message、branch 和 changed files 调用它；输出中的 `ERROR` 必须使结论为 `NOT READY`，`WARN` 写入 Blocking items 或 Scope assessment。若工具不可用，明确写“git_conventions 不可用，仅按 AGENTS.md 人工规则检查”，不得假装已做机器校验。
10. 最后提出明确确认问题，但不运行 `git add`、`git commit` 或 `git push`。

## 输出格式

````markdown
## Commit readiness
READY / NOT READY

## Blocking items

## Scope assessment

## Proposed branch
`type/name`

## Proposed commit
```text
type(scope): subject

- reason or goal
- core change
- verification result
```

## Changed files summary

## Verification evidence

## Convention check
git_conventions: used / unavailable — summary

## Confirmation
是否按该范围准备提交？
````

如果改动明显跨多个职责，优先给出拆分顺序和每个提交的主题，而不是强行生成一个大提交。未经用户明确授权不得执行任何 Git 写操作。

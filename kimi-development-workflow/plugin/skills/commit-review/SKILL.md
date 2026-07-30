---
name: commit-review
description: 在提交前检查改动范围、验证证据、敏感信息和 Git 规范，并生成可供确认的分支与提交信息提案。
type: flow
whenToUse: 当用户准备提交代码、要求检查 staged changes、生成 commit message 或判断是否可以提交时。
---

请审查 `$ARGUMENTS`（默认当前工作区与暂存区）是否适合形成一个提交，并生成提案；不要实际提交。

Anti-rationalization **ID 释义以 `test-changed` 为 SSOT**（AR-1–AR-10）。本 Skill 结论连动：`FAIL` → **必须 NOT READY**。

## 流程

1. 读取 AGENTS.md 中的 Git、测试和安全规则。
2. **Contract resolution**（同会话、不落盘；可简版，通例同 `test-changed`）：
   - 优先级：`explicit-handoff` → `user-pinned` → `rebuilt-from-context` → `unavailable`。
   - 能还原则对照 Must-have / Out of scope，Alignment note：`matched` / `drift` / `n/a`。
   - **无 plan 单独不强制 NOT READY**；`unavailable` 写入 Scope assessment。禁止未对照却声称 aligned。`rebuilt` 须注明未与 explicit Handoff 对照。
3. 获取 `git status --short`、未暂存/已暂存 diff 与 untracked。
4. 判断是否单一职责；指出应排除、拆分或补充的文件。
5. 搜索疑似密钥、Token、Cookie、私钥、`.env`、生产地址、调试日志和临时文件。
6. 检查生成物、lockfile、迁移、配置和公共 API 变化是否合理。
7. 读取命令级测试证据；无则要求最短验证；口述≠L1（AR-6）。
8. 按项目规则生成分支名与 commit message（subject：英文祈使、小写开头、无句号）。
9. 若需 body：2–4 条 bullet（目的、核心改动、验证）。
10. 可用 `git_conventions` 时用提案 message/branch/files 调用：`ERROR` → NOT READY；`WARN` 入 Blocking 或 Scope。不可用则写明，不得假装已机器校验。
11. **Anti-rationalization**：检查 AR-1–AR-10。`FAIL` 或既有阻塞 → NOT READY；READY 还要求 AR `PASS`。
12. 提出确认问题；不运行 `git add` / `git commit` / `git push`。

## 输出格式

````markdown
## Commit readiness
READY / NOT READY

## Contract resolution
source: explicit-handoff | user-pinned | rebuilt-from-context | unavailable
- Goal / Must-have / Out of scope:（或 unavailable）
- Alignment note: matched / drift / n/a

## Anti-rationalization
Result: PASS | FAIL
Triggered: none | AR-n, …
ID 标签速查：AR-1(命令绿≠验收) AR-2(历史≠当前) AR-3(小改不跳过) AR-4(工具不可用降级) AR-5(看似合理≠结案) AR-6(口述≠L1) AR-7(大方向≠aligned) AR-8(顺手小改记录) AR-9(部分≠全部) AR-10(AI自证需外部证据)；释义见 test-changed

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

跨多职责时优先给拆分顺序与各提交主题。未经用户明确授权不得执行任何 Git 写操作。

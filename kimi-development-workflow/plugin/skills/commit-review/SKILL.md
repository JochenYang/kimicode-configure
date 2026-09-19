---
name: commit-review
description: 准备提交代码、要 commit message、或判断能不能提交时使用。主人说「提交吧」「帮我写个 commit」「这些改动可以提交吗」「分几个提交好」「提交前看看有没有问题」时加载。
---

请审查 `$ARGUMENTS`（默认当前工作区与暂存区）是否适合形成一个提交，并生成提案；不要实际提交。

## 流程

1. 读取 AGENTS.md 中的 Git、测试和安全规则。
2. **对照验收依据**：优先读项目内 `.devflow/<slug>.md`；其次是主人本轮明确写下的范围；再次从 diff 重建；都没有写 `unavailable`。能对照时给出 `matched` / `drift` / `n/a`，不能对照时不得声称 matched。
3. 获取 `git status --short`、未暂存/已暂存 diff 与 untracked。
4. 判断是否单一职责；指出应排除、拆分或补充的文件。
5. 搜索疑似密钥、Token、Cookie、私钥、`.env`、生产地址、调试日志和临时文件。
6. 检查生成物、lockfile、迁移、配置和公共 API 变化是否合理。
7. 读取命令级测试证据；无则要求最短验证。
8. 按项目规则生成分支名与 commit message（subject：英文祈使、小写开头、无句号）。
9. 若需 body：2–4 条 bullet（目的、核心改动、验证）。
10. 可用 `git_conventions` 时用提案的 message/branch/files 调用：`ERROR` → NOT READY；`WARN` 记入阻塞项或范围说明。不可用则写明未做机器校验，不假装已校验。
11. **结案自查**：没有 plan 不单独构成 NOT READY；但命令绿了不等于验收满足、看起来合理不算证据、主人说测过了只是口述——这三条不满足时必须 NOT READY。
12. 提出确认问题；不运行 `git add` / `git commit` / `git push`。

## 输出格式

```markdown
## Readiness
READY / NOT READY

## Blocking items
阻塞项；无则写 None

## Proposed commit
分支：`type/name`

提交信息：
```text
type(scope): subject

- reason or goal
- core change
- verification result
```

## Scope
改动文件概要、验收依据对照（source / alignment）、验证证据、约定检查结果
```

跨多职责时优先给拆分顺序与各提交主题。未经主人明确授权不得执行任何 Git 写操作。

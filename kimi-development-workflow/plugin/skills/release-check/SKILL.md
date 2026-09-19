---
name: release-check
description: 准备发版本、打 tag、上传包或部署前使用。主人说「可以发了吗」「打个 tag」「准备发布」「上线前检查一下」「这版能发出去吗」时加载。
---

请检查 `$ARGUMENTS`（默认当前仓库和待发布版本）的发布准备状态；默认只读，不执行 tag、publish、deploy 或 push。

## 流程

1. 读取 AGENTS.md、发布文档、CI 配置、包管理配置和版本来源。
2. 确定发布目标、版本、渠道、受影响组件和兼容范围。
3. **对照验收依据**（可选）：有 `.devflow/<slug>.md` 或主人本轮明确写下的发布相关验收时，列入 Verification；都没有不单独构成 NO-GO，但不得声称与计划一致。
4. 检查工作区是否干净，待发布内容是否与预期提交一致。
5. 对齐 manifest/package/server/应用/schema/changelog 等版本来源。
6. 检查 breaking changes、迁移、配置、环境变量、权限与回滚。
7. 执行或读取类型检查、测试、构建、smoke；区分本工作区执行与历史 CI——历史 CI 不等于当前工作区验证。
8. 检查发布物：入口、依赖、无不当 `node_modules`/源码泄露/密钥/日志/绝对路径/陈旧 bundle。
9. 检查文档、安装升级说明、变更记录与已知限制。
10. **结案自查**：`GO` 仅在必需检查有本工作区真实证据、无阻塞项，且以下三条都满足时成立——命令绿了不等于验收满足；看起来合理不算证据；主人说测过了只是口述，没有命令和退出码不构成执行证据。
11. 给出 GO / NO-GO / CONDITIONAL GO 与阻塞项、最短解除路径。

## 输出格式

```markdown
## Decision
GO / NO-GO / CONDITIONAL GO

## Blocking items
阻塞项与最短解除路径；无则写 None

## Verification
| Check | Command/evidence | Result |
|---|---|---|

## Remaining
未验证项、兼容性与迁移、回滚准备
```

构建成功不自动证明功能满足。未经授权不得 tag、发布、部署或推送。

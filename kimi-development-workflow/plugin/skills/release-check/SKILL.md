---
name: release-check
description: 在发布前核对版本、变更记录、构建、测试、发布物、兼容性、安全和回滚条件，给出明确放行结论。
type: flow
whenToUse: 当用户准备发布版本、创建 tag、上传包、部署或要求检查 release readiness 时。
---

请检查 `$ARGUMENTS`（默认当前仓库和待发布版本）的发布准备状态；默认只读，不执行 tag、publish、deploy 或 push。

## 流程

1. 读取 AGENTS.md、发布文档、CI 配置、包管理配置和版本来源。
2. 确定发布目标、版本、渠道、受影响组件和兼容范围。
3. 检查 Git 工作区是否干净，待发布内容是否与预期提交一致。
4. 对齐 manifest、package、server、应用、schema 和 changelog 等版本来源。
5. 检查 breaking changes、迁移步骤、配置变化、环境变量、权限和回滚方式。
6. 执行或读取项目要求的类型检查、测试、构建和 smoke test；区分实际执行与历史 CI 结果。
7. 检查发布物内容：入口存在、依赖完整、无 `node_modules`、源码泄露、密钥、日志、绝对路径或陈旧 bundle。
8. 检查文档、安装/升级说明、变更记录和已知限制。
9. 给出 GO、NO-GO 或 CONDITIONAL GO，并列出阻塞项和最短解除路径。

## 输出格式

```markdown
## Release decision
GO / NO-GO / CONDITIONAL GO

## Target

## Blocking items

## Version consistency

## Verification
| Check | Command/evidence | Result |
|---|---|---|

## Artifact inspection

## Compatibility and migration

## Security and configuration

## Rollback readiness

## Unverified items

## Next action
```

只有所有必需检查有真实证据且无阻塞项时才能给出 GO。构建成功不自动证明功能满足，历史 CI 也不等同于当前工作区验证。未经授权不得创建 tag、发布包、部署或推送。

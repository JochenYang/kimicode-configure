---
name: release-check
description: 在发布前核对版本、变更记录、构建、测试、发布物、兼容性、安全和回滚条件，给出明确放行结论。
type: flow
whenToUse: 当用户准备发布版本、创建 tag、上传包、部署或要求检查 release readiness 时。
---

请检查 `$ARGUMENTS`（默认当前仓库和待发布版本）的发布准备状态；默认只读，不执行 tag、publish、deploy 或 push。

Anti-rationalization **ID 释义以 `test-changed` 为 SSOT**（AR-1–AR-10）。本 Skill 结论连动：`FAIL` → **不得 GO**（最高 CONDITIONAL GO 或 NO-GO）。

## 流程

1. 读取 AGENTS.md、发布文档、CI 配置、包管理配置和版本来源。
2. 确定发布目标、版本、渠道、受影响组件和兼容范围。
3. 可选 **Contract resolution**（同会话、不落盘；通例同 `test-changed`）：有发布相关 Acceptance/范围则列入 Verification；`unavailable` **不单独 NO-GO**；禁止未对照却声称与 plan aligned。
4. 检查工作区是否干净，待发布内容是否与预期提交一致。
5. 对齐 manifest/package/server/应用/schema/changelog 等版本来源。
6. 检查 breaking changes、迁移、配置、环境变量、权限与回滚。
7. 执行或读取类型检查、测试、构建、smoke；区分本工作区执行与历史 CI（AR-1 / AR-2）。
8. 检查发布物：入口、依赖、无不当 `node_modules`/源码泄露/密钥/日志/绝对路径/陈旧 bundle。
9. 检查文档、安装升级说明、变更记录与已知限制。
10. **Anti-rationalization**：适用 AR-1, AR-2, AR-4, AR-5, AR-6, AR-7, AR-9, AR-10（范围/发布物可注 AR-3）。
11. 给出 GO / NO-GO / CONDITIONAL GO 与阻塞项、最短解除路径。**GO** 仅当：必需检查有本工作区真实证据、无阻塞、且 AR `PASS`。

## 输出格式

```markdown
## Release decision
GO / NO-GO / CONDITIONAL GO

## Contract resolution
source: explicit-handoff | user-pinned | rebuilt-from-context | unavailable
- Release-relevant acceptance / out of scope:（或 n/a）

## Anti-rationalization
Result: PASS | FAIL
Triggered: none | AR-n, …
ID 标签速查：AR-1(命令绿≠验收) AR-2(历史≠当前) AR-3(小改不跳过) AR-4(工具不可用降级) AR-5(看似合理≠结案) AR-6(口述≠L1) AR-7(大方向≠aligned) AR-8(顺手小改记录) AR-9(部分≠全部) AR-10(AI自证需外部证据)；释义见 test-changed

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

构建成功不自动证明功能满足；历史 CI ≠ 当前工作区验证。未经授权不得 tag、发布、部署或推送。

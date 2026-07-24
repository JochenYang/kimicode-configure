# Kimi Development Workflow

这是一个面向日常软件开发的 Kimi Code 工作流插件。它只包含 Skills，不包含 MCP server、Hook、Command、Node.js 运行时或后台进程。

## 安装

```text
/plugins install <repo-root>\kimi-development-workflow\plugin
/reload
/plugins info kimi-development-workflow
```

安装后使用：

```text
/skill:<技能名>
```

## 技能说明

### `/skill:change-plan`：编码前规划

把功能、重构或复杂修复整理成可执行计划，明确目标、范围、调用链、风险、验收标准和验证命令。

它与 Kimi 的 Plan mode 互补：Plan mode 控制会话是否直接实施，`change-plan` 规定计划内容应覆盖什么。它不会自动切换会话模式，也不会修改文件。

### `/skill:debug`：系统化调试

按“复现、隔离、提出假设、验证、定位根因、最小修复、回归验证”处理 bug、测试失败、构建失败和运行时错误。

### `/skill:test-changed`：当前改动测试

根据未暂存、已暂存和新增文件，选择最小但足够的测试范围，记录真实执行证据，并说明测试缺口和残余风险。

### `/skill:review`：只读代码审查

发现优先、按严重度排序，检查正确性、回归、安全、并发、数据一致性、性能、测试和可维护性，并附文件和行号。

### `/skill:commit-review`：提交前检查

检查改动范围、敏感信息、测试证据、提交拆分、分支命名和 commit message，生成提案但不执行 Git 写操作。

### `/skill:release-check`：发布前检查

检查版本、Changelog、构建、测试、发布物、兼容性、安全配置和回滚条件，输出 `GO`、`NO-GO` 或 `CONDITIONAL GO`，不执行发布或部署。

## 常用示例

```text
/skill:change-plan 为订单模块增加优惠券抵扣功能
/skill:debug fix 用户并发登录时偶尔丢失 session
/skill:test-changed
/skill:review staged
/skill:commit-review
/skill:release-check v0.2.0
```

## 推荐生命周期

```text
change-plan → 实现 → test-changed → review → commit-review → release-check
```

`commit-review` 在可用时调用 `git_conventions`（`kimi-engineering-tools` 插件 MCP）；未安装或未启用时降级为按 `AGENTS.md` 检查。

## 共同约束

所有 Skill 都是手动调用的 `flow` Skill：

- 使用前读取适用的 `AGENTS.md`。
- 遵循更具体的项目规则。
- 保留用户已有的无关改动。
- 没有执行证据时不宣称完成。
- 未经明确授权不提交、推送、发布、合并或执行破坏性清理。

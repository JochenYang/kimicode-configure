# Kimi Development Workflow

这是一个面向日常软件开发的 Kimi Code 工作流插件。它只包含 Skills，不包含 MCP server、Hook、Command、Node.js 运行时或后台进程。

## 安装

```text
/plugins install <repo-root>\kimi-development-workflow\plugin
/reload
/plugins info kimi-development-workflow
```

安装后使用官方稳定调用形式：

```text
/skill:<技能名>
```

## Skills 总览

### `/skill:change-plan`：编码前规划

把一个功能、重构或复杂修复整理成可执行计划：

- 明确目标、非目标和成功标准。
- 区分 Must-have、Nice-to-have 和排除项。
- 定位相关文件、入口、调用链和数据流。
- 识别兼容性、权限、并发、缓存和数据一致性风险。
- 拆分实现步骤并定义验收标准和验证命令。
- 输出固定 `Handoff contract`，供后续 `test-changed` / `review` 对照。

示例：

```text
/skill:change-plan 为订单模块增加优惠券抵扣功能
```

它与 Kimi 的 Plan mode 互补：Plan mode 控制会话是否直接实施，`change-plan` 规定计划内容应覆盖什么。该 Skill 不会自动切换会话模式，也不会修改文件。

### `/skill:debug`：系统化调试

用于 bug、测试失败、构建失败、运行时错误和性能退化问题：

```text
复现 → 隔离 → 提出假设 → 验证 → 定位根因 → 最小修复 → 回归验证
```

隔离阶段在可用时优先调用 `codesearch` 缩小调用链；工具不可用则降级为文本搜索并在输出中标明。

支持诊断、修复和复验意图：

```text
/skill:debug diagnose npm test 中 order service 偶发失败
/skill:debug fix 用户并发登录时偶尔丢失 session
/skill:debug verify 检查当前修复是否解决内存泄漏
```

### `/skill:test-changed`：当前改动测试

根据当前未暂存、已暂存和新增文件，选择最小但足够的验证范围：

- 若会话中已有 `change-plan`，优先对照其 Acceptance criteria 与 Verification commands。
- 将改动映射到受影响模块和测试。
- 优先运行类型检查、目标包测试或最小集成测试。
- 记录命令、退出码、环境和失败摘要。
- 区分产品失败、测试失败、环境失败和 flaky。
- 明确未覆盖的高风险路径与 plan 未满足项。

示例：

```text
/skill:test-changed
/skill:test-changed 只验证 auth 和 session 相关改动
```

### `/skill:review`：只读代码审查

针对当前改动或指定范围，按严重度输出带文件和行号的发现：

- 正确性和失败路径。
- 行为回归和公共 API 兼容性。
- 权限、注入、敏感信息和 XSS。
- 并发、事务、幂等性、缓存、时区和数据一致性。
- 性能问题和测试缺口。
- 无关改动、调试残留和可维护性问题。
- 相对既有 plan 的范围漂移（Must-have 缺口、Out of scope 扩张）。
- 可用时可选调用 `codesearch` / `dead_code`；不可用则明确降级。

示例：

```text
/skill:review
/skill:review staged
/skill:review HEAD~3..HEAD
/skill:review 重点检查权限、并发和敏感信息
```

它默认只读，不修改文件、不提交、不推送。没有阻塞问题时会明确输出 `No blocking findings`。

### `/skill:commit-review`：提交前检查

在真正提交前检查：

- 改动是否单一职责。
- 是否混入临时文件、调试日志或敏感信息。
- 是否有实际测试证据。
- 是否需要拆分提交。
- 分支名和 commit message 是否符合项目规则。

示例：

```text
/skill:commit-review
/skill:commit-review 只审查当前 staged changes
```

它只生成提交提案，不执行 `git add`、`git commit` 或 `git push`。

### `/skill:release-check`：发布前检查

在发布、打 tag 或部署前检查：

- 版本号、Changelog 和兼容范围。
- 类型检查、测试、构建和 smoke test。
- 发布物入口、依赖和 bundle 是否完整。
- 是否包含密钥、日志、源码泄露或陈旧构建产物。
- 配置、迁移、权限和回滚条件。

示例：

```text
/skill:release-check v0.2.0
/skill:release-check 检查当前插件是否可以发布
```

它只给出 `GO`、`NO-GO` 或 `CONDITIONAL GO`，不会执行 tag、publish、deploy 或 push。

## 推荐生命周期

```text
change-plan → 实现 → test-changed → review → commit-review → release-check
```

- `change-plan` 只产出可验证计划与 `Handoff contract`，不改代码。
- 实现阶段仍由用户/会话自由推进；后续 skill 通过 Handoff 对照防止范围漂移。
- `test-changed` / `review` 在存在 plan 时必须对照 Acceptance 与 Out of scope。
- `debug` / `review` 在可用时可选调用 `codesearch` / `dead_code`（`kimi-engineering-tools` MCP）；不可用则降级并标明。
- `commit-review` 在可用时调用 `git_conventions`（同属该插件 MCP）；未安装或未启用时降级为按 `AGENTS.md` 人工检查。
- `release-check` 只给放行结论，不执行发布。

## 共同约束

所有 Skill 都是手动调用的 `flow` Skill：

- 使用前读取适用的 `AGENTS.md`。
- 遵循更具体的项目规则。
- 保留用户已有的无关改动。
- 不在没有执行证据时宣称完成。
- 区分复现、读取、调用链推断和猜测。
- 未经明确授权不提交、推送、发布、合并或执行破坏性清理。

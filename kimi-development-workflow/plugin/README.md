# Kimi Development Workflow

这是一个面向日常软件开发的 Kimi Code 工作流插件，包含 Skills 与 Agents，不包含 MCP server、Hook、Command、Node.js 运行时或后台进程。

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

把功能、重构或复杂修复整理成可执行计划，明确目标、范围、调用链、风险、验收标准和验证命令，并输出固定 `Handoff contract` 供后续 skill 对照。

它与 Kimi 的 Plan mode 互补：Plan mode 控制会话是否直接实施，`change-plan` 规定计划内容应覆盖什么。它不会自动切换会话模式，也不会修改文件。

### `/skill:debug`：系统化调试

按“复现、隔离、提出假设、验证、定位根因、最小修复、回归验证”处理 bug、测试失败、构建失败和运行时错误。隔离阶段在可用时优先调用 `codesearch`。

### `/skill:test-changed`：当前改动测试

根据未暂存、已暂存和新增文件，选择最小但足够的测试范围；若会话中已有 plan，优先对照 Acceptance criteria。记录真实执行证据，并说明测试缺口和残余风险。

### `/skill:review`：只读代码审查

发现优先、按严重度排序，检查正确性、回归、安全、并发、数据一致性、性能、测试、可维护性，以及相对 plan 的范围漂移；可用时可选调用 `codesearch` / `dead_code`。

### `/skill:commit-review`：提交前检查

检查改动范围、敏感信息、测试证据、提交拆分、分支命名和 commit message，生成提案但不执行 Git 写操作。

### `/skill:release-check`：发布前检查

检查版本、Changelog、构建、测试、发布物、兼容性、安全配置和回滚条件，输出 `GO`、`NO-GO` 或 `CONDITIONAL GO`，不执行发布或部署。

### `/skill:doc-gen`：文档生成

生成或更新 API 文档、CHANGELOG、README、用户文档和迁移指南。API 文档从类型签名/路由/导出符号提取，每条附 `file:line`；CHANGELOG 按 Keep a Changelog 规范从提交/diff 生成；迁移指南与 release-check 的 breaking change 清单对齐。每条声明须可回指代码，无依据的标注 `unverified`。只写文档文件，不改代码逻辑。

## Agents

插件 `agents/` 目录提供 21 个专长子代理，由主 Agent 自动发现并按任务委派（通过 Agent 工具），各自带工具权限隔离：

- 只读分析：`explore`（代码定位）、`reviewer`（审查）、`detective`（根因）、`guard`（安全）、`oracle`（反方顾问）、`perf`（性能）、`integrator`（跨层集成一致性）
- 实现：`backend`（后端服务）、`builder`（通用）、`frontend`（Web 前端）、`mobile`（移动端）、`miniapp`（小程序）、`ai-app`（AI agent 应用）、`dba`（数据库与查询）、`tester`（TDD）、`ops`（部署运维）
- 游戏设计：`game-designer`（玩法与 GDD）、`combat-designer`（战斗系统）、`level-designer`（关卡设计）、`art-director`（美术方向）、`playtest-analyst`（试玩分析）

只读类禁 Bash/Write/Edit；实现类按职责配置 Read/Grep/Glob + Bash/Write/Edit/FetchURL 的子集（dba 禁 Bash 只写迁移脚本），需要代码结构搜索的 agent（`explore`/`reviewer`/`detective`/`guard`/`builder`/`frontend`/`mobile`/`miniapp`/`ai-app`）额外允许 `mcp__*__codesearch`；`reviewer`/`detective`/`integrator` 额外允许 `mcp__*__dead_code`。游戏设计类（`game-designer`/`combat-designer`/`level-designer`/`art-director`）禁 Bash、允许 Write/Edit 产出设计文档；`playtest-analyst` 允许 Bash 仅用于试玩日志/数据分析，不修改游戏代码。具体权限与专长见各 agent 文件。

agent 默认不声明 `model_preference`：启用 `KIMI_CODE_EXPERIMENTAL_SECONDARY_MODEL` 并配置 `[secondary_model].model` 时，子代理自动走次级模型（主模型留给主会话做规划/决策）；不启用时继承主模型。需强推理的 agent（如 `oracle`）可单独声明 `model_preference: primary` 保留主模型。

## 常用示例

```text
/skill:change-plan 为订单模块增加优惠券抵扣功能
/skill:debug fix 用户并发登录时偶尔丢失 session
/skill:test-changed
/skill:review staged
/skill:commit-review
/skill:release-check v0.2.0
/skill:doc-gen 给订单模块生成 API 文档
```

## 推荐生命周期

```text
change-plan → 实现 → test-changed → review → commit-review → release-check → doc-gen
```

- `change-plan` 产出同会话 `Handoff contract`（不默认落盘）；下游 skill 经 Contract resolution 对照或标 unavailable。
- `test-changed` / `review` / `commit-review` / `release-check` 含 Anti-rationalization（释义 SSOT 在 `test-changed`）；FAIL 时不得 READY/GO。
- `debug` / `review` 在可用时可选调用 `codesearch` / `dead_code`；不可用则降级并标明。
- `commit-review` 在可用时调用 `git_conventions`（`kimi-engineering-tools` 插件 MCP）；未安装或未启用时降级为按 `AGENTS.md` 检查。
- `doc-gen` 在发布后或独立触发，生成/更新文档，不改代码逻辑。

## 共同约束

所有 Skill 都是手动调用的 `flow` Skill：

- 使用前读取适用的 `AGENTS.md`。
- 遵循更具体的项目规则。
- 保留用户已有的无关改动。
- 没有执行证据时不宣称完成。
- 未经明确授权不提交、推送、发布、合并或执行破坏性清理。

# Kimi Development Workflow

这是一个面向日常软件开发的 Kimi Code 工作流插件，包含 7 个 Skill 与 16 个专长子代理，不包含 MCP server、Hook、Command、Node.js 运行时或后台进程。

## 安装

```text
/plugins install <repo-root>\kimi-development-workflow\plugin
/reload
/plugins info kimi-development-workflow
```

## 调用方式

7 个 Skill 都不声明 `type`，类型为默认的 `inline`：模型会按 `description` 在合适的时候自动加载，主人也可以随时手动调用。

```text
/skill:change-plan 为订单模块增加优惠券抵扣功能
```

两条通道同时可用。提交、发布这类需要授权的动作由 Skill 内部约束把关，不依赖调用方式。

## 技能说明

### `change-plan`：编码前规划

把功能、重构或复杂修复整理成可执行计划：目标、范围、调用链、风险、验收标准和验证命令。

计划末尾的 Handoff 会写入项目内 `.devflow/<slug>.md`（并把 `.devflow/` 加进 `.gitignore`），作为下游 Skill 的验收依据——不再依赖会话内传递，压缩或换会话都不会丢。除这个文件外不修改任何文件。

它与 Kimi 的 Plan mode 互补：Plan mode 控制会话是否直接实施，`change-plan` 规定计划内容应覆盖什么。

### `debug`：系统化调试

按「复现 → 隔离 → 可证伪假设 → 验证 → 根因 → 最小修复 → 回归验证」处理 bug、测试失败、构建失败、运行时错误和性能退化。支持 `diagnose`、`fix`、`verify` 三种意图。定位阶段优先用结构化搜索，工具不可用时降级为文本搜索并在输出中标明。

### `test-changed`：当前改动测试

根据未暂存、已暂存和新增文件，选最小但足够的验证范围。优先对照 `.devflow/<slug>.md` 里的 Acceptance criteria；记录命令、退出码、环境与失败摘要，区分产品/测试/环境/flaky，并列出未跑的高风险路径与未满足的验收项。

### `review`：只读代码审查

发现优先、按 P0–P3 排序，每条带 `path:line`、行为影响、证据等级与最小修复。覆盖正确性、回归、公共 API 兼容、安全、并发与数据一致性、性能、测试缺口和可维护性，并对照验收依据检查范围漂移。无阻塞问题时明确输出 `No blocking findings`。

### `commit-review`：提交前检查

检查改动是否单一职责、是否混入临时文件或敏感信息、是否有命令级测试证据、是否需要拆分提交，并生成分支名与 commit message 提案。可用时调用 `git_conventions` 做机器校验；不可用时写明未做机器校验。不执行 `git add`、`git commit` 或 `git push`。

### `release-check`：发布前检查

检查版本一致性、Changelog、类型检查/测试/构建/smoke、发布物完整性、密钥与陈旧产物、配置与迁移、回滚条件，输出 `GO`、`NO-GO` 或 `CONDITIONAL GO` 与最短解除路径。不执行 tag、publish、deploy 或 push。

### `doc-gen`：文档生成

生成或更新 API 文档、CHANGELOG、README、用户文档和迁移指南。API 条目从类型签名/路由/导出符号提取并附 `path:line`；CHANGELOG 按 Keep a Changelog 从提交或 diff 生成，不编造未发生的变更；迁移指南与 `release-check` 的 breaking change 清单对齐；无依据的声明标注 `unverified`。只写文档文件，不改代码逻辑。

## Agents

插件 `agents/` 目录提供 16 个专长子代理，由主 Agent 自动发现并按任务委派，各自带工具权限隔离。

- 只读分析：`explore`（代码定位）、`reviewer`（审查）、`detective`（根因）、`guard`（安全）、`oracle`（反方顾问）、`perf`（性能）、`integrator`（跨层集成一致性）
- 实现：`builder`（通用实现，覆盖服务端、Web 前端、移动端、小程序与 AI 应用）、`dba`（数据库与迁移）、`ops`（部署运维）
- 测试：`tester`（TDD 与测试补齐）
- 游戏设计：`game-designer`（玩法与 GDD）、`combat-designer`（战斗系统）、`level-designer`（关卡设计）、`art-director`（美术方向）、`playtest-analyst`（试玩分析）

工具权限按职责隔离：

| 类别 | 权限 |
|---|---|
| 只读分析：`explore`、`reviewer`、`detective`、`guard`、`oracle`、`integrator` | 不给 Bash、Write、Edit |
| `perf` | 可运行命令做基准测量，但不给 Write、Edit |
| `dba` | 不给 Bash，只写迁移脚本 |
| `builder`、`ops`、`tester`、`playtest-analyst` | 完整读写与命令权限 |
| 游戏设计：`game-designer`、`combat-designer`、`level-designer`、`art-director` | 禁 Bash，允许 Write、Edit 产出设计文档 |

需要代码结构搜索的 agent（`explore`、`reviewer`、`detective`、`guard`、`integrator`、`builder`）额外允许 `mcp__*__codesearch`；`reviewer`、`detective`、`integrator` 额外允许 `mcp__*__dead_code`；`oracle`、`game-designer`、`art-director` 额外允许 `WebSearch`。

agent 默认不声明 `model_preference`：启用 `KIMI_CODE_EXPERIMENTAL_SECONDARY_MODEL` 并配置 `[secondary_model].model` 时，子代理自动走次级模型（主模型留给主会话做规划与决策）；不启用时继承主模型。需强推理的 agent（如 `oracle`）可单独声明 `model_preference: primary` 保留主模型。

## 常用示例

```text
/skill:change-plan 为订单模块增加优惠券抵扣功能
/skill:debug fix 用户并发登录时偶尔丢失 session
/skill:test-changed
/skill:review staged
/skill:commit-review
/skill:release-check v0.3.0
/skill:doc-gen 给订单模块生成 API 文档
```

## 推荐生命周期

```text
change-plan → 实现 → test-changed → review → commit-review → release-check → doc-gen
```

- `change-plan` 把 Handoff 写入项目内 `.devflow/<slug>.md`。下游 Skill 按以下顺序找验收依据：该文件 → 主人在本轮明确写下的范围 → 从 diff 重建（缺的字段标 `unknown`）→ `unavailable`。前三者都没有时，不得声称与计划一致。
- `.devflow/` 应加入 `.gitignore`。
- 每个 Skill 在结案前做一次自查：命令绿了不等于验收满足（要逐条对应）、看起来合理不算证据、主人说测过了只是口述。
- `debug` 与 `review` 在可用时调用 `codesearch` / `dead_code`（`kimi-engineering-tools` 插件提供的 MCP）；不可用时降级并标明。
- `commit-review` 在可用时调用 `git_conventions`（同属该插件 MCP）；未安装或未启用时降级为按 `AGENTS.md` 人工检查。
- `release-check` 只给放行结论，不执行发布。
- `doc-gen` 在发布后或独立触发，生成或更新文档，不改代码逻辑。

## 共同约束

所有 Skill 使用前都会读取适用的 `AGENTS.md`，并遵循更具体的项目规则：

- 保留主人已有的无关改动。
- 没有执行证据时不宣称完成。
- 未经明确授权不提交、推送、发布、合并或执行破坏性清理。

# Kimi Code 个人配置与本地插件

本仓库是一套基于 Kimi Code 原生 `AGENTS.md`、Plugin、Skill 和 MCP 机制自主设计并实现的个人配置与本地插件集合。

## 仓库结构

```text
<repo-root>/
├── kimi-personal-rules/          # 全局协作与工程规则
├── kimi-engineering-tools/       # 自包含工程工具 MCP 插件
├── kimi-mcp-connectors/          # Context7、Exa、LoreWiki MCP 连接器
└── kimi-development-workflow/    # 日常开发流程 Skills 插件
```

`<repo-root>` 表示本仓库克隆后的绝对路径，可以位于任意磁盘或目录，不依赖固定盘符。

## 组件说明

### 个人全局规则

源文件：

```text
<repo-root>\kimi-personal-rules\AGENTS.md
```

同步到 Kimi Code 用户规则目录：

```powershell
Copy-Item -LiteralPath "<repo-root>\kimi-personal-rules\AGENTS.md" `
  -Destination "$HOME\.kimi-code\AGENTS.md" -Force
```

规则涵盖协作方式、最小正确工程、证据与验证、安全边界、前端质量、Git 规范、代码审查和交付闭环。

更新全局规则后，建议开启新的 Kimi Code 会话。

### 工程工具插件

可安装目录：

```text
<repo-root>\kimi-engineering-tools\plugin
```

安装：

```text
/plugins install <repo-root>\kimi-engineering-tools\plugin
/reload
/plugins info kimi-engineering-tools
```

自包含 MCP bundle 提供：

- `git_conventions`：校验分支名、commit message 和 commit body。
- `codesearch`：通过 ast-grep 执行结构化代码搜索。
- `dead_code`：启发式报告待审查的不可达模块候选。

普通用户不需要执行 `npm install`。仓库提交的 `plugin/bin/server.mjs` 已包含 JavaScript 运行时依赖。运行环境需要 PATH 中存在 Node.js 20 或更高版本；使用 `codesearch` 时，目标项目或系统 PATH 还需要提供 ast-grep。

维护者验证：

```powershell
Set-Location "<repo-root>\kimi-engineering-tools"
npm ci
npm test
```

### MCP 连接器插件

可安装目录：

```text
<repo-root>\kimi-mcp-connectors
```

安装：

```text
/plugins install <repo-root>\kimi-mcp-connectors
/reload
/plugins info kimi-mcp-connectors
```

声明的 MCP server：

- `context7`：通过 `npx` 查询技术文档。
- `exa`：远程 HTTP 搜索服务。
- `lorewiki`：通过 LoreWiki CLI 访问本地知识库。

运行条件取决于具体连接器：Context7 需要 Node.js、npm 和网络；Exa 需要网络；LoreWiki 需要提前安装并位于 PATH 中。

### 开发工作流插件

可安装目录：

```text
<repo-root>\kimi-development-workflow\plugin
```

安装：

```text
/plugins install <repo-root>\kimi-development-workflow\plugin
/reload
/plugins info kimi-development-workflow
```

该插件包含 6 个手动 `flow` Skill，不包含 MCP server、Hook、Command、Node.js 运行时或后台进程：

- `/skill:change-plan`：将明确的开发目标转换为可执行、可验证的实施计划。
- `/skill:debug`：复现、隔离、验证假设、最小修复并回归验证。
- `/skill:test-changed`：为当前改动选择并运行最小有效验证范围。
- `/skill:review`：执行只读、发现优先、附文件和行号的代码审查。
- `/skill:commit-review`：检查提交准备状态并生成符合规范的分支和提交信息提案。
- `/skill:release-check`：检查发布准备状态，但不创建 tag、不发布、不部署、不推送。

`change-plan` 与 Plan mode 互补：Plan mode 控制会话交互和需求澄清，Skill 负责规定工程计划中的范围、风险、验收标准和验证步骤。

## 更新本地插件

Kimi Code 会把本地安装的插件复制到：

```text
~/.kimi-code/plugins/managed/<plugin-id>
```

修改插件源码目录后，需要重新安装并 reload：

```text
/plugins install <插件绝对路径>
/reload
```

Windows 上运行中的 stdio MCP 进程可能暂时锁定文件。如果重装时报 `EBUSY`，先禁用插件并 reload 后重试；若 managed 目录仍被占用，再退出 Kimi Code 后重新安装。

## 禁用与移除

```text
/plugins disable <plugin-id>
/reload
```

```text
/plugins remove <plugin-id>
/reload
```

移除安装记录不会删除本仓库中的源码文件。

## 安全说明

- 不提交 API key、Token、密码、私钥、Cookie、Session、`.env` 或生产凭据。
- 凭据应保存在环境变量或 secret manager 中。
- 将 MCP 的本地命令执行和本地数据访问视为受信扩展能力。
- 项目专用 MCP 应放在项目的 `.kimi-code/mcp.json`，不要把所有服务都加入全局插件。

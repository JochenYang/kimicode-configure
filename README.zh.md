# Kimi Code 个人配置

本仓库包含从 OpenCode 配置迁出的 Kimi Code 个人草稿与本地插件。

## 目录内容

- `kimi-personal-rules/AGENTS.md`：Kimi Code 全局个人规则。
- `kimi-engineering-tools/`：工程能力 MCP 本地插件。
- `kimi-mcp-connectors/`：Context7、Exa、LoreWiki 连接器 MCP 本地插件。
- `kimi-code-opencode-migration-report.md`：迁移评估记录。

## 全局规则

建议同步到：

```text
~/.kimi-code/AGENTS.md
```

规则涵盖：个人协作偏好、工程标准、安全规范、证据优先行为、前端质量要求、Git 规范、Review 输出风格、交付闭环要求。

本项目要求 commit 必须带 body，调用 `git_conventions` MCP 校验时使用默认 `enforce_body=true`，不要传 `false`。

手动同步：

```powershell
Copy-Item -LiteralPath "D:\codes\kimicode-configure\kimi-personal-rules\AGENTS.md" -Destination "$HOME\.kimi-code\AGENTS.md" -Force
```

修改全局规则后，重启 Kimi Code 或开新会话生效。

## 工程能力插件

路径：

```text
D:\codes\kimicode-configure\kimi-engineering-tools
```

提供 1 个 stdio MCP server，3 个工具：

- `git_conventions`：校验 commit message、分支名和 Git 提案规范。
- `codesearch`：调用 ast-grep 做结构化代码搜索。
- `dead_code`：扫描候选死代码和无依赖导出符号。

构建后再安装：

```powershell
cd D:\codes\kimicode-configure\kimi-engineering-tools
npm install
npm run build
```

在 Kimi Code 安装：

```text
/plugins install D:\codes\kimicode-configure\kimi-engineering-tools
/reload
/plugins info kimi-engineering-tools
```

健康状态：

```text
Status: enabled | state: ok
MCP servers (1/1 enabled)
plugin-kimi-engineering-tools:kimi-engineering-tools connected · 3 tools
```

插件装好但被禁用：

```text
/plugins enable kimi-engineering-tools
/reload
```

MCP server 被禁用：

```text
/plugins mcp enable kimi-engineering-tools kimi-engineering-tools
/reload
```

### dead_code 说明

`dead_code` 只是启发式，不能直接据其结果删除文件。

默认排除：测试、mocks、storybook、generated、fixtures、examples、声明文件。

入口文件（例如 `index`、`src/index`、`packages/*/src/index`）作为 entry points 保护，而不是从依赖图中剔除。

测试 prompt：

```text
请调用 kimi-engineering-tools 插件提供的 MCP 工具 dead_code，参数 entry=".", lang=["typescript"]。使用默认排除规则，不要删除任何文件。只输出前 20 个候选 dead modules，并说明误报风险。
```

新版正确输出应包含：

```text
Excludes: 18 pattern(s) applied
```

### codesearch 说明

`codesearch` 需要 `ast-grep` 在 PATH 或目标项目 `node_modules/.bin` 下。

安装方式之一：

```powershell
npm install -g @ast-grep/cli
```

```powershell
winget install ast-grep
```

示例 prompt：

```text
请调用 codesearch 工具，在当前项目中用 TypeScript 模式搜索所有 console.log 调用。pattern: console.log($$$), lang: typescript, path: ., maxResults: 20
```

## MCP 连接器插件

路径：

```text
D:\codes\kimicode-configure\kimi-mcp-connectors
```

提供 MCP 连接器：

- `context7`：通过 `npx -y @upstash/context7-mcp` 做文档查询。
- `exa`：远程 HTTP MCP，地址 `https://mcp.exa.ai/mcp`。
- `lorewiki`：本地知识库，通过 `lorewiki mcp serve` 启动。

在 Kimi Code 安装：

```text
/plugins install D:\codes\kimicode-configure\kimi-mcp-connectors
/reload
/plugins info kimi-mcp-connectors
```

stdio MCP 子进程会继承启动 Kimi Code 的 shell 环境变量。API key 不要写进插件文件，用环境变量或 secret manager。

若 `context7` 需要 key，确保启动 Kimi Code 之前已设置：

```powershell
$env:CONTEXT7_API_KEY="your-key"
```

若 `lorewiki` 连不上，确认 `lorewiki` CLI 在 PATH 上。

## 插件重装说明

Kimi Code 会把本地插件复制到：

```text
~/.kimi-code/plugins/managed/<plugin-id>
```

修改源码后要重新安装并 `/reload` 或 `/new`。

Windows 上重装正在运行的 stdio MCP 插件可能遇到 `EBUSY`：

```text
/plugins disable <plugin-id>
/reload
```

然后再装。如果目录仍被锁定，退出 Kimi Code 重新打开再装。

## 禁用与卸载

临时禁用：

```text
/plugins disable kimi-engineering-tools
/reload
```

删除安装记录：

```text
/plugins remove kimi-engineering-tools
/reload
```

删除安装记录不会删除本仓库的源码目录。

## 安全说明

- 不要把 API key、token、`.env`、`service-local.json` 或本地运行时状态提交到仓库。
- 凭据放在环境变量或 secret manager。
- 所有执行本地命令或访问本地数据的 MCP 工具都视为受信本地扩展。

## 相关文档

- 英文版：`README.md`
- 全局规则：`kimi-personal-rules/AGENTS.md`
- 迁移记录：`kimi-code-opencode-migration-report.md`

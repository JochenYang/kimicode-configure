# Kimi MCP Connectors

个人 MCP 连接器插件，包含：

- `context7`：Context7 文档检索 MCP。
- `exa`：Exa Web Search MCP。
- `lorewiki`：本地 LoreWiki 知识库 MCP。

`<repo-root>` 表示本仓库克隆后的绝对路径，请在安装时替换为本机实际路径。

## 安装

在 Kimi Code 中执行：

```text
/plugins install <repo-root>\kimi-mcp-connectors
/reload
/plugins info kimi-mcp-connectors
```

## 环境变量

本插件不写入任何 API key。Kimi stdio MCP 会继承父进程环境变量。

如果 `context7` 需要 key，请确保启动 Kimi Code 的 shell 中已有：

```powershell
$env:CONTEXT7_API_KEY="your-key"
```

如需持久化，使用系统环境变量或你的 secret 管理方式，不要写入本插件文件。

## 前置依赖

- `context7` 使用 `npx -y @upstash/context7-mcp`，需要 Node/npm 可用。
- `exa` 是远程 HTTP MCP，需要能访问 `https://mcp.exa.ai/mcp`。
- `lorewiki` 需要 `lorewiki` CLI 在 PATH 上。

## 管理 MCP server

```text
/plugins mcp disable kimi-mcp-connectors exa
/plugins mcp enable kimi-mcp-connectors exa
/reload
```

如果只想使用其中一部分，可以禁用不需要的 server。

# Kimi Code Personal Configuration

[中文版文档](./README.zh.md)

This repository contains personal Kimi Code configuration drafts and local plugins migrated from the OpenCode setup.

## Contents

- `kimi-personal-rules/AGENTS.md`: Personal global rules for Kimi Code.
- `kimi-engineering-tools/`: Local MCP plugin for engineering tools.
- `kimi-mcp-connectors/`: Local MCP plugin for Context7, Exa, and LoreWiki connectors.
- `kimi-code-opencode-migration-report.md`: Migration assessment notes.

## Global Rules

The rules file is intended to be synced to:

```text
~/.kimi-code/AGENTS.md
```

It defines personal collaboration preferences, engineering standards, security rules, evidence-first behavior, frontend quality requirements, Git conventions, review output style, and delivery closure requirements.

This project requires commit messages to include a body. Use the `git_conventions` MCP tool with its default `enforce_body=true` strictness so a missing or malformed body fails the check.

To sync manually:

```powershell
Copy-Item -LiteralPath "D:\codes\kimicode-configure\kimi-personal-rules\AGENTS.md" -Destination "$HOME\.kimi-code\AGENTS.md" -Force
```

Restart Kimi Code or start a new session after changing global rules.

## Engineering Tools Plugin

Path:

```text
D:\codes\kimicode-configure\kimi-engineering-tools
```

Provides one stdio MCP server with three tools:

- `git_conventions`: Validate commit messages, branch names, and Git proposal conventions.
- `codesearch`: Run ast-grep structural code search.
- `dead_code`: Scan candidate dead modules and unused exported symbols.

Build before installing:

```powershell
cd D:\codes\kimicode-configure\kimi-engineering-tools
npm install
npm run build
```

Install in Kimi Code:

```text
/plugins install D:\codes\kimicode-configure\kimi-engineering-tools
/reload
/plugins info kimi-engineering-tools
```

Expected healthy state:

```text
Status: enabled | state: ok
MCP servers (1/1 enabled)
plugin-kimi-engineering-tools:kimi-engineering-tools connected · 3 tools
```

If the plugin is installed but disabled:

```text
/plugins enable kimi-engineering-tools
/reload
```

If the MCP server is disabled:

```text
/plugins mcp enable kimi-engineering-tools kimi-engineering-tools
/reload
```

### dead_code Notes

`dead_code` is heuristic only. Do not delete files directly from its output.

Default excludes skip tests, mocks, storybook files, generated files, fixtures, examples, and declaration files. Package entry points such as `index`, `src/index`, and `packages/*/src/index` are protected as entry points rather than removed from the dependency graph.

Useful test prompt:

```text
请调用 kimi-engineering-tools 插件提供的 MCP 工具 dead_code，参数 entry=".", lang=["typescript"]。使用默认排除规则，不要删除任何文件。只输出前 20 个候选 dead modules，并说明误报风险。
```

Correct optimized output should include:

```text
Excludes: 18 pattern(s) applied
```

### codesearch Notes

`codesearch` requires `ast-grep` on PATH or in the target project's `node_modules/.bin`.

Install one of:

```powershell
npm install -g @ast-grep/cli
```

```powershell
winget install ast-grep
```

Example prompt:

```text
请调用 codesearch 工具，在当前项目中用 TypeScript 模式搜索所有 console.log 调用。pattern: console.log($$$), lang: typescript, path: ., maxResults: 20
```

## MCP Connectors Plugin

Path:

```text
D:\codes\kimicode-configure\kimi-mcp-connectors
```

Provides MCP connectors:

- `context7`: Documentation lookup via `npx -y @upstash/context7-mcp`.
- `exa`: Remote HTTP MCP at `https://mcp.exa.ai/mcp`.
- `lorewiki`: Local knowledge base via `lorewiki mcp serve`.

Install in Kimi Code:

```text
/plugins install D:\codes\kimicode-configure\kimi-mcp-connectors
/reload
/plugins info kimi-mcp-connectors
```

Stdio MCP servers inherit the environment of the shell that starts Kimi Code. Keep API keys in environment variables or a secret manager, not in plugin files.

If `context7` requires a key, ensure it exists before launching Kimi Code:

```powershell
$env:CONTEXT7_API_KEY="your-key"
```

If `lorewiki` does not connect, ensure the `lorewiki` CLI is on PATH.

## Plugin Reinstall Notes

Kimi Code copies local plugins into:

```text
~/.kimi-code/plugins/managed/<plugin-id>
```

After editing source files, reinstall the plugin and run `/reload` or `/new`.

On Windows, reinstalling a running stdio MCP plugin may fail with `EBUSY`. If that happens:

```text
/plugins disable <plugin-id>
/reload
```

Then reinstall. If the directory is still locked, exit Kimi Code, reopen it, and install again.

## Uninstall / Disable

Disable a plugin temporarily:

```text
/plugins disable kimi-engineering-tools
/reload
```

Remove a plugin installation record:

```text
/plugins remove kimi-engineering-tools
/reload
```

Removing a plugin does not delete the original source directory in this repository.

## Security Notes

- Do not commit API keys, tokens, `.env` files, `service-local.json`, or local runtime state.
- Keep credentials in environment variables or a secret manager.
- Treat all MCP tools that execute local commands or access local data as trusted local extensions.

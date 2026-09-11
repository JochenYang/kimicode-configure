# Kimi Code Personal Configuration

[中文版](./README.zh.md)

This repository is an independently designed and implemented collection of personal configuration and local plugins built on Kimi Code's native `AGENTS.md`, Plugin, Skill, and MCP mechanisms.

## Repository layout

```text
<repo-root>/
├── kimi-personal-rules/          # Global resident rules and the on-demand reference Skill
├── kimi-engineering-tools/       # Self-contained local MCP engineering tools
├── kimi-mcp-connectors/          # Context7, Exa, and LoreWiki MCP connectors
└── kimi-development-workflow/    # Skills-only daily development workflows
```

`<repo-root>` means the absolute path where this repository is cloned. It can be located on any drive or directory.

## Components

### Personal rules

Two artifacts work together: `AGENTS.md` is injected when every prompt is built, while the `agent-rules-reference` Skill loads its detail only when the model judges it relevant.

Source files:

```text
<repo-root>\kimi-personal-rules\AGENTS.md
<repo-root>\kimi-personal-rules\skills\agent-rules-reference\
```

Sync them to the Kimi Code user directories:

```powershell
Copy-Item -LiteralPath "<repo-root>\kimi-personal-rules\AGENTS.md" `
  -Destination "$HOME\.kimi-code\AGENTS.md" -Force

Copy-Item -LiteralPath "<repo-root>\kimi-personal-rules\skills\agent-rules-reference" `
  -Destination "$HOME\.agents\skills\" -Recurse -Force
```

`AGENTS.md` keeps the clauses that must apply on every turn: identity and language, high-risk confirmation, sub-agent dispatch thresholds, minimal-correct scope, evidence expectations, security boundaries, frontend quality, Git conventions, and review output. The Skill keeps the detail that is only needed while doing one specific thing: evidence levels L1-L4, pre-delivery checks, sub-agent capability boundaries, and the UI acceptance checklist.

Do not declare the Skill as `type: flow`. `flow` Skills are manual `/skill:<name>` invocations and are never loaded automatically from their description.

Start a new Kimi Code session after updating the rules or the Skill.

### Engineering tools plugin

Installable directory:

```text
<repo-root>\kimi-engineering-tools\plugin
```

Install:

```text
/plugins install <repo-root>\kimi-engineering-tools\plugin
/reload
/plugins info kimi-engineering-tools
```

The self-contained MCP bundle exposes:

- `git_conventions`: validates branch names, commit messages, and commit bodies.
- `codesearch`: runs structural code search through ast-grep.
- `dead_code`: reports heuristic dead-module candidates for review.

Users do not need to run `npm install`. The committed `plugin/bin/server.mjs` contains the JavaScript runtime dependencies. Node.js 20 or newer must be available on PATH; `codesearch` additionally requires ast-grep in the target project or on PATH.

Maintainer verification:

```powershell
Set-Location "<repo-root>\kimi-engineering-tools"
npm ci
npm test
```

### MCP connectors plugin

Installable directory:

```text
<repo-root>\kimi-mcp-connectors
```

Install:

```text
/plugins install <repo-root>\kimi-mcp-connectors
/reload
/plugins info kimi-mcp-connectors
```

Declared MCP servers:

- `context7`: documentation lookup through `npx`.
- `exa`: remote HTTP search service.
- `lorewiki`: local knowledge base through the LoreWiki CLI.

Runtime prerequisites depend on the connector: Context7 needs Node.js/npm and network access, Exa needs network access, and LoreWiki must be installed on PATH.

### Development workflow plugin

Installable directory:

```text
<repo-root>\kimi-development-workflow\plugin
```

Install:

```text
/plugins install <repo-root>\kimi-development-workflow\plugin
/reload
/plugins info kimi-development-workflow
```

This plugin contains seven manual `flow` Skills and no MCP server, Hook, Command, Node.js runtime, or background process:

- `/skill:change-plan`: converts a clear development goal into an executable and verifiable implementation plan.
- `/skill:debug`: reproduces, isolates, tests hypotheses, applies the smallest fix, and verifies it.
- `/skill:test-changed`: selects and runs the smallest meaningful validation set for current changes.
- `/skill:review`: performs a read-only, findings-first code review with file and line references.
- `/skill:commit-review`: checks commit readiness and proposes a compliant branch and commit message.
- `/skill:release-check`: checks release readiness without tagging, publishing, deploying, or pushing.
- `/skill:doc-gen`: generates or updates API docs, CHANGELOG, README, user docs, and migration guides from code, with each claim linked back to `file:line`.

`change-plan` complements Plan mode: Plan mode controls session behavior and clarification, while the Skill defines the engineering content, scope, risks, acceptance criteria, and verification steps of a plan.

## Updating local plugins

Kimi Code copies locally installed plugins into:

```text
~/.kimi-code/plugins/managed/<plugin-id>
```

After changing a plugin source directory, reinstall it and reload the session:

```text
/plugins install <absolute-plugin-directory>
/reload
```

On Windows, an active stdio MCP process may temporarily lock files. If reinstalling reports `EBUSY`, disable the plugin, reload, and retry. Exit Kimi Code if the managed directory remains locked.

## Disable or remove

```text
/plugins disable <plugin-id>
/reload
```

```text
/plugins remove <plugin-id>
/reload
```

Removing an installation record does not delete this repository's source files.

## Security

- Do not commit API keys, tokens, passwords, private keys, cookies, sessions, `.env` files, or production credentials.
- Keep credentials in environment variables or a secret manager.
- Treat local command execution and local data access through MCP as trusted extension capabilities.
- Keep project-specific MCP servers in the project's `.kimi-code/mcp.json` instead of adding every server globally.

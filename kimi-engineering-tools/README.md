# Kimi Engineering Tools

This directory contains the TypeScript source, tests, and build tooling for a self-contained Kimi Code CLI plugin.

## Install the plugin

Users install the runtime-only directory and do not run `npm install`:

```text
/plugins install <repo-root>\kimi-engineering-tools\plugin
/reload
/plugins info kimi-engineering-tools
```

The installable directory contains only the manifest, documentation, and bundled MCP server:

```text
plugin/
├── bin/server.mjs
├── kimi.plugin.json
└── README.md
```

## Development

Maintainers need Node.js 20 or newer:

```powershell
npm ci
npm test
```

`npm run build` type-checks the source and bundles all JavaScript runtime dependencies into `plugin/bin/server.mjs`. The published plugin does not depend on `node_modules`.

## Tools

MCP server key: `engineering-tools` (stdio). Tools:

- `git_conventions`: validates commit messages and branch names. Missing body is WARN by default (`enforce_body=true`); bad body is ERROR.
- `codesearch`: runs ast-grep structural searches. The target project must provide ast-grep in its `node_modules/.bin` directory or on PATH.
- `dead_code`: reports modules that are heuristically unreachable from configured entry points. Results are review candidates, not deletion proof.

`codesearch.path`, `dead_code.entry`, and related resolved targets must stay inside the project root from `cwd`.

**Plugin install note:** Kimi Code pins a plugin MCP server's process cwd to the managed plugin directory (`~/.kimi-code/plugins/managed/...`). Relative `path` / `entry` without an absolute `cwd` therefore resolve under the plugin tree and usually fail with `path not found`. Pass an **absolute workspace `cwd`**, and/or an **absolute `path`/`entry`**. Parent traversal (`..`) and absolute paths outside an explicit `cwd` root still return an error.

## Verification

```powershell
npm run typecheck
npm run verify:plugin
npm test
```

`verify:plugin` rejects unexpected files in the installable directory and checks that the bundled server has no unresolved runtime package imports.

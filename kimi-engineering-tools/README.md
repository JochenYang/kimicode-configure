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

**Plugin install note:** Kimi Code pins a plugin MCP server's process cwd to the managed plugin directory (`~/.kimi-code/plugins/managed/...`). This tool is pure string validation and does not touch the filesystem, so the cwd limitation does not affect it.

## Verification

```powershell
npm run typecheck
npm run verify:plugin
npm test
```

`verify:plugin` rejects unexpected files in the installable directory and checks that the bundled server has no unresolved runtime package imports.

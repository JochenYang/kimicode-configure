# Kimi Engineering Tools Plugin

Self-contained Kimi Code CLI plugin. The runtime bundle includes all JavaScript dependencies; users do not need to run `npm install`.

## Install

```text
/plugins install <repository-path>/kimi-engineering-tools/plugin
/reload
/plugins info kimi-engineering-tools
```

## Included MCP tools

- `git_conventions`: validates commit messages and branch names.
- `codesearch`: performs structural search with ast-grep. The target project must provide ast-grep locally or on PATH.
- `dead_code`: reports heuristic dead-module candidates. Results are review input, not deletion proof.

`codesearch.path` and `dead_code.entry` are restricted to the project root resolved from `cwd`. Paths that escape that root are rejected.

Because this plugin's MCP process cwd is the managed plugin directory, always pass an **absolute workspace path** via `cwd` and/or absolute `path`/`entry`. Relative-only calls resolve against the plugin install dir and fail.

## Runtime requirements

- Node.js 20 or newer on PATH.
- `ast-grep` is optional and only required by `codesearch`.

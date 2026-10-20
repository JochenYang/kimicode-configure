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

The tool is pure string validation and reads no files, so the MCP process cwd does not affect it.

## Runtime requirements

- Node.js 20 or newer on PATH.

# Kimi Engineering Tools

本目录是 Kimi Code 本地 MCP 插件草案，只迁移通用工程能力：

- `git_conventions`：校验 commit message、分支名，并返回提交规范。`enforce_body` 默认 `false`：只校验 subject 时通过，body 质量不合规返回 WARN；设为 `true` 后只写 subject 返回 WARN、坏 body 返回 ERROR。
- `codesearch`：调用 `ast-grep` 做结构化代码搜索。
- `dead_code`：基于导入图和导出符号扫描潜在死代码。

## 安装与构建

```powershell
npm install
npm run build
```

Kimi Code 本地安装时使用插件目录的绝对路径：

```text
/plugins install D:\codes\kimicode-configure\kimi-engineering-tools
/reload
```

## 运行依赖

- Node.js 20+
- `codesearch` 需要 `ast-grep` 可执行文件在当前项目 `node_modules/.bin` 或系统 PATH 中。
- `dead_code` 是候选清单工具，不应直接根据结果删除代码；动态 import、框架入口、插件入口、CLI 入口都可能误报。
- `dead_code` 默认排除测试、mock、storybook、generated、fixture、example 和声明文件。`index` / `src/index` / `packages/*/src/index` 等入口会作为 entry points 保护，而不是从依赖图里排除。可用 `exclude` 追加排除，或用 `include_default_excludes=false` 关闭默认排除。

## 不包含的内容

- 不包含 OpenCode mission、Forge、TUI、agent/subagent 适配。
- 不包含任何 API key、`service-local.json`、备份配置或用户状态文件。

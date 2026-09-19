# Kimi Development Workflow

面向日常软件开发的 Kimi Code 工作流插件，包含 7 个 Skill 与 16 个专长子代理，不包含 MCP server、Hook、Command、Node.js 运行时或后台进程。

插件本体在 `plugin/` 目录。功能说明、技能清单、子代理权限与推荐生命周期见 [plugin/README.md](plugin/README.md)，本文件只讲安装与维护。

## 安装

```text
/plugins install <repo-root>\kimi-development-workflow\plugin
/reload
/plugins info kimi-development-workflow
```

## 更新已安装的插件

Kimi Code 会把本地安装的插件复制到 `~/.kimi-code/plugins/managed/<plugin-id>`。改动源目录后需要重新安装并重载会话：

```text
/plugins install <绝对插件目录>
/reload
```

Windows 上活动的 stdio MCP 进程可能临时占用文件。重新安装报 `EBUSY` 时先禁用插件、重载后重试；仍然被占用就退出 Kimi Code 再操作。

## 禁用或移除

```text
/plugins disable kimi-development-workflow
/reload
```

```text
/plugins remove kimi-development-workflow
/reload
```

移除安装记录不会删除本仓库的源文件。

## 依赖

可选依赖 `kimi-engineering-tools` 插件，它提供三个 MCP 工具：`codesearch`、`dead_code`、`git_conventions`。

未安装或未启用时，相关 Skill 会降级为文本搜索或人工检查，并在输出中写明降级情况，不会假装已完成机器分析。

# 子智能体：来源与能力边界

本清单同时服务 Kimi 与 ZCode。平台事实分列，共同规则单列。

## 平台事实

| 事项 | Kimi | ZCode |
|---|---|---|
| 内置角色 | coder / explore / plan。插件里的小写 `explore` 用 `override: true` 覆盖内置的 explore（纯静态只读，无 Bash）；需要执行验证或复现时改派 tester / detective。 | 内置的 `Explore`（只读侦察，有 Bash）与 `general-purpose`（全部工具），名字保留、插件不能占用，计划模式只用 `Explore`。插件里没有小写的 explore（覆盖不了内置的，已删除）。 |
| 专项角色来源 | `kimi-development-workflow`，17 个。 | `dev-workflow`，23 个，由同步钩子装进 `~/.zcode/agents`，都带 codegraph 工具、依赖 codegraph 插件。 |
| 默认是否派 subagent | 否，除非用户、`AGENTS.md` 或 skill 明确要求；skill 的分工段就是授权。 | 无此限制，也没有匹配度打分，主模型读清单里的 description 决定派谁。 |
| 续用方式 | Agent 工具的 `resume`。 | `SendMessage`。 |
| 搜索工具 | 按各 agent 的 `tools` 声明，Grep/Glob 与 Bash 可以同时声明。 | 有 Bash 的 agent 拿不到 `Grep` / `Glob`（宿主在 Bash 可用时不注册，搜索走 Bash）；没有 Bash 的才有。 |

## 共同规则

- 只读类角色一律不给 Write/Edit；其中 reviewer、guard、detective、integrator 可跑只读 Bash（范围见各 agent 的「命令约束」），perf 可跑基准测量命令，oracle 与设计类不给 Bash；实现类按职责配置读写权限的子集。具体权限见各 agent 文件。
- 派发前确认专项角色可用，不可用时退化为内置角色审查。
- 什么时候派、派给谁按 `change-plan` 的「派发」一节：读写量大、可并行、要独立，三者至少一项；点/线自己做，面/批先落计划，查派 `explore`/`detective`，界面派 `ux-designer`，审派 `reviewer`/`guard`。
- 回收时不凭 Status 放行，抽查关键结论、复跑关键命令；缺上下文就续用同一个 subagent，不重开。

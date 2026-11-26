# 子智能体：来源与能力边界

## 来源

- 内置角色只有 coder / explore / plan。
- reviewer、tester、detective、guard 等专用角色来自 kimi-development-workflow 插件；派发前确认其可用，不可用时退化为内置角色审查。
- 插件版 explore 为纯静态只读（Read/Grep/Glob，无 Bash）；需要执行验证或复现时改派 tester / detective。
- 只读类角色一律不给 Write/Edit；其中 reviewer、guard、detective、integrator 可跑只读 Bash（范围见各 agent 的「命令约束」），perf 可跑基准测量命令，explore、oracle 不给 Bash；实现类按职责配置读写权限的子集。具体权限见各 agent 文件。
- 派发由用户、`AGENTS.md` 或 skill 的分工段授权（Kimi 默认不派 subagent）；什么时候派、派给谁按 change-plan 的「派发」一节。

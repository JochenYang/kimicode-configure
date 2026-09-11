# 子智能体：来源与能力边界

## 来源

- 内置角色只有 coder / explore / plan。
- reviewer、tester、detective、guard 等专用角色来自 kimi-development-workflow 插件；派发前确认其可用，不可用时退化为内置角色审查。
- 插件版 explore 为纯静态只读（Read/Grep/Glob，无 Bash）；需要执行验证或复现时改派 tester / detective。
- 只读类角色禁 Bash/Write/Edit；实现类按职责配置读写权限的子集。具体权限见各 agent 文件。

## 派发约定

- prompt 中明确要求“只回结论、不贴原始代码”，防止子智能体主动贴原文。
- 结论只返回其最终消息；机制不自动转储子智能体文件，也不主动读取其完整记录。
- 子智能体结论为参考，关键处抽查复核，不盲信。
- 对每个子任务明确边界与验收，避免子任务范围重叠。

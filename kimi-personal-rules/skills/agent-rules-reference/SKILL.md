---
name: agent-rules-reference
description: 个人全局规则的详细清单：证据等级 L1–L4 定义、交付前检查项、子智能体角色能力边界、界面与 WCAG 2.1 AA 验收清单。标注证据等级、判断绿测是否等于需求满足、派发子智能体、做界面改动或验收测试时使用。
whenToUse: 需要区分执行/复现证据与推断猜测、需要派发子智能体并核对角色可用性、需要做界面改动或可访问性验收时。
---

# 个人规则详版

`AGENTS.md` 常驻压缩条款，本 skill 提供展开清单。**按需读单节，不要整篇读。**

- 标注证据等级、说明不确定性或反例 → 读 `${KIMI_SKILL_DIR}/references/evidence.md`
- 判断绿测或构建成功是否等于需求满足 → 读 `${KIMI_SKILL_DIR}/references/testing.md`
- 派发子智能体、核对角色来源与能力边界 → 读 `${KIMI_SKILL_DIR}/references/subagents.md`
- 界面改动、可访问性验收 → 读 `${KIMI_SKILL_DIR}/references/ui.md`

与 `AGENTS.md` 冲突时以安全底线为准；更具体的项目规则优先于两者。

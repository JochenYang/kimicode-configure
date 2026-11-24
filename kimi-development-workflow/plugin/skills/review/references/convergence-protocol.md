# 多轮审查收敛协议

单轮低风险审查不需要本协议。进入第二轮，或改动为 high 风险时使用。

## 角色

| 角色 | 做什么 | 不做什么 |
|---|---|---|
| 审计方（`reviewer` subagent） | 只读产出 findings 与证据 | 不裁决、不改文档、不宣布收敛 |
| 主会话 | 逐条打开代码核实，写裁决，修订文档 | 不跳闸、不把 pending 带进下一轮 |
| 闸门脚本 | 读状态文件，按固定顺序判 action | 不做语义判断 |
| 用户 | 只在确认闸回答 | 不逐条审代码 |

高风险或多轮时**必须派 `reviewer` subagent**；主会话不得同时产出 findings 和写 decision。低风险单轮可以由主会话一次完成，但要在输出里写明未使用独立审计方。

## 状态文件

路径：`.devflow/<slug>/review-<round>.json`

```json
{
  "round": 2,
  "max_rounds": 3,
  "required_clean_rounds": 2,
  "clean_rounds": 1,
  "new_blocking_count": 0,
  "baseline_frozen": true,
  "baseline_finding_ids": ["F1"],
  "findings": [
    {
      "id": "F1",
      "severity": "P1",
      "original_severity": "P1",
      "decision": "accepted",
      "repeat_count": 1,
      "repeat_escalated": false,
      "confirmed": true,
      "verified_fixed": false
    }
  ],
  "structure_comparison": { "status": "pass", "warnings_reviewed": true },
  "context_not_read": false,
  "status_inconsistent": false,
  "manual_stop_count": 0,
  "manual_stop_retry_limit": 2
}
```

字段说明：

- `decision`：`pending` / `accepted` / `rejected` / `downgraded` / `intentional`。每条 finding 必须有裁决，不能沉默携带。
- `accepted` 表示承诺修复；任何 `accepted` 未 `verified_fixed: true` 都算未闭合，不论 severity。不修的用 `intentional`（附理由）或 `rejected`，不要用 `accepted`。
- `confirmed`：blocking 被 `rejected`、`downgraded` 或标 `intentional` 时必须为 `true`，表示用户已确认。
- `original_severity`：降级前的 severity。闸门 1 用它判断“降级前是否 blocking”；缺省时任何 `downgraded` 都按曾经 blocking 处理。
- `repeat_count`：同一 finding 的**出现次数**；第二次出现即触发闸门 2。
- `new_blocking_count`：本轮新增的 blocking 数量。脚本会从 findings 推导（blocking、`repeat_count ≤ 1`、非 intentional、未 confirmed、未 verified_fixed），手填值与推导不一致即 `invalid_state`。
- `baseline_frozen` / `baseline_finding_ids`：进入干净轮前冻结基线；`baseline_frozen=true` 时必须提供 id 列表，且每个 id 都必须已闭合。
- `clean_rounds`：连续干净轮数；不得超过 `round`。任何闸门 1–5 命中，或本轮有新 blocking，重置为 0。
- `structure_comparison`：Round > 1 必填；`pass` 或 `warn + warnings_reviewed` 才可收敛，`fail` 不可收敛。
- `context_not_read` / `status_inconsistent`：为 true 时必须附 `context_not_read_evidence` / `status_inconsistent_evidence`（缺失文件、矛盾的状态对）。
- `manual_stop_count` / `manual_stop_retry_limit`：同轮手动停止达到上限时交用户；`manual_stop_count > 0` 时必须附 `manual_stop_reason`。

## 结构对比比什么

Round > 1 时对比当前计划与上一轮：

1. 必需段落是否齐全：Goal/Why、Scope、Work items、Phases、Affected behaviors、Test plan、Deferred、Rollback、Phase log。
2. Work items 状态与 Phase log 是否一致：Phase log 写了通过，Work items 仍有 `[~]` 即矛盾。
3. P0/P1 是否都映射了 Test plan 用例；Test plan 结果列是否与 Phase log 一致。

判定：

- `fail`：缺必需段落，或状态矛盾。
- `warn`：多余段落、非阻塞用例未映射、措辞漂移但不影响判定。
- `pass`：以上都通过。

## 闸门顺序（first-match-wins）

| # | 条件 | action |
|---|---|---|
| 1 | blocking 被 rejected/downgraded/标 intentional，且 `confirmed != true`；downgraded 缺 `original_severity` 时按曾经 blocking 处理 | `needs_user_confirmation` |
| 2 | 存在 `repeat_escalated = true`，或 `repeat_count ≥ 2` 且 decision 不是 `intentional` | `needs_user_confirmation` |
| 3 | Round > 1 且结构对比缺失、`fail`、或 `warn` 未 `warnings_reviewed` | `needs_user_confirmation` |
| 4 | `context_not_read = true` 或 `status_inconsistent = true` | `needs_user_confirmation` |
| 5 | `manual_stop_count ≥ manual_stop_retry_limit` | `needs_user_confirmation` |
| 6 | 连续干净轮达标 + `baseline_frozen` + 无未闭合条目 + 结构通过 | `converged` |
| 7 | `round ≥ max_rounds` | `stop_max_rounds` |
| 8 | 以上都不命中 | `continue` |

`converged` 的四件事必须同时成立，缺一不可：

1. `clean_rounds ≥ required_clean_rounds`（默认 2），且 `clean_rounds ≤ round`
2. `baseline_frozen = true`，且 `baseline_finding_ids` 全部闭合
3. 未闭合条目为 0：任何 `pending`，或任何 `accepted` 未 `verified_fixed`
4. Round 1，或结构对比通过（`pass`，或 `warn` 已逐条处理）

## 运行

```bash
node <review skill 目录>/scripts/review-gate.mjs .devflow/<slug>/review-<round>.json
```

输出 JSON：`action`、`gate`、`reasons`、`open_items`、`blocking_open`、`blocking_total`。没有 Node 时按上表人工判定，并在输出里写明「闸门为人工判定」。

状态文件不合法时脚本返回 `invalid_state` 并列出字段错误；此时不得继续，先修状态文件。

## 收敛后

写边界声明：未覆盖范围、未验证假设、残余风险。审计方的 findings、每轮状态文件和裁决记录保留在 `.devflow/<slug>/`，作为证据。

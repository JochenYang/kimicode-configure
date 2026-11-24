#!/usr/bin/env node
import { readFileSync } from "node:fs";

const fail = (errors) => {
  console.log(JSON.stringify({ action: "invalid_state", errors }, null, 2));
  process.exit(2);
};

const path = process.argv[2];
if (!path) fail(["usage: review-gate.mjs <review-state.json>"]);

let state;
try {
  state = JSON.parse(readFileSync(path, "utf8"));
} catch (err) {
  fail([`cannot read state: ${err.message}`]);
}

const errors = [];
const isCount = (v) => Number.isInteger(v) && v >= 0;
const isBool = (v) => typeof v === "boolean";
const isText = (v) =>
  (typeof v === "string" && v.trim().length > 0) ||
  (Array.isArray(v) && v.length > 0 && v.every((x) => typeof x === "string" && x.trim().length > 0));

const round = state.round;
const maxRounds = state.max_rounds;
if (!isCount(round) || round < 1) errors.push("round must be an integer >= 1");
if (!isCount(maxRounds) || maxRounds < 1) errors.push("max_rounds must be an integer >= 1");

const findings = Array.isArray(state.findings) ? state.findings : [];
if (!Array.isArray(state.findings)) errors.push("findings must be an array");

const decisions = new Set(["pending", "accepted", "rejected", "downgraded", "intentional"]);
const severities = new Set(["P0", "P1", "P2", "P3"]);

for (const [i, f] of findings.entries()) {
  if (!f || typeof f !== "object" || Array.isArray(f)) {
    errors.push(`findings[${i}] must be an object`);
    continue;
  }
  if (typeof f.id !== "string" || f.id.length === 0) errors.push(`findings[${i}].id required`);
  if (!severities.has(f.severity)) errors.push(`findings[${i}].severity must be P0-P3`);
  if (!decisions.has(f.decision)) errors.push(`findings[${i}].decision invalid`);
  if (f.original_severity !== undefined && !severities.has(f.original_severity)) {
    errors.push(`findings[${i}].original_severity must be P0-P3`);
  }
  if (f.repeat_count !== undefined && !isCount(f.repeat_count)) errors.push(`findings[${i}].repeat_count must be >= 0`);
  for (const key of ["repeat_escalated", "confirmed", "verified_fixed"]) {
    if (f[key] !== undefined && !isBool(f[key])) errors.push(`findings[${i}].${key} must be boolean`);
  }
}

for (const key of ["clean_rounds", "new_blocking_count", "manual_stop_count"]) {
  if (state[key] !== undefined && !isCount(state[key])) errors.push(`${key} must be >= 0`);
}
if (state.required_clean_rounds !== undefined && (!isCount(state.required_clean_rounds) || state.required_clean_rounds < 1)) {
  errors.push("required_clean_rounds must be >= 1");
}
if (state.manual_stop_retry_limit !== undefined && (!isCount(state.manual_stop_retry_limit) || state.manual_stop_retry_limit < 1)) {
  errors.push("manual_stop_retry_limit must be >= 1");
}
for (const key of ["baseline_frozen", "context_not_read", "status_inconsistent"]) {
  if (state[key] !== undefined && !isBool(state[key])) errors.push(`${key} must be boolean`);
}

const sc = state.structure_comparison;
if (sc !== undefined) {
  if (!sc || typeof sc !== "object" || Array.isArray(sc)) errors.push("structure_comparison must be an object");
  else {
    if (!["pass", "warn", "fail"].includes(sc.status)) errors.push("structure_comparison.status must be pass|warn|fail");
    if (sc.warnings_reviewed !== undefined && !isBool(sc.warnings_reviewed)) {
      errors.push("structure_comparison.warnings_reviewed must be boolean");
    }
  }
}

if (state.clean_rounds !== undefined && state.clean_rounds > round) errors.push("clean_rounds cannot exceed round");
if (state.required_clean_rounds !== undefined && state.required_clean_rounds > maxRounds) {
  errors.push("required_clean_rounds cannot exceed max_rounds");
}

const isBlockingSeverity = (s) => s === "P0" || s === "P1";
const blocking = (f) => Boolean(f) && isBlockingSeverity(f.severity);
const isOpen = (f) => Boolean(f) && (f.decision === "pending" || (f.decision === "accepted" && f.verified_fixed !== true));
const isClosed = (f) => Boolean(f) && !isOpen(f);

if (state.baseline_frozen === true) {
  if (!Array.isArray(state.baseline_finding_ids)) {
    errors.push("baseline_finding_ids required when baseline_frozen=true");
  } else {
    const byId = new Map(findings.filter((f) => f && typeof f.id === "string").map((f) => [f.id, f]));
    for (const id of state.baseline_finding_ids) {
      const f = byId.get(id);
      if (!f) errors.push(`baseline id ${id} not found in findings`);
      else if (!isClosed(f)) errors.push(`baseline id ${id} is not closed`);
    }
  }
}

const newBlocking = findings.filter(
  (f) =>
    blocking(f) &&
    (f.repeat_count ?? 0) <= 1 &&
    f.decision !== "intentional" &&
    !(f.decision === "rejected" && f.confirmed === true) &&
    !(f.decision === "downgraded" && f.confirmed === true) &&
    f.verified_fixed !== true,
);
if (state.new_blocking_count !== undefined && state.new_blocking_count !== newBlocking.length) {
  errors.push(`new_blocking_count mismatch: provided ${state.new_blocking_count}, derived ${newBlocking.length}`);
}

if (state.context_not_read === true && !isText(state.context_not_read_evidence)) {
  errors.push("context_not_read_evidence required when context_not_read=true");
}
if (state.status_inconsistent === true && !isText(state.status_inconsistent_evidence)) {
  errors.push("status_inconsistent_evidence required when status_inconsistent=true");
}
if ((state.manual_stop_count ?? 0) > 0 && !isText(state.manual_stop_reason)) {
  errors.push("manual_stop_reason required when manual_stop_count>0");
}

if (errors.length) fail(errors);

const openItems = findings.filter(isOpen);
const repeatEscalated = findings.filter(
  (f) => f.repeat_escalated === true || ((f.repeat_count ?? 0) >= 2 && f.decision !== "intentional"),
);

const emit = (gate, action, reasons) => {
  console.log(
    JSON.stringify(
      {
        action,
        gate,
        round,
        max_rounds: maxRounds,
        open_items: openItems.length,
        blocking_open: findings.filter((f) => blocking(f) && isOpen(f)).length,
        blocking_total: findings.filter(blocking).length,
        reasons,
      },
      null,
      2,
    ),
  );
  process.exit(0);
};

const wasBlocking = (f) => {
  if (f.original_severity !== undefined) return isBlockingSeverity(f.original_severity);
  return blocking(f) || f.decision === "downgraded";
};
const unconfirmed = findings.filter(
  (f) =>
    ((f.decision === "downgraded" && wasBlocking(f)) ||
      (blocking(f) && (f.decision === "rejected" || f.decision === "intentional"))) &&
    f.confirmed !== true,
);
if (unconfirmed.length > 0) {
  emit(1, "needs_user_confirmation", unconfirmed.map((f) => `${f.id}: blocking ${f.decision} 未确认`));
}

if (repeatEscalated.length > 0) {
  emit(2, "needs_user_confirmation", repeatEscalated.map((f) => `${f.id}: 重复出现，判断是执念还是真问题`));
}

const structureWarn =
  round > 1 && (!sc || sc.status === "fail" || (sc.status === "warn" && sc.warnings_reviewed !== true));
if (structureWarn) {
  emit(3, "needs_user_confirmation", [
    sc ? `结构对比 ${sc.status}${sc.warnings_reviewed === true ? "（已复核）" : "（未逐条处理）"}` : "Round > 1 缺少结构对比",
  ]);
}

if (state.context_not_read === true || state.status_inconsistent === true) {
  emit(4, "needs_user_confirmation", [
    state.context_not_read === true ? "context_not_read=true" : "",
    state.status_inconsistent === true ? "status_inconsistent=true" : "",
  ].filter(Boolean));
}

const manualLimit = state.manual_stop_retry_limit ?? 2;
if ((state.manual_stop_count ?? 0) >= manualLimit) {
  emit(5, "needs_user_confirmation", [`manual_stop_count=${state.manual_stop_count ?? 0} 达到上限 ${manualLimit}`]);
}

const cleanRounds = state.clean_rounds ?? 0;
const requiredClean = state.required_clean_rounds ?? 2;
const structureOk = round === 1 || (sc && (sc.status === "pass" || (sc.status === "warn" && sc.warnings_reviewed === true)));
const converged =
  cleanRounds >= requiredClean &&
  newBlocking.length === 0 &&
  state.baseline_frozen === true &&
  openItems.length === 0 &&
  structureOk === true;
if (converged) {
  emit(6, "converged", [
    `连续干净轮 ${cleanRounds}/${requiredClean}`,
    "baseline_frozen=true",
    "open_items=0",
    round === 1 ? "Round 1 无需结构对比" : "结构对比通过",
  ]);
}

if (round >= maxRounds) {
  emit(7, "stop_max_rounds", [`round=${round} >= max_rounds=${maxRounds}`]);
}

emit(8, "continue", [`round=${round}，修订后进入 Round ${round + 1}`]);

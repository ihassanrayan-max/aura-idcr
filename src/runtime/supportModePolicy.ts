import type {
  AlarmIntelligenceSnapshot,
  AlarmSet,
  CombinedRiskSnapshot,
  CriticalVisibilityGuardrailState,
  OperatorStateSnapshot,
  PlantStateSnapshot,
  ReasoningSnapshot,
  SupportMode,
  SupportPolicySnapshot,
} from "../contracts/aura";
import { criticalVariableIds } from "../data/plantModel";

const protectedResponseAlarmIds = [
  "ALM_RPV_LEVEL_LOW_LOW",
  "ALM_RPV_PRESSURE_HIGH",
  "ALM_CONTAINMENT_PRESSURE_HIGH",
] as const;

type SupportModeRuntimeState = {
  current_mode: SupportMode;
  pending_downshift_mode?: SupportMode;
  pending_downshift_ticks: number;
};

type ResolveSupportModePolicyParams = {
  plant_state: PlantStateSnapshot;
  alarm_set: AlarmSet;
  alarm_intelligence: AlarmIntelligenceSnapshot;
  reasoning_snapshot: ReasoningSnapshot;
  operator_state: OperatorStateSnapshot;
  combined_risk: CombinedRiskSnapshot;
  previous_mode: SupportMode;
  runtime_state: SupportModeRuntimeState;
};

type EvaluatedMode = {
  mode: SupportMode;
  reasons: string[];
};

function factorRawIndex(combined_risk: CombinedRiskSnapshot, factor_id: string): number {
  return combined_risk.factor_breakdown.find((factor) => factor.factor_id === factor_id)?.raw_index ?? 0;
}

function formatSupportModeLabel(mode: SupportMode): string {
  switch (mode) {
    case "monitoring_support":
      return "Monitoring Support";
    case "guided_support":
      return "Guided Support";
    case "protected_response":
      return "Protected Response";
  }
}

function modeRank(mode: SupportMode): number {
  switch (mode) {
    case "monitoring_support":
      return 0;
    case "guided_support":
      return 1;
    case "protected_response":
      return 2;
  }
}

function listToSentence(items: string[]): string {
  if (items.length === 0) {
    return "bounded support cues remain inside the normal watch band";
  }

  if (items.length === 1) {
    return items[0];
  }

  if (items.length === 2) {
    return `${items[0]} and ${items[1]}`;
  }

  return `${items[0]}, ${items[1]}, and ${items[2]}`;
}

function buildCriticalVisibilityGuardrailState(alarm_set: AlarmSet): CriticalVisibilityGuardrailState {
  const always_visible_alarm_ids = alarm_set.active_alarms
    .filter((alarm) => alarm.visibility_rule === "always_visible")
    .map((alarm) => alarm.alarm_id);
  const pinned_alarm_ids = alarm_set.active_alarms
    .filter((alarm) => alarm.visibility_rule === "always_visible" || alarm.priority === "P1" || alarm.priority === "P2")
    .map((alarm) => alarm.alarm_id);

  return {
    critical_variable_ids: [...criticalVariableIds],
    always_visible_alarm_ids,
    pinned_alarm_ids,
    summary:
      pinned_alarm_ids.length > 0
        ? `Critical visibility guardrails are active: ${criticalVariableIds.length} plant variables stay pinned and ${pinned_alarm_ids.length} active P1/P2 or always-visible alarms remain surfaced.`
        : `Critical visibility guardrails are active: ${criticalVariableIds.length} plant variables stay pinned and no critical alarms are active right now.`,
  };
}

function evaluateRawMode(params: ResolveSupportModePolicyParams, guardrails: CriticalVisibilityGuardrailState): EvaluatedMode {
  const combined_risk_score = params.combined_risk.combined_risk_score;
  const plant_severity = factorRawIndex(params.combined_risk, "plant_severity");
  const diagnosis_uncertainty = factorRawIndex(params.combined_risk, "diagnosis_uncertainty");
  const attention_instability = Math.max(0, 100 - params.operator_state.attention_stability_index);
  const degraded_confidence = params.operator_state.degraded_mode_active || params.operator_state.signal_confidence < 70;
  const escalation_marker_active =
    Boolean(params.plant_state.reactor_trip_active) ||
    alarm_setHasAny(params.alarm_set, protectedResponseAlarmIds);
  const reasoning_unstable =
    params.reasoning_snapshot.changed_since_last_tick ||
    params.reasoning_snapshot.stable_for_ticks < 2 ||
    diagnosis_uncertainty >= 45;

  const protected_reasons: string[] = [];
  if (escalation_marker_active) {
    protected_reasons.push("critical escalation markers are active");
  }
  if (combined_risk_score >= 70) {
    protected_reasons.push(`combined risk is ${combined_risk_score.toFixed(1)}/100`);
  }
  if (plant_severity >= 72) {
    protected_reasons.push(`plant severity reached ${plant_severity}/100`);
  }
  if (guardrails.pinned_alarm_ids.length >= 3 && combined_risk_score >= 62) {
    protected_reasons.push("multiple critical alarms remain active while overall risk stays elevated");
  }
  if (params.operator_state.workload_index >= 78 && attention_instability >= 40 && combined_risk_score >= 60) {
    protected_reasons.push("workload and attention strain are both elevated while risk stays high");
  }

  if (protected_reasons.length > 0) {
    return {
      mode: "protected_response",
      reasons: protected_reasons,
    };
  }

  const guided_reasons: string[] = [];
  if (combined_risk_score >= 45) {
    guided_reasons.push(`combined risk is ${params.combined_risk.combined_risk_band}`);
  }
  if (params.operator_state.workload_index >= 68) {
    guided_reasons.push(`workload is ${params.operator_state.workload_index}/100`);
  }
  if (params.alarm_intelligence.grouped_alarm_count >= 2) {
    guided_reasons.push(`${params.alarm_intelligence.grouped_alarm_count} alarm clusters remain active`);
  }
  if (attention_instability >= 38) {
    guided_reasons.push(`attention instability pressure is ${attention_instability}/100`);
  }
  if (reasoning_unstable) {
    guided_reasons.push("reasoning is still settling");
  }
  if (degraded_confidence) {
    guided_reasons.push("degraded confidence is limiting certainty");
  }
  if (guardrails.pinned_alarm_ids.length > 0 && combined_risk_score >= 40) {
    guided_reasons.push("critical alarms remain in view");
  }

  if (guided_reasons.length > 0) {
    return {
      mode: "guided_support",
      reasons: guided_reasons,
    };
  }

  return {
    mode: "monitoring_support",
    reasons: [
      "combined risk, workload, and reasoning ambiguity remain inside the monitoring band",
    ],
  };
}

function alarm_setHasAny(alarm_set: AlarmSet, alarm_ids: readonly string[]): boolean {
  return alarm_ids.some((alarm_id) => alarm_set.active_alarm_ids.includes(alarm_id));
}

function canDownshiftFromProtected(params: ResolveSupportModePolicyParams, guardrails: CriticalVisibilityGuardrailState): boolean {
  const combined_risk_score = params.combined_risk.combined_risk_score;
  const plant_severity = factorRawIndex(params.combined_risk, "plant_severity");
  return (
    !Boolean(params.plant_state.reactor_trip_active) &&
    !alarm_setHasAny(params.alarm_set, protectedResponseAlarmIds) &&
    combined_risk_score < 60 &&
    plant_severity < 68 &&
    guardrails.pinned_alarm_ids.length < 3
  );
}

function canDownshiftToMonitoring(params: ResolveSupportModePolicyParams): boolean {
  const diagnosis_uncertainty = factorRawIndex(params.combined_risk, "diagnosis_uncertainty");
  const attention_instability = Math.max(0, 100 - params.operator_state.attention_stability_index);
  return (
    params.combined_risk.combined_risk_score < 38 &&
    params.operator_state.workload_index < 60 &&
    attention_instability < 30 &&
    !params.operator_state.degraded_mode_active &&
    !params.reasoning_snapshot.changed_since_last_tick &&
    params.reasoning_snapshot.stable_for_ticks >= 2 &&
    diagnosis_uncertainty < 40
  );
}

function applyModeTransitionPolicy(
  params: ResolveSupportModePolicyParams,
  raw_mode: SupportMode,
  raw_reasons: string[],
  guardrails: CriticalVisibilityGuardrailState,
): {
  support_mode: SupportMode;
  runtime_state: SupportModeRuntimeState;
  transition_reason: string;
  mode_change_summary: string;
} {
  const prior_mode = params.previous_mode;

  if (modeRank(raw_mode) > modeRank(prior_mode)) {
    return {
      support_mode: raw_mode,
      runtime_state: {
        current_mode: raw_mode,
        pending_downshift_mode: undefined,
        pending_downshift_ticks: 0,
      },
      transition_reason: `Escalated immediately because ${listToSentence(raw_reasons.slice(0, 3))}.`,
      mode_change_summary: `Support mode changed from ${formatSupportModeLabel(prior_mode)} to ${formatSupportModeLabel(raw_mode)}.`,
    };
  }

  if (raw_mode === prior_mode) {
    return {
      support_mode: prior_mode,
      runtime_state: {
        current_mode: prior_mode,
        pending_downshift_mode: undefined,
        pending_downshift_ticks: 0,
      },
      transition_reason: `Holding ${formatSupportModeLabel(prior_mode)} because ${listToSentence(raw_reasons.slice(0, 3))}.`,
      mode_change_summary: "No support-mode change this tick.",
    };
  }

  const pending_downshift_mode =
    params.runtime_state.pending_downshift_mode === raw_mode ? raw_mode : raw_mode;
  const pending_downshift_ticks =
    params.runtime_state.pending_downshift_mode === raw_mode ? params.runtime_state.pending_downshift_ticks + 1 : 1;
  const downshift_ready =
    prior_mode === "protected_response"
      ? pending_downshift_ticks >= 2 && canDownshiftFromProtected(params, guardrails)
      : pending_downshift_ticks >= 2 && canDownshiftToMonitoring(params);

  if (downshift_ready) {
    return {
      support_mode: raw_mode,
      runtime_state: {
        current_mode: raw_mode,
        pending_downshift_mode: undefined,
        pending_downshift_ticks: 0,
      },
      transition_reason: `Relaxed after a bounded dwell because ${listToSentence(raw_reasons.slice(0, 3))}.`,
      mode_change_summary: `Support mode changed from ${formatSupportModeLabel(prior_mode)} to ${formatSupportModeLabel(raw_mode)}.`,
    };
  }

  return {
    support_mode: prior_mode,
    runtime_state: {
      current_mode: prior_mode,
      pending_downshift_mode,
      pending_downshift_ticks,
    },
    transition_reason: `Holding ${formatSupportModeLabel(prior_mode)} for ${pending_downshift_ticks} tick(s) to avoid mode chatter while lower-pressure signals settle.`,
    mode_change_summary: "No support-mode change this tick.",
  };
}

function supportBehaviorChanges(mode: SupportMode): string[] {
  switch (mode) {
    case "monitoring_support":
      return [
        "Keep broader summaries and lighter emphasis inside the existing support regions.",
        "Maintain standard watch-now prioritization unless critical guardrails pin alarms.",
      ];
    case "guided_support":
      return [
        "Tighten emphasis onto the strongest current first-response items.",
        "Use firmer support wording and stronger watch-now prioritization inside the existing shell.",
      ];
    case "protected_response":
      return [
        "Narrow emphasis to the most critical bounded response items without hiding the rest.",
        "Increase caution prominence and keep critical state cues pinned across the shell.",
      ];
  }
}

function degradedConfidenceEffect(operator_state: OperatorStateSnapshot, support_mode: SupportMode): string {
  if (!operator_state.degraded_mode_active) {
    return `Current runtime signals support nominal confidence for ${formatSupportModeLabel(support_mode)}.`;
  }

  return `Degraded confidence is limiting how aggressively ${formatSupportModeLabel(support_mode)} narrows support, so verification and caution wording stay explicit.`;
}

export function createSupportModeRuntimeState(initial_mode: SupportMode = "monitoring_support"): SupportModeRuntimeState {
  return {
    current_mode: initial_mode,
    pending_downshift_ticks: 0,
  };
}

export function resolveSupportModePolicy(params: ResolveSupportModePolicyParams): {
  support_mode: SupportMode;
  support_policy: SupportPolicySnapshot;
  runtime_state: SupportModeRuntimeState;
} {
  const guardrails = buildCriticalVisibilityGuardrailState(params.alarm_set);
  const raw_evaluation = evaluateRawMode(params, guardrails);
  const transition = applyModeTransitionPolicy(params, raw_evaluation.mode, raw_evaluation.reasons, guardrails);
  const active_mode_reasons =
    transition.support_mode === raw_evaluation.mode
      ? raw_evaluation.reasons
      : [`${formatSupportModeLabel(transition.support_mode)} remains active while downshift dwell completes.`];

  return {
    support_mode: transition.support_mode,
    support_policy: {
      current_mode_reason: `${formatSupportModeLabel(transition.support_mode)} is active because ${listToSentence(
        active_mode_reasons.slice(0, 3),
      )}.`,
      transition_reason: transition.transition_reason,
      mode_change_summary: transition.mode_change_summary,
      support_behavior_changes: supportBehaviorChanges(transition.support_mode),
      degraded_confidence_effect: degradedConfidenceEffect(params.operator_state, transition.support_mode),
      critical_visibility: guardrails,
    },
    runtime_state: transition.runtime_state,
  };
}

export { formatSupportModeLabel };

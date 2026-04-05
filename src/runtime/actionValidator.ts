import type {
  ActionRequest,
  ActionValidationResult,
  AlarmSet,
  AllowedOperatorAction,
  CombinedRiskSnapshot,
  FirstResponseLane,
  OperatorStateSnapshot,
  PlantStateSnapshot,
  ReasoningSnapshot,
  SupportMode,
} from "../contracts/aura";

type ValidateActionParams = {
  action_request: ActionRequest;
  allowed_action: AllowedOperatorAction;
  plant_state: PlantStateSnapshot;
  alarm_set: AlarmSet;
  reasoning_snapshot: ReasoningSnapshot;
  combined_risk: CombinedRiskSnapshot;
  operator_state: OperatorStateSnapshot;
  support_mode: SupportMode;
  first_response_lane: FirstResponseLane;
  validation_sequence: number;
};

const escalationAlarmIds = ["ALM_RPV_LEVEL_LOW_LOW", "ALM_RPV_PRESSURE_HIGH", "ALM_CONTAINMENT_PRESSURE_HIGH"] as const;

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function factorRawIndex(combined_risk: CombinedRiskSnapshot, factor_id: string): number {
  return combined_risk.factor_breakdown.find((factor) => factor.factor_id === factor_id)?.raw_index ?? 0;
}

function formatSupportMode(mode: SupportMode): string {
  switch (mode) {
    case "monitoring_support":
      return "Monitoring Support";
    case "guided_support":
      return "Guided Support";
    case "protected_response":
      return "Protected Response";
  }
}

function buildValidationId(sequence: number): string {
  return `val_${String(sequence).padStart(4, "0")}`;
}

function dominantHypothesisLabel(reasoning_snapshot: ReasoningSnapshot): string {
  return (
    reasoning_snapshot.ranked_hypotheses.find(
      (hypothesis) => hypothesis.hypothesis_id === reasoning_snapshot.dominant_hypothesis_id,
    )?.label ?? "monitoring-only picture"
  );
}

function laneRecommendedFeedwaterTarget(first_response_lane: FirstResponseLane): number {
  const recommended_item = first_response_lane.items.find(
    (item) => item.recommended_action_id === "act_adjust_feedwater" && typeof item.recommended_value === "number",
  );
  return typeof recommended_item?.recommended_value === "number" ? Number(recommended_item.recommended_value) : 82;
}

function laneSupportsAction(first_response_lane: FirstResponseLane, action_id: string): boolean {
  return first_response_lane.items.some((item) => item.recommended_action_id === action_id);
}

function confidenceNote(operator_state: OperatorStateSnapshot): string {
  if (operator_state.degraded_mode_active || operator_state.signal_confidence < 70) {
    return `Degraded confidence is active (${operator_state.signal_confidence}/100), so certainty stays limited and verification should remain explicit.`;
  }

  return "Current runtime signals do not indicate degraded confidence limiting this decision.";
}

function baseRiskContext(params: ValidateActionParams, bounded_recovery_target: number): string {
  const plant_severity = factorRawIndex(params.combined_risk, "plant_severity");
  return `${formatSupportMode(params.support_mode)} is active, combined risk is ${params.combined_risk.combined_risk_band} (${params.combined_risk.combined_risk_score.toFixed(
    1,
  )}/100), plant severity is ${plant_severity}/100, the dominant hypothesis is ${dominantHypothesisLabel(
    params.reasoning_snapshot,
  )}, and the current first-response lane points to a bounded recovery target near ${bounded_recovery_target}% rated.`;
}

function passResult(params: ValidateActionParams, reason_code: string, explanation: string): ActionValidationResult {
  return {
    validation_result_id: buildValidationId(params.validation_sequence),
    action_request_id: params.action_request.action_request_id,
    sim_time_sec: params.action_request.sim_time_sec,
    outcome: "pass",
    requires_confirmation: false,
    override_allowed: false,
    reason_code,
    explanation,
    risk_context: explanation,
    confidence_note: confidenceNote(params.operator_state),
    affected_variable_ids: params.allowed_action.target_variable_ids,
    nuisance_flag: false,
  };
}

export function validateAction(params: ValidateActionParams): ActionValidationResult {
  if (!params.allowed_action.requires_validation || params.action_request.action_id === "act_ack_alarm") {
    return passResult(
      params,
      "bounded_acknowledgement_pass",
      "This action stays inside the bounded scenario and does not change plant progression.",
    );
  }

  if (params.action_request.action_id !== "act_adjust_feedwater") {
    return passResult(
      params,
      "bounded_action_pass",
      "This bounded action does not currently require additional interception logic in this slice.",
    );
  }

  const bounded_recovery_target = laneRecommendedFeedwaterTarget(params.first_response_lane);
  const requested_setpoint = clamp(Number(params.action_request.requested_value ?? params.plant_state.feedwater_flow_pct), 35, 95);
  const escalation_active =
    Boolean(params.plant_state.reactor_trip_active) ||
    escalationAlarmIds.some((alarm_id) => params.alarm_set.active_alarm_ids.includes(alarm_id));
  const plant_severity = factorRawIndex(params.combined_risk, "plant_severity");
  const lane_relevant = laneSupportsAction(params.first_response_lane, params.action_request.action_id);
  const aligned_with_recovery_lane =
    lane_relevant &&
    params.reasoning_snapshot.dominant_hypothesis_id === "hyp_feedwater_degradation" &&
    requested_setpoint >= 78 &&
    requested_setpoint <= 86;
  const risk_context = baseRiskContext(params, bounded_recovery_target);
  const current_confidence_note = confidenceNote(params.operator_state);

  if (requested_setpoint < 60) {
    return {
      validation_result_id: buildValidationId(params.validation_sequence),
      action_request_id: params.action_request.action_request_id,
      sim_time_sec: params.action_request.sim_time_sec,
      outcome: "hard_prevent",
      requires_confirmation: false,
      override_allowed: false,
      reason_code: "feedwater_below_safe_floor",
      explanation:
        "Requested feedwater is below the bounded recovery floor for this deterministic scenario, so the action is blocked.",
      risk_context,
      confidence_note: current_confidence_note,
      affected_variable_ids: params.allowed_action.target_variable_ids,
      prevented_harm: true,
      nuisance_flag: false,
      recommended_safe_alternative: `Use the bounded feedwater recovery path near ${bounded_recovery_target}% rated and re-check level plus pressure.`,
    };
  }

  if (escalation_active && requested_setpoint < 76) {
    return {
      validation_result_id: buildValidationId(params.validation_sequence),
      action_request_id: params.action_request.action_request_id,
      sim_time_sec: params.action_request.sim_time_sec,
      outcome: "hard_prevent",
      requires_confirmation: false,
      override_allowed: false,
      reason_code: "reduced_feedwater_during_escalation",
      explanation:
        "Escalation markers are active, and this feedwater reduction conflicts with the bounded recovery path, so the action is blocked.",
      risk_context: `${risk_context} Escalation markers are active in the current plant/alarm picture.`,
      confidence_note: current_confidence_note,
      affected_variable_ids: params.allowed_action.target_variable_ids,
      prevented_harm: true,
      nuisance_flag: false,
      recommended_safe_alternative: `Hold the recovery direction and move feedwater toward ${bounded_recovery_target}% rated instead of reducing it.`,
    };
  }

  if (requested_setpoint < 78) {
    return {
      validation_result_id: buildValidationId(params.validation_sequence),
      action_request_id: params.action_request.action_request_id,
      sim_time_sec: params.action_request.sim_time_sec,
      outcome: "soft_warning",
      requires_confirmation: true,
      override_allowed: false,
      reason_code: "feedwater_below_guided_recovery_band",
      explanation:
        "Requested feedwater sits below the guided recovery band, so the action needs explicit confirmation before it proceeds.",
      risk_context,
      confidence_note: current_confidence_note,
      affected_variable_ids: params.allowed_action.target_variable_ids,
      prevented_harm: false,
      nuisance_flag: false,
      recommended_safe_alternative: `A safer direction is the current bounded recovery target near ${bounded_recovery_target}% rated.`,
    };
  }

  if (requested_setpoint > 86) {
    return {
      validation_result_id: buildValidationId(params.validation_sequence),
      action_request_id: params.action_request.action_request_id,
      sim_time_sec: params.action_request.sim_time_sec,
      outcome: "soft_warning",
      requires_confirmation: true,
      override_allowed: false,
      reason_code: "feedwater_above_guided_recovery_band",
      explanation:
        "Requested feedwater is above the bounded guided band for this slice, so the action needs explicit confirmation before it proceeds.",
      risk_context,
      confidence_note: current_confidence_note,
      affected_variable_ids: params.allowed_action.target_variable_ids,
      prevented_harm: false,
      nuisance_flag: false,
      recommended_safe_alternative: `Stay near the current bounded recovery target around ${bounded_recovery_target}% rated unless a stronger reason is visible.`,
    };
  }

  if (!lane_relevant || params.reasoning_snapshot.dominant_hypothesis_id !== "hyp_feedwater_degradation") {
    return {
      validation_result_id: buildValidationId(params.validation_sequence),
      action_request_id: params.action_request.action_request_id,
      sim_time_sec: params.action_request.sim_time_sec,
      outcome: "soft_warning",
      requires_confirmation: true,
      override_allowed: false,
      reason_code: "feedwater_not_current_recovery_lane",
      explanation:
        "The requested feedwater action is not strongly supported by the current first-response picture, so explicit confirmation is required.",
      risk_context,
      confidence_note: current_confidence_note,
      affected_variable_ids: params.allowed_action.target_variable_ids,
      prevented_harm: false,
      nuisance_flag: false,
      recommended_safe_alternative: "Re-check the dominant storyline and the current first-response lane before changing the feedwater path.",
    };
  }

  if (params.support_mode === "protected_response" && plant_severity >= 72 && requested_setpoint !== bounded_recovery_target) {
    return {
      validation_result_id: buildValidationId(params.validation_sequence),
      action_request_id: params.action_request.action_request_id,
      sim_time_sec: params.action_request.sim_time_sec,
      outcome: "soft_warning",
      requires_confirmation: true,
      override_allowed: false,
      reason_code: "protected_response_precision_check",
      explanation:
        "Protected response is active, so a feedwater move away from the bounded target needs explicit confirmation before it proceeds.",
      risk_context,
      confidence_note: current_confidence_note,
      affected_variable_ids: params.allowed_action.target_variable_ids,
      prevented_harm: false,
      nuisance_flag: false,
      recommended_safe_alternative: `Stay with the bounded recovery target near ${bounded_recovery_target}% rated while the escalation picture is still active.`,
    };
  }

  if (aligned_with_recovery_lane) {
    return passResult(
      params,
      "bounded_recovery_pass",
      "Requested feedwater matches the current bounded recovery path for this deterministic scenario.",
    );
  }

  return {
    validation_result_id: buildValidationId(params.validation_sequence),
    action_request_id: params.action_request.action_request_id,
    sim_time_sec: params.action_request.sim_time_sec,
    outcome: "soft_warning",
    requires_confirmation: true,
    override_allowed: false,
    reason_code: "bounded_recovery_confirmation_required",
    explanation: "This feedwater action is not clearly unsafe, but it is outside the clean pass band and needs explicit confirmation.",
    risk_context,
    confidence_note: current_confidence_note,
    affected_variable_ids: params.allowed_action.target_variable_ids,
    prevented_harm: false,
    nuisance_flag: false,
    recommended_safe_alternative: `Use the bounded recovery target near ${bounded_recovery_target}% rated if you want the lowest-friction recovery path.`,
  };
}

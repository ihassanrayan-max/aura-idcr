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
  ScenarioRuntimeProfileId,
  SessionMode,
  SupportMode,
} from "../contracts/aura";
import { formatSupportModeLabel } from "./supportModePolicy";

type ValidateActionParams = {
  action_request: ActionRequest;
  allowed_action: AllowedOperatorAction;
  plant_state: PlantStateSnapshot;
  alarm_set: AlarmSet;
  reasoning_snapshot: ReasoningSnapshot;
  combined_risk: CombinedRiskSnapshot;
  operator_state: OperatorStateSnapshot;
  session_mode: SessionMode;
  support_mode: SupportMode;
  first_response_lane: FirstResponseLane;
  validation_sequence: number;
  runtime_profile_id?: ScenarioRuntimeProfileId;
};

const escalationAlarmIds = ["ALM_RPV_LEVEL_LOW_LOW", "ALM_RPV_PRESSURE_HIGH", "ALM_CONTAINMENT_PRESSURE_HIGH"] as const;

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function factorRawIndex(combined_risk: CombinedRiskSnapshot, factor_id: string): number {
  return combined_risk.factor_breakdown.find((factor) => factor.factor_id === factor_id)?.raw_index ?? 0;
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
  return `${formatSupportModeLabel(params.support_mode)} is active, combined risk is ${params.combined_risk.combined_risk_band} (${params.combined_risk.combined_risk_score.toFixed(
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

  if (params.session_mode === "baseline") {
    return passResult(
      params,
      "baseline_session_pass_through",
      "Baseline session mode keeps bounded actions pass-through without adaptive interception.",
    );
  }

  const runtime_profile_id = params.runtime_profile_id ?? "feedwater_degradation";

  if (runtime_profile_id === "main_steam_isolation_upset") {
    return validateMainSteamIsolationAction(params);
  }

  if (runtime_profile_id === "loss_of_offsite_power_sbo") {
    return validateLossOfOffsitePowerAction(params);
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

function laneRecommendedIcTarget(first_response_lane: FirstResponseLane): number {
  const recommended_item = first_response_lane.items.find(
    (item) => item.recommended_action_id === "act_adjust_isolation_condenser" && typeof item.recommended_value === "number",
  );
  return typeof recommended_item?.recommended_value === "number" ? Number(recommended_item.recommended_value) : 68;
}

function validateLossOfOffsitePowerAction(params: ValidateActionParams): ActionValidationResult {
  if (params.action_request.action_id !== "act_adjust_isolation_condenser") {
    return passResult(
      params,
      "bounded_action_pass",
      "This bounded action does not currently require additional interception logic in this slice.",
    );
  }

  const requested_setpoint = clamp(Number(params.action_request.requested_value ?? params.plant_state.isolation_condenser_flow_pct), 0, 100);
  const bounded_recovery_target = laneRecommendedIcTarget(params.first_response_lane);
  const lane_relevant = laneSupportsAction(params.first_response_lane, params.action_request.action_id);
  const pressure = Number(params.plant_state.vessel_pressure_mpa);
  const dcBus = Number(params.plant_state.dc_bus_soc_pct);
  const escalation_active =
    pressure >= 7.45 ||
    dcBus < 32 ||
    params.alarm_set.active_alarm_ids.includes("ALM_CONTAINMENT_PRESSURE_HIGH") ||
    params.alarm_set.active_alarm_ids.includes("ALM_SRV_STUCK_OPEN");
  const risk_context = `${formatSupportModeLabel(params.support_mode)} is active, combined risk is ${params.combined_risk.combined_risk_band} (${params.combined_risk.combined_risk_score.toFixed(
    1,
  )}/100), the dominant hypothesis is ${dominantHypothesisLabel(params.reasoning_snapshot)}, IC target is near ${bounded_recovery_target}% rated, pressure is ${pressure.toFixed(
    2,
  )} MPa, and DC margin is ${dcBus.toFixed(1)}%.`;
  const current_confidence_note = confidenceNote(params.operator_state);
  const aligned_with_recovery_lane =
    (lane_relevant ||
      params.reasoning_snapshot.dominant_hypothesis_id === "hyp_decay_heat_removal_gap" ||
      params.reasoning_snapshot.dominant_hypothesis_id === "hyp_loss_of_offsite_power") &&
    requested_setpoint >= 60 &&
    requested_setpoint <= 76;

  if (requested_setpoint < 20) {
    return {
      validation_result_id: buildValidationId(params.validation_sequence),
      action_request_id: params.action_request.action_request_id,
      sim_time_sec: params.action_request.sim_time_sec,
      outcome: "hard_prevent",
      requires_confirmation: false,
      override_allowed: false,
      reason_code: "ic_below_safe_floor",
      explanation: "Requested isolation-condenser demand is below the bounded safe floor for this recovery path, so the action is blocked.",
      risk_context,
      confidence_note: current_confidence_note,
      affected_variable_ids: params.allowed_action.target_variable_ids,
      prevented_harm: true,
      nuisance_flag: false,
      recommended_safe_alternative: `Move isolation-condenser demand toward the bounded recovery band near ${bounded_recovery_target}% rated.`,
    };
  }

  if (escalation_active && requested_setpoint < 45) {
    return {
      validation_result_id: buildValidationId(params.validation_sequence),
      action_request_id: params.action_request.action_request_id,
      sim_time_sec: params.action_request.sim_time_sec,
      outcome: "hard_prevent",
      requires_confirmation: false,
      override_allowed: false,
      reason_code: "reduced_ic_during_escalation",
      explanation: "Escalation markers are active, and reducing IC demand conflicts with the bounded recovery path, so the action is blocked.",
      risk_context,
      confidence_note: current_confidence_note,
      affected_variable_ids: params.allowed_action.target_variable_ids,
      prevented_harm: true,
      nuisance_flag: false,
      recommended_safe_alternative: `Hold or increase IC demand near ${bounded_recovery_target}% rated while pressure and DC margin remain stressed.`,
    };
  }

  if (requested_setpoint < 60) {
    return {
      validation_result_id: buildValidationId(params.validation_sequence),
      action_request_id: params.action_request.action_request_id,
      sim_time_sec: params.action_request.sim_time_sec,
      outcome: "soft_warning",
      requires_confirmation: true,
      override_allowed: false,
      reason_code: "ic_below_guided_recovery_band",
      explanation: "Requested isolation-condenser demand is below the guided recovery band, so explicit confirmation is required.",
      risk_context,
      confidence_note: current_confidence_note,
      affected_variable_ids: params.allowed_action.target_variable_ids,
      prevented_harm: false,
      nuisance_flag: false,
      recommended_safe_alternative: `A safer direction is the bounded IC recovery target near ${bounded_recovery_target}% rated.`,
    };
  }

  if (requested_setpoint > 82) {
    return {
      validation_result_id: buildValidationId(params.validation_sequence),
      action_request_id: params.action_request.action_request_id,
      sim_time_sec: params.action_request.sim_time_sec,
      outcome: "soft_warning",
      requires_confirmation: true,
      override_allowed: false,
      reason_code: "ic_above_guided_recovery_band",
      explanation: "Requested isolation-condenser demand is above the bounded guided band for this slice, so explicit confirmation is required.",
      risk_context,
      confidence_note: current_confidence_note,
      affected_variable_ids: params.allowed_action.target_variable_ids,
      prevented_harm: false,
      nuisance_flag: false,
      recommended_safe_alternative: `Stay near ${bounded_recovery_target}% rated unless the pressure picture clearly demands otherwise.`,
    };
  }

  if (
    !lane_relevant &&
    params.reasoning_snapshot.dominant_hypothesis_id !== "hyp_loss_of_offsite_power" &&
    params.reasoning_snapshot.dominant_hypothesis_id !== "hyp_decay_heat_removal_gap"
  ) {
    return {
      validation_result_id: buildValidationId(params.validation_sequence),
      action_request_id: params.action_request.action_request_id,
      sim_time_sec: params.action_request.sim_time_sec,
      outcome: "soft_warning",
      requires_confirmation: true,
      override_allowed: false,
      reason_code: "ic_not_current_recovery_lane",
      explanation: "The requested IC action is not strongly supported by the current first-response picture, so explicit confirmation is required.",
      risk_context,
      confidence_note: current_confidence_note,
      affected_variable_ids: params.allowed_action.target_variable_ids,
      prevented_harm: false,
      nuisance_flag: false,
      recommended_safe_alternative: "Re-check the current storyline and first-response lane before changing the IC path.",
    };
  }

  if (params.support_mode === "protected_response" && escalation_active && requested_setpoint !== bounded_recovery_target) {
    return {
      validation_result_id: buildValidationId(params.validation_sequence),
      action_request_id: params.action_request.action_request_id,
      sim_time_sec: params.action_request.sim_time_sec,
      outcome: "soft_warning",
      requires_confirmation: true,
      override_allowed: false,
      reason_code: "protected_response_ic_precision_check",
      explanation: "Protected response is active, so moving IC demand away from the bounded target requires explicit confirmation.",
      risk_context,
      confidence_note: current_confidence_note,
      affected_variable_ids: params.allowed_action.target_variable_ids,
      prevented_harm: false,
      nuisance_flag: false,
      recommended_safe_alternative: `Stay with the bounded IC recovery target near ${bounded_recovery_target}% rated while the escalation picture is active.`,
    };
  }

  if (aligned_with_recovery_lane) {
    return passResult(
      params,
      "bounded_ic_recovery_pass",
      "Requested isolation-condenser demand matches the current bounded recovery path for this deterministic scenario.",
    );
  }

  return {
    validation_result_id: buildValidationId(params.validation_sequence),
    action_request_id: params.action_request.action_request_id,
    sim_time_sec: params.action_request.sim_time_sec,
    outcome: "soft_warning",
    requires_confirmation: true,
    override_allowed: false,
    reason_code: "bounded_ic_confirmation_required",
    explanation: "This isolation-condenser action is not clearly unsafe, but it sits outside the clean pass band and needs explicit confirmation.",
    risk_context,
    confidence_note: current_confidence_note,
    affected_variable_ids: params.allowed_action.target_variable_ids,
    prevented_harm: false,
    nuisance_flag: false,
    recommended_safe_alternative: `Use the bounded IC recovery target near ${bounded_recovery_target}% rated if you want the lowest-friction recovery path.`,
  };
}

function laneRecommendedMainSteamIcTarget(first_response_lane: FirstResponseLane): number {
  const recommended_item = first_response_lane.items.find(
    (item) => item.recommended_action_id === "act_adjust_isolation_condenser" && typeof item.recommended_value === "number",
  );
  return typeof recommended_item?.recommended_value === "number" ? Number(recommended_item.recommended_value) : 72;
}

function validateMainSteamIsolationAction(params: ValidateActionParams): ActionValidationResult {
  if (params.action_request.action_id !== "act_adjust_isolation_condenser") {
    return passResult(
      params,
      "bounded_action_pass",
      "This bounded action does not currently require additional interception logic in this slice.",
    );
  }

  const requested_setpoint = clamp(Number(params.action_request.requested_value ?? params.plant_state.isolation_condenser_flow_pct), 0, 100);
  const bounded_recovery_target = laneRecommendedMainSteamIcTarget(params.first_response_lane);
  const lane_relevant = laneSupportsAction(params.first_response_lane, params.action_request.action_id);
  const pressure = Number(params.plant_state.vessel_pressure_mpa);
  const containment = Number(params.plant_state.containment_pressure_kpa);
  const escalation_active =
    pressure >= 7.42 ||
    containment >= 108 ||
    params.alarm_set.active_alarm_ids.includes("ALM_CONTAINMENT_PRESSURE_HIGH") ||
    params.alarm_set.active_alarm_ids.includes("ALM_SRV_STUCK_OPEN");
  const risk_context = `${formatSupportModeLabel(params.support_mode)} is active, combined risk is ${params.combined_risk.combined_risk_band} (${params.combined_risk.combined_risk_score.toFixed(
    1,
  )}/100), the dominant hypothesis is ${dominantHypothesisLabel(params.reasoning_snapshot)}, IC target is near ${bounded_recovery_target}% rated, pressure is ${pressure.toFixed(
    2,
  )} MPa, containment is ${containment.toFixed(1)} kPa, and offsite power remains available.`;
  const current_confidence_note = confidenceNote(params.operator_state);
  const alignedWithRecoveryLane =
    (lane_relevant ||
      params.reasoning_snapshot.dominant_hypothesis_id === "hyp_main_steam_isolation_upset" ||
      params.reasoning_snapshot.dominant_hypothesis_id === "hyp_alternate_heat_sink_gap" ||
      params.reasoning_snapshot.dominant_hypothesis_id === "hyp_isolation_recovery_lag") &&
    requested_setpoint >= 64 &&
    requested_setpoint <= 78;

  if (requested_setpoint < 20) {
    return {
      validation_result_id: buildValidationId(params.validation_sequence),
      action_request_id: params.action_request.action_request_id,
      sim_time_sec: params.action_request.sim_time_sec,
      outcome: "hard_prevent",
      requires_confirmation: false,
      override_allowed: false,
      reason_code: "msi_ic_below_safe_floor",
      explanation: "Requested isolation-condenser demand is below the bounded safe floor for this steam-isolation recovery path, so the action is blocked.",
      risk_context,
      confidence_note: current_confidence_note,
      affected_variable_ids: params.allowed_action.target_variable_ids,
      prevented_harm: true,
      nuisance_flag: false,
      recommended_safe_alternative: `Move isolation-condenser demand toward the bounded recovery band near ${bounded_recovery_target}% rated.`,
    };
  }

  if (escalation_active && requested_setpoint < 50) {
    return {
      validation_result_id: buildValidationId(params.validation_sequence),
      action_request_id: params.action_request.action_request_id,
      sim_time_sec: params.action_request.sim_time_sec,
      outcome: "hard_prevent",
      requires_confirmation: false,
      override_allowed: false,
      reason_code: "msi_reduced_ic_during_pressure_escalation",
      explanation: "Pressure-consequence markers are active, and reducing IC demand conflicts with the bounded recovery path, so the action is blocked.",
      risk_context,
      confidence_note: current_confidence_note,
      affected_variable_ids: params.allowed_action.target_variable_ids,
      prevented_harm: true,
      nuisance_flag: false,
      recommended_safe_alternative: `Hold or increase IC demand near ${bounded_recovery_target}% rated while pressure and containment remain stressed.`,
    };
  }

  if (requested_setpoint < 64) {
    return {
      validation_result_id: buildValidationId(params.validation_sequence),
      action_request_id: params.action_request.action_request_id,
      sim_time_sec: params.action_request.sim_time_sec,
      outcome: "soft_warning",
      requires_confirmation: true,
      override_allowed: false,
      reason_code: "msi_ic_below_guided_recovery_band",
      explanation: "Requested isolation-condenser demand is below the guided recovery band for this steam-isolation slice, so explicit confirmation is required.",
      risk_context,
      confidence_note: current_confidence_note,
      affected_variable_ids: params.allowed_action.target_variable_ids,
      prevented_harm: false,
      nuisance_flag: false,
      recommended_safe_alternative: `A safer direction is the bounded IC recovery target near ${bounded_recovery_target}% rated.`,
    };
  }

  if (requested_setpoint > 82) {
    return {
      validation_result_id: buildValidationId(params.validation_sequence),
      action_request_id: params.action_request.action_request_id,
      sim_time_sec: params.action_request.sim_time_sec,
      outcome: "soft_warning",
      requires_confirmation: true,
      override_allowed: false,
      reason_code: "msi_ic_above_guided_recovery_band",
      explanation: "Requested isolation-condenser demand is above the bounded guided band for this steam-isolation slice, so explicit confirmation is required.",
      risk_context,
      confidence_note: current_confidence_note,
      affected_variable_ids: params.allowed_action.target_variable_ids,
      prevented_harm: false,
      nuisance_flag: false,
      recommended_safe_alternative: `Stay near ${bounded_recovery_target}% rated unless the pressure picture clearly demands otherwise.`,
    };
  }

  if (
    !lane_relevant &&
    params.reasoning_snapshot.dominant_hypothesis_id !== "hyp_main_steam_isolation_upset" &&
    params.reasoning_snapshot.dominant_hypothesis_id !== "hyp_alternate_heat_sink_gap" &&
    params.reasoning_snapshot.dominant_hypothesis_id !== "hyp_isolation_recovery_lag"
  ) {
    return {
      validation_result_id: buildValidationId(params.validation_sequence),
      action_request_id: params.action_request.action_request_id,
      sim_time_sec: params.action_request.sim_time_sec,
      outcome: "soft_warning",
      requires_confirmation: true,
      override_allowed: false,
      reason_code: "msi_ic_not_current_recovery_lane",
      explanation: "The requested IC action is not strongly supported by the current steam-isolation first-response picture, so explicit confirmation is required.",
      risk_context,
      confidence_note: current_confidence_note,
      affected_variable_ids: params.allowed_action.target_variable_ids,
      prevented_harm: false,
      nuisance_flag: false,
      recommended_safe_alternative: "Re-check the current storyline and first-response lane before changing the IC path.",
    };
  }

  if (params.support_mode === "protected_response" && escalation_active && requested_setpoint !== bounded_recovery_target) {
    return {
      validation_result_id: buildValidationId(params.validation_sequence),
      action_request_id: params.action_request.action_request_id,
      sim_time_sec: params.action_request.sim_time_sec,
      outcome: "soft_warning",
      requires_confirmation: true,
      override_allowed: false,
      reason_code: "msi_protected_response_ic_precision_check",
      explanation: "Protected response is active, so moving IC demand away from the bounded steam-isolation target requires explicit confirmation.",
      risk_context,
      confidence_note: current_confidence_note,
      affected_variable_ids: params.allowed_action.target_variable_ids,
      prevented_harm: false,
      nuisance_flag: false,
      recommended_safe_alternative: `Stay with the bounded IC recovery target near ${bounded_recovery_target}% rated while the escalation picture is active.`,
    };
  }

  if (alignedWithRecoveryLane) {
    return passResult(
      params,
      "bounded_msi_ic_recovery_pass",
      "Requested isolation-condenser demand matches the current bounded recovery path for this deterministic steam-isolation scenario.",
    );
  }

  return {
    validation_result_id: buildValidationId(params.validation_sequence),
    action_request_id: params.action_request.action_request_id,
    sim_time_sec: params.action_request.sim_time_sec,
    outcome: "soft_warning",
    requires_confirmation: true,
    override_allowed: false,
    reason_code: "bounded_msi_ic_confirmation_required",
    explanation: "This isolation-condenser action is not clearly unsafe, but it sits outside the clean steam-isolation pass band and needs explicit confirmation.",
    risk_context,
    confidence_note: current_confidence_note,
    affected_variable_ids: params.allowed_action.target_variable_ids,
    prevented_harm: false,
    nuisance_flag: false,
    recommended_safe_alternative: `Use the bounded IC recovery target near ${bounded_recovery_target}% rated if you want the lowest-friction recovery path.`,
  };
}

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
  ValidationOutcome,
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

export type ValidationDemoPreset = {
  preset_id: "recommended" | "soft_warning" | "hard_prevent";
  label: string;
  requested_value: number;
  expected_outcome: ValidationOutcome;
  description: string;
};

type NumericActionValidationConfig = {
  runtime_profile_id: ScenarioRuntimeProfileId;
  action_id: string;
  requested_value_min: number;
  requested_value_max: number;
  fallback_target: number;
  pass_band: [number, number];
  guided_band: [number, number];
  absolute_hard_floor: number;
  escalation_hard_floor: number;
  dominant_hypothesis_ids: string[];
  pass_reason_code: string;
  pass_explanation: string;
  absolute_hard_reason_code: string;
  absolute_hard_explanation: string;
  contextual_hard_reason_code: string;
  contextual_hard_explanation: string;
  below_guided_reason_code: string;
  below_guided_explanation: string;
  above_guided_reason_code: string;
  above_guided_explanation: string;
  off_lane_reason_code: string;
  off_lane_explanation: string;
  protected_precision_reason_code: string;
  protected_precision_explanation: string;
  fallback_soft_reason_code: string;
  fallback_soft_explanation: string;
  low_band_alternative: (bounded_recovery_target: number) => string;
  high_band_alternative: (bounded_recovery_target: number) => string;
  off_lane_alternative: string;
  protected_precision_alternative: (bounded_recovery_target: number) => string;
  fallback_soft_alternative: (bounded_recovery_target: number) => string;
  absolute_hard_alternative: (bounded_recovery_target: number) => string;
  contextual_hard_alternative: (bounded_recovery_target: number) => string;
  recommended_target: (first_response_lane: FirstResponseLane) => number;
  risk_context: (params: ValidateActionParams, bounded_recovery_target: number) => string;
  escalation_active: (params: ValidateActionParams) => boolean;
  protected_precision_active: (
    params: ValidateActionParams,
    bounded_recovery_target: number,
    requested_setpoint: number,
    escalation_active: boolean,
  ) => boolean;
};

const escalationAlarmIds = ["ALM_RPV_LEVEL_LOW_LOW", "ALM_RPV_PRESSURE_HIGH", "ALM_CONTAINMENT_PRESSURE_HIGH"] as const;

const feedwaterConfig: NumericActionValidationConfig = {
  runtime_profile_id: "feedwater_degradation",
  action_id: "act_adjust_feedwater",
  requested_value_min: 35,
  requested_value_max: 95,
  fallback_target: 82,
  pass_band: [78, 86],
  guided_band: [78, 86],
  absolute_hard_floor: 60,
  escalation_hard_floor: 76,
  dominant_hypothesis_ids: ["hyp_feedwater_degradation"],
  pass_reason_code: "bounded_recovery_pass",
  pass_explanation: "Requested feedwater matches the current bounded recovery path for this deterministic scenario.",
  absolute_hard_reason_code: "feedwater_below_safe_floor",
  absolute_hard_explanation:
    "Requested feedwater is below the bounded recovery floor for this deterministic scenario, so the action is blocked.",
  contextual_hard_reason_code: "reduced_feedwater_during_escalation",
  contextual_hard_explanation:
    "Escalation markers are active, and this feedwater reduction conflicts with the bounded recovery path, so the action is blocked.",
  below_guided_reason_code: "feedwater_below_guided_recovery_band",
  below_guided_explanation:
    "Requested feedwater sits below the guided recovery band, so the action needs explicit confirmation before it proceeds.",
  above_guided_reason_code: "feedwater_above_guided_recovery_band",
  above_guided_explanation:
    "Requested feedwater is above the bounded guided band for this slice, so the action needs explicit confirmation before it proceeds.",
  off_lane_reason_code: "feedwater_not_current_recovery_lane",
  off_lane_explanation:
    "The requested feedwater action is not strongly supported by the current first-response picture, so explicit confirmation is required.",
  protected_precision_reason_code: "protected_response_precision_check",
  protected_precision_explanation:
    "Protected response is active, so a feedwater move away from the bounded target needs explicit confirmation before it proceeds.",
  fallback_soft_reason_code: "bounded_recovery_confirmation_required",
  fallback_soft_explanation:
    "This feedwater action is not clearly unsafe, but it is outside the clean pass band and needs explicit confirmation.",
  low_band_alternative: (bounded_recovery_target) =>
    `A safer direction is the current bounded recovery target near ${bounded_recovery_target}% rated.`,
  high_band_alternative: (bounded_recovery_target) =>
    `Stay near the current bounded recovery target around ${bounded_recovery_target}% rated unless a stronger reason is visible.`,
  off_lane_alternative: "Re-check the dominant storyline and the current first-response lane before changing the feedwater path.",
  protected_precision_alternative: (bounded_recovery_target) =>
    `Stay with the bounded recovery target near ${bounded_recovery_target}% rated while the escalation picture is still active.`,
  fallback_soft_alternative: (bounded_recovery_target) =>
    `Use the bounded recovery target near ${bounded_recovery_target}% rated if you want the lowest-friction recovery path.`,
  absolute_hard_alternative: (bounded_recovery_target) =>
    `Use the bounded feedwater recovery path near ${bounded_recovery_target}% rated and re-check level plus pressure.`,
  contextual_hard_alternative: (bounded_recovery_target) =>
    `Hold the recovery direction and move feedwater toward ${bounded_recovery_target}% rated instead of reducing it.`,
  recommended_target: (first_response_lane) => laneRecommendedTarget(first_response_lane, "act_adjust_feedwater", 82),
  risk_context: (params, bounded_recovery_target) => {
    const plant_urgency = factorRawIndex(params.combined_risk, "plant_urgency");
    return `${formatSupportModeLabel(params.support_mode)} is active, combined risk is ${params.combined_risk.combined_risk_band} (${params.combined_risk.combined_risk_score.toFixed(
      1,
    )}/100), plant urgency is ${plant_urgency}/100, the dominant hypothesis is ${dominantHypothesisLabel(
      params.reasoning_snapshot,
    )}, and the current first-response lane points to a bounded recovery target near ${bounded_recovery_target}% rated.`;
  },
  escalation_active: (params) =>
    Boolean(params.plant_state.reactor_trip_active) ||
    escalationAlarmIds.some((alarm_id) => params.alarm_set.active_alarm_ids.includes(alarm_id)),
  protected_precision_active: (params, bounded_recovery_target, requested_setpoint) =>
    params.support_mode === "protected_response" &&
    factorRawIndex(params.combined_risk, "plant_urgency") >= 72 &&
    requested_setpoint !== bounded_recovery_target,
};

const loopIcConfig: NumericActionValidationConfig = {
  runtime_profile_id: "loss_of_offsite_power_sbo",
  action_id: "act_adjust_isolation_condenser",
  requested_value_min: 0,
  requested_value_max: 100,
  fallback_target: 68,
  pass_band: [60, 76],
  guided_band: [60, 82],
  absolute_hard_floor: 20,
  escalation_hard_floor: 45,
  dominant_hypothesis_ids: ["hyp_loss_of_offsite_power", "hyp_decay_heat_removal_gap"],
  pass_reason_code: "bounded_ic_recovery_pass",
  pass_explanation: "Requested isolation-condenser demand matches the current bounded recovery path for this deterministic scenario.",
  absolute_hard_reason_code: "ic_below_safe_floor",
  absolute_hard_explanation:
    "Requested isolation-condenser demand is below the bounded safe floor for this recovery path, so the action is blocked.",
  contextual_hard_reason_code: "reduced_ic_during_escalation",
  contextual_hard_explanation:
    "Escalation markers are active, and reducing IC demand conflicts with the bounded recovery path, so the action is blocked.",
  below_guided_reason_code: "ic_below_guided_recovery_band",
  below_guided_explanation:
    "Requested isolation-condenser demand is below the guided recovery band, so explicit confirmation is required.",
  above_guided_reason_code: "ic_above_guided_recovery_band",
  above_guided_explanation:
    "Requested isolation-condenser demand is above the bounded guided band for this slice, so explicit confirmation is required.",
  off_lane_reason_code: "ic_not_current_recovery_lane",
  off_lane_explanation:
    "The requested IC action is not strongly supported by the current first-response picture, so explicit confirmation is required.",
  protected_precision_reason_code: "protected_response_ic_precision_check",
  protected_precision_explanation:
    "Protected response is active, so moving IC demand away from the bounded target requires explicit confirmation.",
  fallback_soft_reason_code: "bounded_ic_confirmation_required",
  fallback_soft_explanation:
    "This isolation-condenser action is not clearly unsafe, but it sits outside the clean pass band and needs explicit confirmation.",
  low_band_alternative: (bounded_recovery_target) =>
    `A safer direction is the bounded IC recovery target near ${bounded_recovery_target}% rated.`,
  high_band_alternative: (bounded_recovery_target) =>
    `Stay near ${bounded_recovery_target}% rated unless the pressure picture clearly demands otherwise.`,
  off_lane_alternative: "Re-check the current storyline and first-response lane before changing the IC path.",
  protected_precision_alternative: (bounded_recovery_target) =>
    `Stay with the bounded IC recovery target near ${bounded_recovery_target}% rated while the escalation picture is active.`,
  fallback_soft_alternative: (bounded_recovery_target) =>
    `Use the bounded IC recovery target near ${bounded_recovery_target}% rated if you want the lowest-friction recovery path.`,
  absolute_hard_alternative: (bounded_recovery_target) =>
    `Move isolation-condenser demand toward the bounded recovery band near ${bounded_recovery_target}% rated.`,
  contextual_hard_alternative: (bounded_recovery_target) =>
    `Hold or increase IC demand near ${bounded_recovery_target}% rated while pressure and DC margin remain stressed.`,
  recommended_target: (first_response_lane) => laneRecommendedTarget(first_response_lane, "act_adjust_isolation_condenser", 68),
  risk_context: (params, bounded_recovery_target) => {
    const pressure = Number(params.plant_state.vessel_pressure_mpa);
    const dc_bus = Number(params.plant_state.dc_bus_soc_pct);
    return `${formatSupportModeLabel(params.support_mode)} is active, combined risk is ${params.combined_risk.combined_risk_band} (${params.combined_risk.combined_risk_score.toFixed(
      1,
    )}/100), the dominant hypothesis is ${dominantHypothesisLabel(
      params.reasoning_snapshot,
    )}, IC target is near ${bounded_recovery_target}% rated, pressure is ${pressure.toFixed(2)} MPa, and DC margin is ${dc_bus.toFixed(1)}%.`;
  },
  escalation_active: (params) =>
    Number(params.plant_state.vessel_pressure_mpa) >= 7.45 ||
    Number(params.plant_state.dc_bus_soc_pct) < 32 ||
    params.alarm_set.active_alarm_ids.includes("ALM_CONTAINMENT_PRESSURE_HIGH") ||
    params.alarm_set.active_alarm_ids.includes("ALM_SRV_STUCK_OPEN"),
  protected_precision_active: (params, bounded_recovery_target, requested_setpoint, escalation_active) =>
    params.support_mode === "protected_response" && escalation_active && requested_setpoint !== bounded_recovery_target,
};

const mainSteamIcConfig: NumericActionValidationConfig = {
  runtime_profile_id: "main_steam_isolation_upset",
  action_id: "act_adjust_isolation_condenser",
  requested_value_min: 0,
  requested_value_max: 100,
  fallback_target: 72,
  pass_band: [64, 78],
  guided_band: [64, 82],
  absolute_hard_floor: 20,
  escalation_hard_floor: 50,
  dominant_hypothesis_ids: [
    "hyp_main_steam_isolation_upset",
    "hyp_alternate_heat_sink_gap",
    "hyp_isolation_recovery_lag",
  ],
  pass_reason_code: "bounded_msi_ic_recovery_pass",
  pass_explanation:
    "Requested isolation-condenser demand matches the current bounded recovery path for this deterministic steam-isolation scenario.",
  absolute_hard_reason_code: "msi_ic_below_safe_floor",
  absolute_hard_explanation:
    "Requested isolation-condenser demand is below the bounded safe floor for this steam-isolation recovery path, so the action is blocked.",
  contextual_hard_reason_code: "msi_reduced_ic_during_pressure_escalation",
  contextual_hard_explanation:
    "Pressure-consequence markers are active, and reducing IC demand conflicts with the bounded recovery path, so the action is blocked.",
  below_guided_reason_code: "msi_ic_below_guided_recovery_band",
  below_guided_explanation:
    "Requested isolation-condenser demand is below the guided recovery band for this steam-isolation slice, so explicit confirmation is required.",
  above_guided_reason_code: "msi_ic_above_guided_recovery_band",
  above_guided_explanation:
    "Requested isolation-condenser demand is above the bounded guided band for this steam-isolation slice, so explicit confirmation is required.",
  off_lane_reason_code: "msi_ic_not_current_recovery_lane",
  off_lane_explanation:
    "The requested IC action is not strongly supported by the current steam-isolation first-response picture, so explicit confirmation is required.",
  protected_precision_reason_code: "msi_protected_response_ic_precision_check",
  protected_precision_explanation:
    "Protected response is active, so moving IC demand away from the bounded steam-isolation target requires explicit confirmation.",
  fallback_soft_reason_code: "bounded_msi_ic_confirmation_required",
  fallback_soft_explanation:
    "This isolation-condenser action is not clearly unsafe, but it sits outside the clean steam-isolation pass band and needs explicit confirmation.",
  low_band_alternative: (bounded_recovery_target) =>
    `A safer direction is the bounded IC recovery target near ${bounded_recovery_target}% rated.`,
  high_band_alternative: (bounded_recovery_target) =>
    `Stay near ${bounded_recovery_target}% rated unless the pressure picture clearly demands otherwise.`,
  off_lane_alternative: "Re-check the current storyline and first-response lane before changing the IC path.",
  protected_precision_alternative: (bounded_recovery_target) =>
    `Stay with the bounded IC recovery target near ${bounded_recovery_target}% rated while the escalation picture is active.`,
  fallback_soft_alternative: (bounded_recovery_target) =>
    `Use the bounded IC recovery target near ${bounded_recovery_target}% rated if you want the lowest-friction recovery path.`,
  absolute_hard_alternative: (bounded_recovery_target) =>
    `Move isolation-condenser demand toward the bounded recovery band near ${bounded_recovery_target}% rated.`,
  contextual_hard_alternative: (bounded_recovery_target) =>
    `Hold or increase IC demand near ${bounded_recovery_target}% rated while pressure and containment remain stressed.`,
  recommended_target: (first_response_lane) => laneRecommendedTarget(first_response_lane, "act_adjust_isolation_condenser", 72),
  risk_context: (params, bounded_recovery_target) => {
    const pressure = Number(params.plant_state.vessel_pressure_mpa);
    const containment = Number(params.plant_state.containment_pressure_kpa);
    return `${formatSupportModeLabel(params.support_mode)} is active, combined risk is ${params.combined_risk.combined_risk_band} (${params.combined_risk.combined_risk_score.toFixed(
      1,
    )}/100), the dominant hypothesis is ${dominantHypothesisLabel(
      params.reasoning_snapshot,
    )}, IC target is near ${bounded_recovery_target}% rated, pressure is ${pressure.toFixed(
      2,
    )} MPa, containment is ${containment.toFixed(1)} kPa, and offsite power remains available.`;
  },
  escalation_active: (params) =>
    Number(params.plant_state.vessel_pressure_mpa) >= 7.42 ||
    Number(params.plant_state.containment_pressure_kpa) >= 108 ||
    params.alarm_set.active_alarm_ids.includes("ALM_CONTAINMENT_PRESSURE_HIGH") ||
    params.alarm_set.active_alarm_ids.includes("ALM_SRV_STUCK_OPEN"),
  protected_precision_active: (params, bounded_recovery_target, requested_setpoint, escalation_active) =>
    params.support_mode === "protected_response" && escalation_active && requested_setpoint !== bounded_recovery_target,
};

const numericActionConfigs: Readonly<Record<ScenarioRuntimeProfileId, NumericActionValidationConfig>> = {
  feedwater_degradation: feedwaterConfig,
  loss_of_offsite_power_sbo: loopIcConfig,
  main_steam_isolation_upset: mainSteamIcConfig,
};

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

function laneRecommendedTarget(first_response_lane: FirstResponseLane, action_id: string, fallback_target: number): number {
  const recommended_item = first_response_lane.items.find(
    (item) => item.recommended_action_id === action_id && typeof item.recommended_value === "number",
  );
  return typeof recommended_item?.recommended_value === "number" ? Number(recommended_item.recommended_value) : fallback_target;
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

function buildValidationResult(
  params: ValidateActionParams,
  outcome: ValidationOutcome,
  reason_code: string,
  explanation: string,
  risk_context: string,
  recommended_safe_alternative?: string,
  override_allowed = false,
): ActionValidationResult {
  return {
    validation_result_id: buildValidationId(params.validation_sequence),
    action_request_id: params.action_request.action_request_id,
    sim_time_sec: params.action_request.sim_time_sec,
    outcome,
    requires_confirmation: outcome === "soft_warning",
    override_allowed,
    reason_code,
    explanation,
    risk_context,
    confidence_note: confidenceNote(params.operator_state),
    affected_variable_ids: params.allowed_action.target_variable_ids,
    prevented_harm: outcome === "hard_prevent",
    nuisance_flag: false,
    ...(recommended_safe_alternative ? { recommended_safe_alternative } : {}),
  };
}

function passResult(params: ValidateActionParams, reason_code: string, explanation: string): ActionValidationResult {
  return buildValidationResult(params, "pass", reason_code, explanation, explanation);
}

function validateConfiguredNumericAction(
  params: ValidateActionParams,
  config: NumericActionValidationConfig,
): ActionValidationResult {
  if (params.action_request.action_id !== config.action_id) {
    return passResult(
      params,
      "bounded_action_pass",
      "This bounded action does not currently require additional interception logic in this slice.",
    );
  }

  const requested_setpoint = clamp(
    Number(params.action_request.requested_value ?? params.plant_state[params.allowed_action.target_variable_ids[0] ?? ""] ?? config.fallback_target),
    config.requested_value_min,
    config.requested_value_max,
  );
  const bounded_recovery_target = config.recommended_target(params.first_response_lane);
  const lane_relevant = laneSupportsAction(params.first_response_lane, params.action_request.action_id);
  const dominant_hypothesis_supported = config.dominant_hypothesis_ids.includes(
    params.reasoning_snapshot.dominant_hypothesis_id ?? "",
  );
  const aligned_with_recovery_lane =
    (lane_relevant || dominant_hypothesis_supported) &&
    requested_setpoint >= config.pass_band[0] &&
    requested_setpoint <= config.pass_band[1];
  const escalation_active = config.escalation_active(params);
  const risk_context = config.risk_context(params, bounded_recovery_target);

  if (requested_setpoint < config.absolute_hard_floor) {
    return buildValidationResult(
      params,
      "hard_prevent",
      config.absolute_hard_reason_code,
      config.absolute_hard_explanation,
      risk_context,
      config.absolute_hard_alternative(bounded_recovery_target),
      false,
    );
  }

  if (escalation_active && requested_setpoint < config.escalation_hard_floor) {
    return buildValidationResult(
      params,
      "hard_prevent",
      config.contextual_hard_reason_code,
      config.contextual_hard_explanation,
      risk_context,
      config.contextual_hard_alternative(bounded_recovery_target),
      true,
    );
  }

  if (requested_setpoint < config.guided_band[0]) {
    return buildValidationResult(
      params,
      "soft_warning",
      config.below_guided_reason_code,
      config.below_guided_explanation,
      risk_context,
      config.low_band_alternative(bounded_recovery_target),
    );
  }

  if (requested_setpoint > config.guided_band[1]) {
    return buildValidationResult(
      params,
      "soft_warning",
      config.above_guided_reason_code,
      config.above_guided_explanation,
      risk_context,
      config.high_band_alternative(bounded_recovery_target),
    );
  }

  if (!lane_relevant && !dominant_hypothesis_supported) {
    return buildValidationResult(
      params,
      "soft_warning",
      config.off_lane_reason_code,
      config.off_lane_explanation,
      risk_context,
      config.off_lane_alternative,
    );
  }

  if (config.protected_precision_active(params, bounded_recovery_target, requested_setpoint, escalation_active)) {
    return buildValidationResult(
      params,
      "soft_warning",
      config.protected_precision_reason_code,
      config.protected_precision_explanation,
      risk_context,
      config.protected_precision_alternative(bounded_recovery_target),
    );
  }

  if (aligned_with_recovery_lane) {
    return passResult(params, config.pass_reason_code, config.pass_explanation);
  }

  return buildValidationResult(
    params,
    "soft_warning",
    config.fallback_soft_reason_code,
    config.fallback_soft_explanation,
    risk_context,
    config.fallback_soft_alternative(bounded_recovery_target),
  );
}

export function getValidatorDemoPresets(
  runtime_profile_id: ScenarioRuntimeProfileId,
  action_id: string,
): ValidationDemoPreset[] {
  const config = numericActionConfigs[runtime_profile_id];
  if (!config || config.action_id !== action_id) {
    return [];
  }

  const recommended_target = config.fallback_target;
  const soft_warning_value = config.guided_band[0] - (config.runtime_profile_id === "feedwater_degradation" ? 8 : 5);
  const hard_prevent_value =
    config.runtime_profile_id === "main_steam_isolation_upset" ? config.absolute_hard_floor - 10 : config.absolute_hard_floor - 5;

  return [
    {
      preset_id: "recommended",
      label: "Show pass",
      requested_value: recommended_target,
      expected_outcome: "pass",
      description: "Applies the bounded recovery target used for the clean pass path.",
    },
    {
      preset_id: "soft_warning",
      label: "Show soft warning",
      requested_value: soft_warning_value,
      expected_outcome: "soft_warning",
      description: "Uses an off-band but still recoverable request to surface explicit confirmation.",
    },
    {
      preset_id: "hard_prevent",
      label: "Show hard prevent",
      requested_value: hard_prevent_value,
      expected_outcome: "hard_prevent",
      description: "Uses a clearly unsafe request to surface the deterministic hard-prevent path.",
    },
  ];
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
  const config = numericActionConfigs[runtime_profile_id];

  if (!config) {
    return passResult(
      params,
      "bounded_action_pass",
      "This bounded action does not currently require additional interception logic in this slice.",
    );
  }

  return validateConfiguredNumericAction(params, config);
}

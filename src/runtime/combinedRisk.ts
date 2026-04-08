import type {
  AlarmIntelligenceSnapshot,
  AlarmSet,
  CombinedRiskBand,
  CombinedRiskFactor,
  CombinedRiskSnapshot,
  FirstResponseLane,
  HumanMonitoringRiskCues,
  HumanMonitoringSnapshot,
  OperatorStateSnapshot,
  PlantStateSnapshot,
  ReasoningSnapshot,
  ScenarioPhase,
  SupportMode,
} from "../contracts/aura";
import { clamp } from "../data/plantModel";
import { calculateDiagnosisAmbiguityIndex, calculatePlantSeverityIndex } from "./operatorState";

type BuildCombinedRiskParams = {
  sim_time_sec: number;
  plant_state: PlantStateSnapshot;
  alarm_set: AlarmSet;
  alarm_intelligence: AlarmIntelligenceSnapshot;
  reasoning_snapshot: ReasoningSnapshot;
  human_monitoring: HumanMonitoringSnapshot;
  operator_state: OperatorStateSnapshot;
  first_response_lane: FirstResponseLane;
  current_phase: ScenarioPhase;
  current_phase_elapsed_time_sec: number;
  scenario_expected_duration_sec: number;
  previous_combined_risk?: CombinedRiskSnapshot;
};

const RISK_MODEL_ID = "hpsn_lite_v1";
const HUMAN_FACTOR_IDS = new Set<CombinedRiskFactor["factor_id"]>([
  "human_workload_pressure",
  "attention_instability",
  "interaction_friction",
  "human_confidence_penalty",
]);
const CONTEXT_FACTOR_IDS = new Set<CombinedRiskFactor["factor_id"]>([
  "plant_urgency",
  "alarm_escalation_pressure",
  "storyline_procedure_pressure",
  "phase_time_pressure",
]);
const FACTOR_CAPS: Record<CombinedRiskFactor["factor_id"], number> = {
  plant_urgency: 34,
  alarm_escalation_pressure: 14,
  storyline_procedure_pressure: 12,
  phase_time_pressure: 6,
  human_workload_pressure: 10,
  attention_instability: 8,
  interaction_friction: 10,
  human_confidence_penalty: 6,
};

function roundScore(value: number): number {
  return Number(clamp(value, 0, 100).toFixed(1));
}

function roundIndex(value: number): number {
  return Math.round(clamp(value, 0, 100));
}

function numberValue(value: PlantStateSnapshot[string]): number {
  return typeof value === "number" ? value : Number(value);
}

function scoreBand(score: number): CombinedRiskBand {
  if (score >= 70) {
    return "high";
  }

  if (score >= 45) {
    return "elevated";
  }

  if (score >= 25) {
    return "guarded";
  }

  return "low";
}

function formatBandLabel(band: CombinedRiskBand): string {
  switch (band) {
    case "high":
      return "High";
    case "elevated":
      return "Elevated";
    case "guarded":
      return "Guarded";
    case "low":
      return "Low";
  }
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

function joinLabels(labels: string[]): string {
  if (labels.length <= 1) {
    return labels[0] ?? "bounded cues";
  }

  if (labels.length === 2) {
    return `${labels[0]} and ${labels[1]}`;
  }

  return `${labels[0]}, ${labels[1]}, and ${labels[2]}`;
}

function countPriority(alarm_set: AlarmSet, priority: "P1" | "P2"): number {
  return alarm_set.active_alarms.filter((alarm) => alarm.priority === priority).length;
}

function calculatePlantUrgencyIndex(params: {
  plant_state: PlantStateSnapshot;
  alarm_set: AlarmSet;
}): number {
  const plant_severity = calculatePlantSeverityIndex(params.plant_state);
  const level = numberValue(params.plant_state.vessel_water_level_m);
  const pressure = numberValue(params.plant_state.vessel_pressure_mpa);
  const containment = numberValue(params.plant_state.containment_pressure_kpa);
  const feedwater_gap =
    numberValue(params.plant_state.main_steam_flow_pct) - numberValue(params.plant_state.feedwater_flow_pct);
  const p1_count = countPriority(params.alarm_set, "P1");
  const newly_raised_count = params.alarm_set.newly_raised_alarm_ids.length;

  return roundIndex(
    plant_severity * 0.72 +
      (level < 6.6 ? 18 : level < 6.8 ? 8 : 0) +
      (pressure > 7.45 ? 14 : pressure > 7.35 ? 6 : 0) +
      (containment > 108 ? 12 : containment > 106 ? 5 : 0) +
      clamp(Math.max(feedwater_gap - 8, 0) * 1.2, 0, 10) +
      (Boolean(params.plant_state.reactor_trip_active) ? 12 : 0) +
      (Boolean(params.plant_state.safety_relief_valve_open) ? 10 : 0) +
      p1_count * 4 +
      Math.min(newly_raised_count, 3) * 4,
  );
}

function describePlantUrgency(params: {
  plant_state: PlantStateSnapshot;
  alarm_set: AlarmSet;
  plant_urgency_index: number;
}): string {
  const concerns: string[] = [];
  if (numberValue(params.plant_state.vessel_water_level_m) < 6.8) {
    concerns.push("vessel inventory is slipping");
  }
  if (numberValue(params.plant_state.vessel_pressure_mpa) > 7.35) {
    concerns.push("reactor pressure is climbing");
  }
  if (Boolean(params.plant_state.safety_relief_valve_open)) {
    concerns.push("SRV relief is already active");
  }
  if (Boolean(params.plant_state.reactor_trip_active)) {
    concerns.push("trip consequences are now in play");
  }
  if (numberValue(params.plant_state.containment_pressure_kpa) > 106) {
    concerns.push("containment consequence markers are rising");
  }

  if (concerns.length === 0) {
    return `Plant urgency is ${params.plant_urgency_index}/100 and remains inside the bounded watch band.`;
  }

  return `Plant urgency is ${params.plant_urgency_index}/100 because ${joinLabels(concerns.slice(0, 2))}.`;
}

function calculateAlarmEscalationPressure(params: {
  alarm_set: AlarmSet;
  alarm_intelligence: AlarmIntelligenceSnapshot;
}): number {
  const p1_count = countPriority(params.alarm_set, "P1");
  const p2_count = countPriority(params.alarm_set, "P2");
  const compression_pressure = clamp((params.alarm_intelligence.compression_ratio - 1) * 10, 0, 18);

  return roundIndex(
    params.alarm_set.active_alarm_count * 6 +
      params.alarm_intelligence.grouped_alarm_count * 8 +
      p1_count * 14 +
      p2_count * 6 +
      compression_pressure +
      Math.min(params.alarm_set.newly_raised_alarm_ids.length, 4) * 7,
  );
}

function describeAlarmEscalationPressure(params: {
  alarm_set: AlarmSet;
  alarm_intelligence: AlarmIntelligenceSnapshot;
  alarm_escalation_pressure: number;
}): string {
  return `Alarm escalation pressure is ${params.alarm_escalation_pressure}/100 from ${params.alarm_set.active_alarm_count} active alarms, ${params.alarm_intelligence.grouped_alarm_count} grouped clusters, and ${params.alarm_set.newly_raised_alarm_ids.length} newly raised cues this tick.`;
}

function calculateStorylineProcedurePressure(params: {
  reasoning_snapshot: ReasoningSnapshot;
  first_response_lane: FirstResponseLane;
}): number {
  const ambiguity = calculateDiagnosisAmbiguityIndex(params.reasoning_snapshot);
  const check_count = params.first_response_lane.items.filter((item) => item.item_kind === "check").length;
  const action_count = params.first_response_lane.items.filter((item) => item.item_kind === "action").length;
  const watch_count = params.first_response_lane.items.filter((item) => item.item_kind === "watch").length;
  const lane_breadth_pressure = clamp(Math.max(params.first_response_lane.items.length - 2, 0) * 10, 0, 30);
  const lane_mix_pressure =
    (check_count > 0 && action_count > 0 ? 8 : 0) +
    (watch_count > 0 && action_count > 0 ? 6 : 0) +
    (watch_count > 1 ? 6 : 0);

  return roundIndex(
    ambiguity * 0.68 +
      lane_breadth_pressure +
      lane_mix_pressure +
      (params.reasoning_snapshot.changed_since_last_tick ? 10 : 0) +
      clamp(10 - params.reasoning_snapshot.stable_for_ticks * 3, 0, 10),
  );
}

function describeStorylineProcedurePressure(params: {
  storyline_procedure_pressure: number;
  reasoning_snapshot: ReasoningSnapshot;
  first_response_lane: FirstResponseLane;
}): string {
  const dominant_label = params.reasoning_snapshot.ranked_hypotheses[0]?.label ?? "monitoring only";
  return `Storyline/procedure pressure is ${params.storyline_procedure_pressure}/100 because ${dominant_label.toLowerCase()} is driving ${params.first_response_lane.items.length} bounded first-response items while the storyline ${params.reasoning_snapshot.changed_since_last_tick ? "is still shifting" : `has held for ${params.reasoning_snapshot.stable_for_ticks} ticks`}.`;
}

function calculatePhaseTimePressure(params: {
  sim_time_sec: number;
  current_phase: ScenarioPhase;
  current_phase_elapsed_time_sec: number;
  scenario_expected_duration_sec: number;
}): number {
  const phase_progress =
    params.current_phase.nominal_duration_sec > 0
      ? params.current_phase_elapsed_time_sec / params.current_phase.nominal_duration_sec
      : 0;
  const overall_progress =
    params.scenario_expected_duration_sec > 0 ? params.sim_time_sec / params.scenario_expected_duration_sec : 0;

  return roundIndex(
    clamp(Math.max(phase_progress - 0.6, 0) * 55, 0, 60) +
      clamp(Math.max(overall_progress - 0.7, 0) * 38, 0, 28) +
      clamp(Math.max(phase_progress - 1, 0) * 25, 0, 18),
  );
}

function describePhaseTimePressure(params: {
  phase_time_pressure: number;
  current_phase: ScenarioPhase;
  current_phase_elapsed_time_sec: number;
  scenario_expected_duration_sec: number;
  sim_time_sec: number;
}): string {
  const phase_progress =
    params.current_phase.nominal_duration_sec > 0
      ? params.current_phase_elapsed_time_sec / params.current_phase.nominal_duration_sec
      : 0;
  const overall_progress =
    params.scenario_expected_duration_sec > 0 ? params.sim_time_sec / params.scenario_expected_duration_sec : 0;

  return `Phase/time pressure is ${params.phase_time_pressure}/100 with ${params.current_phase.label} ${Math.round(
    phase_progress * 100,
  )}% through its nominal window and the scenario ${Math.round(overall_progress * 100)}% through expected duration.`;
}

function createEmptyRiskCues(): HumanMonitoringRiskCues {
  return {
    hesitation_pressure: 0,
    latency_trend_pressure: 0,
    reversal_oscillation_pressure: 0,
    inactivity_pressure: 0,
    burstiness_pressure: 0,
    navigation_instability_pressure: 0,
    advisory_visual_attention_pressure: 0,
  };
}

function calculateInteractionFriction(risk_cues: HumanMonitoringRiskCues): number {
  return roundIndex(
    risk_cues.hesitation_pressure * 0.24 +
      risk_cues.latency_trend_pressure * 0.19 +
      risk_cues.reversal_oscillation_pressure * 0.17 +
      risk_cues.inactivity_pressure * 0.18 +
      risk_cues.burstiness_pressure * 0.12 +
      risk_cues.navigation_instability_pressure * 0.1,
  );
}

function calculateAttentionInstability(params: {
  operator_state: OperatorStateSnapshot;
  risk_cues: HumanMonitoringRiskCues;
}): number {
  const base_instability = Math.max(0, 100 - params.operator_state.attention_stability_index);
  return roundIndex(base_instability * 0.82 + params.risk_cues.advisory_visual_attention_pressure * 0.35);
}

function calculateHumanPressureIndex(params: {
  operator_state: OperatorStateSnapshot;
  attention_instability: number;
  interaction_friction: number;
}): number {
  return roundIndex(
    params.operator_state.workload_index * 0.42 +
      params.attention_instability * 0.28 +
      params.interaction_friction * 0.3,
  );
}

function resolveHumanInfluenceScale(human_monitoring: HumanMonitoringSnapshot): number {
  const aggregate_confidence = human_monitoring.aggregate_confidence;
  const has_live_contributor =
    human_monitoring.interpretation_input?.contributing_source_ids.some(
      (source_id) => source_id !== "legacy_runtime_placeholder",
    ) ?? false;

  if (
    human_monitoring.mode === "unavailable" ||
    human_monitoring.freshness_status === "stale" ||
    human_monitoring.freshness_status === "no_observations"
  ) {
    return 0.25;
  }

  if (!has_live_contributor || human_monitoring.mode === "placeholder_compatibility") {
    return 0.4;
  }

  if (human_monitoring.freshness_status === "current" && aggregate_confidence >= 70) {
    return 1;
  }

  if (human_monitoring.freshness_status === "aging" || aggregate_confidence >= 55) {
    return 0.7;
  }

  return 0.4;
}

function buildConfidenceCaveat(params: {
  human_monitoring: HumanMonitoringSnapshot;
  human_influence_scale: number;
}): string {
  const confidence = params.human_monitoring.aggregate_confidence;
  const freshness = params.human_monitoring.freshness_status;
  const mode = params.human_monitoring.mode.replace(/_/g, " ");

  if (params.human_influence_scale >= 1) {
    return `Human-side factors are fully active because monitoring is ${freshness} with ${confidence}/100 aggregate confidence; plant and context factors remain fully active.`;
  }

  return `Human-side factors are scaled to ${params.human_influence_scale.toFixed(2)} because monitoring is ${mode} with ${freshness} freshness and ${confidence}/100 aggregate confidence; plant and context factors remain fully active.`;
}

function applyContributionCap(raw_index: number, factor_id: CombinedRiskFactor["factor_id"], human_influence_scale: number): number {
  const cap = FACTOR_CAPS[factor_id];
  const weighted_cap = HUMAN_FACTOR_IDS.has(factor_id) ? cap * human_influence_scale : cap;
  return roundScore((raw_index / 100) * weighted_cap);
}

function applyHumanDropoffDamping(
  factor_breakdown: CombinedRiskFactor[],
  previous_combined_risk: CombinedRiskSnapshot | undefined,
  human_influence_scale: number,
): CombinedRiskFactor[] {
  if (!previous_combined_risk || human_influence_scale >= previous_combined_risk.human_influence_scale) {
    return factor_breakdown;
  }

  const previous_by_id = Object.fromEntries(
    previous_combined_risk.factor_breakdown.map((factor) => [factor.factor_id, factor]),
  ) as Record<string, CombinedRiskFactor>;
  const context_delta = factor_breakdown.reduce((total, factor) => {
    if (!CONTEXT_FACTOR_IDS.has(factor.factor_id)) {
      return total;
    }

    return total + Math.abs(factor.contribution - (previous_by_id[factor.factor_id]?.contribution ?? 0));
  }, 0);

  if (context_delta >= 4) {
    return factor_breakdown;
  }

  return factor_breakdown.map((factor) => {
    if (!HUMAN_FACTOR_IDS.has(factor.factor_id)) {
      return factor;
    }

    const previous_factor = previous_by_id[factor.factor_id];
    if (!previous_factor || factor.contribution >= previous_factor.contribution) {
      return factor;
    }

    return {
      ...factor,
      contribution: roundScore(Math.max(previous_factor.contribution - 2, factor.contribution)),
    };
  });
}

function chooseRecommendedAssistanceMode(params: {
  combined_risk_score: number;
  plant_urgency_index: number;
  alarm_escalation_pressure: number;
  storyline_procedure_pressure: number;
  human_pressure_index: number;
}): SupportMode {
  if (
    params.combined_risk_score >= 70 ||
    params.plant_urgency_index >= 78 ||
    (params.plant_urgency_index >= 70 && params.alarm_escalation_pressure >= 60)
  ) {
    return "protected_response";
  }

  if (
    params.combined_risk_score >= 45 ||
    params.plant_urgency_index >= 58 ||
    params.storyline_procedure_pressure >= 58 ||
    params.human_pressure_index >= 66 ||
    params.alarm_escalation_pressure >= 60
  ) {
    return "guided_support";
  }

  return "monitoring_support";
}

function factorContributionDelta(
  factor: CombinedRiskFactor,
  previous_combined_risk: CombinedRiskSnapshot | undefined,
): number {
  const previous = previous_combined_risk?.factor_breakdown.find(
    (candidate) => candidate.factor_id === factor.factor_id,
  );
  return roundScore(factor.contribution - (previous?.contribution ?? 0));
}

function buildChangeSummary(
  factor_breakdown: CombinedRiskFactor[],
  combined_risk_score: number,
  previous_combined_risk: CombinedRiskSnapshot | undefined,
): string {
  if (!previous_combined_risk) {
    return "Initial combined-risk snapshot established.";
  }

  const delta = roundScore(combined_risk_score - previous_combined_risk.combined_risk_score);
  if (Math.abs(delta) < 2.5) {
    return `Risk is steady; ${factor_breakdown[0]?.label.toLowerCase() ?? "the current drivers"} remain the main driver.`;
  }

  const strongest_shift = [...factor_breakdown]
    .map((factor) => ({
      factor,
      contribution_delta: factorContributionDelta(factor, previous_combined_risk),
    }))
    .sort((left, right) => Math.abs(right.contribution_delta) - Math.abs(left.contribution_delta))[0];

  if (delta > 0) {
    return `Risk rose ${delta.toFixed(1)} points because ${strongest_shift.factor.label.toLowerCase()} increased.`;
  }

  return `Risk eased ${Math.abs(delta).toFixed(1)} points because ${strongest_shift.factor.label.toLowerCase()} eased.`;
}

export function buildCombinedRiskSnapshot(params: BuildCombinedRiskParams): CombinedRiskSnapshot {
  const plant_urgency_index = calculatePlantUrgencyIndex({
    plant_state: params.plant_state,
    alarm_set: params.alarm_set,
  });
  const alarm_escalation_pressure = calculateAlarmEscalationPressure({
    alarm_set: params.alarm_set,
    alarm_intelligence: params.alarm_intelligence,
  });
  const storyline_procedure_pressure = calculateStorylineProcedurePressure({
    reasoning_snapshot: params.reasoning_snapshot,
    first_response_lane: params.first_response_lane,
  });
  const phase_time_pressure = calculatePhaseTimePressure({
    sim_time_sec: params.sim_time_sec,
    current_phase: params.current_phase,
    current_phase_elapsed_time_sec: params.current_phase_elapsed_time_sec,
    scenario_expected_duration_sec: params.scenario_expected_duration_sec,
  });
  const risk_cues = params.human_monitoring.interpretation_input?.risk_cues ?? createEmptyRiskCues();
  const attention_instability = calculateAttentionInstability({
    operator_state: params.operator_state,
    risk_cues,
  });
  const interaction_friction = calculateInteractionFriction(risk_cues);
  const human_pressure_index = calculateHumanPressureIndex({
    operator_state: params.operator_state,
    attention_instability,
    interaction_friction,
  });
  const human_confidence_penalty = roundIndex(
    clamp(
      100 - params.human_monitoring.aggregate_confidence +
        (params.human_monitoring.degraded_state_active ? 10 : 0) +
        (params.human_monitoring.freshness_status === "aging" ? 6 : 0) +
        (params.human_monitoring.freshness_status === "stale" ? 18 : 0),
      0,
      100,
    ),
  );
  const human_influence_scale = resolveHumanInfluenceScale(params.human_monitoring);

  const undamped_factors: CombinedRiskFactor[] = [
    {
      factor_id: "plant_urgency",
      label: "Plant urgency",
      raw_index: plant_urgency_index,
      contribution: applyContributionCap(plant_urgency_index, "plant_urgency", human_influence_scale),
      detail: describePlantUrgency({
        plant_state: params.plant_state,
        alarm_set: params.alarm_set,
        plant_urgency_index,
      }),
    },
    {
      factor_id: "alarm_escalation_pressure",
      label: "Alarm escalation pressure",
      raw_index: alarm_escalation_pressure,
      contribution: applyContributionCap(
        alarm_escalation_pressure,
        "alarm_escalation_pressure",
        human_influence_scale,
      ),
      detail: describeAlarmEscalationPressure({
        alarm_set: params.alarm_set,
        alarm_intelligence: params.alarm_intelligence,
        alarm_escalation_pressure,
      }),
    },
    {
      factor_id: "storyline_procedure_pressure",
      label: "Storyline/procedure pressure",
      raw_index: storyline_procedure_pressure,
      contribution: applyContributionCap(
        storyline_procedure_pressure,
        "storyline_procedure_pressure",
        human_influence_scale,
      ),
      detail: describeStorylineProcedurePressure({
        storyline_procedure_pressure,
        reasoning_snapshot: params.reasoning_snapshot,
        first_response_lane: params.first_response_lane,
      }),
    },
    {
      factor_id: "phase_time_pressure",
      label: "Phase/time pressure",
      raw_index: phase_time_pressure,
      contribution: applyContributionCap(phase_time_pressure, "phase_time_pressure", human_influence_scale),
      detail: describePhaseTimePressure({
        phase_time_pressure,
        current_phase: params.current_phase,
        current_phase_elapsed_time_sec: params.current_phase_elapsed_time_sec,
        scenario_expected_duration_sec: params.scenario_expected_duration_sec,
        sim_time_sec: params.sim_time_sec,
      }),
    },
    {
      factor_id: "human_workload_pressure",
      label: "Human workload pressure",
      raw_index: params.operator_state.workload_index,
      contribution: applyContributionCap(
        params.operator_state.workload_index,
        "human_workload_pressure",
        human_influence_scale,
      ),
      detail: `Human workload pressure is ${params.operator_state.workload_index}/100 with the canonical monitoring pipeline summarizing bounded interaction and visual posture into one workload proxy.`,
    },
    {
      factor_id: "attention_instability",
      label: "Attention instability",
      raw_index: attention_instability,
      contribution: applyContributionCap(attention_instability, "attention_instability", human_influence_scale),
      detail: `Attention instability is ${attention_instability}/100 from operator-state stability plus advisory visual attention pressure of ${risk_cues.advisory_visual_attention_pressure}/100.`,
    },
    {
      factor_id: "interaction_friction",
      label: "Interaction friction",
      raw_index: interaction_friction,
      contribution: applyContributionCap(interaction_friction, "interaction_friction", human_influence_scale),
      detail: `Interaction friction is ${interaction_friction}/100 from hesitation ${risk_cues.hesitation_pressure}/100, latency ${risk_cues.latency_trend_pressure}/100, reversal ${risk_cues.reversal_oscillation_pressure}/100, inactivity ${risk_cues.inactivity_pressure}/100, burstiness ${risk_cues.burstiness_pressure}/100, and navigation instability ${risk_cues.navigation_instability_pressure}/100.`,
    },
    {
      factor_id: "human_confidence_penalty",
      label: "Human confidence penalty",
      raw_index: human_confidence_penalty,
      contribution: applyContributionCap(
        human_confidence_penalty,
        "human_confidence_penalty",
        human_influence_scale,
      ),
      detail: `Human confidence penalty is ${human_confidence_penalty}/100 with monitoring freshness ${params.human_monitoring.freshness_status} and aggregate confidence ${params.human_monitoring.aggregate_confidence}/100.`,
    },
  ];

  const damped_factors = applyHumanDropoffDamping(
    undamped_factors,
    params.previous_combined_risk,
    human_influence_scale,
  );
  const factor_breakdown = damped_factors
    .slice()
    .sort((left, right) => right.contribution - left.contribution) as CombinedRiskFactor[];
  const combined_risk_score = roundScore(
    factor_breakdown.reduce((total, factor) => total + factor.contribution, 0),
  );
  const combined_risk_band = scoreBand(combined_risk_score);
  const top_contributing_factors = factor_breakdown.slice(0, 3).map((factor) => factor.label);
  const recommended_assistance_mode = chooseRecommendedAssistanceMode({
    combined_risk_score,
    plant_urgency_index,
    alarm_escalation_pressure,
    storyline_procedure_pressure,
    human_pressure_index,
  });
  const fusion_confidence = roundScore(
    clamp(
      68 +
        plant_urgency_index * 0.08 +
        alarm_escalation_pressure * 0.05 +
        storyline_procedure_pressure * 0.04 +
        params.human_monitoring.aggregate_confidence * 0.12 -
        (params.human_monitoring.freshness_status === "stale" ? 6 : 0) -
        (params.human_monitoring.mode === "unavailable" ? 10 : 0),
      55,
      98,
    ),
  );
  const top_two = factor_breakdown.slice(0, 2).map((factor) => factor.label.toLowerCase());
  const recommended_assistance_reason = `Recommend ${formatSupportModeLabel(
    recommended_assistance_mode,
  )} because ${formatBandLabel(combined_risk_band).toLowerCase()} risk is being driven mainly by ${joinLabels(
    top_two,
  )}${human_influence_scale < 1 ? ` with human-side influence confidence-gated to ${human_influence_scale.toFixed(2)}` : ""}.`;

  return {
    risk_model_id: RISK_MODEL_ID,
    combined_risk_score,
    combined_risk_band,
    plant_urgency_index,
    human_pressure_index,
    fusion_confidence,
    human_influence_scale,
    recommended_assistance_mode,
    recommended_assistance_reason,
    factor_breakdown,
    top_contributing_factors,
    confidence_caveat: buildConfidenceCaveat({
      human_monitoring: params.human_monitoring,
      human_influence_scale,
    }),
    why_risk_is_current: `${formatBandLabel(
      combined_risk_band,
    )} risk is being driven mainly by ${joinLabels(top_two)}; the raw assistance recommendation is ${formatSupportModeLabel(
      recommended_assistance_mode,
    )}.`,
    what_changed: buildChangeSummary(
      factor_breakdown,
      combined_risk_score,
      params.previous_combined_risk,
    ),
  };
}

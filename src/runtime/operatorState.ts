import type {
  AlarmIntelligenceSnapshot,
  AlarmSet,
  ExecutedAction,
  OperatorStateSnapshot,
  PlantStateSnapshot,
  ReasoningSnapshot,
} from "../contracts/aura";
import { clamp } from "../data/plantModel";

type BuildOperatorStateParams = {
  sim_time_sec: number;
  tick_index: number;
  plant_state: PlantStateSnapshot;
  alarm_set: AlarmSet;
  alarm_intelligence: AlarmIntelligenceSnapshot;
  reasoning_snapshot: ReasoningSnapshot;
  executed_actions: ExecutedAction[];
  lane_changed: boolean;
};

function numberValue(value: PlantStateSnapshot[string]): number {
  return typeof value === "number" ? value : Number(value);
}

function roundIndex(value: number): number {
  return Math.round(clamp(value, 0, 100));
}

function topHypothesisGap(reasoning_snapshot: ReasoningSnapshot): number {
  const top_score = reasoning_snapshot.ranked_hypotheses[0]?.score ?? 0;
  const second_score = reasoning_snapshot.ranked_hypotheses[1]?.score ?? 0;
  return Math.max(top_score - second_score, 0);
}

function lastActionAgeSec(sim_time_sec: number, executed_actions: ExecutedAction[]): number | undefined {
  const last_action = executed_actions[executed_actions.length - 1];
  if (!last_action) {
    return undefined;
  }

  return Math.max(sim_time_sec - last_action.sim_time_sec, 0);
}

export function calculatePlantSeverityIndex(plant_state: PlantStateSnapshot): number {
  const level = numberValue(plant_state.vessel_water_level_m);
  const pressure = numberValue(plant_state.vessel_pressure_mpa);
  const containment = numberValue(plant_state.containment_pressure_kpa);
  const feedwater_gap = numberValue(plant_state.main_steam_flow_pct) - numberValue(plant_state.feedwater_flow_pct);

  let score = 0;

  if (level < 6.8) {
    score += clamp((6.8 - level) * 22, 0, 35);
  }

  if (pressure > 7.35) {
    score += clamp((pressure - 7.35) * 45, 0, 20);
  }

  if (containment > 106) {
    score += clamp((containment - 106) * 1.4, 0, 12);
  }

  if (feedwater_gap > 8) {
    score += clamp((feedwater_gap - 8) * 1.5, 0, 12);
  }

  if (Boolean(plant_state.reactor_trip_active)) {
    score += 12;
  }

  if (Boolean(plant_state.safety_relief_valve_open)) {
    score += 9;
  }

  return roundIndex(score);
}

export function calculateDiagnosisAmbiguityIndex(reasoning_snapshot: ReasoningSnapshot): number {
  const top_gap = topHypothesisGap(reasoning_snapshot);
  const top_band = reasoning_snapshot.ranked_hypotheses[0]?.confidence_band ?? "low";

  let score = clamp(28 - top_gap * 18, 0, 28);

  switch (top_band) {
    case "low":
      score += 26;
      break;
    case "medium":
      score += 12;
      break;
    case "high":
      break;
  }

  if (reasoning_snapshot.changed_since_last_tick) {
    score += 12;
  }

  score += clamp(10 - reasoning_snapshot.stable_for_ticks * 3, 0, 10);

  return roundIndex(score);
}

export function buildOperatorStateSnapshot(params: BuildOperatorStateParams): OperatorStateSnapshot {
  const active_high_priority_count = params.alarm_set.active_alarms.filter((alarm) => alarm.priority !== "P3").length;
  const plant_severity_index = calculatePlantSeverityIndex(params.plant_state);
  const diagnosis_ambiguity_index = calculateDiagnosisAmbiguityIndex(params.reasoning_snapshot);
  const observation_window_ticks = params.tick_index + 1;
  const recent_action_age_sec = lastActionAgeSec(params.sim_time_sec, params.executed_actions);
  const alarm_load_pressure = clamp(
    params.alarm_set.active_alarm_count * 7 +
      params.alarm_intelligence.grouped_alarm_count * 6 +
      active_high_priority_count * 5,
    0,
    55,
  );

  let interaction_gap_penalty = 0;
  if (recent_action_age_sec === undefined) {
    interaction_gap_penalty = params.sim_time_sec >= 20 && params.alarm_set.active_alarm_count >= 2 ? 12 : 6;
  } else if (recent_action_age_sec > 45 && params.alarm_set.active_alarm_count >= 3) {
    interaction_gap_penalty = 10;
  } else if (recent_action_age_sec > 20 && params.alarm_set.active_alarm_count >= 2) {
    interaction_gap_penalty = 5;
  }

  const workload_index = roundIndex(
    12 +
      alarm_load_pressure +
      plant_severity_index * 0.32 +
      diagnosis_ambiguity_index * 0.18 +
      interaction_gap_penalty,
  );

  const attention_stability_index = roundIndex(
    88 -
      plant_severity_index * 0.16 -
      diagnosis_ambiguity_index * 0.34 -
      (params.reasoning_snapshot.changed_since_last_tick ? 10 : 0) -
      (params.lane_changed ? 8 : 0) -
      interaction_gap_penalty +
      (params.reasoning_snapshot.stable_for_ticks >= 3 ? 6 : 0),
  );

  let signal_confidence = 100;
  const degraded_reasons: string[] = [];

  if (observation_window_ticks < 3) {
    signal_confidence -= 35;
    degraded_reasons.push("short observation window");
  }

  if (params.executed_actions.length === 0) {
    signal_confidence -= 18;
    degraded_reasons.push("no operator interaction evidence yet");
  } else if (recent_action_age_sec !== undefined && recent_action_age_sec > 60) {
    signal_confidence -= 10;
    degraded_reasons.push("operator interaction evidence is stale");
  }

  if (params.reasoning_snapshot.stable_for_ticks < 2) {
    signal_confidence -= 10;
    degraded_reasons.push("storyline evidence is still settling");
  }

  if (params.lane_changed) {
    signal_confidence -= 8;
    degraded_reasons.push("first-response picture changed this tick");
  }

  if (params.alarm_set.active_alarm_count === 0) {
    signal_confidence -= 12;
    degraded_reasons.push("low-strain nominal window provides limited workload evidence");
  }

  const bounded_signal_confidence = roundIndex(clamp(signal_confidence, 15, 100));
  const degraded_mode_active = bounded_signal_confidence < 70;

  return {
    workload_index,
    attention_stability_index,
    signal_confidence: bounded_signal_confidence,
    degraded_mode_active,
    degraded_mode_reason: degraded_mode_active
      ? `Confidence reduced: ${degraded_reasons.join("; ")}.`
      : "Nominal confidence from current runtime and session signals.",
    observation_window_ticks,
  };
}

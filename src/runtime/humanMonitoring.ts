import type {
  AlarmIntelligenceSnapshot,
  AlarmSet,
  ExecutedAction,
  HumanMonitoringCompatibilityObservation,
  HumanMonitoringSnapshot,
  HumanMonitoringSourceSnapshot,
  PlantStateSnapshot,
  ReasoningSnapshot,
} from "../contracts/aura";
import { clamp } from "../data/plantModel";

export type LegacyRuntimePlaceholderParams = {
  sim_time_sec: number;
  tick_index: number;
  tick_duration_sec: number;
  plant_state: PlantStateSnapshot;
  alarm_set: AlarmSet;
  alarm_intelligence: AlarmIntelligenceSnapshot;
  reasoning_snapshot: ReasoningSnapshot;
  executed_actions: ExecutedAction[];
  lane_changed: boolean;
};

export type BuildHumanMonitoringSnapshotParams = {
  sim_time_sec: number;
  tick_index: number;
  tick_duration_sec: number;
  sources: HumanMonitoringSourceSnapshot[];
  compatibility_observation?: HumanMonitoringCompatibilityObservation;
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

export function buildLegacyRuntimePlaceholderSource(
  params: LegacyRuntimePlaceholderParams,
): {
  source: HumanMonitoringSourceSnapshot;
  compatibility_observation: HumanMonitoringCompatibilityObservation;
} {
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
  const oldest_observation_sim_time_sec = Math.max(
    params.sim_time_sec - Math.max(observation_window_ticks - 1, 0) * params.tick_duration_sec,
    0,
  );
  const compatibility_note =
    "Legacy runtime placeholder adapter active. This preserves current deterministic operator-state behavior until real human-monitoring sources are connected.";

  return {
    source: {
      source_id: "legacy_runtime_placeholder",
      source_kind: "legacy_runtime_placeholder",
      availability: degraded_mode_active ? "degraded" : "active",
      confidence: bounded_signal_confidence,
      status_note: degraded_mode_active
        ? `${compatibility_note} Confidence reduced: ${degraded_reasons.join("; ")}.`
        : `${compatibility_note} Placeholder signal is coherent for the current bounded runtime window.`,
      last_observation_sim_time_sec: params.sim_time_sec,
      oldest_observation_sim_time_sec,
      window_tick_span: observation_window_ticks,
      sample_count_in_window: observation_window_ticks,
    },
    compatibility_observation: {
      workload_index,
      attention_stability_index,
      signal_confidence: bounded_signal_confidence,
      degraded_mode_active,
      degraded_mode_reason: degraded_mode_active
        ? `Confidence reduced: ${degraded_reasons.join("; ")}.`
        : "Nominal confidence from current runtime and session signals.",
      observation_window_ticks,
      provenance: "legacy_runtime_placeholder",
      compatibility_note,
    },
  };
}

export function buildHumanMonitoringSnapshot(
  params: BuildHumanMonitoringSnapshotParams,
): HumanMonitoringSnapshot {
  const connected_sources = params.sources.filter(
    (source) => source.availability !== "not_connected" && source.availability !== "unavailable",
  );
  const active_sources = params.sources.filter((source) => source.availability === "active");
  const degraded_sources = params.sources.filter((source) => source.availability === "degraded");
  const latest_observation_sim_time_sec = params.sources
    .map((source) => source.last_observation_sim_time_sec)
    .filter((value): value is number => typeof value === "number")
    .reduce<number | undefined>((latest, value) => (latest === undefined ? value : Math.max(latest, value)), undefined);
  const oldest_observation_sim_time_sec = params.sources
    .map((source) => source.oldest_observation_sim_time_sec)
    .filter((value): value is number => typeof value === "number")
    .reduce<number | undefined>((oldest, value) => (oldest === undefined ? value : Math.min(oldest, value)), undefined);
  const window_tick_span = params.sources.reduce((maximum, source) => Math.max(maximum, source.window_tick_span), 0);
  const window_duration_sec =
    window_tick_span > 0 ? Math.max(window_tick_span - 1, 0) * params.tick_duration_sec : 0;
  const aggregate_confidence =
    connected_sources.length > 0
      ? roundIndex(
          connected_sources.reduce((total, source) => total + source.confidence, 0) / connected_sources.length,
        )
      : 0;
  const has_placeholder_source = params.sources.some(
    (source) => source.source_kind === "legacy_runtime_placeholder",
  );
  const mode: HumanMonitoringSnapshot["mode"] =
    connected_sources.length === 0
      ? "unavailable"
      : has_placeholder_source
        ? "placeholder_compatibility"
        : active_sources.length > 0
          ? "live_sources"
          : "degraded";
  const degraded_state_active =
    mode === "unavailable" || degraded_sources.length > 0 || aggregate_confidence < 70;
  const degraded_state_reason =
    mode === "unavailable"
      ? "Human monitoring is unavailable because no connected sources have been registered yet."
      : degraded_sources.length > 0
        ? degraded_sources.map((source) => `${source.source_id}: ${source.status_note}`).join(" ")
        : aggregate_confidence < 70
          ? `Aggregate monitoring confidence is ${aggregate_confidence}/100, so the monitoring picture remains degraded.`
          : "No degraded human-monitoring conditions are active.";
  const status_summary =
    mode === "unavailable"
      ? "Human-monitoring foundation is online, but no live or placeholder sources are connected yet."
      : mode === "placeholder_compatibility"
        ? "Human-monitoring foundation is running in placeholder compatibility mode so existing operator-state behavior stays stable until live sources are added."
        : mode === "degraded"
          ? "Human-monitoring inputs are connected but currently degraded or low confidence."
          : "Human-monitoring inputs are connected and available for downstream interpretation.";

  return {
    snapshot_id: `hm_t${String(params.tick_index).padStart(4, "0")}`,
    mode,
    aggregate_confidence,
    degraded_state_active,
    degraded_state_reason,
    status_summary,
    latest_observation_sim_time_sec,
    oldest_observation_sim_time_sec,
    window_tick_span,
    window_duration_sec,
    connected_source_count: connected_sources.length,
    active_source_count: active_sources.length,
    sources: params.sources,
    compatibility_observation: params.compatibility_observation,
  };
}

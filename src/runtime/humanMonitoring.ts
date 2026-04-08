import type {
  AlarmIntelligenceSnapshot,
  AlarmSet,
  ExecutedAction,
  HumanMonitoringFreshnessStatus,
  HumanMonitoringInterpretationInput,
  HumanMonitoringSnapshot,
  HumanMonitoringSourceAvailability,
  HumanMonitoringSourceKind,
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

export type HumanMonitoringEvaluationContext = LegacyRuntimePlaceholderParams;

export type HumanMonitoringSourceReading = {
  availability: HumanMonitoringSourceAvailability;
  confidence: number;
  status_note: string;
  observation_sim_time_sec?: number;
  interpretation_input?: Omit<HumanMonitoringInterpretationInput, "contributing_source_ids" | "provenance"> & {
    provenance?: HumanMonitoringInterpretationInput["provenance"];
  };
};

export type HumanMonitoringSourceWindowState = {
  observation_times_sec: number[];
  latest_reading?: HumanMonitoringSourceReading;
};

export type HumanMonitoringRuntimeState = {
  sources: Record<string, HumanMonitoringSourceWindowState>;
};

export type HumanMonitoringSourceAdapter = {
  source_id: string;
  source_kind: HumanMonitoringSourceKind;
  expected_update_interval_sec: number;
  stale_after_sec: number;
  window_duration_sec: number;
  evaluate: (
    context: HumanMonitoringEvaluationContext,
    runtime_state: HumanMonitoringSourceWindowState | undefined,
  ) => HumanMonitoringSourceReading;
};

export type EvaluateHumanMonitoringParams = HumanMonitoringEvaluationContext & {
  runtime_state: HumanMonitoringRuntimeState;
  adapters?: HumanMonitoringSourceAdapter[];
};

export type EvaluateHumanMonitoringResult = {
  snapshot: HumanMonitoringSnapshot;
  runtime_state: HumanMonitoringRuntimeState;
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

function roundAverage(total: number, count: number): number {
  if (count <= 0) {
    return 0;
  }

  return roundIndex(total / count);
}

function deriveFreshnessStatus(params: {
  sim_time_sec: number;
  last_observation_sim_time_sec?: number;
  expected_update_interval_sec: number;
  stale_after_sec: number;
}): {
  freshness_status: HumanMonitoringFreshnessStatus;
  latest_observation_age_sec?: number;
} {
  if (typeof params.last_observation_sim_time_sec !== "number") {
    return {
      freshness_status: "no_observations",
    };
  }

  const latest_observation_age_sec = Math.max(params.sim_time_sec - params.last_observation_sim_time_sec, 0);
  if (latest_observation_age_sec <= params.expected_update_interval_sec) {
    return {
      freshness_status: "current",
      latest_observation_age_sec,
    };
  }

  if (latest_observation_age_sec <= params.stale_after_sec) {
    return {
      freshness_status: "aging",
      latest_observation_age_sec,
    };
  }

  return {
    freshness_status: "stale",
    latest_observation_age_sec,
  };
}

function deriveWindowTickSpan(sample_count_in_window: number): number {
  return sample_count_in_window;
}

function deriveWindowDurationSec(params: {
  sample_count_in_window: number;
  tick_duration_sec: number;
}): number {
  return params.sample_count_in_window > 0
    ? Math.max(params.sample_count_in_window - 1, 0) * params.tick_duration_sec
    : 0;
}

function deriveSourceSnapshot(params: {
  sim_time_sec: number;
  tick_duration_sec: number;
  adapter: HumanMonitoringSourceAdapter;
  reading: HumanMonitoringSourceReading;
  previous_state?: HumanMonitoringSourceWindowState;
}): {
  source_snapshot: HumanMonitoringSourceSnapshot;
  runtime_state: HumanMonitoringSourceWindowState;
} {
  const previous_times = params.previous_state?.observation_times_sec ?? [];
  const next_times = typeof params.reading.observation_sim_time_sec === "number"
    ? [...previous_times, params.reading.observation_sim_time_sec]
    : [...previous_times];
  const trimmed_times = next_times.filter(
    (time_sec) => params.sim_time_sec - time_sec <= params.adapter.window_duration_sec,
  );
  const last_observation_sim_time_sec =
    trimmed_times.length > 0 ? trimmed_times[trimmed_times.length - 1] : undefined;
  const oldest_observation_sim_time_sec = trimmed_times.length > 0 ? trimmed_times[0] : undefined;
  const sample_count_in_window = trimmed_times.length;
  const freshness = deriveFreshnessStatus({
    sim_time_sec: params.sim_time_sec,
    last_observation_sim_time_sec,
    expected_update_interval_sec: params.adapter.expected_update_interval_sec,
    stale_after_sec: params.adapter.stale_after_sec,
  });
  const contributes_to_aggregate =
    params.reading.availability !== "not_connected" &&
    params.reading.availability !== "unavailable" &&
    freshness.freshness_status !== "no_observations" &&
    freshness.freshness_status !== "stale";

  return {
    source_snapshot: {
      source_id: params.adapter.source_id,
      source_kind: params.adapter.source_kind,
      availability: params.reading.availability,
      freshness_status: freshness.freshness_status,
      confidence: roundIndex(params.reading.confidence),
      status_note: params.reading.status_note,
      latest_observation_age_sec: freshness.latest_observation_age_sec,
      last_observation_sim_time_sec,
      oldest_observation_sim_time_sec,
      expected_update_interval_sec: params.adapter.expected_update_interval_sec,
      stale_after_sec: params.adapter.stale_after_sec,
      window_tick_span: deriveWindowTickSpan(sample_count_in_window),
      window_duration_sec: deriveWindowDurationSec({
        sample_count_in_window,
        tick_duration_sec: params.tick_duration_sec,
      }),
      sample_count_in_window,
      contributes_to_aggregate,
    },
    runtime_state: {
      observation_times_sec: trimmed_times,
      latest_reading: params.reading,
    },
  };
}

function buildInterpretationInput(params: {
  sources: HumanMonitoringSourceSnapshot[];
  readings: Array<{ source_id: string; reading: HumanMonitoringSourceReading }>;
}): HumanMonitoringInterpretationInput | undefined {
  const contributors = params.readings
    .map(({ source_id, reading }) => {
      const source = params.sources.find((candidate) => candidate.source_id === source_id);
      if (!source?.contributes_to_aggregate || !reading.interpretation_input) {
        return undefined;
      }

      return {
        source_id,
        source_confidence: source.confidence,
        interpretation: reading.interpretation_input,
      };
    })
    .filter(
      (
        contributor,
      ): contributor is {
        source_id: string;
        source_confidence: number;
        interpretation: NonNullable<HumanMonitoringSourceReading["interpretation_input"]>;
      } => Boolean(contributor),
    );

  if (contributors.length === 0) {
    return undefined;
  }

  const weighted_confidence = contributors.reduce((total, contributor) => total + contributor.source_confidence, 0);
  const denominator = weighted_confidence > 0 ? weighted_confidence : contributors.length;
  const weightedAverage = (selector: (contributor: (typeof contributors)[number]) => number): number =>
    roundIndex(
      contributors.reduce((total, contributor) => total + selector(contributor) * (weighted_confidence > 0 ? contributor.source_confidence : 1), 0) /
        denominator,
    );
  const degraded_reasons = contributors
    .map((contributor) => contributor.interpretation.degraded_mode_reason)
    .filter((reason, index, collection) => reason && collection.indexOf(reason) === index);
  const note = contributors
    .map((contributor) => contributor.interpretation.interpretation_note)
    .filter((value, index, collection) => value && collection.indexOf(value) === index)
    .join(" ");
  const provenance =
    contributors.length === 1 && contributors[0]?.interpretation.provenance === "legacy_runtime_placeholder"
      ? "legacy_runtime_placeholder"
      : "canonical_source_pipeline";

  return {
    workload_index: weightedAverage((contributor) => contributor.interpretation.workload_index),
    attention_stability_index: weightedAverage(
      (contributor) => contributor.interpretation.attention_stability_index,
    ),
    signal_confidence: weightedAverage((contributor) => contributor.interpretation.signal_confidence),
    degraded_mode_active: contributors.some((contributor) => contributor.interpretation.degraded_mode_active),
    degraded_mode_reason:
      degraded_reasons.join(" ") ||
      "Monitoring inputs remain degraded until contributing sources provide a stable interpretation window.",
    observation_window_ticks: Math.max(
      ...contributors.map((contributor) => contributor.interpretation.observation_window_ticks),
    ),
    contributing_source_ids: contributors.map((contributor) => contributor.source_id),
    provenance,
    interpretation_note: note || "Canonical human-monitoring interpretation built from contributing source adapters.",
  };
}

function buildHumanMonitoringSnapshot(params: {
  sim_time_sec: number;
  tick_index: number;
  tick_duration_sec: number;
  sources: HumanMonitoringSourceSnapshot[];
  interpretation_input?: HumanMonitoringInterpretationInput;
}): HumanMonitoringSnapshot {
  const connected_sources = params.sources.filter((source) => source.availability !== "not_connected");
  const contributing_sources = params.sources.filter((source) => source.contributes_to_aggregate);
  const active_sources = contributing_sources.filter((source) => source.availability === "active");
  const current_sources = contributing_sources.filter((source) => source.freshness_status === "current");
  const degraded_sources = params.sources.filter(
    (source) => source.availability === "degraded" || source.freshness_status === "aging",
  );
  const stale_sources = params.sources.filter((source) => source.freshness_status === "stale");
  const latest_observation_sim_time_sec = params.sources
    .map((source) => source.last_observation_sim_time_sec)
    .filter((value): value is number => typeof value === "number")
    .reduce<number | undefined>((latest, value) => (latest === undefined ? value : Math.max(latest, value)), undefined);
  const oldest_observation_sim_time_sec = params.sources
    .map((source) => source.oldest_observation_sim_time_sec)
    .filter((value): value is number => typeof value === "number")
    .reduce<number | undefined>((oldest, value) => (oldest === undefined ? value : Math.min(oldest, value)), undefined);
  const window_tick_span = params.sources.reduce((maximum, source) => Math.max(maximum, source.window_tick_span), 0);
  const window_duration_sec = params.sources.reduce(
    (maximum, source) => Math.max(maximum, source.window_duration_sec),
    0,
  );
  const aggregate_confidence = roundAverage(
    contributing_sources.reduce((total, source) => total + source.confidence, 0),
    contributing_sources.length,
  );
  const freshness_status: HumanMonitoringFreshnessStatus =
    contributing_sources.length === 0
      ? connected_sources.length === 0
        ? "no_observations"
        : stale_sources.length > 0
          ? "stale"
          : "no_observations"
      : stale_sources.length > 0
        ? "stale"
        : degraded_sources.length > 0
          ? "aging"
          : "current";
  const has_live_contributor = contributing_sources.some(
    (source) => source.source_kind !== "legacy_runtime_placeholder",
  );
  const has_placeholder_contributor = contributing_sources.some(
    (source) => source.source_kind === "legacy_runtime_placeholder",
  );
  const mode: HumanMonitoringSnapshot["mode"] =
    connected_sources.length === 0
      ? "unavailable"
      : contributing_sources.length === 0
        ? "degraded"
        : has_live_contributor
          ? "live_sources"
          : has_placeholder_contributor
            ? "placeholder_compatibility"
            : "degraded";
  const degraded_state_active =
    mode === "unavailable" ||
    params.interpretation_input?.degraded_mode_active === true ||
    degraded_sources.length > 0 ||
    stale_sources.length > 0 ||
    aggregate_confidence < 70;
  const degraded_state_reason =
    mode === "unavailable"
      ? "Human monitoring is unavailable because no source adapters are currently connected."
      : stale_sources.length > 0
        ? stale_sources.map((source) => `${source.source_id} is stale: ${source.status_note}`).join(" ")
        : degraded_sources.length > 0
          ? degraded_sources.map((source) => `${source.source_id}: ${source.status_note}`).join(" ")
          : params.interpretation_input?.degraded_mode_active
            ? params.interpretation_input.degraded_mode_reason
            : aggregate_confidence < 70
              ? `Aggregate monitoring confidence is ${aggregate_confidence}/100, so the monitoring picture remains degraded.`
              : "No degraded human-monitoring conditions are active.";
  const status_summary =
    mode === "unavailable"
      ? "Human-monitoring foundation is online, but no source adapters are connected yet."
      : mode === "placeholder_compatibility"
        ? "Human-monitoring foundation is running through the canonical placeholder adapter so current operator-state behavior stays stable until live sources are added."
        : mode === "live_sources"
          ? "Human-monitoring inputs are flowing through the canonical source pipeline."
          : "Human-monitoring adapters are present, but freshness or confidence is currently degraded.";

  return {
    snapshot_id: `hm_t${String(params.tick_index).padStart(4, "0")}`,
    mode,
    freshness_status,
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
    current_source_count: current_sources.length,
    degraded_source_count: degraded_sources.length,
    stale_source_count: stale_sources.length,
    contributing_source_count: contributing_sources.length,
    sources: params.sources,
    interpretation_input: params.interpretation_input,
  };
}

export function createHumanMonitoringRuntimeState(): HumanMonitoringRuntimeState {
  return {
    sources: {},
  };
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
  source: HumanMonitoringSourceReading;
  interpretation_input: HumanMonitoringInterpretationInput;
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
  const interpretation_note =
    "Legacy runtime placeholder adapter active through the canonical human-monitoring pipeline. This preserves current deterministic operator-state behavior until real monitoring sources are connected.";

  return {
    source: {
      availability: degraded_mode_active ? "degraded" : "active",
      confidence: bounded_signal_confidence,
      status_note: degraded_mode_active
        ? `${interpretation_note} Confidence reduced: ${degraded_reasons.join("; ")}.`
        : `${interpretation_note} Placeholder signal is coherent for the current bounded runtime window.`,
      observation_sim_time_sec: params.sim_time_sec,
      interpretation_input: {
        workload_index,
        attention_stability_index,
        signal_confidence: bounded_signal_confidence,
        degraded_mode_active,
        degraded_mode_reason: degraded_mode_active
          ? `Confidence reduced: ${degraded_reasons.join("; ")}.`
          : "Nominal confidence from current runtime and session signals.",
        observation_window_ticks,
        interpretation_note,
        provenance: "legacy_runtime_placeholder",
      },
    },
    interpretation_input: {
      workload_index,
      attention_stability_index,
      signal_confidence: bounded_signal_confidence,
      degraded_mode_active,
      degraded_mode_reason: degraded_mode_active
        ? `Confidence reduced: ${degraded_reasons.join("; ")}.`
        : "Nominal confidence from current runtime and session signals.",
      observation_window_ticks,
      contributing_source_ids: ["legacy_runtime_placeholder"],
      provenance: "legacy_runtime_placeholder",
      interpretation_note,
    },
  };
}

const legacyRuntimePlaceholderAdapter: HumanMonitoringSourceAdapter = {
  source_id: "legacy_runtime_placeholder",
  source_kind: "legacy_runtime_placeholder",
  expected_update_interval_sec: 5,
  stale_after_sec: 20,
  window_duration_sec: 300,
  evaluate: (context) => buildLegacyRuntimePlaceholderSource(context).source,
};

export const DEFAULT_HUMAN_MONITORING_SOURCE_ADAPTERS: readonly HumanMonitoringSourceAdapter[] = [
  legacyRuntimePlaceholderAdapter,
];

export function evaluateHumanMonitoring(
  params: EvaluateHumanMonitoringParams,
): EvaluateHumanMonitoringResult {
  const adapters = params.adapters ?? DEFAULT_HUMAN_MONITORING_SOURCE_ADAPTERS;
  const next_runtime_state: HumanMonitoringRuntimeState = {
    sources: {},
  };
  const source_snapshots: HumanMonitoringSourceSnapshot[] = [];
  const readings: Array<{ source_id: string; reading: HumanMonitoringSourceReading }> = [];

  for (const adapter of adapters) {
    const previous_source_state = params.runtime_state.sources[adapter.source_id];
    const reading = adapter.evaluate(params, previous_source_state);
    const { source_snapshot, runtime_state } = deriveSourceSnapshot({
      sim_time_sec: params.sim_time_sec,
      tick_duration_sec: params.tick_duration_sec,
      adapter,
      reading,
      previous_state: previous_source_state,
    });

    next_runtime_state.sources[adapter.source_id] = runtime_state;
    source_snapshots.push(source_snapshot);
    readings.push({ source_id: adapter.source_id, reading });
  }

  const interpretation_input = buildInterpretationInput({
    sources: source_snapshots,
    readings,
  });

  return {
    snapshot: buildHumanMonitoringSnapshot({
      sim_time_sec: params.sim_time_sec,
      tick_index: params.tick_index,
      tick_duration_sec: params.tick_duration_sec,
      sources: source_snapshots,
      interpretation_input,
    }),
    runtime_state: next_runtime_state,
  };
}

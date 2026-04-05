import type {
  AlarmIntelligenceSnapshot,
  AlarmSet,
  EventHypothesis,
  HypothesisEvidence,
  PlantStateSnapshot,
  ReasoningSnapshot,
} from "../contracts/aura";

export type ReasoningRuntimeState = {
  smoothed_scores: Record<string, number>;
  dominant_hypothesis_id?: string;
  stable_for_ticks: number;
  diagnosis_committed: boolean;
  last_committed_hypothesis_id?: string;
};

type HypothesisConfig = {
  hypothesis_id: string;
  label: string;
  summary: string;
  watch_items: string[];
};

const hypothesisCatalog: HypothesisConfig[] = [
  {
    hypothesis_id: "hyp_feedwater_degradation",
    label: "Feedwater Degradation",
    summary: "Feedwater-side flow loss is the dominant driver of the event and is causing the vessel level drift.",
    watch_items: ["feedwater_flow_pct", "vessel_water_level_m", "main_steam_flow_pct"],
  },
  {
    hypothesis_id: "hyp_heat_sink_stress",
    label: "Heat Sink / Steam Path Stress",
    summary: "Condenser and steam-path stress are amplifying the upset and driving pressure response.",
    watch_items: ["condenser_backpressure_kpa", "main_steam_flow_pct", "vessel_pressure_mpa"],
  },
  {
    hypothesis_id: "hyp_pressure_control_transient",
    label: "Pressure Control Transient",
    summary: "The disturbance is now presenting as a pressure-control problem with SRV or containment consequences.",
    watch_items: ["vessel_pressure_mpa", "safety_relief_valve_open", "containment_pressure_kpa"],
  },
  {
    hypothesis_id: "hyp_post_trip_stabilization",
    label: "Post-Trip Stabilization",
    summary: "Protection has already engaged and the scenario has shifted into post-trip consequence management.",
    watch_items: ["reactor_trip_active", "vessel_water_level_m", "containment_pressure_kpa"],
  },
];

type ScoredHypothesis = {
  hypothesis_id: string;
  raw_score: number;
  smoothed_score: number;
  evidence: HypothesisEvidence[];
};

export function createReasoningRuntimeState(): ReasoningRuntimeState {
  return {
    smoothed_scores: {},
    stable_for_ticks: 0,
    diagnosis_committed: false,
    last_committed_hypothesis_id: undefined,
  };
}

function pushEvidence(
  collection: HypothesisEvidence[],
  evidence_id: string,
  label: string,
  detail: string,
  strength: HypothesisEvidence["strength"],
  source_alarm_ids: string[],
  source_variable_ids: string[],
): void {
  collection.push({
    evidence_id,
    label,
    detail,
    strength,
    source_alarm_ids,
    source_variable_ids,
  });
}

function roundScore(value: number): number {
  return Number(value.toFixed(2));
}

function confidenceBand(score: number): EventHypothesis["confidence_band"] {
  if (score >= 2.4) {
    return "high";
  }

  if (score >= 1.2) {
    return "medium";
  }

  return "low";
}

function scoreFeedwaterDegradation(plant_state: PlantStateSnapshot, alarm_ids: Set<string>): { score: number; evidence: HypothesisEvidence[] } {
  const evidence: HypothesisEvidence[] = [];
  let score = 0;
  const feedwater = Number(plant_state.feedwater_flow_pct);
  const steam = Number(plant_state.main_steam_flow_pct);
  const level = Number(plant_state.vessel_water_level_m);
  const feedwater_gap = steam - feedwater;

  if (alarm_ids.has("ALM_FEEDWATER_FLOW_LOW")) {
    score += 1.35;
    pushEvidence(
      evidence,
      "feedwater_alarm",
      "Feedwater flow low alarm active",
      "The alarm stream points directly to feedwater-side degradation.",
      "strong",
      ["ALM_FEEDWATER_FLOW_LOW"],
      ["feedwater_flow_pct"],
    );
  }

  if (feedwater_gap > 8) {
    score += Math.min(feedwater_gap / 12, 1.1);
    pushEvidence(
      evidence,
      "feedwater_gap",
      "Feedwater is lagging steam demand",
      `Feedwater is ${feedwater_gap.toFixed(1)}% below steam flow demand.`,
      feedwater_gap > 14 ? "strong" : "moderate",
      [],
      ["feedwater_flow_pct", "main_steam_flow_pct"],
    );
  }

  if (level < 6.85) {
    score += 0.95;
    pushEvidence(
      evidence,
      "level_drop",
      "Vessel level is leaving band",
      "Inventory loss is visible at the vessel level signal.",
      level < 6.4 ? "strong" : "moderate",
      ["ALM_RPV_LEVEL_LOW", "ALM_RPV_LEVEL_LOW_LOW"].filter((alarm_id) => alarm_ids.has(alarm_id)),
      ["vessel_water_level_m"],
    );
  }

  return { score, evidence };
}

function scoreHeatSinkStress(plant_state: PlantStateSnapshot, alarm_ids: Set<string>): { score: number; evidence: HypothesisEvidence[] } {
  const evidence: HypothesisEvidence[] = [];
  let score = 0;
  const backpressure = Number(plant_state.condenser_backpressure_kpa);
  const pressure = Number(plant_state.vessel_pressure_mpa);

  if (alarm_ids.has("ALM_CONDENSER_BACKPRESSURE_HIGH")) {
    score += 1.15;
    pushEvidence(
      evidence,
      "condenser_alarm",
      "Condenser backpressure alarm active",
      "Heat-sink side resistance is elevated and could amplify the upset.",
      "strong",
      ["ALM_CONDENSER_BACKPRESSURE_HIGH"],
      ["condenser_backpressure_kpa"],
    );
  }

  if (backpressure > 16.5) {
    score += Math.min((backpressure - 16.5) / 2.5, 0.9);
    pushEvidence(
      evidence,
      "backpressure_trend",
      "Backpressure is climbing",
      `Condenser backpressure is ${backpressure.toFixed(1)} kPa and trending into stress territory.`,
      backpressure > 18 ? "strong" : "moderate",
      [],
      ["condenser_backpressure_kpa"],
    );
  }

  if (alarm_ids.has("ALM_MAIN_STEAM_FLOW_MISMATCH") || alarm_ids.has("ALM_TURBINE_OUTPUT_LOW")) {
    score += 0.7;
    pushEvidence(
      evidence,
      "steam_side_support",
      "Steam-path symptoms are present",
      "Steam mismatch and generation drift suggest the event is propagating beyond feedwater alone.",
      "moderate",
      ["ALM_MAIN_STEAM_FLOW_MISMATCH", "ALM_TURBINE_OUTPUT_LOW"].filter((alarm_id) => alarm_ids.has(alarm_id)),
      ["main_steam_flow_pct", "turbine_output_mwe"],
    );
  }

  if (pressure > 7.35) {
    score += 0.45;
  }

  return { score, evidence };
}

function scorePressureControlTransient(
  plant_state: PlantStateSnapshot,
  alarm_ids: Set<string>,
): { score: number; evidence: HypothesisEvidence[] } {
  const evidence: HypothesisEvidence[] = [];
  let score = 0;
  const pressure = Number(plant_state.vessel_pressure_mpa);
  const containment = Number(plant_state.containment_pressure_kpa);

  if (alarm_ids.has("ALM_RPV_PRESSURE_HIGH")) {
    score += 1.25;
    pushEvidence(
      evidence,
      "pressure_alarm",
      "Pressure high alarm active",
      "The event has entered a direct pressure-control problem.",
      "strong",
      ["ALM_RPV_PRESSURE_HIGH"],
      ["vessel_pressure_mpa"],
    );
  }

  if (Boolean(plant_state.safety_relief_valve_open)) {
    score += 1.1;
    pushEvidence(
      evidence,
      "srv_open",
      "SRV is open",
      "Pressure relief is active, which means the transient is no longer contained in normal control bands.",
      "strong",
      ["ALM_SRV_STUCK_OPEN"].filter((alarm_id) => alarm_ids.has(alarm_id)),
      ["safety_relief_valve_open"],
    );
  }

  if (containment > 108) {
    score += 0.8;
    pushEvidence(
      evidence,
      "containment_rise",
      "Containment pressure is rising",
      `Containment pressure is ${containment.toFixed(1)} kPa, indicating escalating consequence exposure.`,
      containment > 112 ? "strong" : "moderate",
      ["ALM_CONTAINMENT_PRESSURE_HIGH"].filter((alarm_id) => alarm_ids.has(alarm_id)),
      ["containment_pressure_kpa"],
    );
  }

  if (pressure > 7.55) {
    score += 0.55;
  }

  return { score, evidence };
}

function scorePostTripStabilization(
  plant_state: PlantStateSnapshot,
  alarm_ids: Set<string>,
): { score: number; evidence: HypothesisEvidence[] } {
  const evidence: HypothesisEvidence[] = [];
  let score = 0;

  if (Boolean(plant_state.reactor_trip_active)) {
    score += 1.6;
    pushEvidence(
      evidence,
      "trip_active",
      "Reactor trip is active",
      "Protection has already actuated, so the operating problem is now stabilization after trip.",
      "strong",
      ["ALM_REACTOR_TRIP_ACTIVE"].filter((alarm_id) => alarm_ids.has(alarm_id)),
      ["reactor_trip_active"],
    );
  }

  if (alarm_ids.has("ALM_RPV_LEVEL_LOW_LOW")) {
    score += 0.95;
    pushEvidence(
      evidence,
      "low_low_level",
      "Low-low vessel level alarm active",
      "The event has crossed a hard escalation marker that usually forces recovery into consequence management.",
      "strong",
      ["ALM_RPV_LEVEL_LOW_LOW"],
      ["vessel_water_level_m"],
    );
  }

  return { score, evidence };
}

function buildScoredHypotheses(
  plant_state: PlantStateSnapshot,
  alarm_set: AlarmSet,
  previous_state: ReasoningRuntimeState,
): ScoredHypothesis[] {
  const alarm_ids = new Set(alarm_set.active_alarm_ids);
  const raw_scores = new Map<string, { score: number; evidence: HypothesisEvidence[] }>();

  raw_scores.set("hyp_feedwater_degradation", scoreFeedwaterDegradation(plant_state, alarm_ids));
  raw_scores.set("hyp_heat_sink_stress", scoreHeatSinkStress(plant_state, alarm_ids));
  raw_scores.set("hyp_pressure_control_transient", scorePressureControlTransient(plant_state, alarm_ids));
  raw_scores.set("hyp_post_trip_stabilization", scorePostTripStabilization(plant_state, alarm_ids));

  return hypothesisCatalog.map((hypothesis) => {
    const raw = raw_scores.get(hypothesis.hypothesis_id) ?? { score: 0, evidence: [] };
    const previous = previous_state.smoothed_scores[hypothesis.hypothesis_id] ?? 0;
    const smoothed_score = roundScore(previous * 0.6 + raw.score * 0.4);

    return {
      hypothesis_id: hypothesis.hypothesis_id,
      raw_score: roundScore(raw.score),
      smoothed_score,
      evidence: raw.evidence,
    };
  });
}

function selectDominantHypothesis(
  scored: ScoredHypothesis[],
  previous_state: ReasoningRuntimeState,
): { dominant_hypothesis_id?: string; changed_since_last_tick: boolean; stable_for_ticks: number } {
  const ranked = [...scored].sort((left, right) => right.smoothed_score - left.smoothed_score);
  const top = ranked[0];

  if (!top || top.smoothed_score < 0.3) {
    return {
      dominant_hypothesis_id: previous_state.dominant_hypothesis_id,
      changed_since_last_tick: false,
      stable_for_ticks: previous_state.dominant_hypothesis_id ? previous_state.stable_for_ticks + 1 : 0,
    };
  }

  if (!previous_state.dominant_hypothesis_id) {
    return {
      dominant_hypothesis_id: top.hypothesis_id,
      changed_since_last_tick: true,
      stable_for_ticks: 1,
    };
  }

  const previous_score =
    scored.find((entry) => entry.hypothesis_id === previous_state.dominant_hypothesis_id)?.smoothed_score ?? 0;
  const switch_allowed = top.hypothesis_id === previous_state.dominant_hypothesis_id || top.smoothed_score >= previous_score + 0.6;
  const next_dominant_id = switch_allowed ? top.hypothesis_id : previous_state.dominant_hypothesis_id;
  const changed_since_last_tick = next_dominant_id !== previous_state.dominant_hypothesis_id;

  return {
    dominant_hypothesis_id: next_dominant_id,
    changed_since_last_tick,
    stable_for_ticks: changed_since_last_tick ? 1 : previous_state.stable_for_ticks + 1,
  };
}

function dominantSummary(dominant_hypothesis_id: string | undefined, ranked_hypotheses: EventHypothesis[]): string {
  if (!dominant_hypothesis_id) {
    return "No dominant hypothesis yet. Continue monitoring the bounded scenario cues.";
  }

  const hypothesis = ranked_hypotheses.find((entry) => entry.hypothesis_id === dominant_hypothesis_id);
  if (!hypothesis) {
    return "No dominant hypothesis yet. Continue monitoring the bounded scenario cues.";
  }

  const top_evidence = hypothesis.evidence[0];
  if (!top_evidence) {
    return hypothesis.summary;
  }

  return `${hypothesis.summary} Leading evidence: ${top_evidence.label.toLowerCase()}.`;
}

export function buildReasoningSnapshot(params: {
  plant_state: PlantStateSnapshot;
  alarm_set: AlarmSet;
  alarm_intelligence: AlarmIntelligenceSnapshot;
  previous_state: ReasoningRuntimeState;
  expected_root_cause_hypothesis_id?: string;
}): { reasoning_snapshot: ReasoningSnapshot; runtime_state: ReasoningRuntimeState } {
  const scored = buildScoredHypotheses(params.plant_state, params.alarm_set, params.previous_state);
  const dominant_state = selectDominantHypothesis(scored, params.previous_state);
  const ranked_hypotheses = scored
    .sort((left, right) => right.smoothed_score - left.smoothed_score)
    .map((entry, index) => {
      const definition = hypothesisCatalog.find((item) => item.hypothesis_id === entry.hypothesis_id)!;

      return {
        hypothesis_id: entry.hypothesis_id,
        label: definition.label,
        summary: definition.summary,
        score: entry.smoothed_score,
        confidence_band: confidenceBand(entry.smoothed_score),
        rank: index + 1,
        evidence: entry.evidence.slice(0, 3),
        watch_items: definition.watch_items,
      };
    })
    .filter((entry) => entry.score > 0.2 || entry.rank === 1);

  const reasoning_snapshot: ReasoningSnapshot = {
    dominant_hypothesis_id: dominant_state.dominant_hypothesis_id,
    dominant_summary: dominantSummary(dominant_state.dominant_hypothesis_id, ranked_hypotheses),
    ranked_hypotheses,
    changed_since_last_tick: dominant_state.changed_since_last_tick,
    stable_for_ticks: dominant_state.stable_for_ticks,
    expected_root_cause_aligned:
      dominant_state.dominant_hypothesis_id !== undefined &&
      dominant_state.dominant_hypothesis_id === params.expected_root_cause_hypothesis_id,
  };

  return {
    reasoning_snapshot,
    runtime_state: {
      ...params.previous_state,
      smoothed_scores: Object.fromEntries(scored.map((entry) => [entry.hypothesis_id, entry.smoothed_score])),
      dominant_hypothesis_id: dominant_state.dominant_hypothesis_id,
      stable_for_ticks: dominant_state.stable_for_ticks,
      diagnosis_committed: params.previous_state.diagnosis_committed,
      last_committed_hypothesis_id: params.previous_state.last_committed_hypothesis_id,
    },
  };
}

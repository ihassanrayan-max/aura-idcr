import type {
  AlarmIntelligenceSnapshot,
  AlarmSet,
  CombinedRiskSnapshot,
  OperatorStateSnapshot,
  PlantStateSnapshot,
  ReasoningSnapshot,
} from "../contracts/aura";
import { buildCombinedRiskSnapshot } from "./combinedRisk";

const stressedPlantState: PlantStateSnapshot = {
  reactor_power_pct: 68,
  vessel_water_level_m: 6.55,
  vessel_pressure_mpa: 7.48,
  main_steam_flow_pct: 69,
  feedwater_flow_pct: 54,
  turbine_output_mwe: 196,
  condenser_heat_sink_available: true,
  condenser_backpressure_kpa: 18.6,
  isolation_condenser_available: true,
  isolation_condenser_flow_pct: 0,
  containment_pressure_kpa: 109,
  offsite_power_available: true,
  dc_bus_soc_pct: 91,
  reactor_trip_active: false,
  safety_relief_valve_open: true,
  alarm_load_count: 4,
  active_alarm_cluster_count: 2,
};

function buildAlarmSet(): AlarmSet {
  const active_alarms = [
    {
      alarm_id: "ALM_FEEDWATER_FLOW_LOW",
      title: "Feedwater flow low",
      priority: "P1" as const,
      subsystem_tag: "feedwater_system",
      active: true,
      visibility_rule: "always_visible" as const,
      group_hint: "feedwater_loss",
    },
    {
      alarm_id: "ALM_RPV_LEVEL_LOW",
      title: "RPV level low",
      priority: "P2" as const,
      subsystem_tag: "reactor_vessel",
      active: true,
      visibility_rule: "always_visible" as const,
      group_hint: "inventory_loss",
    },
    {
      alarm_id: "ALM_RPV_PRESSURE_HIGH",
      title: "RPV pressure high",
      priority: "P1" as const,
      subsystem_tag: "reactor_pressure",
      active: true,
      visibility_rule: "always_visible" as const,
      group_hint: "pressure_transient",
    },
    {
      alarm_id: "ALM_CONDENSER_BACKPRESSURE_HIGH",
      title: "Condenser backpressure high",
      priority: "P2" as const,
      subsystem_tag: "condenser_system",
      active: true,
      visibility_rule: "standard_visible" as const,
      group_hint: "heat_sink_loss",
    },
  ];

  return {
    alarm_set_id: "tick_0006_alarms",
    tick_id: "tick_0006",
    session_id: "session_001",
    scenario_id: "scn_alarm_cascade_root_cause",
    active_alarm_count: active_alarms.length,
    active_alarm_cluster_count: 2,
    highest_priority_active: "P1",
    active_alarm_ids: active_alarms.map((alarm) => alarm.alarm_id),
    active_alarms,
    newly_raised_alarm_ids: [],
    newly_cleared_alarm_ids: [],
  };
}

const alarmIntelligence: AlarmIntelligenceSnapshot = {
  visible_alarm_card_count: 2,
  grouped_alarm_count: 2,
  compression_ratio: 2,
  dominant_cluster_id: "cluster_feedwater_inventory",
  clusters: [],
};

const reasoningSnapshot: ReasoningSnapshot = {
  dominant_hypothesis_id: "hyp_feedwater_degradation",
  dominant_summary: "Feedwater degradation remains dominant but pressure consequences are rising.",
  ranked_hypotheses: [
    {
      hypothesis_id: "hyp_feedwater_degradation",
      label: "Feedwater Degradation",
      summary: "Feedwater degradation remains dominant.",
      score: 2.1,
      confidence_band: "medium",
      rank: 1,
      evidence: [],
      watch_items: ["feedwater_flow_pct", "vessel_water_level_m"],
    },
    {
      hypothesis_id: "hyp_pressure_control_transient",
      label: "Pressure Control Transient",
      summary: "Pressure consequences are rising.",
      score: 1.8,
      confidence_band: "medium",
      rank: 2,
      evidence: [],
      watch_items: ["vessel_pressure_mpa", "containment_pressure_kpa"],
    },
  ],
  changed_since_last_tick: true,
  stable_for_ticks: 1,
  expected_root_cause_aligned: true,
};

const degradedOperatorState: OperatorStateSnapshot = {
  workload_index: 76,
  attention_stability_index: 48,
  signal_confidence: 52,
  degraded_mode_active: true,
  degraded_mode_reason: "Confidence reduced: short observation window; storyline evidence is still settling.",
  observation_window_ticks: 2,
};

describe("buildCombinedRiskSnapshot", () => {
  it("produces deterministic transparent factor breakdowns", () => {
    const input = {
      plant_state: stressedPlantState,
      alarm_set: buildAlarmSet(),
      alarm_intelligence: alarmIntelligence,
      reasoning_snapshot: reasoningSnapshot,
      operator_state: degradedOperatorState,
    };

    const first = buildCombinedRiskSnapshot(input);
    const second = buildCombinedRiskSnapshot(input);

    expect(first).toEqual(second);
    expect(first.factor_breakdown).toHaveLength(6);
    expect(first.top_contributing_factors.length).toBeGreaterThan(0);
    expect(first.why_risk_is_current).toMatch(/Combined risk is/i);
    expect(first.confidence_caveat).toMatch(/Degraded proxy confidence/i);
    expect(first.what_changed).toMatch(/Initial combined-risk snapshot established/i);
  });

  it("reports what changed when risk rises between snapshots", () => {
    const previous: CombinedRiskSnapshot = buildCombinedRiskSnapshot({
      plant_state: {
        ...stressedPlantState,
        vessel_water_level_m: 6.95,
        vessel_pressure_mpa: 7.22,
        containment_pressure_kpa: 103,
        safety_relief_valve_open: false,
      },
      alarm_set: {
        ...buildAlarmSet(),
        active_alarm_count: 2,
        active_alarm_ids: ["ALM_FEEDWATER_FLOW_LOW", "ALM_RPV_LEVEL_LOW"],
        active_alarms: buildAlarmSet().active_alarms.slice(0, 2),
      },
      alarm_intelligence: {
        ...alarmIntelligence,
        visible_alarm_card_count: 1,
        grouped_alarm_count: 1,
        compression_ratio: 2,
      },
      reasoning_snapshot: {
        ...reasoningSnapshot,
        changed_since_last_tick: false,
        stable_for_ticks: 4,
        ranked_hypotheses: [
          { ...reasoningSnapshot.ranked_hypotheses[0], score: 2.5, confidence_band: "high" },
          { ...reasoningSnapshot.ranked_hypotheses[1], score: 1.1, confidence_band: "low" },
        ],
      },
      operator_state: {
        ...degradedOperatorState,
        workload_index: 58,
        attention_stability_index: 68,
        signal_confidence: 84,
        degraded_mode_active: false,
        degraded_mode_reason: "Nominal confidence from current runtime and session signals.",
        observation_window_ticks: 8,
      },
    });

    const current = buildCombinedRiskSnapshot({
      plant_state: stressedPlantState,
      alarm_set: buildAlarmSet(),
      alarm_intelligence: alarmIntelligence,
      reasoning_snapshot: reasoningSnapshot,
      operator_state: degradedOperatorState,
      previous_combined_risk: previous,
    });

    expect(current.combined_risk_score).toBeGreaterThan(previous.combined_risk_score);
    expect(current.what_changed).toMatch(/Risk rose/i);
    expect(current.top_contributing_factors[0]).toBeDefined();
  });
});

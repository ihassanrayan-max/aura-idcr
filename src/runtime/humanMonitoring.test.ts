import type { AlarmIntelligenceSnapshot, AlarmSet, ExecutedAction, PlantStateSnapshot, ReasoningSnapshot } from "../contracts/aura";
import { buildHumanMonitoringSnapshot, buildLegacyRuntimePlaceholderSource } from "./humanMonitoring";

const basePlantState: PlantStateSnapshot = {
  reactor_power_pct: 72,
  vessel_water_level_m: 7.1,
  vessel_pressure_mpa: 7.18,
  main_steam_flow_pct: 71,
  feedwater_flow_pct: 62,
  turbine_output_mwe: 206,
  condenser_heat_sink_available: true,
  condenser_backpressure_kpa: 15,
  isolation_condenser_available: true,
  isolation_condenser_flow_pct: 0,
  containment_pressure_kpa: 101,
  offsite_power_available: true,
  dc_bus_soc_pct: 92,
  reactor_trip_active: false,
  safety_relief_valve_open: false,
  alarm_load_count: 3,
  active_alarm_cluster_count: 2,
};

function buildAlarmSet(activeAlarmCount = 3): AlarmSet {
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
      alarm_id: "ALM_TURBINE_OUTPUT_LOW",
      title: "Turbine output low",
      priority: "P3" as const,
      subsystem_tag: "turbine_generator",
      active: true,
      visibility_rule: "standard_visible" as const,
      group_hint: "generation_mismatch",
    },
  ].slice(0, activeAlarmCount);

  return {
    alarm_set_id: "tick_0003_alarms",
    tick_id: "tick_0003",
    session_id: "session_001",
    scenario_id: "scn_alarm_cascade_root_cause",
    active_alarm_count: active_alarms.length,
    active_alarm_cluster_count: Math.max(Math.min(active_alarms.length, 2), 0),
    highest_priority_active: active_alarms[0]?.priority,
    active_alarm_ids: active_alarms.map((alarm) => alarm.alarm_id),
    active_alarms,
    newly_raised_alarm_ids: active_alarms.map((alarm) => alarm.alarm_id),
    newly_cleared_alarm_ids: [],
  };
}

function buildAlarmIntelligence(activeAlarmCount = 3): AlarmIntelligenceSnapshot {
  return {
    visible_alarm_card_count: Math.max(Math.min(activeAlarmCount, 2), 0),
    grouped_alarm_count: Math.max(Math.min(activeAlarmCount, 2), 0),
    compression_ratio: activeAlarmCount === 0 ? 0 : Number((activeAlarmCount / Math.max(Math.min(activeAlarmCount, 2), 1)).toFixed(2)),
    dominant_cluster_id: activeAlarmCount > 0 ? "cluster_feedwater_inventory" : undefined,
    clusters: [],
  };
}

function buildReasoningSnapshot(overrides: Partial<ReasoningSnapshot> = {}): ReasoningSnapshot {
  return {
    dominant_hypothesis_id: "hyp_feedwater_degradation",
    dominant_summary: "Feedwater-side flow loss is dominating the current upset.",
    ranked_hypotheses: [
      {
        hypothesis_id: "hyp_feedwater_degradation",
        label: "Feedwater Degradation",
        summary: "Feedwater-side flow loss is dominating the current upset.",
        score: 2.5,
        confidence_band: "high",
        rank: 1,
        evidence: [],
        watch_items: ["feedwater_flow_pct"],
      },
      {
        hypothesis_id: "hyp_heat_sink_stress",
        label: "Heat Sink / Steam Path Stress",
        summary: "Heat-sink stress is present but secondary.",
        score: 1.2,
        confidence_band: "medium",
        rank: 2,
        evidence: [],
        watch_items: ["condenser_backpressure_kpa"],
      },
    ],
    changed_since_last_tick: false,
    stable_for_ticks: 3,
    expected_root_cause_aligned: true,
    ...overrides,
  };
}

function buildExecutedAction(sim_time_sec: number): ExecutedAction {
  return {
    action_request_id: "actreq_0001",
    session_id: "session_001",
    scenario_id: "scn_alarm_cascade_root_cause",
    sim_time_sec,
    actor_role: "operator",
    action_id: "act_adjust_feedwater",
    target_subsystem: "feedwater_system",
    requested_value: 82,
    ui_region: "plant_mimic",
    reason_note: "test correction",
    applied: true,
  };
}

describe("humanMonitoring foundation", () => {
  it("builds deterministic placeholder compatibility snapshots", () => {
    const placeholder = buildLegacyRuntimePlaceholderSource({
      sim_time_sec: 55,
      tick_index: 8,
      tick_duration_sec: 5,
      plant_state: basePlantState,
      alarm_set: buildAlarmSet(3),
      alarm_intelligence: buildAlarmIntelligence(3),
      reasoning_snapshot: buildReasoningSnapshot(),
      executed_actions: [buildExecutedAction(35)],
      lane_changed: false,
    });

    const first = buildHumanMonitoringSnapshot({
      sim_time_sec: 55,
      tick_index: 8,
      tick_duration_sec: 5,
      sources: [placeholder.source],
      compatibility_observation: placeholder.compatibility_observation,
    });
    const second = buildHumanMonitoringSnapshot({
      sim_time_sec: 55,
      tick_index: 8,
      tick_duration_sec: 5,
      sources: [placeholder.source],
      compatibility_observation: placeholder.compatibility_observation,
    });

    expect(first).toEqual(second);
    expect(first.mode).toBe("placeholder_compatibility");
    expect(first.connected_source_count).toBe(1);
    expect(first.sources[0]?.source_kind).toBe("legacy_runtime_placeholder");
  });

  it("reports unavailable when no sources are connected", () => {
    const snapshot = buildHumanMonitoringSnapshot({
      sim_time_sec: 0,
      tick_index: 0,
      tick_duration_sec: 5,
      sources: [],
    });

    expect(snapshot.mode).toBe("unavailable");
    expect(snapshot.degraded_state_active).toBe(true);
    expect(snapshot.aggregate_confidence).toBe(0);
    expect(snapshot.status_summary).toMatch(/no live or placeholder sources/i);
  });

  it("marks low-confidence placeholder windows as degraded", () => {
    const placeholder = buildLegacyRuntimePlaceholderSource({
      sim_time_sec: 0,
      tick_index: 0,
      tick_duration_sec: 5,
      plant_state: { ...basePlantState, alarm_load_count: 0, active_alarm_cluster_count: 0 },
      alarm_set: buildAlarmSet(0),
      alarm_intelligence: buildAlarmIntelligence(0),
      reasoning_snapshot: buildReasoningSnapshot({
        dominant_hypothesis_id: undefined,
        ranked_hypotheses: [],
        stable_for_ticks: 0,
      }),
      executed_actions: [] as ExecutedAction[],
      lane_changed: false,
    });
    const snapshot = buildHumanMonitoringSnapshot({
      sim_time_sec: 0,
      tick_index: 0,
      tick_duration_sec: 5,
      sources: [placeholder.source],
      compatibility_observation: placeholder.compatibility_observation,
    });

    expect(snapshot.mode).toBe("placeholder_compatibility");
    expect(snapshot.degraded_state_active).toBe(true);
    expect(snapshot.aggregate_confidence).toBeLessThan(70);
    expect(snapshot.degraded_state_reason).toMatch(/legacy_runtime_placeholder/i);
  });
});

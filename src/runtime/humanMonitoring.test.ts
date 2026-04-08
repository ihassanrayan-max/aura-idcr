import type {
  AlarmIntelligenceSnapshot,
  AlarmSet,
  InteractionTelemetryEventKind,
  PlantStateSnapshot,
  ReasoningSnapshot,
} from "../contracts/aura";
import {
  DEFAULT_HUMAN_MONITORING_SOURCE_ADAPTERS,
  createHumanMonitoringRuntimeState,
  evaluateHumanMonitoring,
  recordInteractionTelemetry,
  setInteractionTelemetrySuppressed,
} from "./humanMonitoring";

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

function buildAlarmSet(activeAlarmCount = 3, overrides: Partial<AlarmSet> = {}): AlarmSet {
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
    ...overrides,
  };
}

function buildAlarmIntelligence(activeAlarmCount = 3): AlarmIntelligenceSnapshot {
  return {
    visible_alarm_card_count: Math.max(Math.min(activeAlarmCount, 2), 0),
    grouped_alarm_count: Math.max(Math.min(activeAlarmCount, 2), 0),
    compression_ratio:
      activeAlarmCount === 0 ? 0 : Number((activeAlarmCount / Math.max(Math.min(activeAlarmCount, 2), 1)).toFixed(2)),
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

function buildInteractionRuntimeState(
  events: Array<{
    sim_time_sec: number;
    tick_index: number;
    event_kind: InteractionTelemetryEventKind;
    target_id?: string;
    requested_value?: number;
    workspace?: "operate" | "review";
  }>,
) {
  let runtime_state = createHumanMonitoringRuntimeState();
  for (const event of events) {
    runtime_state = recordInteractionTelemetry({
      runtime_state,
      sim_time_sec: event.sim_time_sec,
      tick_index: event.tick_index,
      event_kind: event.event_kind,
      ui_region:
        event.event_kind === "workspace_switch"
          ? "workspace_switcher"
          : event.event_kind === "alarm_cluster_toggle"
            ? "alarm_cluster"
            : event.event_kind === "manual_control_adjustment"
              ? "plant_mimic"
              : event.event_kind.startsWith("supervisor_override")
                ? "review_workspace"
                : "runtime_controls",
      workspace: event.workspace,
      target_id: event.target_id,
      requested_value: event.requested_value,
      detail: "test interaction",
    });
  }
  return runtime_state;
}

function evaluateWithDefaultSources(params?: {
  sim_time_sec?: number;
  tick_index?: number;
  runtime_state?: ReturnType<typeof createHumanMonitoringRuntimeState>;
  alarm_set?: AlarmSet;
  reasoning_snapshot?: ReasoningSnapshot;
  lane_changed?: boolean;
}) {
  const runtime_state = params?.runtime_state ?? createHumanMonitoringRuntimeState();
  return evaluateHumanMonitoring({
    sim_time_sec: params?.sim_time_sec ?? 30,
    tick_index: params?.tick_index ?? 6,
    tick_duration_sec: 5,
    plant_state: basePlantState,
    alarm_set: params?.alarm_set ?? buildAlarmSet(3),
    alarm_intelligence: buildAlarmIntelligence(3),
    reasoning_snapshot: params?.reasoning_snapshot ?? buildReasoningSnapshot(),
    executed_actions: [],
    lane_changed: params?.lane_changed ?? false,
    runtime_state,
  }).snapshot;
}

describe("humanMonitoring interaction telemetry", () => {
  it("keeps placeholder compatibility active until live interaction evidence starts contributing", () => {
    const snapshot = evaluateWithDefaultSources({
      sim_time_sec: 0,
      tick_index: 0,
      alarm_set: buildAlarmSet(0, {
        newly_raised_alarm_ids: [],
      }),
      reasoning_snapshot: buildReasoningSnapshot({
        dominant_hypothesis_id: undefined,
        ranked_hypotheses: [],
        stable_for_ticks: 0,
      }),
    });

    const interactionSource = snapshot.sources.find((source) => source.source_kind === "interaction_telemetry");

    expect(snapshot.mode).toBe("placeholder_compatibility");
    expect(snapshot.connected_source_count).toBe(2);
    expect(interactionSource?.freshness_status).toBe("no_observations");
    expect(interactionSource?.contributes_to_aggregate).toBe(false);
    expect(interactionSource?.status_note).toMatch(/no practical operator interaction evidence has been captured yet/i);
  });

  it("produces a bounded live interaction contribution from a stable nominal interaction window", () => {
    const runtime_state = buildInteractionRuntimeState([
      {
        sim_time_sec: 5,
        tick_index: 1,
        event_kind: "workspace_switch",
        target_id: "review",
        workspace: "review",
      },
      {
        sim_time_sec: 10,
        tick_index: 2,
        event_kind: "workspace_switch",
        target_id: "operate",
        workspace: "operate",
      },
      {
        sim_time_sec: 15,
        tick_index: 3,
        event_kind: "manual_control_adjustment",
        target_id: "control_feedwater_demand",
        requested_value: 74,
      },
      {
        sim_time_sec: 18,
        tick_index: 3,
        event_kind: "action_request",
        target_id: "act_adjust_feedwater",
        requested_value: 74,
      },
      {
        sim_time_sec: 24,
        tick_index: 4,
        event_kind: "action_confirmation",
        target_id: "act_adjust_feedwater",
        requested_value: 74,
      },
    ]);

    const snapshot = evaluateWithDefaultSources({
      sim_time_sec: 28,
      tick_index: 5,
      runtime_state,
      alarm_set: buildAlarmSet(2, { newly_raised_alarm_ids: [] }),
    });
    const interactionSource = snapshot.sources.find((source) => source.source_kind === "interaction_telemetry");

    expect(snapshot.mode).toBe("live_sources");
    expect(snapshot.interpretation_input?.provenance).toBe("canonical_source_pipeline");
    expect(snapshot.interpretation_input?.contributing_source_ids).toContain("interaction_telemetry");
    expect(interactionSource?.contributes_to_aggregate).toBe(true);
    expect(interactionSource?.confidence).toBeGreaterThanOrEqual(70);
    expect(interactionSource?.status_note).toMatch(/interaction telemetry observed/i);
    expect(snapshot.status_summary).toMatch(/interaction telemetry/i);
  });

  it("marks sparse interaction windows as degraded without claiming the source is unavailable", () => {
    const runtime_state = buildInteractionRuntimeState([
      {
        sim_time_sec: 12,
        tick_index: 2,
        event_kind: "manual_control_adjustment",
        target_id: "control_feedwater_demand",
        requested_value: 66,
      },
    ]);

    const snapshot = evaluateWithDefaultSources({
      sim_time_sec: 15,
      tick_index: 3,
      runtime_state,
      alarm_set: buildAlarmSet(1, { newly_raised_alarm_ids: [] }),
    });
    const interactionSource = snapshot.sources.find((source) => source.source_kind === "interaction_telemetry");

    expect(interactionSource?.availability).toBe("degraded");
    expect(interactionSource?.freshness_status).toBe("current");
    expect(interactionSource?.contributes_to_aggregate).toBe(true);
    expect(interactionSource?.status_note).toMatch(/confidence reduced/i);
    expect(snapshot.degraded_state_active).toBe(true);
  });

  it("ages out stale interaction telemetry cleanly while preserving canonical degraded semantics", () => {
    const runtime_state = buildInteractionRuntimeState([
      {
        sim_time_sec: 0,
        tick_index: 0,
        event_kind: "action_request",
        target_id: "act_adjust_feedwater",
        requested_value: 70,
      },
    ]);

    const snapshot = evaluateWithDefaultSources({
      sim_time_sec: 95,
      tick_index: 19,
      runtime_state,
      alarm_set: buildAlarmSet(3, {
        newly_raised_alarm_ids: [],
      }),
    });
    const interactionSource = snapshot.sources.find((source) => source.source_kind === "interaction_telemetry");

    expect(interactionSource?.freshness_status).toBe("stale");
    expect(interactionSource?.contributes_to_aggregate).toBe(false);
    expect(snapshot.degraded_state_active).toBe(true);
    expect(snapshot.degraded_state_reason).toMatch(/interaction_telemetry is stale/i);
  });

  it("raises workload and lowers attention stability when reversals and bursty retries are present", () => {
    const stableRuntime = buildInteractionRuntimeState([
      { sim_time_sec: 6, tick_index: 1, event_kind: "action_request", target_id: "act_adjust_feedwater", requested_value: 68 },
      { sim_time_sec: 18, tick_index: 3, event_kind: "action_request", target_id: "act_adjust_feedwater", requested_value: 72 },
      { sim_time_sec: 30, tick_index: 6, event_kind: "action_request", target_id: "act_adjust_feedwater", requested_value: 76 },
    ]);
    const unstableRuntime = buildInteractionRuntimeState([
      { sim_time_sec: 18, tick_index: 3, event_kind: "action_request", target_id: "act_adjust_feedwater", requested_value: 82 },
      { sim_time_sec: 20, tick_index: 4, event_kind: "action_request", target_id: "act_adjust_feedwater", requested_value: 46 },
      { sim_time_sec: 22, tick_index: 4, event_kind: "action_request", target_id: "act_adjust_feedwater", requested_value: 84 },
      { sim_time_sec: 23, tick_index: 4, event_kind: "workspace_switch", target_id: "review", workspace: "review" },
      { sim_time_sec: 24, tick_index: 4, event_kind: "workspace_switch", target_id: "operate", workspace: "operate" },
    ]);

    const stable = evaluateWithDefaultSources({
      sim_time_sec: 34,
      tick_index: 6,
      runtime_state: stableRuntime,
      alarm_set: buildAlarmSet(2, { newly_raised_alarm_ids: [] }),
    });
    const unstable = evaluateWithDefaultSources({
      sim_time_sec: 34,
      tick_index: 6,
      runtime_state: unstableRuntime,
      alarm_set: buildAlarmSet(2, { newly_raised_alarm_ids: [] }),
    });

    expect(unstable.interpretation_input?.workload_index ?? 0).toBeGreaterThan(
      stable.interpretation_input?.workload_index ?? 0,
    );
    expect(unstable.interpretation_input?.attention_stability_index ?? 100).toBeLessThan(
      stable.interpretation_input?.attention_stability_index ?? 100,
    );
  });

  it("raises workload pressure for inactivity during meaningful moments without making unavailable claims", () => {
    const runtime_state = buildInteractionRuntimeState([
      {
        sim_time_sec: 5,
        tick_index: 1,
        event_kind: "action_request",
        target_id: "act_ack_alarm",
      },
    ]);

    const calmSnapshot = evaluateWithDefaultSources({
      sim_time_sec: 30,
      tick_index: 6,
      runtime_state,
      alarm_set: buildAlarmSet(0, {
        newly_raised_alarm_ids: [],
        active_alarm_ids: [],
        active_alarms: [],
        highest_priority_active: undefined,
      }),
    });
    const meaningfulSnapshot = evaluateWithDefaultSources({
      sim_time_sec: 30,
      tick_index: 6,
      runtime_state,
      alarm_set: buildAlarmSet(3),
      lane_changed: true,
      reasoning_snapshot: buildReasoningSnapshot({ changed_since_last_tick: true }),
    });

    expect(meaningfulSnapshot.interpretation_input?.workload_index ?? 0).toBeGreaterThan(
      calmSnapshot.interpretation_input?.workload_index ?? 0,
    );
    expect(meaningfulSnapshot.sources.find((source) => source.source_kind === "interaction_telemetry")?.status_note).toMatch(
      /hesitation pressure elevated/i,
    );
  });

  it("preserves suppression for tutorial-only telemetry writes until capture is re-enabled", () => {
    let runtime_state = createHumanMonitoringRuntimeState();
    runtime_state = setInteractionTelemetrySuppressed(runtime_state, true);
    runtime_state = recordInteractionTelemetry({
      runtime_state,
      sim_time_sec: 4,
      tick_index: 0,
      event_kind: "workspace_switch",
      ui_region: "workspace_switcher",
      workspace: "review",
      target_id: "review",
    });
    expect(runtime_state.interaction_telemetry.records).toHaveLength(0);

    runtime_state = setInteractionTelemetrySuppressed(runtime_state, false);
    runtime_state = recordInteractionTelemetry({
      runtime_state,
      sim_time_sec: 5,
      tick_index: 1,
      event_kind: "workspace_switch",
      ui_region: "workspace_switcher",
      workspace: "review",
      target_id: "review",
    });
    expect(runtime_state.interaction_telemetry.records).toHaveLength(1);
  });

  it("can run interaction telemetry by itself through the same canonical source pipeline", () => {
    const interactionOnlyAdapters = DEFAULT_HUMAN_MONITORING_SOURCE_ADAPTERS.filter(
      (adapter) => adapter.source_kind === "interaction_telemetry",
    );
    const runtime_state = buildInteractionRuntimeState([
      { sim_time_sec: 8, tick_index: 1, event_kind: "workspace_switch", target_id: "review", workspace: "review" },
      { sim_time_sec: 12, tick_index: 2, event_kind: "action_request", target_id: "act_adjust_feedwater", requested_value: 72 },
      { sim_time_sec: 20, tick_index: 4, event_kind: "action_confirmation", target_id: "act_adjust_feedwater", requested_value: 72 },
    ]);

    const snapshot = evaluateHumanMonitoring({
      sim_time_sec: 24,
      tick_index: 4,
      tick_duration_sec: 5,
      plant_state: basePlantState,
      alarm_set: buildAlarmSet(2, { newly_raised_alarm_ids: [] }),
      alarm_intelligence: buildAlarmIntelligence(2),
      reasoning_snapshot: buildReasoningSnapshot(),
      executed_actions: [],
      lane_changed: false,
      runtime_state,
      adapters: interactionOnlyAdapters,
    }).snapshot;

    expect(snapshot.mode).toBe("live_sources");
    expect(snapshot.connected_source_count).toBe(1);
    expect(snapshot.contributing_source_count).toBe(1);
    expect(snapshot.interpretation_input?.provenance).toBe("canonical_source_pipeline");
  });
});

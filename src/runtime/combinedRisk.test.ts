import type {
  AlarmIntelligenceSnapshot,
  AlarmSet,
  CombinedRiskSnapshot,
  FirstResponseLane,
  HumanMonitoringSnapshot,
  OperatorStateSnapshot,
  PlantStateSnapshot,
  ReasoningSnapshot,
  ScenarioPhase,
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

const currentPhase: ScenarioPhase = {
  phase_id: "phase_response",
  label: "Response",
  description: "Bounded response window",
  nominal_duration_sec: 45,
  completion_condition: { elapsed_time_sec_gte: 45 },
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
    newly_raised_alarm_ids: ["ALM_RPV_PRESSURE_HIGH"],
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

const firstResponseLane: FirstResponseLane = {
  lane_id: "lane_feedwater",
  dominant_hypothesis_id: "hyp_feedwater_degradation",
  updated_at_sec: 30,
  prototype_notice: "Prototype guidance only.",
  items: [
    {
      item_id: "fw_check",
      label: "Confirm feedwater mismatch",
      item_kind: "check",
      why: "Verify the dominant driver first.",
      completion_hint: "Check level, steam, and feedwater together.",
      source_alarm_ids: ["ALM_FEEDWATER_FLOW_LOW"],
      source_variable_ids: ["feedwater_flow_pct", "vessel_water_level_m"],
    },
    {
      item_id: "fw_action",
      label: "Recover feedwater demand toward 82% rated",
      item_kind: "action",
      why: "Bounded recovery step.",
      recommended_action_id: "act_adjust_feedwater",
      recommended_value: 82,
      completion_hint: "Use the bounded correction first.",
      source_alarm_ids: ["ALM_FEEDWATER_FLOW_LOW"],
      source_variable_ids: ["feedwater_flow_pct"],
    },
    {
      item_id: "fw_watch",
      label: "Watch vessel level and pressure after correction",
      item_kind: "watch",
      why: "Confirm whether the correction is working.",
      completion_hint: "Keep pressure and level in view.",
      source_alarm_ids: ["ALM_RPV_LEVEL_LOW", "ALM_RPV_PRESSURE_HIGH"],
      source_variable_ids: ["vessel_water_level_m", "vessel_pressure_mpa"],
    },
  ],
};

function buildHumanMonitoring(overrides: Partial<HumanMonitoringSnapshot> = {}): HumanMonitoringSnapshot {
  return {
    snapshot_id: "hm_0006",
    mode: "live_sources",
    freshness_status: "current",
    aggregate_confidence: 82,
    degraded_state_active: false,
    degraded_state_reason: "Monitoring posture is current.",
    status_summary: "Interaction telemetry is contributing bounded live evidence.",
    latest_observation_sim_time_sec: 30,
    oldest_observation_sim_time_sec: 15,
    window_tick_span: 4,
    window_duration_sec: 15,
    connected_source_count: 3,
    active_source_count: 2,
    current_source_count: 2,
    degraded_source_count: 0,
    stale_source_count: 0,
    contributing_source_count: 2,
    sources: [
      {
        source_id: "legacy_runtime_placeholder",
        source_kind: "legacy_runtime_placeholder",
        availability: "active",
        freshness_status: "current",
        confidence: 74,
        status_note: "Fallback source remains current.",
        latest_observation_age_sec: 0,
        last_observation_sim_time_sec: 30,
        oldest_observation_sim_time_sec: 15,
        expected_update_interval_sec: 5,
        stale_after_sec: 20,
        window_tick_span: 4,
        window_duration_sec: 15,
        sample_count_in_window: 4,
        contributes_to_aggregate: true,
      },
      {
        source_id: "interaction_telemetry",
        source_kind: "interaction_telemetry",
        availability: "active",
        freshness_status: "current",
        confidence: 86,
        status_note: "Interaction telemetry is current.",
        latest_observation_age_sec: 2,
        last_observation_sim_time_sec: 28,
        oldest_observation_sim_time_sec: 15,
        expected_update_interval_sec: 20,
        stale_after_sec: 60,
        window_tick_span: 4,
        window_duration_sec: 15,
        sample_count_in_window: 4,
        contributes_to_aggregate: true,
      },
      {
        source_id: "camera_cv",
        source_kind: "camera_cv",
        availability: "degraded",
        freshness_status: "aging",
        confidence: 44,
        status_note: "Webcam remains advisory.",
        latest_observation_age_sec: 6,
        last_observation_sim_time_sec: 24,
        oldest_observation_sim_time_sec: 20,
        expected_update_interval_sec: 2,
        stale_after_sec: 8,
        window_tick_span: 2,
        window_duration_sec: 5,
        sample_count_in_window: 2,
        contributes_to_aggregate: true,
      },
    ],
    interpretation_input: {
      workload_index: 76,
      attention_stability_index: 48,
      signal_confidence: 82,
      risk_cues: {
        hesitation_pressure: 28,
        latency_trend_pressure: 18,
        reversal_oscillation_pressure: 20,
        inactivity_pressure: 14,
        burstiness_pressure: 16,
        navigation_instability_pressure: 12,
        advisory_visual_attention_pressure: 10,
      },
      degraded_mode_active: false,
      degraded_mode_reason: "Monitoring posture is current.",
      observation_window_ticks: 4,
      contributing_source_ids: ["interaction_telemetry", "camera_cv"],
      provenance: "canonical_source_pipeline",
      interpretation_note: "Canonical monitoring posture.",
    },
    ...overrides,
  };
}

const degradedOperatorState: OperatorStateSnapshot = {
  workload_index: 76,
  attention_stability_index: 48,
  signal_confidence: 52,
  degraded_mode_active: true,
  degraded_mode_reason: "Confidence reduced: short observation window; storyline evidence is still settling.",
  observation_window_ticks: 2,
};

function buildInput(overrides: {
  human_monitoring?: HumanMonitoringSnapshot;
  operator_state?: OperatorStateSnapshot;
  previous_combined_risk?: CombinedRiskSnapshot;
  sim_time_sec?: number;
  current_phase_elapsed_time_sec?: number;
} = {}) {
  return {
    sim_time_sec: overrides.sim_time_sec ?? 30,
    plant_state: stressedPlantState,
    alarm_set: buildAlarmSet(),
    alarm_intelligence: alarmIntelligence,
    reasoning_snapshot: reasoningSnapshot,
    human_monitoring: overrides.human_monitoring ?? buildHumanMonitoring(),
    operator_state: overrides.operator_state ?? degradedOperatorState,
    first_response_lane: firstResponseLane,
    current_phase: currentPhase,
    current_phase_elapsed_time_sec: overrides.current_phase_elapsed_time_sec ?? 28,
    scenario_expected_duration_sec: 75,
    previous_combined_risk: overrides.previous_combined_risk,
  };
}

describe("buildCombinedRiskSnapshot", () => {
  it("produces deterministic bounded Packet 4 fusion output", () => {
    const first = buildCombinedRiskSnapshot(buildInput());
    const second = buildCombinedRiskSnapshot(buildInput());

    expect(first).toEqual(second);
    expect(first.factor_breakdown).toHaveLength(8);
    expect(first.combined_risk_score).toBeGreaterThanOrEqual(0);
    expect(first.combined_risk_score).toBeLessThanOrEqual(100);
    expect(first.risk_model_id).toBe("hpsn_lite_v1");
    expect(first.why_risk_is_current).toMatch(/recommendation is/i);
    expect(first.recommended_assistance_reason).toMatch(/Recommend/i);
  });

  it("worsens monotonically when plant, alarm, timing, and human pressure worsen together", () => {
    const calmer = buildCombinedRiskSnapshot(
      buildInput({
        sim_time_sec: 18,
        current_phase_elapsed_time_sec: 12,
        human_monitoring: buildHumanMonitoring({
          aggregate_confidence: 84,
          interpretation_input: {
            ...buildHumanMonitoring().interpretation_input!,
            workload_index: 48,
            attention_stability_index: 74,
            signal_confidence: 84,
            risk_cues: {
              hesitation_pressure: 10,
              latency_trend_pressure: 6,
              reversal_oscillation_pressure: 4,
              inactivity_pressure: 4,
              burstiness_pressure: 6,
              navigation_instability_pressure: 4,
              advisory_visual_attention_pressure: 4,
            },
          },
        }),
        operator_state: {
          ...degradedOperatorState,
          workload_index: 48,
          attention_stability_index: 74,
          signal_confidence: 84,
          degraded_mode_active: false,
          degraded_mode_reason: "Nominal confidence from current runtime and session signals.",
          observation_window_ticks: 6,
        },
      }),
    );
    const stressed = buildCombinedRiskSnapshot(buildInput());

    expect(stressed.combined_risk_score).toBeGreaterThan(calmer.combined_risk_score);
    expect(stressed.plant_urgency_index).toBeGreaterThanOrEqual(calmer.plant_urgency_index);
    expect(stressed.human_pressure_index).toBeGreaterThan(calmer.human_pressure_index);
  });

  it("confidence-gates human influence while leaving plant/context factors fully active", () => {
    const currentLive = buildCombinedRiskSnapshot(
      buildInput({
        human_monitoring: buildHumanMonitoring({
          mode: "live_sources",
          freshness_status: "current",
          aggregate_confidence: 82,
        }),
        operator_state: {
          ...degradedOperatorState,
          signal_confidence: 82,
          degraded_mode_active: false,
          degraded_mode_reason: "Nominal confidence from current runtime and session signals.",
        },
      }),
    );
    const agingLive = buildCombinedRiskSnapshot(
      buildInput({
        human_monitoring: buildHumanMonitoring({
          freshness_status: "aging",
          aggregate_confidence: 62,
        }),
      }),
    );
    const placeholder = buildCombinedRiskSnapshot(
      buildInput({
        human_monitoring: buildHumanMonitoring({
          mode: "placeholder_compatibility",
          aggregate_confidence: 54,
          interpretation_input: {
            ...buildHumanMonitoring().interpretation_input!,
            contributing_source_ids: ["legacy_runtime_placeholder"],
          },
        }),
      }),
    );
    const stale = buildCombinedRiskSnapshot(
      buildInput({
        human_monitoring: buildHumanMonitoring({
          mode: "degraded",
          freshness_status: "stale",
          aggregate_confidence: 30,
          degraded_state_active: true,
          degraded_state_reason: "Interaction telemetry is stale.",
          interpretation_input: {
            ...buildHumanMonitoring().interpretation_input!,
            contributing_source_ids: ["interaction_telemetry"],
          },
        }),
      }),
    );

    expect(currentLive.human_influence_scale).toBe(1);
    expect(agingLive.human_influence_scale).toBe(0.7);
    expect(placeholder.human_influence_scale).toBe(0.4);
    expect(stale.human_influence_scale).toBe(0.25);

    const currentHumanContribution = currentLive.factor_breakdown
      .filter((factor) => factor.factor_id === "human_workload_pressure" || factor.factor_id === "interaction_friction")
      .reduce((total, factor) => total + factor.contribution, 0);
    const staleHumanContribution = stale.factor_breakdown
      .filter((factor) => factor.factor_id === "human_workload_pressure" || factor.factor_id === "interaction_friction")
      .reduce((total, factor) => total + factor.contribution, 0);
    const currentPlantContribution =
      currentLive.factor_breakdown.find((factor) => factor.factor_id === "plant_urgency")?.contribution ?? 0;
    const stalePlantContribution =
      stale.factor_breakdown.find((factor) => factor.factor_id === "plant_urgency")?.contribution ?? 0;

    expect(staleHumanContribution).toBeLessThan(currentHumanContribution);
    expect(stalePlantContribution).toBe(currentPlantContribution);
  });

  it("caps one-tick human dropoff when plant/context are unchanged", () => {
    const previous = buildCombinedRiskSnapshot(buildInput());
    const stale = buildCombinedRiskSnapshot(
      buildInput({
        human_monitoring: buildHumanMonitoring({
          mode: "degraded",
          freshness_status: "stale",
          aggregate_confidence: 22,
          degraded_state_active: true,
          degraded_state_reason: "Interaction telemetry is stale.",
        }),
        previous_combined_risk: previous,
      }),
    );

    expect(previous.combined_risk_score - stale.combined_risk_score).toBeLessThan(10);
    expect(stale.what_changed).toMatch(/Risk eased|Risk is steady/i);
  });
});

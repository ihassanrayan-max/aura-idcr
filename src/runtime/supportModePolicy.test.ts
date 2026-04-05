import { describe, expect, it } from "vitest";
import type {
  AlarmIntelligenceSnapshot,
  AlarmSet,
  CombinedRiskSnapshot,
  OperatorStateSnapshot,
  PlantStateSnapshot,
  ReasoningSnapshot,
  SupportMode,
} from "../contracts/aura";
import { createSupportModeRuntimeState, resolveSupportModePolicy } from "./supportModePolicy";

const basePlantState: PlantStateSnapshot = {
  reactor_power_pct: 68,
  vessel_water_level_m: 6.7,
  vessel_pressure_mpa: 7.28,
  main_steam_flow_pct: 69,
  feedwater_flow_pct: 57,
  turbine_output_mwe: 194,
  condenser_heat_sink_available: true,
  condenser_backpressure_kpa: 17.8,
  isolation_condenser_available: true,
  isolation_condenser_flow_pct: 0,
  containment_pressure_kpa: 104,
  offsite_power_available: true,
  dc_bus_soc_pct: 90,
  reactor_trip_active: false,
  safety_relief_valve_open: false,
  alarm_load_count: 3,
  active_alarm_cluster_count: 2,
};

function buildAlarmSet(overrides: Partial<AlarmSet> = {}): AlarmSet {
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
  ];

  return {
    alarm_set_id: "tick_0004_alarms",
    tick_id: "tick_0004",
    session_id: "session_001",
    scenario_id: "scn_alarm_cascade_root_cause",
    active_alarm_count: active_alarms.length,
    active_alarm_cluster_count: 1,
    highest_priority_active: "P1",
    active_alarm_ids: active_alarms.map((alarm) => alarm.alarm_id),
    active_alarms,
    newly_raised_alarm_ids: [],
    newly_cleared_alarm_ids: [],
    ...overrides,
  };
}

const alarmIntelligence: AlarmIntelligenceSnapshot = {
  visible_alarm_card_count: 1,
  grouped_alarm_count: 1,
  compression_ratio: 2,
  dominant_cluster_id: "cluster_feedwater_inventory",
  clusters: [],
};

const stableReasoningSnapshot: ReasoningSnapshot = {
  dominant_hypothesis_id: "hyp_feedwater_degradation",
  dominant_summary: "Feedwater-side degradation remains dominant.",
  ranked_hypotheses: [
    {
      hypothesis_id: "hyp_feedwater_degradation",
      label: "Feedwater Degradation",
      summary: "Feedwater-side degradation remains dominant.",
      score: 2.9,
      confidence_band: "high",
      rank: 1,
      evidence: [],
      watch_items: ["vessel_water_level_m", "feedwater_flow_pct"],
    },
  ],
  changed_since_last_tick: false,
  stable_for_ticks: 4,
  expected_root_cause_aligned: true,
};

function buildOperatorState(overrides: Partial<OperatorStateSnapshot> = {}): OperatorStateSnapshot {
  return {
    workload_index: 64,
    attention_stability_index: 72,
    signal_confidence: 84,
    degraded_mode_active: false,
    degraded_mode_reason: "Nominal confidence from current runtime and session signals.",
    observation_window_ticks: 6,
    ...overrides,
  };
}

function buildCombinedRisk(overrides: Partial<CombinedRiskSnapshot> = {}): CombinedRiskSnapshot {
  return {
    combined_risk_score: 46,
    combined_risk_band: "elevated",
    factor_breakdown: [
      {
        factor_id: "plant_severity",
        label: "Plant severity",
        raw_index: 48,
        contribution: 16.3,
        detail: "Plant severity is elevated.",
      },
      {
        factor_id: "diagnosis_uncertainty",
        label: "Diagnosis uncertainty",
        raw_index: 34,
        contribution: 5.4,
        detail: "Reasoning is stable.",
      },
      {
        factor_id: "operator_workload",
        label: "Operator workload",
        raw_index: 64,
        contribution: 9,
        detail: "Workload is elevated.",
      },
      {
        factor_id: "attention_instability",
        label: "Attention instability",
        raw_index: 28,
        contribution: 2.2,
        detail: "Attention remains bounded.",
      },
      {
        factor_id: "signal_confidence_penalty",
        label: "Signal confidence penalty",
        raw_index: 16,
        contribution: 1,
        detail: "Signal confidence is nominal.",
      },
      {
        factor_id: "alarm_burden",
        label: "Alarm burden",
        raw_index: 38,
        contribution: 8.4,
        detail: "Alarm burden remains manageable.",
      },
    ],
    top_contributing_factors: ["Plant severity", "Operator workload", "Alarm burden"],
    confidence_caveat: "Signal confidence 84/100 from current runtime and session cues.",
    why_risk_is_current: "Combined risk is elevated because plant severity and operator workload are the strongest current drivers.",
    what_changed: "Risk is steady; plant severity remains the main driver.",
    ...overrides,
  };
}

function resolveWithMode(params: {
  previous_mode: SupportMode;
  runtime_state?: ReturnType<typeof createSupportModeRuntimeState>;
  alarm_set?: AlarmSet;
  combined_risk?: CombinedRiskSnapshot;
  operator_state?: OperatorStateSnapshot;
  plant_state?: PlantStateSnapshot;
  reasoning_snapshot?: ReasoningSnapshot;
}): ReturnType<typeof resolveSupportModePolicy> {
  return resolveSupportModePolicy({
    plant_state: params.plant_state ?? basePlantState,
    alarm_set: params.alarm_set ?? buildAlarmSet(),
    alarm_intelligence: alarmIntelligence,
    reasoning_snapshot: params.reasoning_snapshot ?? stableReasoningSnapshot,
    operator_state: params.operator_state ?? buildOperatorState(),
    combined_risk: params.combined_risk ?? buildCombinedRisk(),
    previous_mode: params.previous_mode,
    runtime_state: params.runtime_state ?? createSupportModeRuntimeState(params.previous_mode),
  });
}

describe("resolveSupportModePolicy", () => {
  it("escalates immediately into protected response on critical escalation markers", () => {
    const result = resolveWithMode({
      previous_mode: "guided_support",
      alarm_set: buildAlarmSet({
        active_alarm_count: 3,
        active_alarm_ids: ["ALM_FEEDWATER_FLOW_LOW", "ALM_RPV_LEVEL_LOW", "ALM_RPV_LEVEL_LOW_LOW"],
        active_alarms: [
          ...buildAlarmSet().active_alarms,
          {
            alarm_id: "ALM_RPV_LEVEL_LOW_LOW",
            title: "RPV level low-low",
            priority: "P1" as const,
            subsystem_tag: "reactor_vessel",
            active: true,
            visibility_rule: "always_visible" as const,
            group_hint: "inventory_loss",
          },
        ],
      }),
      combined_risk: buildCombinedRisk({
        combined_risk_score: 74,
        combined_risk_band: "high",
      }),
    });

    expect(result.support_mode).toBe("protected_response");
    expect(result.support_policy.transition_reason).toMatch(/Escalated immediately/i);
    expect(result.support_policy.current_mode_reason).toMatch(/Protected Response/i);
  });

  it("holds a downshift for one tick before relaxing to monitoring support", () => {
    const first = resolveWithMode({
      previous_mode: "guided_support",
      combined_risk: buildCombinedRisk({
        combined_risk_score: 32,
        combined_risk_band: "guarded",
        factor_breakdown: buildCombinedRisk().factor_breakdown.map((factor) =>
          factor.factor_id === "diagnosis_uncertainty"
            ? { ...factor, raw_index: 20, contribution: 3.2 }
            : factor.factor_id === "operator_workload"
              ? { ...factor, raw_index: 48, contribution: 6.7 }
              : factor,
        ),
      }),
      operator_state: buildOperatorState({
        workload_index: 48,
        attention_stability_index: 82,
      }),
    });

    expect(first.support_mode).toBe("guided_support");
    expect(first.support_policy.transition_reason).toMatch(/avoid mode chatter/i);

    const second = resolveWithMode({
      previous_mode: first.support_mode,
      runtime_state: first.runtime_state,
      combined_risk: buildCombinedRisk({
        combined_risk_score: 30,
        combined_risk_band: "guarded",
        factor_breakdown: buildCombinedRisk().factor_breakdown.map((factor) =>
          factor.factor_id === "diagnosis_uncertainty"
            ? { ...factor, raw_index: 18, contribution: 2.9 }
            : factor.factor_id === "operator_workload"
              ? { ...factor, raw_index: 46, contribution: 6.4 }
              : factor,
        ),
      }),
      operator_state: buildOperatorState({
        workload_index: 46,
        attention_stability_index: 84,
      }),
    });

    expect(second.support_mode).toBe("monitoring_support");
    expect(second.support_policy.transition_reason).toMatch(/Relaxed after a bounded dwell/i);
  });

  it("publishes critical visibility guardrails with pinned alarms", () => {
    const result = resolveWithMode({
      previous_mode: "monitoring_support",
    });

    expect(result.support_policy.critical_visibility.critical_variable_ids).toContain("vessel_water_level_m");
    expect(result.support_policy.critical_visibility.always_visible_alarm_ids).toContain("ALM_FEEDWATER_FLOW_LOW");
    expect(result.support_policy.critical_visibility.pinned_alarm_ids).toContain("ALM_RPV_LEVEL_LOW");
    expect(result.support_policy.critical_visibility.summary).toMatch(/guardrails are active/i);
  });
});

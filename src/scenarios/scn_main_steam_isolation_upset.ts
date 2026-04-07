import type { ScenarioDefinition } from "../contracts/aura";

export const scnMainSteamIsolationUpset: ScenarioDefinition = {
  scenario_id: "scn_main_steam_isolation_upset",
  version: "1.0.0",
  title: "Main Steam Isolation Upset",
  summary:
    "A non-electrical steam-path isolation upset trips the unit, removes the normal condenser sink, and creates a bounded window to establish isolation-condenser cooling before pressure consequences escalate.",
  training_goal:
    "Recognize the trip plus steam-path collapse as a main-steam isolation event rather than a LoOP, then establish bounded IC recovery while offsite power remains available.",
  initiating_event: "A main steam / reactor isolation disturbance collapses the normal steam path without offsite power loss.",
  difficulty: "high",
  tags: ["steam-isolation", "post-trip", "heat-sink-loss", "deterministic"],
  expected_duration_sec: 300,
  deterministic_seed: "cluster2-main-steam-isolation-seed-01",
  initial_plant_state: {
    reactor_power_pct: 70,
    vessel_water_level_m: 7.34,
    vessel_pressure_mpa: 7.04,
    main_steam_flow_pct: 70,
    feedwater_flow_pct: 69,
    turbine_output_mwe: 212,
    condenser_heat_sink_available: true,
    condenser_backpressure_kpa: 12,
    isolation_condenser_available: true,
    isolation_condenser_flow_pct: 0,
    containment_pressure_kpa: 101,
    offsite_power_available: true,
    dc_bus_soc_pct: 93,
    reactor_trip_active: false,
    safety_relief_valve_open: false,
    alarm_load_count: 0,
    active_alarm_cluster_count: 0,
  },
  phases: [
    {
      phase_id: "phase_nominal_monitoring",
      label: "Nominal Monitoring",
      description: "The operator begins from a stable pre-upset operating condition.",
      completion_condition: { elapsed_time_sec_gte: 15 },
      nominal_duration_sec: 15,
      allowed_action_ids: ["act_ack_alarm"],
    },
    {
      phase_id: "phase_isolation_onset",
      label: "Isolation / Trip Onset",
      description: "Steam-path collapse, trip, and loss of the normal sink create the initial diagnosis burden.",
      completion_condition: {
        any: [{ action: { action_id: "act_adjust_isolation_condenser", performed: true } }, { elapsed_time_sec_gte: 60 }],
      },
      nominal_duration_sec: 60,
      allowed_action_ids: ["act_ack_alarm", "act_adjust_isolation_condenser"],
    },
    {
      phase_id: "phase_recovery_window",
      label: "Alternate Heat-Sink Recovery Window",
      description: "The operator has a bounded window to establish IC cooling before pressure and containment consequences compound.",
      completion_condition: { any: [{ elapsed_time_sec_gte: 120 }] },
      nominal_duration_sec: 120,
      allowed_action_ids: ["act_ack_alarm", "act_adjust_isolation_condenser"],
    },
    {
      phase_id: "phase_stabilization_or_escalation",
      label: "Stabilization Or Pressure Escalation",
      description: "The deterministic profile resolves toward bounded post-trip stabilization or pressure-facing consequence escalation.",
      completion_condition: { any: [{ elapsed_time_sec_gte: 105 }] },
      nominal_duration_sec: 105,
      allowed_action_ids: ["act_ack_alarm", "act_adjust_isolation_condenser"],
    },
  ],
  event_injections: [
    {
      injection_id: "inj_main_steam_isolation_onset",
      phase_id: "phase_isolation_onset",
      trigger: { trigger_kind: "time_offset_sec", phase_time_sec: 0 },
      effects: [
        { variable_id: "reactor_trip_active", effect_operation: "set", value: true },
        { variable_id: "condenser_heat_sink_available", effect_operation: "set", value: false },
        { variable_id: "main_steam_flow_pct", effect_operation: "ramp_to", value: 28 },
        { variable_id: "turbine_output_mwe", effect_operation: "ramp_to", value: 18 },
        { variable_id: "vessel_pressure_mpa", effect_operation: "delta", value: 0.14 },
      ],
      note: "Steam-path collapse trips the unit and removes the normal condenser sink without any electrical disturbance.",
    },
    {
      injection_id: "inj_main_steam_isolation_pressure_bias",
      phase_id: "phase_recovery_window",
      trigger: { trigger_kind: "time_offset_sec", phase_time_sec: 25 },
      effects: [
        { variable_id: "vessel_pressure_mpa", effect_operation: "delta", value: 0.18 },
        { variable_id: "containment_pressure_kpa", effect_operation: "delta", value: 1.4 },
      ],
      note: "If alternate heat-sink recovery is late or weak, pressure and containment consequence cues become explicit.",
    },
  ],
  alarm_hooks: [
    {
      hook_id: "hook_msi_ic_low_assert",
      alarm_id: "ALM_ISOLATION_CONDENSER_FLOW_LOW",
      trigger: {
        trigger_kind: "condition",
        condition: {
          all: [
            { variable: { variable_id: "condenser_heat_sink_available", operator: "eq", value: false } },
            { variable: { variable_id: "isolation_condenser_flow_pct", operator: "lt", value: 56 } },
          ],
        },
      },
      action: "assert",
      note: "Scenario C needs an IC-low cue even though offsite power remains available.",
    },
    {
      hook_id: "hook_msi_pressure_high_assert",
      alarm_id: "ALM_RPV_PRESSURE_HIGH",
      trigger: {
        trigger_kind: "condition",
        condition: { variable: { variable_id: "vessel_pressure_mpa", operator: "gt", value: 7.55 } },
      },
      action: "assert",
      note: "Pressure rise marks a missed or incomplete alternate heat-sink recovery path.",
    },
    {
      hook_id: "hook_msi_turbine_low_assert",
      alarm_id: "ALM_TURBINE_OUTPUT_LOW",
      trigger: {
        trigger_kind: "condition",
        condition: { variable: { variable_id: "turbine_output_mwe", operator: "lt", value: 55 } },
      },
      action: "assert",
      note: "Turbine collapse makes the steam-path upset explicit without implying electrical loss.",
    },
  ],
  allowed_operator_actions: [
    {
      action_id: "act_ack_alarm",
      label: "Acknowledge highlighted alarm",
      category: "acknowledgement",
      target_variable_ids: ["alarm_load_count"],
      allowed_phase_ids: [
        "phase_nominal_monitoring",
        "phase_isolation_onset",
        "phase_recovery_window",
        "phase_stabilization_or_escalation",
      ],
      can_change_progression: false,
      unsafe_if_misused: false,
      requires_validation: false,
      effect_note: "Records operator acknowledgement without changing plant state.",
    },
    {
      action_id: "act_adjust_isolation_condenser",
      label: "Adjust isolation condenser demand",
      category: "control_input",
      target_variable_ids: ["isolation_condenser_flow_pct"],
      allowed_phase_ids: ["phase_isolation_onset", "phase_recovery_window", "phase_stabilization_or_escalation"],
      can_change_progression: true,
      unsafe_if_misused: true,
      requires_validation: true,
      effect_note:
        "A bounded IC-demand alignment establishes alternate post-trip cooling; weak or reversed demand worsens pressure-facing escalation deterministically.",
    },
  ],
  expected_root_cause_hypothesis_id: "hyp_main_steam_isolation_upset",
  success_condition: {
    all: [
      { action: { action_id: "act_adjust_isolation_condenser", performed: true } },
      { variable: { variable_id: "offsite_power_available", operator: "eq", value: true } },
      { variable: { variable_id: "isolation_condenser_flow_pct", operator: "gte", value: 60 } },
      { variable: { variable_id: "vessel_pressure_mpa", operator: "lte", value: 7.24 } },
      { variable: { variable_id: "containment_pressure_kpa", operator: "lte", value: 106 } },
      { elapsed_time_sec_gte: 180 },
    ],
  },
  failure_condition: {
    any: [
      { variable: { variable_id: "containment_pressure_kpa", operator: "gt", value: 112 } },
      { variable: { variable_id: "vessel_pressure_mpa", operator: "gt", value: 7.84 } },
    ],
  },
  timeout_condition: { elapsed_time_sec_gte: 300 },
};

import type { ScenarioDefinition } from "../contracts/aura";

export const scnAlarmCascadeRootCause: ScenarioDefinition = {
  scenario_id: "scn_alarm_cascade_root_cause",
  version: "1.0.0",
  title: "Feedwater Degradation Alarm Cascade",
  summary:
    "A feedwater-side degradation drives vessel level down, creates a rising alarm burden, and tests whether one operator can recover the plant through a bounded feedwater correction.",
  training_goal:
    "Recognize feedwater degradation as the dominant driver and restore level before the event cascades into low-low level and pressure stress.",
  initiating_event: "Feedwater control train begins losing effective flow.",
  difficulty: "intro",
  tags: ["alarm-flood", "feedwater", "deterministic"],
  expected_duration_sec: 240,
  deterministic_seed: "phase1-feedwater-fixed-seed-01",
  initial_plant_state: {
    reactor_power_pct: 72,
    vessel_water_level_m: 7.52,
    vessel_pressure_mpa: 7.08,
    main_steam_flow_pct: 71,
    feedwater_flow_pct: 72,
    turbine_output_mwe: 214,
    condenser_heat_sink_available: true,
    condenser_backpressure_kpa: 12,
    isolation_condenser_available: true,
    isolation_condenser_flow_pct: 0,
    containment_pressure_kpa: 101,
    offsite_power_available: true,
    dc_bus_soc_pct: 92,
    reactor_trip_active: false,
    safety_relief_valve_open: false,
    alarm_load_count: 0,
    active_alarm_cluster_count: 0,
  },
  phases: [
    {
      phase_id: "phase_nominal",
      label: "Nominal Monitoring",
      description: "The operator begins from a stable operating condition.",
      completion_condition: { elapsed_time_sec_gte: 15 },
      nominal_duration_sec: 15,
      allowed_action_ids: ["act_ack_alarm"],
    },
    {
      phase_id: "phase_onset",
      label: "Abnormal Onset",
      description: "Feedwater loss begins and vessel inventory starts to drift downward.",
      completion_condition: {
        any: [
          { action: { action_id: "act_adjust_feedwater", performed: true } },
          { elapsed_time_sec_gte: 90 },
        ],
      },
      nominal_duration_sec: 90,
      allowed_action_ids: ["act_ack_alarm", "act_adjust_feedwater"],
    },
    {
      phase_id: "phase_stabilization",
      label: "Stabilization Window",
      description: "The operator correction either restores the plant or the disturbance escalates into failure.",
      completion_condition: {
        any: [{ elapsed_time_sec_gte: 135 }],
      },
      nominal_duration_sec: 135,
      allowed_action_ids: ["act_ack_alarm", "act_adjust_feedwater"],
    },
  ],
  event_injections: [
    {
      injection_id: "inj_feedwater_loss_stage_1",
      phase_id: "phase_onset",
      trigger: { trigger_kind: "time_offset_sec", phase_time_sec: 0 },
      effects: [
        { variable_id: "feedwater_flow_pct", effect_operation: "delta", value: -12 },
        { variable_id: "turbine_output_mwe", effect_operation: "delta", value: -8 },
      ],
      note: "Initial feedwater degradation reduces effective feedwater and turbine load.",
    },
    {
      injection_id: "inj_feedwater_loss_stage_2",
      phase_id: "phase_onset",
      trigger: { trigger_kind: "time_offset_sec", phase_time_sec: 35 },
      effects: [
        { variable_id: "feedwater_flow_pct", effect_operation: "delta", value: -6 },
        { variable_id: "condenser_backpressure_kpa", effect_operation: "delta", value: 3 },
      ],
      note: "The disturbance deepens and starts pushing heat-sink-side stress.",
    },
    {
      injection_id: "inj_partial_recovery_bias",
      phase_id: "phase_stabilization",
      trigger: {
        trigger_kind: "condition",
        condition: {
          action: {
            action_id: "act_adjust_feedwater",
            performed: true,
          },
        },
      },
      effects: [{ variable_id: "condenser_backpressure_kpa", effect_operation: "delta", value: -2 }],
      note: "A proper feedwater correction also relieves part of the condenser stress.",
    },
  ],
  alarm_hooks: [
    {
      hook_id: "hook_feedwater_low_assert",
      phase_id: "phase_onset",
      alarm_id: "ALM_FEEDWATER_FLOW_LOW",
      trigger: {
        trigger_kind: "condition",
        condition: {
          variable: { variable_id: "feedwater_flow_pct", operator: "lt", value: 58 },
        },
      },
      action: "assert",
      note: "Feedwater flow low should appear early in the upset.",
    },
    {
      hook_id: "hook_level_low_assert",
      alarm_id: "ALM_RPV_LEVEL_LOW",
      trigger: {
        trigger_kind: "condition",
        condition: {
          variable: { variable_id: "vessel_water_level_m", operator: "lt", value: 6.8 },
        },
      },
      action: "assert",
      note: "Inventory loss becomes operator-visible once vessel level falls out of band.",
    },
    {
      hook_id: "hook_level_low_low_latch",
      alarm_id: "ALM_RPV_LEVEL_LOW_LOW",
      trigger: {
        trigger_kind: "condition",
        condition: {
          variable: { variable_id: "vessel_water_level_m", operator: "lt", value: 6.2 },
        },
      },
      action: "latch",
      note: "Low-low level is treated as a hard failure marker for the slice.",
    },
    {
      hook_id: "hook_pressure_high_assert",
      alarm_id: "ALM_RPV_PRESSURE_HIGH",
      trigger: {
        trigger_kind: "condition",
        condition: {
          variable: { variable_id: "vessel_pressure_mpa", operator: "gt", value: 7.6 },
        },
      },
      action: "assert",
      note: "Pressure rise shows the disturbance is no longer contained.",
    },
    {
      hook_id: "hook_turbine_low_assert",
      alarm_id: "ALM_TURBINE_OUTPUT_LOW",
      trigger: {
        trigger_kind: "condition",
        condition: {
          variable: { variable_id: "turbine_output_mwe", operator: "lt", value: 195 },
        },
      },
      action: "assert",
      note: "Generation mismatch adds context without implying root cause.",
    },
  ],
  allowed_operator_actions: [
    {
      action_id: "act_ack_alarm",
      label: "Acknowledge highlighted alarm",
      category: "acknowledgement",
      target_variable_ids: ["alarm_load_count"],
      allowed_phase_ids: ["phase_nominal", "phase_onset", "phase_stabilization"],
      can_change_progression: false,
      unsafe_if_misused: false,
      requires_validation: false,
      effect_note: "Records operator acknowledgement without changing the plant state.",
    },
    {
      action_id: "act_adjust_feedwater",
      label: "Adjust feedwater demand",
      category: "control_input",
      target_variable_ids: ["feedwater_flow_pct"],
      allowed_phase_ids: ["phase_onset", "phase_stabilization"],
      can_change_progression: true,
      unsafe_if_misused: true,
      requires_validation: false,
      effect_note:
        "A proper setpoint correction restores vessel inventory; a poor correction worsens the event deterministically.",
    },
  ],
  success_condition: {
    all: [
      { action: { action_id: "act_adjust_feedwater", performed: true } },
      {
        variable: {
          variable_id: "vessel_water_level_m",
          operator: "gte",
          value: 7.0,
        },
      },
      {
        variable: {
          variable_id: "vessel_pressure_mpa",
          operator: "lte",
          value: 7.35,
        },
      },
      { elapsed_time_sec_gte: 120 },
    ],
  },
  failure_condition: {
    any: [
      {
        variable: {
          variable_id: "vessel_water_level_m",
          operator: "lt",
          value: 6.2,
        },
      },
      {
        variable: {
          variable_id: "containment_pressure_kpa",
          operator: "gt",
          value: 112,
        },
      },
    ],
  },
  timeout_condition: { elapsed_time_sec_gte: 240 },
};

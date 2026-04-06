import type { ScenarioDefinition } from "../contracts/aura";

export const scnLossOfOffsitePowerSbo: ScenarioDefinition = {
  scenario_id: "scn_loss_of_offsite_power_sbo",
  version: "1.0.0",
  title: "Loss of Offsite Power Toward Station Blackout",
  summary:
    "A deterministic loss of offsite power triggers reactor trip, loss of the normal heat sink, battery-limited recovery pressure, and a bounded decision window to establish isolation-condenser decay-heat removal.",
  training_goal:
    "Recognize the LoOP and trip picture quickly, establish bounded isolation-condenser recovery, and stabilize decay-heat removal before DC margin and pressure consequences escalate.",
  initiating_event: "Offsite power is lost and the unit transitions into a trip plus blackout-risk response window.",
  difficulty: "moderate",
  tags: ["loop", "station-blackout-risk", "decay-heat-removal", "deterministic"],
  expected_duration_sec: 300,
  deterministic_seed: "cluster1-loop-sbo-seed-01",
  initial_plant_state: {
    reactor_power_pct: 68,
    vessel_water_level_m: 7.36,
    vessel_pressure_mpa: 7.02,
    main_steam_flow_pct: 68,
    feedwater_flow_pct: 67,
    turbine_output_mwe: 206,
    condenser_heat_sink_available: true,
    condenser_backpressure_kpa: 12,
    isolation_condenser_available: true,
    isolation_condenser_flow_pct: 0,
    containment_pressure_kpa: 101,
    offsite_power_available: true,
    dc_bus_soc_pct: 94,
    reactor_trip_active: false,
    safety_relief_valve_open: false,
    alarm_load_count: 0,
    active_alarm_cluster_count: 0,
  },
  phases: [
    {
      phase_id: "phase_nominal_monitoring",
      label: "Nominal Monitoring",
      description: "The operator begins from a stable operating condition before the electrical disturbance arrives.",
      completion_condition: { elapsed_time_sec_gte: 15 },
      nominal_duration_sec: 15,
      allowed_action_ids: ["act_ack_alarm"],
    },
    {
      phase_id: "phase_loop_trip_onset",
      label: "LoOP / Trip Onset",
      description: "Loss of offsite power collapses the normal sink and presents the core event picture.",
      completion_condition: {
        any: [{ action: { action_id: "act_adjust_isolation_condenser", performed: true } }, { elapsed_time_sec_gte: 60 }],
      },
      nominal_duration_sec: 60,
      allowed_action_ids: ["act_ack_alarm", "act_adjust_isolation_condenser"],
    },
    {
      phase_id: "phase_decay_heat_window",
      label: "Decay-Heat Removal Window",
      description: "The operator has a bounded window to establish isolation-condenser flow before blackout risk and pressure stress compound.",
      completion_condition: { any: [{ elapsed_time_sec_gte: 120 }] },
      nominal_duration_sec: 120,
      allowed_action_ids: ["act_ack_alarm", "act_adjust_isolation_condenser"],
    },
    {
      phase_id: "phase_stabilization_or_blackout",
      label: "Stabilization Or Blackout Progression",
      description: "The scenario deterministically resolves toward stabilized decay-heat removal or blackout-facing escalation.",
      completion_condition: { any: [{ elapsed_time_sec_gte: 105 }] },
      nominal_duration_sec: 105,
      allowed_action_ids: ["act_ack_alarm", "act_adjust_isolation_condenser"],
    },
  ],
  event_injections: [
    {
      injection_id: "inj_loop_offsite_power_loss",
      phase_id: "phase_loop_trip_onset",
      trigger: { trigger_kind: "time_offset_sec", phase_time_sec: 0 },
      effects: [
        { variable_id: "offsite_power_available", effect_operation: "set", value: false },
        { variable_id: "condenser_heat_sink_available", effect_operation: "set", value: false },
        { variable_id: "turbine_output_mwe", effect_operation: "ramp_to", value: 20 },
      ],
      note: "Loss of offsite power removes the normal sink and collapses generation output.",
    },
    {
      injection_id: "inj_loop_pressure_bias",
      phase_id: "phase_decay_heat_window",
      trigger: { trigger_kind: "time_offset_sec", phase_time_sec: 35 },
      effects: [
        { variable_id: "vessel_pressure_mpa", effect_operation: "delta", value: 0.18 },
        { variable_id: "containment_pressure_kpa", effect_operation: "delta", value: 1.2 },
      ],
      note: "If recovery is not established quickly, decay-heat management pressure starts to surface explicitly.",
    },
  ],
  alarm_hooks: [
    {
      hook_id: "hook_loop_power_loss_assert",
      alarm_id: "ALM_OFFSITE_POWER_LOSS",
      trigger: {
        trigger_kind: "condition",
        condition: { variable: { variable_id: "offsite_power_available", operator: "eq", value: false } },
      },
      action: "assert",
      note: "LoOP should remain explicit in the alarm picture.",
    },
    {
      hook_id: "hook_loop_heat_sink_assert",
      alarm_id: "ALM_CONDENSER_HEAT_SINK_LOST",
      trigger: {
        trigger_kind: "condition",
        condition: { variable: { variable_id: "condenser_heat_sink_available", operator: "eq", value: false } },
      },
      action: "assert",
      note: "Loss of normal sink is part of the dominant scenario picture.",
    },
    {
      hook_id: "hook_loop_dc_low_assert",
      alarm_id: "ALM_DC_BUS_LOW",
      trigger: {
        trigger_kind: "condition",
        condition: { variable: { variable_id: "dc_bus_soc_pct", operator: "lt", value: 40 } },
      },
      action: "assert",
      note: "Battery margin becomes part of the operational pressure if recovery drifts.",
    },
    {
      hook_id: "hook_loop_ic_low_assert",
      alarm_id: "ALM_ISOLATION_CONDENSER_FLOW_LOW",
      trigger: {
        trigger_kind: "condition",
        condition: {
          all: [
            { variable: { variable_id: "offsite_power_available", operator: "eq", value: false } },
            { variable: { variable_id: "isolation_condenser_flow_pct", operator: "lt", value: 52 } },
          ],
        },
      },
      action: "assert",
      note: "Low IC flow is the decisive missing-recovery alarm in this bounded slice.",
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
        "phase_loop_trip_onset",
        "phase_decay_heat_window",
        "phase_stabilization_or_blackout",
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
      allowed_phase_ids: ["phase_loop_trip_onset", "phase_decay_heat_window", "phase_stabilization_or_blackout"],
      can_change_progression: true,
      unsafe_if_misused: true,
      requires_validation: true,
      effect_note:
        "A bounded IC-demand alignment establishes decay-heat removal; weak or reversed demand worsens blackout-facing escalation deterministically.",
    },
  ],
  expected_root_cause_hypothesis_id: "hyp_loss_of_offsite_power",
  success_condition: {
    all: [
      { action: { action_id: "act_adjust_isolation_condenser", performed: true } },
      { variable: { variable_id: "isolation_condenser_flow_pct", operator: "gte", value: 60 } },
      { variable: { variable_id: "vessel_pressure_mpa", operator: "lte", value: 7.2 } },
      { variable: { variable_id: "containment_pressure_kpa", operator: "lte", value: 106 } },
      { variable: { variable_id: "dc_bus_soc_pct", operator: "gte", value: 40 } },
      { elapsed_time_sec_gte: 180 },
    ],
  },
  failure_condition: {
    any: [
      { variable: { variable_id: "dc_bus_soc_pct", operator: "lt", value: 18 } },
      { variable: { variable_id: "containment_pressure_kpa", operator: "gt", value: 112 } },
      { variable: { variable_id: "vessel_pressure_mpa", operator: "gt", value: 7.82 } },
    ],
  },
  timeout_condition: { elapsed_time_sec_gte: 300 },
};

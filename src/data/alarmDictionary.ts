import type { AlarmRecord } from "../contracts/aura";

export type AlarmDictionaryEntry = Omit<AlarmRecord, "active"> & {
  trigger_condition_description: string;
  recommended_next_check_hint: string;
};

export const alarmDictionary: AlarmDictionaryEntry[] = [
  {
    alarm_id: "ALM_RPV_LEVEL_LOW",
    title: "Reactor Vessel Level Low",
    priority: "P2",
    subsystem_tag: "reactor_vessel",
    visibility_rule: "always_visible",
    group_hint: "inventory_loss",
    trigger_condition_description: "Raise when vessel_water_level_m < 6.8 for a short persistence window.",
    recommended_next_check_hint: "Check feedwater_flow_pct and level trend.",
  },
  {
    alarm_id: "ALM_RPV_LEVEL_LOW_LOW",
    title: "Reactor Vessel Level Low-Low",
    priority: "P1",
    subsystem_tag: "reactor_vessel",
    visibility_rule: "always_visible",
    group_hint: "inventory_loss",
    trigger_condition_description: "Raise when vessel_water_level_m < 6.2.",
    recommended_next_check_hint: "Confirm immediate inventory recovery path.",
  },
  {
    alarm_id: "ALM_RPV_PRESSURE_HIGH",
    title: "Reactor Vessel Pressure High",
    priority: "P1",
    subsystem_tag: "reactor_vessel",
    visibility_rule: "always_visible",
    group_hint: "pressure_transient",
    trigger_condition_description: "Raise when vessel_pressure_mpa > 7.6.",
    recommended_next_check_hint: "Check safety_relief_valve_open and condenser status.",
  },
  {
    alarm_id: "ALM_MAIN_STEAM_FLOW_MISMATCH",
    title: "Main Steam Flow Mismatch",
    priority: "P3",
    subsystem_tag: "steam_path",
    visibility_rule: "standard_visible",
    group_hint: "steam_path_anomaly",
    trigger_condition_description: "Raise when main_steam_flow_pct diverges materially from expected flow for current power.",
    recommended_next_check_hint: "Compare steam flow to reactor_power_pct.",
  },
  {
    alarm_id: "ALM_FEEDWATER_FLOW_LOW",
    title: "Feedwater Flow Low",
    priority: "P2",
    subsystem_tag: "feedwater",
    visibility_rule: "always_visible",
    group_hint: "feedwater_loss",
    trigger_condition_description: "Raise when feedwater_flow_pct drops below the expected operating band at power.",
    recommended_next_check_hint: "Check pump response and vessel level trend.",
  },
  {
    alarm_id: "ALM_TURBINE_OUTPUT_LOW",
    title: "Turbine Output Low For Power",
    priority: "P3",
    subsystem_tag: "turbine_generator",
    visibility_rule: "standard_visible",
    group_hint: "generation_mismatch",
    trigger_condition_description: "Raise when turbine_output_mwe is low relative to reactor_power_pct.",
    recommended_next_check_hint: "Compare turbine output, steam flow, and trip state.",
  },
  {
    alarm_id: "ALM_CONDENSER_BACKPRESSURE_HIGH",
    title: "Condenser Backpressure High",
    priority: "P2",
    subsystem_tag: "heat_sink",
    visibility_rule: "always_visible",
    group_hint: "heat_sink_loss",
    trigger_condition_description: "Raise when condenser_backpressure_kpa > 18.",
    recommended_next_check_hint: "Confirm heat sink degradation and steam path impact.",
  },
  {
    alarm_id: "ALM_CONTAINMENT_PRESSURE_HIGH",
    title: "Containment Pressure High",
    priority: "P1",
    subsystem_tag: "containment",
    visibility_rule: "always_visible",
    group_hint: "containment_challenge",
    trigger_condition_description: "Raise when containment_pressure_kpa > 112.",
    recommended_next_check_hint: "Check containment trend and related pressure causes.",
  },
  {
    alarm_id: "ALM_REACTOR_TRIP_ACTIVE",
    title: "Reactor Trip Active",
    priority: "P2",
    subsystem_tag: "reactor_core",
    visibility_rule: "always_visible",
    group_hint: "post_trip_recovery",
    trigger_condition_description: "Raise when reactor_trip_active = true.",
    recommended_next_check_hint: "Confirm post-trip stabilization path.",
  },
  {
    alarm_id: "ALM_SRV_STUCK_OPEN",
    title: "Safety Relief Valve Open Extended",
    priority: "P2",
    subsystem_tag: "reactor_vessel",
    visibility_rule: "always_visible",
    group_hint: "pressure_transient",
    trigger_condition_description: "Raise when safety_relief_valve_open = true beyond the short transient allowance.",
    recommended_next_check_hint: "Check pressure trend and valve recovery.",
  },
];

export const alarmDictionaryById = Object.fromEntries(
  alarmDictionary.map((entry) => [entry.alarm_id, entry]),
) as Record<string, AlarmDictionaryEntry>;

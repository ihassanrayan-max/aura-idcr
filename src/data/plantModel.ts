import type { PlantStateSnapshot } from "../contracts/aura";

export const canonicalVariableOrder = [
  "reactor_power_pct",
  "vessel_water_level_m",
  "vessel_pressure_mpa",
  "main_steam_flow_pct",
  "feedwater_flow_pct",
  "turbine_output_mwe",
  "condenser_heat_sink_available",
  "condenser_backpressure_kpa",
  "isolation_condenser_available",
  "isolation_condenser_flow_pct",
  "containment_pressure_kpa",
  "offsite_power_available",
  "dc_bus_soc_pct",
  "reactor_trip_active",
  "safety_relief_valve_open",
  "alarm_load_count",
  "active_alarm_cluster_count",
] as const;

export type CanonicalVariableId = (typeof canonicalVariableOrder)[number];

export const variableLabels: Record<CanonicalVariableId, string> = {
  reactor_power_pct: "Reactor Power",
  vessel_water_level_m: "Vessel Water Level",
  vessel_pressure_mpa: "Vessel Pressure",
  main_steam_flow_pct: "Main Steam Flow",
  feedwater_flow_pct: "Feedwater Flow",
  turbine_output_mwe: "Turbine Output",
  condenser_heat_sink_available: "Condenser Heat Sink",
  condenser_backpressure_kpa: "Condenser Backpressure",
  isolation_condenser_available: "Isolation Condenser Available",
  isolation_condenser_flow_pct: "Isolation Condenser Flow",
  containment_pressure_kpa: "Containment Pressure",
  offsite_power_available: "Offsite Power",
  dc_bus_soc_pct: "DC Bus State Of Charge",
  reactor_trip_active: "Reactor Trip",
  safety_relief_valve_open: "Safety Relief Valve",
  alarm_load_count: "Active Alarm Count",
  active_alarm_cluster_count: "Active Alarm Cluster Count",
};

export const variableUnits: Partial<Record<CanonicalVariableId, string>> = {
  reactor_power_pct: "% rated",
  vessel_water_level_m: "m",
  vessel_pressure_mpa: "MPa",
  main_steam_flow_pct: "% rated",
  feedwater_flow_pct: "% rated",
  turbine_output_mwe: "MW_e",
  condenser_backpressure_kpa: "kPa",
  isolation_condenser_flow_pct: "% rated",
  containment_pressure_kpa: "kPa",
  dc_bus_soc_pct: "%",
};

export const criticalVariableIds: CanonicalVariableId[] = [
  "reactor_power_pct",
  "vessel_water_level_m",
  "vessel_pressure_mpa",
  "feedwater_flow_pct",
  "main_steam_flow_pct",
  "turbine_output_mwe",
  "condenser_heat_sink_available",
  "containment_pressure_kpa",
  "offsite_power_available",
];

export function createEmptyPlantState(): PlantStateSnapshot {
  return {
    reactor_power_pct: 0,
    vessel_water_level_m: 0,
    vessel_pressure_mpa: 0,
    main_steam_flow_pct: 0,
    feedwater_flow_pct: 0,
    turbine_output_mwe: 0,
    condenser_heat_sink_available: false,
    condenser_backpressure_kpa: 0,
    isolation_condenser_available: false,
    isolation_condenser_flow_pct: 0,
    containment_pressure_kpa: 0,
    offsite_power_available: false,
    dc_bus_soc_pct: 0,
    reactor_trip_active: false,
    safety_relief_valve_open: false,
    alarm_load_count: 0,
    active_alarm_cluster_count: 0,
  };
}

export function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

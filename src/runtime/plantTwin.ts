import type {
  ActionRequest,
  PlantStateSnapshot,
  ScenarioRuntimeProfileId,
  ScenarioStateEffect,
} from "../contracts/aura";
import { clamp, createEmptyPlantState } from "../data/plantModel";

export type PlantTwinInternalState = {
  feedwater_manual_setpoint_pct: number;
  feedwater_disturbance_pct: number;
  isolation_condenser_manual_setpoint_pct: number;
  last_acknowledged_alarm_id?: string;
};

export function createPlantTwinInternalState(initial_plant_state: PlantStateSnapshot): PlantTwinInternalState {
  return {
    feedwater_manual_setpoint_pct: Number(initial_plant_state.feedwater_flow_pct),
    feedwater_disturbance_pct: 0,
    isolation_condenser_manual_setpoint_pct: Number(initial_plant_state.isolation_condenser_flow_pct),
  };
}

function numericValue(value: PlantStateSnapshot[string]): number {
  return typeof value === "number" ? value : Number(value);
}

export function applyScenarioEffects(
  plant_state: PlantStateSnapshot,
  internal_state: PlantTwinInternalState,
  effects: ScenarioStateEffect[],
): { plant_state: PlantStateSnapshot; internal_state: PlantTwinInternalState } {
  if (effects.length === 0) {
    return { plant_state, internal_state };
  }

  const next_state = { ...plant_state };
  let next_internal = { ...internal_state };

  for (const effect of effects) {
    const current_value = next_state[effect.variable_id];

    if (typeof current_value === "boolean") {
      next_state[effect.variable_id] = Boolean(effect.value);
      continue;
    }

    if (typeof current_value === "string") {
      next_state[effect.variable_id] = String(effect.value);
      continue;
    }

    const current_numeric = numericValue(current_value);
    const effect_numeric = Number(effect.value);

    switch (effect.effect_operation) {
      case "set":
      case "ramp_to":
        next_state[effect.variable_id] = effect_numeric;
        break;
      case "delta":
        next_state[effect.variable_id] = current_numeric + effect_numeric;
        break;
    }

    if (effect.variable_id === "feedwater_flow_pct") {
      const updated_feedwater = Number(next_state.feedwater_flow_pct);
      next_internal = {
        ...next_internal,
        feedwater_disturbance_pct: clamp(
          next_internal.feedwater_manual_setpoint_pct - updated_feedwater,
          0,
          45,
        ),
      };
    }
  }

  return { plant_state: next_state, internal_state: next_internal };
}

export function applyOperatorAction(
  plant_state: PlantStateSnapshot,
  internal_state: PlantTwinInternalState,
  action_request: ActionRequest,
): {
  plant_state: PlantStateSnapshot;
  internal_state: PlantTwinInternalState;
  resulting_state_change: string;
  correctness_label: "correct_recovery" | "neutral" | "harmful_or_incorrect";
  action_class: "critical" | "non_critical";
} {
  if (action_request.action_id === "act_ack_alarm") {
    return {
      plant_state,
      internal_state: {
        ...internal_state,
        last_acknowledged_alarm_id: action_request.reason_note,
      },
      resulting_state_change: "alarm acknowledgement recorded",
      correctness_label: "neutral",
      action_class: "non_critical",
    };
  }

  if (action_request.action_id === "act_adjust_feedwater") {
    const requested_setpoint = clamp(Number(action_request.requested_value ?? plant_state.feedwater_flow_pct), 35, 95);

    return {
      plant_state,
      internal_state: {
        ...internal_state,
        feedwater_manual_setpoint_pct: requested_setpoint,
      },
      resulting_state_change: `feedwater demand target set to ${requested_setpoint.toFixed(0)}% rated`,
      correctness_label:
        requested_setpoint >= 78 ? "correct_recovery" : requested_setpoint < 60 ? "harmful_or_incorrect" : "neutral",
      action_class: "critical",
    };
  }

  if (action_request.action_id === "act_adjust_isolation_condenser") {
    const requested_setpoint = clamp(
      Number(action_request.requested_value ?? plant_state.isolation_condenser_flow_pct),
      0,
      100,
    );

    return {
      plant_state,
      internal_state: {
        ...internal_state,
        isolation_condenser_manual_setpoint_pct: requested_setpoint,
      },
      resulting_state_change: `isolation condenser demand target set to ${requested_setpoint.toFixed(0)}% rated`,
      correctness_label:
        requested_setpoint >= 60 && requested_setpoint <= 76
          ? "correct_recovery"
          : requested_setpoint < 40
            ? "harmful_or_incorrect"
            : "neutral",
      action_class: "critical",
    };
  }

  return {
    plant_state,
    internal_state,
    resulting_state_change: "no plant-side change",
    correctness_label: "neutral",
    action_class: "non_critical",
  };
}

export function stepPlantTwin(
  current_state: PlantStateSnapshot,
  internal_state: PlantTwinInternalState,
  delta_time_sec: number,
  runtime_profile_id: ScenarioRuntimeProfileId = "feedwater_degradation",
): { plant_state: PlantStateSnapshot; internal_state: PlantTwinInternalState } {
  if (runtime_profile_id === "loss_of_offsite_power_sbo") {
    return stepLossOfOffsitePowerTwin(current_state, internal_state, delta_time_sec);
  }

  const previous = { ...createEmptyPlantState(), ...current_state };
  const next_internal = { ...internal_state };
  const dt = delta_time_sec;

  if (next_internal.feedwater_manual_setpoint_pct >= 78) {
    next_internal.feedwater_disturbance_pct = clamp(
      next_internal.feedwater_disturbance_pct - 0.35 * dt * ((next_internal.feedwater_manual_setpoint_pct - 72) / 8),
      0,
      45,
    );
  } else if (next_internal.feedwater_manual_setpoint_pct < 60) {
    next_internal.feedwater_disturbance_pct = clamp(next_internal.feedwater_disturbance_pct + 0.12 * dt, 0, 45);
  }

  const effective_feedwater_target = clamp(
    next_internal.feedwater_manual_setpoint_pct - next_internal.feedwater_disturbance_pct,
    0,
    100,
  );
  const feedwater_flow_pct = clamp(
    numericValue(previous.feedwater_flow_pct) +
      (effective_feedwater_target - numericValue(previous.feedwater_flow_pct)) * 0.6,
    0,
    100,
  );

  const reactor_trip_active =
    Boolean(previous.reactor_trip_active) ||
    numericValue(previous.vessel_water_level_m) < 6.15 ||
    numericValue(previous.vessel_pressure_mpa) > 7.9;

  const reactor_power_pct = reactor_trip_active
    ? clamp(numericValue(previous.reactor_power_pct) - 4.5 * dt, 20, 100)
    : clamp(numericValue(previous.reactor_power_pct) + (72 - numericValue(previous.reactor_power_pct)) * 0.06, 20, 100);

  const condenser_backpressure_kpa = clamp(
    numericValue(previous.condenser_backpressure_kpa) +
      ((feedwater_flow_pct < 55 ? 0.08 : -0.05) + (Boolean(previous.safety_relief_valve_open) ? 0.05 : 0)) * dt,
    8,
    24,
  );

  const main_steam_flow_pct = clamp(
    numericValue(previous.main_steam_flow_pct) +
      ((reactor_power_pct - numericValue(previous.main_steam_flow_pct)) * 0.24 -
        (condenser_backpressure_kpa - 12) * 0.12) *
        dt,
    15,
    100,
  );

  const vessel_water_level_m = clamp(
    numericValue(previous.vessel_water_level_m) +
      ((feedwater_flow_pct - main_steam_flow_pct) * 0.0031 - (Boolean(previous.safety_relief_valve_open) ? 0.016 : 0)) *
        dt,
    5.2,
    8.2,
  );

  const projected_pressure = clamp(
    numericValue(previous.vessel_pressure_mpa) +
      ((main_steam_flow_pct - feedwater_flow_pct) * 0.006 +
        (condenser_backpressure_kpa - 12) * 0.012 -
        (reactor_trip_active ? 0.04 : 0)) *
        dt,
    6.1,
    8.4,
  );

  const safety_relief_valve_open =
    projected_pressure > 7.62 ||
    (Boolean(previous.safety_relief_valve_open) && projected_pressure > 7.34);

  const vessel_pressure_mpa = clamp(
    projected_pressure - (safety_relief_valve_open ? 0.09 * dt : 0),
    6.1,
    8.2,
  );

  const turbine_output_mwe = clamp(
    numericValue(previous.turbine_output_mwe) +
      ((reactor_power_pct * 3 - numericValue(previous.turbine_output_mwe)) * 0.22 -
        (condenser_backpressure_kpa - 12) * 2.4) *
        dt,
    50,
    300,
  );

  const containment_pressure_kpa = clamp(
    numericValue(previous.containment_pressure_kpa) +
      ((safety_relief_valve_open ? 0.34 : -0.05) + (vessel_pressure_mpa > 7.65 ? 0.04 : 0)) * dt,
    98,
    118,
  );

  const dc_bus_soc_pct = clamp(
    numericValue(previous.dc_bus_soc_pct) - (Boolean(previous.offsite_power_available) ? 0 : 0.18) * dt,
    0,
    100,
  );

  return {
    plant_state: {
      ...previous,
      reactor_power_pct: Number(reactor_power_pct.toFixed(2)),
      vessel_water_level_m: Number(vessel_water_level_m.toFixed(3)),
      vessel_pressure_mpa: Number(vessel_pressure_mpa.toFixed(3)),
      main_steam_flow_pct: Number(main_steam_flow_pct.toFixed(2)),
      feedwater_flow_pct: Number(feedwater_flow_pct.toFixed(2)),
      turbine_output_mwe: Number(turbine_output_mwe.toFixed(2)),
      condenser_backpressure_kpa: Number(condenser_backpressure_kpa.toFixed(2)),
      containment_pressure_kpa: Number(containment_pressure_kpa.toFixed(2)),
      dc_bus_soc_pct: Number(dc_bus_soc_pct.toFixed(2)),
      reactor_trip_active,
      safety_relief_valve_open,
    },
    internal_state: next_internal,
  };
}

function stepLossOfOffsitePowerTwin(
  current_state: PlantStateSnapshot,
  internal_state: PlantTwinInternalState,
  delta_time_sec: number,
): { plant_state: PlantStateSnapshot; internal_state: PlantTwinInternalState } {
  const previous = { ...createEmptyPlantState(), ...current_state };
  const next_internal = { ...internal_state };
  const dt = delta_time_sec;
  const offsite_power_available = Boolean(previous.offsite_power_available);
  const condenser_heat_sink_available = offsite_power_available ? Boolean(previous.condenser_heat_sink_available) : false;
  const reactor_trip_active = Boolean(previous.reactor_trip_active) || !offsite_power_available;
  const ic_target =
    Boolean(previous.isolation_condenser_available) && reactor_trip_active
      ? next_internal.isolation_condenser_manual_setpoint_pct
      : 0;
  const isolation_condenser_flow_pct = clamp(
    numericValue(previous.isolation_condenser_flow_pct) + (ic_target - numericValue(previous.isolation_condenser_flow_pct)) * 0.42,
    0,
    100,
  );
  const reactor_power_pct = reactor_trip_active
    ? clamp(numericValue(previous.reactor_power_pct) - (0.5 + isolation_condenser_flow_pct * 0.004) * dt, 10, 100)
    : clamp(numericValue(previous.reactor_power_pct) + (68 - numericValue(previous.reactor_power_pct)) * 0.05, 10, 100);
  const main_steam_flow_pct = clamp(
    numericValue(previous.main_steam_flow_pct) +
      ((reactor_power_pct - numericValue(previous.main_steam_flow_pct)) * 0.25 - isolation_condenser_flow_pct * 0.03) * dt,
    8,
    100,
  );
  const pressure_drive =
    (condenser_heat_sink_available ? -0.02 : 0.055) +
    (main_steam_flow_pct > 24 ? 0.008 : -0.004) -
    isolation_condenser_flow_pct * 0.0014 -
    (reactor_trip_active ? 0.012 : 0);
  const projected_pressure = clamp(numericValue(previous.vessel_pressure_mpa) + pressure_drive * dt, 6.2, 8.4);
  const safety_relief_valve_open =
    projected_pressure > 7.56 ||
    (Boolean(previous.safety_relief_valve_open) && projected_pressure > 7.3);
  const vessel_pressure_mpa = clamp(projected_pressure - (safety_relief_valve_open ? 0.07 * dt : 0), 6.2, 8.2);
  const vessel_water_level_m = clamp(
    numericValue(previous.vessel_water_level_m) +
      ((isolation_condenser_flow_pct * 0.0009) - (main_steam_flow_pct * 0.00045) - (safety_relief_valve_open ? 0.008 : 0.002)) * dt,
    5.8,
    8.0,
  );
  const condenser_backpressure_kpa = clamp(
    condenser_heat_sink_available
      ? numericValue(previous.condenser_backpressure_kpa) + (12 - numericValue(previous.condenser_backpressure_kpa)) * 0.35
      : numericValue(previous.condenser_backpressure_kpa) + 0.32 * dt,
    10,
    26,
  );
  const turbine_output_mwe = clamp(
    offsite_power_available
      ? numericValue(previous.turbine_output_mwe) + ((reactor_power_pct * 3) - numericValue(previous.turbine_output_mwe)) * 0.18
      : numericValue(previous.turbine_output_mwe) * 0.12,
    0,
    260,
  );
  const containment_pressure_kpa = clamp(
    numericValue(previous.containment_pressure_kpa) +
      ((safety_relief_valve_open ? 0.26 : -0.03) + (vessel_pressure_mpa > 7.45 ? 0.035 : 0)) * dt,
    98,
    118,
  );
  const dc_bus_soc_pct = clamp(
    numericValue(previous.dc_bus_soc_pct) -
      (!offsite_power_available ? (isolation_condenser_flow_pct >= 60 ? 0.1 : 0.2) : 0) * dt,
    0,
    100,
  );

  return {
    plant_state: {
      ...previous,
      reactor_power_pct: Number(reactor_power_pct.toFixed(2)),
      vessel_water_level_m: Number(vessel_water_level_m.toFixed(3)),
      vessel_pressure_mpa: Number(vessel_pressure_mpa.toFixed(3)),
      main_steam_flow_pct: Number(main_steam_flow_pct.toFixed(2)),
      turbine_output_mwe: Number(turbine_output_mwe.toFixed(2)),
      condenser_heat_sink_available,
      condenser_backpressure_kpa: Number(condenser_backpressure_kpa.toFixed(2)),
      isolation_condenser_flow_pct: Number(isolation_condenser_flow_pct.toFixed(2)),
      containment_pressure_kpa: Number(containment_pressure_kpa.toFixed(2)),
      dc_bus_soc_pct: Number(dc_bus_soc_pct.toFixed(2)),
      offsite_power_available,
      reactor_trip_active,
      safety_relief_valve_open,
    },
    internal_state: next_internal,
  };
}

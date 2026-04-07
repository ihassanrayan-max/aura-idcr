import type {
  AlarmSet,
  FirstResponseItem,
  FirstResponseLane,
  PlantStateSnapshot,
  ReasoningSnapshot,
  ScalarValue,
  ScenarioRuntimeProfileId,
} from "../contracts/aura";

function makeItem(params: {
  item_id: string;
  label: string;
  item_kind: FirstResponseItem["item_kind"];
  why: string;
  completion_hint: string;
  source_alarm_ids?: string[];
  source_variable_ids?: string[];
  recommended_action_id?: string;
  recommended_value?: ScalarValue;
}): FirstResponseItem {
  return {
    item_id: params.item_id,
    label: params.label,
    item_kind: params.item_kind,
    why: params.why,
    completion_hint: params.completion_hint,
    source_alarm_ids: params.source_alarm_ids ?? [],
    source_variable_ids: params.source_variable_ids ?? [],
    recommended_action_id: params.recommended_action_id,
    recommended_value: params.recommended_value,
  };
}

function topAlarmId(alarm_set: AlarmSet): string | undefined {
  return alarm_set.active_alarm_ids[0];
}

function buildFeedwaterLane(plant_state: PlantStateSnapshot, alarm_set: AlarmSet, allowed_action_ids: Set<string>): FirstResponseItem[] {
  const items: FirstResponseItem[] = [];
  const feedwater_gap = Number(plant_state.main_steam_flow_pct) - Number(plant_state.feedwater_flow_pct);
  const top_alarm_id = topAlarmId(alarm_set);

  items.push(
    makeItem({
      item_id: "fw_check_mismatch",
      label: "Confirm feedwater is lagging steam demand",
      item_kind: "check",
      why: `Steam flow exceeds feedwater by ${feedwater_gap.toFixed(1)}%, which fits the feedwater-loss storyline.`,
      completion_hint: "Use feedwater flow, steam flow, and vessel level together before acting.",
      source_alarm_ids: ["ALM_FEEDWATER_FLOW_LOW", "ALM_RPV_LEVEL_LOW", "ALM_RPV_LEVEL_LOW_LOW"].filter((alarm_id) =>
        alarm_set.active_alarm_ids.includes(alarm_id),
      ),
      source_variable_ids: ["feedwater_flow_pct", "main_steam_flow_pct", "vessel_water_level_m"],
    }),
  );

  if (allowed_action_ids.has("act_adjust_feedwater")) {
    items.push(
      makeItem({
        item_id: "fw_action_recover",
        label: "Recover feedwater demand toward 82% rated",
        item_kind: "action",
        why: "The dominant hypothesis points to inadequate feedwater as the primary recoverable driver.",
        completion_hint: "Use the bounded correction first, then watch whether level stabilizes without pressure worsening.",
        source_alarm_ids: ["ALM_FEEDWATER_FLOW_LOW", "ALM_RPV_LEVEL_LOW", "ALM_RPV_LEVEL_LOW_LOW"].filter((alarm_id) =>
          alarm_set.active_alarm_ids.includes(alarm_id),
        ),
        source_variable_ids: ["feedwater_flow_pct", "vessel_water_level_m"],
        recommended_action_id: "act_adjust_feedwater",
        recommended_value: 82,
      }),
    );
  }

  if (allowed_action_ids.has("act_ack_alarm") && top_alarm_id) {
    items.push(
      makeItem({
        item_id: "fw_action_ack",
        label: "Acknowledge the top alarm once the diagnosis is clear",
        item_kind: "action",
        why: "Alarm clutter is increasing, but acknowledgement should follow the bounded first-response picture rather than replace it.",
        completion_hint: "Keep the critical alarm visible while reducing nuisance scanning.",
        source_alarm_ids: [top_alarm_id],
        source_variable_ids: [],
        recommended_action_id: "act_ack_alarm",
      }),
    );
  }

  items.push(
    makeItem({
      item_id: "fw_watch_recovery",
      label: "Watch vessel level and pressure after correction",
      item_kind: "watch",
      why: "A successful recovery should raise level back toward band without allowing a pressure spike.",
      completion_hint: "Look for level recovery first, then confirm pressure is staying bounded.",
      source_alarm_ids: ["ALM_RPV_LEVEL_LOW", "ALM_RPV_PRESSURE_HIGH"].filter((alarm_id) => alarm_set.active_alarm_ids.includes(alarm_id)),
      source_variable_ids: ["vessel_water_level_m", "vessel_pressure_mpa"],
    }),
  );

  return items;
}

function buildHeatSinkLane(plant_state: PlantStateSnapshot, alarm_set: AlarmSet, allowed_action_ids: Set<string>): FirstResponseItem[] {
  const items: FirstResponseItem[] = [
    makeItem({
      item_id: "hs_check_backpressure",
      label: "Check condenser backpressure against steam-path drift",
      item_kind: "check",
      why: `Condenser backpressure is ${Number(plant_state.condenser_backpressure_kpa).toFixed(1)} kPa and is contributing to steam-path stress.`,
      completion_hint: "Confirm whether condenser stress is a driver or a consequence of the feedwater upset.",
      source_alarm_ids: ["ALM_CONDENSER_BACKPRESSURE_HIGH", "ALM_MAIN_STEAM_FLOW_MISMATCH"].filter((alarm_id) =>
        alarm_set.active_alarm_ids.includes(alarm_id),
      ),
      source_variable_ids: ["condenser_backpressure_kpa", "main_steam_flow_pct"],
    }),
    makeItem({
      item_id: "hs_watch_pressure",
      label: "Watch vessel pressure and SRV behavior",
      item_kind: "watch",
      why: "Heat-sink stress matters mainly because it can escalate into pressure control consequences.",
      completion_hint: "Escalate concern if pressure keeps rising or SRV relief becomes sustained.",
      source_alarm_ids: ["ALM_RPV_PRESSURE_HIGH", "ALM_SRV_STUCK_OPEN"].filter((alarm_id) =>
        alarm_set.active_alarm_ids.includes(alarm_id),
      ),
      source_variable_ids: ["vessel_pressure_mpa", "safety_relief_valve_open"],
    }),
  ];

  if (allowed_action_ids.has("act_adjust_feedwater")) {
    items.push(
      makeItem({
        item_id: "hs_compare_feedwater",
        label: "Compare feedwater recovery before chasing secondary symptoms",
        item_kind: "action",
        why: "In this bounded scenario, heat-sink stress often follows the feedwater upset rather than replacing it.",
        completion_hint: "Use the feedwater correction path if the mismatch remains present.",
        source_alarm_ids: ["ALM_FEEDWATER_FLOW_LOW"].filter((alarm_id) => alarm_set.active_alarm_ids.includes(alarm_id)),
        source_variable_ids: ["feedwater_flow_pct"],
        recommended_action_id: "act_adjust_feedwater",
        recommended_value: 82,
      }),
    );
  }

  return items;
}

function buildPressureLane(plant_state: PlantStateSnapshot, alarm_set: AlarmSet): FirstResponseItem[] {
  return [
    makeItem({
      item_id: "pc_check_pressure",
      label: "Check pressure, SRV state, and containment together",
      item_kind: "check",
      why: `Pressure is ${Number(plant_state.vessel_pressure_mpa).toFixed(2)} MPa and the event is approaching consequence territory.`,
      completion_hint: "Do not treat pressure in isolation; confirm whether containment or SRV indicators are worsening too.",
      source_alarm_ids: ["ALM_RPV_PRESSURE_HIGH", "ALM_SRV_STUCK_OPEN", "ALM_CONTAINMENT_PRESSURE_HIGH"].filter((alarm_id) =>
        alarm_set.active_alarm_ids.includes(alarm_id),
      ),
      source_variable_ids: ["vessel_pressure_mpa", "safety_relief_valve_open", "containment_pressure_kpa"],
    }),
    makeItem({
      item_id: "pc_watch_consequence",
      label: "Watch for containment or low-low level escalation",
      item_kind: "watch",
      why: "This hypothesis indicates the upset is no longer just a diagnosis problem; it is becoming a consequence-control problem.",
      completion_hint: "If containment pressure or low-low level appear, the response is unsuccessful.",
      source_alarm_ids: ["ALM_CONTAINMENT_PRESSURE_HIGH", "ALM_RPV_LEVEL_LOW_LOW"].filter((alarm_id) =>
        alarm_set.active_alarm_ids.includes(alarm_id),
      ),
      source_variable_ids: ["containment_pressure_kpa", "vessel_water_level_m"],
    }),
  ];
}

function buildPostTripLane(plant_state: PlantStateSnapshot, alarm_set: AlarmSet): FirstResponseItem[] {
  return [
    makeItem({
      item_id: "pt_check_trip",
      label: "Confirm post-trip stabilization cues",
      item_kind: "check",
      why: "Protection has already actuated, so the first-response priority is stabilization rather than diagnosis refinement.",
      completion_hint: "Track level, containment, and pressure together to determine whether the response stayed bounded.",
      source_alarm_ids: ["ALM_REACTOR_TRIP_ACTIVE", "ALM_RPV_LEVEL_LOW_LOW", "ALM_CONTAINMENT_PRESSURE_HIGH"].filter((alarm_id) =>
        alarm_set.active_alarm_ids.includes(alarm_id),
      ),
      source_variable_ids: ["reactor_trip_active", "vessel_water_level_m", "containment_pressure_kpa"],
    }),
    makeItem({
      item_id: "pt_watch_recovery",
      label: "Watch for unsuccessful stabilization markers",
      item_kind: "watch",
      why: `Containment pressure is ${Number(plant_state.containment_pressure_kpa).toFixed(1)} kPa and vessel level is ${Number(plant_state.vessel_water_level_m).toFixed(2)} m.`,
      completion_hint: "If containment pressure keeps rising or level stays below recovery band, the scenario has not stabilized.",
      source_alarm_ids: ["ALM_CONTAINMENT_PRESSURE_HIGH", "ALM_RPV_LEVEL_LOW_LOW"].filter((alarm_id) =>
        alarm_set.active_alarm_ids.includes(alarm_id),
      ),
      source_variable_ids: ["containment_pressure_kpa", "vessel_water_level_m"],
    }),
  ];
}

function buildLoopDiagnosisLane(plant_state: PlantStateSnapshot, alarm_set: AlarmSet): FirstResponseItem[] {
  return [
    makeItem({
      item_id: "loop_check_picture",
      label: "Confirm LoOP, trip, and generation collapse together",
      item_kind: "check",
      why: "The first bounded task is to confirm that the event is an electrical loss with trip, not an isolated turbine indication.",
      completion_hint: "Use offsite power, reactor trip, and turbine output together before narrowing the response path.",
      source_alarm_ids: ["ALM_OFFSITE_POWER_LOSS", "ALM_REACTOR_TRIP_ACTIVE", "ALM_TURBINE_OUTPUT_LOW"].filter((alarm_id) =>
        alarm_set.active_alarm_ids.includes(alarm_id),
      ),
      source_variable_ids: ["offsite_power_available", "reactor_trip_active", "turbine_output_mwe"],
    }),
    makeItem({
      item_id: "loop_watch_dc",
      label: "Watch DC margin while the recovery path is forming",
      item_kind: "watch",
      why: `DC bus state of charge is ${Number(plant_state.dc_bus_soc_pct).toFixed(1)}%, so the response window is battery-limited if recovery drifts.`,
      completion_hint: "Battery margin should stay comfortably above the low band while the decay-heat path is established.",
      source_alarm_ids: ["ALM_DC_BUS_LOW"].filter((alarm_id) => alarm_set.active_alarm_ids.includes(alarm_id)),
      source_variable_ids: ["dc_bus_soc_pct"],
    }),
  ];
}

function buildDecayHeatRemovalLane(
  plant_state: PlantStateSnapshot,
  alarm_set: AlarmSet,
  allowed_action_ids: Set<string>,
): FirstResponseItem[] {
  const items: FirstResponseItem[] = [
    makeItem({
      item_id: "sbo_check_ic",
      label: "Confirm isolation condenser flow is establishing decay-heat removal",
      item_kind: "check",
      why: `Isolation condenser flow is ${Number(plant_state.isolation_condenser_flow_pct).toFixed(1)}% rated while the normal sink remains unavailable.`,
      completion_hint: "The bounded recovery path is to establish IC flow before pressure and DC margin worsen.",
      source_alarm_ids: ["ALM_CONDENSER_HEAT_SINK_LOST", "ALM_ISOLATION_CONDENSER_FLOW_LOW"].filter((alarm_id) =>
        alarm_set.active_alarm_ids.includes(alarm_id),
      ),
      source_variable_ids: ["condenser_heat_sink_available", "isolation_condenser_flow_pct", "vessel_pressure_mpa"],
    }),
  ];

  if (allowed_action_ids.has("act_adjust_isolation_condenser")) {
    items.push(
      makeItem({
        item_id: "sbo_action_ic",
        label: "Align isolation condenser demand toward 68% rated",
        item_kind: "action",
        why: "The current first-response path is to establish bounded IC flow before blackout pressure accumulates.",
        completion_hint: "Use the bounded IC-demand alignment first, then re-check pressure, containment, and battery margin.",
        source_alarm_ids: ["ALM_ISOLATION_CONDENSER_FLOW_LOW"].filter((alarm_id) => alarm_set.active_alarm_ids.includes(alarm_id)),
        source_variable_ids: ["isolation_condenser_flow_pct", "vessel_pressure_mpa"],
        recommended_action_id: "act_adjust_isolation_condenser",
        recommended_value: 68,
      }),
    );
  }

  items.push(
    makeItem({
      item_id: "sbo_watch_pressure",
      label: "Watch pressure and containment while IC flow comes up",
      item_kind: "watch",
      why: "A successful recovery should flatten pressure and keep containment from escalating while DC margin is preserved.",
      completion_hint: "Pressure should trend back inside the bounded band and containment should stop climbing.",
      source_alarm_ids: ["ALM_RPV_PRESSURE_HIGH", "ALM_CONTAINMENT_PRESSURE_HIGH"].filter((alarm_id) =>
        alarm_set.active_alarm_ids.includes(alarm_id),
      ),
      source_variable_ids: ["vessel_pressure_mpa", "containment_pressure_kpa", "dc_bus_soc_pct"],
    }),
  );

  return items;
}

function buildBlackoutProgressionLane(plant_state: PlantStateSnapshot, alarm_set: AlarmSet): FirstResponseItem[] {
  return [
    makeItem({
      item_id: "sbo_watch_blackout",
      label: "Watch battery margin and consequence escalation markers together",
      item_kind: "watch",
      why: `DC bus is ${Number(plant_state.dc_bus_soc_pct).toFixed(1)}% and containment pressure is ${Number(plant_state.containment_pressure_kpa).toFixed(1)} kPa.`,
      completion_hint: "If battery margin keeps falling while pressure indicators worsen, the bounded recovery path is being missed.",
      source_alarm_ids: ["ALM_DC_BUS_LOW", "ALM_CONTAINMENT_PRESSURE_HIGH", "ALM_SRV_STUCK_OPEN"].filter((alarm_id) =>
        alarm_set.active_alarm_ids.includes(alarm_id),
      ),
      source_variable_ids: ["dc_bus_soc_pct", "containment_pressure_kpa", "safety_relief_valve_open"],
    }),
  ];
}

function buildSteamIsolationDiagnosisLane(plant_state: PlantStateSnapshot, alarm_set: AlarmSet): FirstResponseItem[] {
  return [
    makeItem({
      item_id: "msi_check_isolation_picture",
      label: "Confirm trip, steam collapse, and normal electrical availability together",
      item_kind: "check",
      why: "The bounded task is to confirm a steam-isolation upset rather than misclassifying it as a LoOP or generic turbine issue.",
      completion_hint: "Use offsite power, trip state, steam flow, and turbine output together before narrowing the recovery path.",
      source_alarm_ids: ["ALM_REACTOR_TRIP_ACTIVE", "ALM_MAIN_STEAM_FLOW_MISMATCH", "ALM_TURBINE_OUTPUT_LOW"].filter((alarm_id) =>
        alarm_set.active_alarm_ids.includes(alarm_id),
      ),
      source_variable_ids: ["offsite_power_available", "reactor_trip_active", "main_steam_flow_pct", "turbine_output_mwe"],
    }),
    makeItem({
      item_id: "msi_watch_sink_loss",
      label: "Watch the lost normal sink while alternate cooling is still forming",
      item_kind: "watch",
      why: `Condenser sink is unavailable and vessel pressure is ${Number(plant_state.vessel_pressure_mpa).toFixed(2)} MPa.`,
      completion_hint: "If IC flow does not establish quickly, the event will shift from diagnosis into pressure-facing recovery.",
      source_alarm_ids: ["ALM_CONDENSER_HEAT_SINK_LOST"].filter((alarm_id) => alarm_set.active_alarm_ids.includes(alarm_id)),
      source_variable_ids: ["condenser_heat_sink_available", "vessel_pressure_mpa", "isolation_condenser_flow_pct"],
    }),
  ];
}

function buildSteamIsolationRecoveryLane(
  plant_state: PlantStateSnapshot,
  alarm_set: AlarmSet,
  allowed_action_ids: Set<string>,
): FirstResponseItem[] {
  const items: FirstResponseItem[] = [
    makeItem({
      item_id: "msi_check_ic_recovery",
      label: "Confirm IC flow is taking over the post-trip cooling path",
      item_kind: "check",
      why: `Isolation condenser flow is ${Number(plant_state.isolation_condenser_flow_pct).toFixed(1)}% rated while the normal sink remains unavailable.`,
      completion_hint: "The bounded recovery path is to establish IC flow before pressure and containment continue climbing.",
      source_alarm_ids: ["ALM_CONDENSER_HEAT_SINK_LOST", "ALM_ISOLATION_CONDENSER_FLOW_LOW"].filter((alarm_id) =>
        alarm_set.active_alarm_ids.includes(alarm_id),
      ),
      source_variable_ids: ["condenser_heat_sink_available", "isolation_condenser_flow_pct", "vessel_pressure_mpa"],
    }),
  ];

  if (allowed_action_ids.has("act_adjust_isolation_condenser")) {
    items.push(
      makeItem({
        item_id: "msi_action_ic_align",
        label: "Align isolation condenser demand toward 72% rated",
        item_kind: "action",
        why: "The current first-response path is to establish bounded alternate heat-sink recovery before pressure consequences take over.",
        completion_hint: "Use the bounded IC-demand alignment first, then re-check pressure and containment flattening.",
        source_alarm_ids: ["ALM_ISOLATION_CONDENSER_FLOW_LOW", "ALM_RPV_PRESSURE_HIGH"].filter((alarm_id) =>
          alarm_set.active_alarm_ids.includes(alarm_id),
        ),
        source_variable_ids: ["isolation_condenser_flow_pct", "vessel_pressure_mpa", "containment_pressure_kpa"],
        recommended_action_id: "act_adjust_isolation_condenser",
        recommended_value: 72,
      }),
    );
  }

  items.push(
    makeItem({
      item_id: "msi_watch_pressure_flatten",
      label: "Watch pressure and containment for a flattening recovery trend",
      item_kind: "watch",
      why: "A successful response should flatten pressure and stop containment from climbing while IC flow comes up.",
      completion_hint: "Pressure should trend back toward the bounded band and containment should stop rising.",
      source_alarm_ids: ["ALM_RPV_PRESSURE_HIGH", "ALM_CONTAINMENT_PRESSURE_HIGH"].filter((alarm_id) =>
        alarm_set.active_alarm_ids.includes(alarm_id),
      ),
      source_variable_ids: ["vessel_pressure_mpa", "containment_pressure_kpa"],
    }),
  );

  return items;
}

function buildSteamIsolationPressureLane(plant_state: PlantStateSnapshot, alarm_set: AlarmSet): FirstResponseItem[] {
  return [
    makeItem({
      item_id: "msi_check_pressure_consequences",
      label: "Check pressure, SRV state, and containment together",
      item_kind: "check",
      why: `Pressure is ${Number(plant_state.vessel_pressure_mpa).toFixed(2)} MPa and containment is ${Number(plant_state.containment_pressure_kpa).toFixed(1)} kPa.`,
      completion_hint: "Do not treat the pressure indication in isolation; confirm whether SRV relief and containment are worsening too.",
      source_alarm_ids: ["ALM_RPV_PRESSURE_HIGH", "ALM_SRV_STUCK_OPEN", "ALM_CONTAINMENT_PRESSURE_HIGH"].filter((alarm_id) =>
        alarm_set.active_alarm_ids.includes(alarm_id),
      ),
      source_variable_ids: ["vessel_pressure_mpa", "safety_relief_valve_open", "containment_pressure_kpa"],
    }),
    makeItem({
      item_id: "msi_watch_unsuccessful_recovery",
      label: "Watch for an unsuccessful alternate heat-sink response",
      item_kind: "watch",
      why: "This branch means the steam-isolation event is no longer just a diagnosis problem; it is now a consequence-control problem.",
      completion_hint: "If pressure remains high or containment keeps rising, the bounded recovery path has not stabilized.",
      source_alarm_ids: ["ALM_CONTAINMENT_PRESSURE_HIGH", "ALM_SRV_STUCK_OPEN"].filter((alarm_id) =>
        alarm_set.active_alarm_ids.includes(alarm_id),
      ),
      source_variable_ids: ["containment_pressure_kpa", "safety_relief_valve_open", "isolation_condenser_flow_pct"],
    }),
  ];
}

export function buildFirstResponseLane(params: {
  sim_time_sec: number;
  plant_state: PlantStateSnapshot;
  alarm_set: AlarmSet;
  reasoning_snapshot: ReasoningSnapshot;
  allowed_action_ids: string[];
  runtime_profile_id?: ScenarioRuntimeProfileId;
}): FirstResponseLane {
  const allowed_action_ids = new Set(params.allowed_action_ids);
  let items: FirstResponseItem[];
  const runtime_profile_id = params.runtime_profile_id ?? "feedwater_degradation";

  if (runtime_profile_id === "main_steam_isolation_upset") {
    const pressureEscalating =
      params.reasoning_snapshot.dominant_hypothesis_id === "hyp_pressure_consequence_escalation" ||
      Number(params.plant_state.vessel_pressure_mpa) >= 7.45 ||
      params.alarm_set.active_alarm_ids.includes("ALM_CONTAINMENT_PRESSURE_HIGH");
    const recoveryGapActive =
      params.reasoning_snapshot.dominant_hypothesis_id === "hyp_alternate_heat_sink_gap" ||
      params.reasoning_snapshot.dominant_hypothesis_id === "hyp_isolation_recovery_lag" ||
      params.alarm_set.active_alarm_ids.includes("ALM_ISOLATION_CONDENSER_FLOW_LOW") ||
      Number(params.plant_state.isolation_condenser_flow_pct) < 56;

    if (pressureEscalating) {
      items = buildSteamIsolationPressureLane(params.plant_state, params.alarm_set);
    } else if (recoveryGapActive) {
      items = buildSteamIsolationRecoveryLane(params.plant_state, params.alarm_set, allowed_action_ids);
    } else {
      items = buildSteamIsolationDiagnosisLane(params.plant_state, params.alarm_set);
    }

    return {
      lane_id: `lane_${params.reasoning_snapshot.dominant_hypothesis_id ?? "monitor"}_${params.sim_time_sec}`,
      dominant_hypothesis_id: params.reasoning_snapshot.dominant_hypothesis_id,
      updated_at_sec: params.sim_time_sec,
      prototype_notice:
        "Prototype guidance only. This lane narrows likely first checks and actions for the current bounded steam-isolation scenario; it is not an official procedure.",
      items,
    };
  }

  if (runtime_profile_id === "loss_of_offsite_power_sbo") {
    switch (params.reasoning_snapshot.dominant_hypothesis_id) {
      case "hyp_decay_heat_removal_gap":
        items = buildDecayHeatRemovalLane(params.plant_state, params.alarm_set, allowed_action_ids);
        break;
      case "hyp_station_blackout_progression":
      case "hyp_pressure_consequence_management":
        items = buildBlackoutProgressionLane(params.plant_state, params.alarm_set);
        break;
      case "hyp_loss_of_offsite_power":
      default:
        items = buildLoopDiagnosisLane(params.plant_state, params.alarm_set);
        break;
    }

    return {
      lane_id: `lane_${params.reasoning_snapshot.dominant_hypothesis_id ?? "monitor"}_${params.sim_time_sec}`,
      dominant_hypothesis_id: params.reasoning_snapshot.dominant_hypothesis_id,
      updated_at_sec: params.sim_time_sec,
      prototype_notice:
        "Prototype guidance only. This lane narrows likely first checks and actions for the current bounded LoOP/SBO scenario; it is not an official procedure.",
      items,
    };
  }

  switch (params.reasoning_snapshot.dominant_hypothesis_id) {
    case "hyp_heat_sink_stress":
      items = buildHeatSinkLane(params.plant_state, params.alarm_set, allowed_action_ids);
      break;
    case "hyp_pressure_control_transient":
      items = buildPressureLane(params.plant_state, params.alarm_set);
      break;
    case "hyp_post_trip_stabilization":
      items = buildPostTripLane(params.plant_state, params.alarm_set);
      break;
    case "hyp_feedwater_degradation":
    default:
      items = buildFeedwaterLane(params.plant_state, params.alarm_set, allowed_action_ids);
      break;
  }

  return {
    lane_id: `lane_${params.reasoning_snapshot.dominant_hypothesis_id ?? "monitor"}_${params.sim_time_sec}`,
    dominant_hypothesis_id: params.reasoning_snapshot.dominant_hypothesis_id,
    updated_at_sec: params.sim_time_sec,
    prototype_notice: "Prototype guidance only. This lane narrows likely first checks and actions for the current bounded scenario; it is not an official procedure.",
    items,
  };
}

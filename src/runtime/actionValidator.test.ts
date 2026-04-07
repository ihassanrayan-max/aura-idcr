import type { ActionRequest, ScenarioRuntimeProfileId } from "../contracts/aura";
import { AuraSessionStore } from "../state/sessionStore";
import { getValidatorDemoPresets, validateAction } from "./actionValidator";

function buildValidationContext(params: {
  scenario_id?: string;
  requested_value: number;
  action_id: "act_adjust_feedwater" | "act_adjust_isolation_condenser";
  session_index: number;
  advance_until?: (store: AuraSessionStore) => boolean;
}): ReturnType<typeof validateAction> extends infer _T
  ? {
      action_request: ActionRequest;
      allowed_action: NonNullable<ReturnType<AuraSessionStore["getSnapshot"]>["scenario"]["allowed_operator_actions"][number]>;
      plant_state: ReturnType<AuraSessionStore["getSnapshot"]>["plant_tick"]["plant_state"];
      alarm_set: ReturnType<AuraSessionStore["getSnapshot"]>["alarm_set"];
      reasoning_snapshot: ReturnType<AuraSessionStore["getSnapshot"]>["reasoning_snapshot"];
      combined_risk: ReturnType<AuraSessionStore["getSnapshot"]>["combined_risk"];
      operator_state: ReturnType<AuraSessionStore["getSnapshot"]>["operator_state"];
      session_mode: ReturnType<AuraSessionStore["getSnapshot"]>["session_mode"];
      support_mode: ReturnType<AuraSessionStore["getSnapshot"]>["support_mode"];
      first_response_lane: ReturnType<AuraSessionStore["getSnapshot"]>["first_response_lane"];
      runtime_profile_id: ScenarioRuntimeProfileId;
    }
  : never {
  const store = new AuraSessionStore({
    session_index: params.session_index,
    tick_duration_sec: 5,
    ...(params.scenario_id ? { scenario_id: params.scenario_id } : {}),
  });

  if (params.advance_until) {
    let guard = 0;
    while (!params.advance_until(store) && guard < 40) {
      store.advanceTick();
      guard += 1;
    }
  } else {
    for (let tick = 0; tick < 4; tick += 1) {
      store.advanceTick();
    }
  }

  const snapshot = store.getSnapshot();
  const allowed_action = snapshot.scenario.allowed_operator_actions.find((action) => action.action_id === params.action_id);

  if (!allowed_action) {
    throw new Error(`Expected ${params.action_id} to exist in the bounded scenario.`);
  }

  const action_request: ActionRequest = {
    action_request_id: `actreq_test_${String(params.session_index).padStart(4, "0")}`,
    session_id: snapshot.session_id,
    scenario_id: snapshot.scenario.scenario_id,
    sim_time_sec: snapshot.sim_time_sec,
    actor_role: "operator",
    action_id: params.action_id,
    target_subsystem: allowed_action.target_variable_ids[0] ?? "bounded_variable",
    requested_value: params.requested_value,
    ui_region: "plant_mimic",
    reason_note: "Validator unit test request",
  };

  return {
    action_request,
    allowed_action,
    plant_state: snapshot.plant_tick.plant_state,
    alarm_set: snapshot.alarm_set,
    reasoning_snapshot: snapshot.reasoning_snapshot,
    combined_risk: snapshot.combined_risk,
    operator_state: snapshot.operator_state,
    session_mode: snapshot.session_mode,
    support_mode: snapshot.support_mode,
    first_response_lane: snapshot.first_response_lane,
    runtime_profile_id: snapshot.runtime_profile_id,
  };
}

function advanceUntilFeedwaterEscalation(store: AuraSessionStore): boolean {
  const snapshot = store.getSnapshot();
  return (
    Boolean(snapshot.plant_tick.plant_state.reactor_trip_active) ||
    snapshot.alarm_set.active_alarm_ids.includes("ALM_RPV_LEVEL_LOW_LOW") ||
    snapshot.alarm_set.active_alarm_ids.includes("ALM_RPV_PRESSURE_HIGH") ||
    snapshot.alarm_set.active_alarm_ids.includes("ALM_CONTAINMENT_PRESSURE_HIGH")
  );
}

function advanceUntilLoopEscalation(store: AuraSessionStore): boolean {
  const snapshot = store.getSnapshot();
  return (
    Number(snapshot.plant_tick.plant_state.vessel_pressure_mpa) >= 7.45 ||
    Number(snapshot.plant_tick.plant_state.dc_bus_soc_pct) < 32 ||
    snapshot.alarm_set.active_alarm_ids.includes("ALM_CONTAINMENT_PRESSURE_HIGH") ||
    snapshot.alarm_set.active_alarm_ids.includes("ALM_SRV_STUCK_OPEN")
  );
}

function advanceUntilMainSteamEscalation(store: AuraSessionStore): boolean {
  const snapshot = store.getSnapshot();
  return (
    Number(snapshot.plant_tick.plant_state.vessel_pressure_mpa) >= 7.42 ||
    Number(snapshot.plant_tick.plant_state.containment_pressure_kpa) >= 108 ||
    snapshot.alarm_set.active_alarm_ids.includes("ALM_CONTAINMENT_PRESSURE_HIGH") ||
    snapshot.alarm_set.active_alarm_ids.includes("ALM_SRV_STUCK_OPEN")
  );
}

describe("validateAction", () => {
  it("passes the bounded recovery request for the current feedwater lane", () => {
    const result = validateAction({
      ...buildValidationContext({
        requested_value: 82,
        action_id: "act_adjust_feedwater",
        session_index: 31,
      }),
      validation_sequence: 1,
    });

    expect(result.outcome).toBe("pass");
    expect(result.requires_confirmation).toBe(false);
    expect(result.reason_code).toBe("bounded_recovery_pass");
  });

  it("returns a soft warning for a below-guidance feedwater recovery request", () => {
    const result = validateAction({
      ...buildValidationContext({
        requested_value: 70,
        action_id: "act_adjust_feedwater",
        session_index: 32,
      }),
      validation_sequence: 2,
    });

    expect(result.outcome).toBe("soft_warning");
    expect(result.requires_confirmation).toBe(true);
    expect(result.reason_code).toBe("feedwater_below_guided_recovery_band");
    expect(result.override_allowed).toBe(false);
  });

  it("keeps the absolute feedwater floor non-overrideable", () => {
    const result = validateAction({
      ...buildValidationContext({
        requested_value: 55,
        action_id: "act_adjust_feedwater",
        session_index: 33,
      }),
      validation_sequence: 3,
    });

    expect(result.outcome).toBe("hard_prevent");
    expect(result.prevented_harm).toBe(true);
    expect(result.reason_code).toBe("feedwater_below_safe_floor");
    expect(result.override_allowed).toBe(false);
  });

  it("marks escalation-phase feedwater reductions as override-eligible hard prevents", () => {
    const result = validateAction({
      ...buildValidationContext({
        requested_value: 70,
        action_id: "act_adjust_feedwater",
        session_index: 34,
        advance_until: advanceUntilFeedwaterEscalation,
      }),
      validation_sequence: 4,
    });

    expect(result.outcome).toBe("hard_prevent");
    expect(result.reason_code).toBe("reduced_feedwater_during_escalation");
    expect(result.override_allowed).toBe(true);
  });

  it("passes the bounded IC recovery request for Scenario B", () => {
    const result = validateAction({
      ...buildValidationContext({
        scenario_id: "scn_loss_of_offsite_power_sbo",
        requested_value: 68,
        action_id: "act_adjust_isolation_condenser",
        session_index: 131,
      }),
      validation_sequence: 5,
    });

    expect(result.outcome).toBe("pass");
    expect(result.reason_code).toBe("bounded_ic_recovery_pass");
  });

  it("keeps the Scenario B absolute IC floor non-overrideable", () => {
    const result = validateAction({
      ...buildValidationContext({
        scenario_id: "scn_loss_of_offsite_power_sbo",
        requested_value: 10,
        action_id: "act_adjust_isolation_condenser",
        session_index: 132,
      }),
      validation_sequence: 6,
    });

    expect(result.outcome).toBe("hard_prevent");
    expect(result.reason_code).toBe("ic_below_safe_floor");
    expect(result.override_allowed).toBe(false);
  });

  it("marks Scenario B escalation-phase IC reductions as override-eligible hard prevents", () => {
    const result = validateAction({
      ...buildValidationContext({
        scenario_id: "scn_loss_of_offsite_power_sbo",
        requested_value: 40,
        action_id: "act_adjust_isolation_condenser",
        session_index: 133,
        advance_until: advanceUntilLoopEscalation,
      }),
      validation_sequence: 7,
    });

    expect(result.outcome).toBe("hard_prevent");
    expect(result.reason_code).toBe("reduced_ic_during_escalation");
    expect(result.override_allowed).toBe(true);
  });

  it("passes the bounded IC recovery request for Scenario C", () => {
    const result = validateAction({
      ...buildValidationContext({
        scenario_id: "scn_main_steam_isolation_upset",
        requested_value: 72,
        action_id: "act_adjust_isolation_condenser",
        session_index: 231,
      }),
      validation_sequence: 8,
    });

    expect(result.outcome).toBe("pass");
    expect(result.reason_code).toBe("bounded_msi_ic_recovery_pass");
  });

  it("returns a soft warning for a below-guidance IC request during Scenario C", () => {
    const result = validateAction({
      ...buildValidationContext({
        scenario_id: "scn_main_steam_isolation_upset",
        requested_value: 58,
        action_id: "act_adjust_isolation_condenser",
        session_index: 232,
      }),
      validation_sequence: 9,
    });

    expect(result.outcome).toBe("soft_warning");
    expect(result.requires_confirmation).toBe(true);
    expect(result.reason_code).toBe("msi_ic_below_guided_recovery_band");
  });

  it("keeps the Scenario C absolute IC floor non-overrideable", () => {
    const result = validateAction({
      ...buildValidationContext({
        scenario_id: "scn_main_steam_isolation_upset",
        requested_value: 10,
        action_id: "act_adjust_isolation_condenser",
        session_index: 233,
      }),
      validation_sequence: 10,
    });

    expect(result.outcome).toBe("hard_prevent");
    expect(result.reason_code).toBe("msi_ic_below_safe_floor");
    expect(result.override_allowed).toBe(false);
  });

  it("marks Scenario C escalation-phase IC reductions as override-eligible hard prevents", () => {
    const result = validateAction({
      ...buildValidationContext({
        scenario_id: "scn_main_steam_isolation_upset",
        requested_value: 48,
        action_id: "act_adjust_isolation_condenser",
        session_index: 234,
        advance_until: advanceUntilMainSteamEscalation,
      }),
      validation_sequence: 11,
    });

    expect(result.outcome).toBe("hard_prevent");
    expect(result.reason_code).toBe("msi_reduced_ic_during_pressure_escalation");
    expect(result.override_allowed).toBe(true);
  });

  it("publishes scenario-aware validator demo presets from the same rule source", () => {
    expect(getValidatorDemoPresets("feedwater_degradation", "act_adjust_feedwater")).toHaveLength(3);
    expect(getValidatorDemoPresets("loss_of_offsite_power_sbo", "act_adjust_isolation_condenser")).toHaveLength(3);
    expect(getValidatorDemoPresets("main_steam_isolation_upset", "act_adjust_isolation_condenser")).toHaveLength(3);
  });
});

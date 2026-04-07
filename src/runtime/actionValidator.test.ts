import type { ActionRequest } from "../contracts/aura";
import { AuraSessionStore } from "../state/sessionStore";
import { validateAction } from "./actionValidator";

function buildValidationContext(requested_value: number) {
  const store = new AuraSessionStore({ session_index: 31, tick_duration_sec: 5 });

  for (let tick = 0; tick < 4; tick += 1) {
    store.advanceTick();
  }

  const snapshot = store.getSnapshot();
  const allowed_action = snapshot.scenario.allowed_operator_actions.find((action) => action.action_id === "act_adjust_feedwater");

  if (!allowed_action) {
    throw new Error("Expected feedwater action to exist in the bounded scenario.");
  }

  const action_request: ActionRequest = {
    action_request_id: "actreq_test_0001",
    session_id: snapshot.session_id,
    scenario_id: snapshot.scenario.scenario_id,
    sim_time_sec: snapshot.sim_time_sec,
    actor_role: "operator",
    action_id: "act_adjust_feedwater",
    target_subsystem: allowed_action.target_variable_ids[0] ?? "feedwater_flow_pct",
    requested_value,
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
  };
}

function buildLoopValidationContext(requested_value: number) {
  const store = new AuraSessionStore({
    session_index: 131,
    tick_duration_sec: 5,
    scenario_id: "scn_loss_of_offsite_power_sbo",
  });

  for (let tick = 0; tick < 4; tick += 1) {
    store.advanceTick();
  }

  const snapshot = store.getSnapshot();
  const allowed_action = snapshot.scenario.allowed_operator_actions.find(
    (action) => action.action_id === "act_adjust_isolation_condenser",
  );

  if (!allowed_action) {
    throw new Error("Expected IC action to exist in the LoOP scenario.");
  }

  const action_request: ActionRequest = {
    action_request_id: "actreq_test_loop_0001",
    session_id: snapshot.session_id,
    scenario_id: snapshot.scenario.scenario_id,
    sim_time_sec: snapshot.sim_time_sec,
    actor_role: "operator",
    action_id: "act_adjust_isolation_condenser",
    target_subsystem: allowed_action.target_variable_ids[0] ?? "isolation_condenser_flow_pct",
    requested_value,
    ui_region: "plant_mimic",
    reason_note: "LoOP validator unit test request",
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

function buildMainSteamIsolationValidationContext(requested_value: number) {
  const store = new AuraSessionStore({
    session_index: 231,
    tick_duration_sec: 5,
    scenario_id: "scn_main_steam_isolation_upset",
  });

  for (let tick = 0; tick < 4; tick += 1) {
    store.advanceTick();
  }

  const snapshot = store.getSnapshot();
  const allowed_action = snapshot.scenario.allowed_operator_actions.find(
    (action) => action.action_id === "act_adjust_isolation_condenser",
  );

  if (!allowed_action) {
    throw new Error("Expected IC action to exist in the main steam isolation scenario.");
  }

  const action_request: ActionRequest = {
    action_request_id: "actreq_test_msi_0001",
    session_id: snapshot.session_id,
    scenario_id: snapshot.scenario.scenario_id,
    sim_time_sec: snapshot.sim_time_sec,
    actor_role: "operator",
    action_id: "act_adjust_isolation_condenser",
    target_subsystem: allowed_action.target_variable_ids[0] ?? "isolation_condenser_flow_pct",
    requested_value,
    ui_region: "plant_mimic",
    reason_note: "Main steam isolation validator unit test request",
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

describe("validateAction", () => {
  it("passes the bounded recovery request for the current feedwater lane", () => {
    const result = validateAction({
      ...buildValidationContext(82),
      validation_sequence: 1,
    });

    expect(result.outcome).toBe("pass");
    expect(result.requires_confirmation).toBe(false);
    expect(result.reason_code).toBe("bounded_recovery_pass");
  });

  it("returns a soft warning for a below-guidance feedwater recovery request", () => {
    const result = validateAction({
      ...buildValidationContext(70),
      validation_sequence: 2,
    });

    expect(result.outcome).toBe("soft_warning");
    expect(result.requires_confirmation).toBe(true);
    expect(result.reason_code).toBe("feedwater_below_guided_recovery_band");
    expect(result.recommended_safe_alternative).toMatch(/82% rated/i);
  });

  it("hard prevents clearly harmful feedwater reductions", () => {
    const result = validateAction({
      ...buildValidationContext(55),
      validation_sequence: 3,
    });

    expect(result.outcome).toBe("hard_prevent");
    expect(result.prevented_harm).toBe(true);
    expect(result.reason_code).toBe("feedwater_below_safe_floor");
  });

  it("passes the bounded IC recovery request for Scenario B", () => {
    const result = validateAction({
      ...buildLoopValidationContext(68),
      validation_sequence: 4,
    });

    expect(result.outcome).toBe("pass");
    expect(result.reason_code).toBe("bounded_ic_recovery_pass");
  });

  it("hard prevents clearly harmful IC reductions during Scenario B", () => {
    const result = validateAction({
      ...buildLoopValidationContext(10),
      validation_sequence: 5,
    });

    expect(result.outcome).toBe("hard_prevent");
    expect(result.prevented_harm).toBe(true);
    expect(result.reason_code).toBe("ic_below_safe_floor");
  });

  it("passes the bounded IC recovery request for Scenario C", () => {
    const result = validateAction({
      ...buildMainSteamIsolationValidationContext(72),
      validation_sequence: 6,
    });

    expect(result.outcome).toBe("pass");
    expect(result.reason_code).toBe("bounded_msi_ic_recovery_pass");
  });

  it("returns a soft warning for a below-guidance IC request during Scenario C", () => {
    const result = validateAction({
      ...buildMainSteamIsolationValidationContext(58),
      validation_sequence: 7,
    });

    expect(result.outcome).toBe("soft_warning");
    expect(result.requires_confirmation).toBe(true);
    expect(result.reason_code).toBe("msi_ic_below_guided_recovery_band");
  });

  it("hard prevents clearly harmful IC reductions during Scenario C", () => {
    const result = validateAction({
      ...buildMainSteamIsolationValidationContext(10),
      validation_sequence: 8,
    });

    expect(result.outcome).toBe("hard_prevent");
    expect(result.prevented_harm).toBe(true);
    expect(result.reason_code).toBe("msi_ic_below_safe_floor");
  });
});

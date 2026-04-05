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
});

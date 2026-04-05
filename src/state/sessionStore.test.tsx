import { act, render, screen } from "@testing-library/react";
import App from "../App";
import { AuraSessionStore } from "./sessionStore";

function runSuccessfulSession(): AuraSessionStore {
  const store = new AuraSessionStore({ session_index: 11, tick_duration_sec: 5 });
  store.advanceTick();
  store.advanceTick();
  store.advanceTick();
  store.requestAction({
    action_id: "act_adjust_feedwater",
    requested_value: 82,
    ui_region: "plant_mimic",
    reason_note: "Deterministic test correction",
  });
  store.runUntilComplete(60);
  return store;
}

function summarizeStore(store: AuraSessionStore) {
  const snapshot = store.getSnapshot();
  return {
    outcome: snapshot.outcome,
    active_alarm_ids: snapshot.alarm_set.active_alarm_ids,
    events: snapshot.events.map((event) => ({
      type: event.event_type,
      time: event.sim_time_sec,
      phase: event.phase_id,
      payload: event.payload,
    })),
    final_tick: {
      sim_time_sec: snapshot.plant_tick.sim_time_sec,
      phase_id: snapshot.plant_tick.phase_id,
      level: snapshot.plant_tick.plant_state.vessel_water_level_m,
      pressure: snapshot.plant_tick.plant_state.vessel_pressure_mpa,
      feedwater: snapshot.plant_tick.plant_state.feedwater_flow_pct,
      alarms: snapshot.plant_tick.plant_state.alarm_load_count,
    },
  };
}

describe("AuraSessionStore", () => {
  it("runs the same corrected scenario path deterministically", () => {
    const first = summarizeStore(runSuccessfulSession());
    const second = summarizeStore(runSuccessfulSession());

    expect(first).toEqual(second);
    expect(first.outcome?.outcome).toBe("success");
  });

  it("reaches a non-success terminal state without corrective action", () => {
    const store = new AuraSessionStore({ session_index: 12, tick_duration_sec: 5 });
    const finalSnapshot = store.runUntilComplete(80);

    expect(finalSnapshot.outcome).toBeDefined();
    expect(finalSnapshot.outcome?.outcome).not.toBe("success");
  });

  it("keeps the rendered HMI synchronized with the session store", () => {
    const store = new AuraSessionStore({ session_index: 13, tick_duration_sec: 5 });
    render(<App store={store} autoRun={false} />);

    expect(screen.getByText("00:00")).toBeInTheDocument();
    expect(screen.getByText(/Vessel Water Level/i)).toBeInTheDocument();

    act(() => {
      store.advanceTick();
    });

    expect(screen.getByText("00:05")).toBeInTheDocument();
    expect(screen.getByText(/session_started/i)).toBeInTheDocument();
  });

  it("records the required baseline log events for the corrected run", () => {
    const snapshot = runSuccessfulSession().getSnapshot();
    const eventTypes = snapshot.events.map((event) => event.event_type);

    expect(eventTypes).toContain("session_started");
    expect(eventTypes).toContain("phase_changed");
    expect(eventTypes).toContain("plant_tick_recorded");
    expect(eventTypes).toContain("alarm_set_updated");
    expect(eventTypes).toContain("action_requested");
    expect(eventTypes).toContain("operator_action_applied");
    expect(eventTypes).toContain("scenario_outcome_recorded");
  });
});

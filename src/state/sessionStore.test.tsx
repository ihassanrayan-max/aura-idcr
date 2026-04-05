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
    alarm_cards: snapshot.alarm_intelligence.visible_alarm_card_count,
    dominant_hypothesis_id: snapshot.reasoning_snapshot.dominant_hypothesis_id,
    stable_for_ticks: snapshot.reasoning_snapshot.stable_for_ticks,
    first_response_items: snapshot.first_response_lane.items.map((item) => item.item_id),
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
    expect(screen.getAllByText(/Vessel Water Level/i).length).toBeGreaterThan(0);

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
    expect(eventTypes).toContain("reasoning_snapshot_published");
    expect(eventTypes).toContain("diagnosis_committed");
    expect(eventTypes).toContain("scenario_outcome_recorded");
  });

  it("reduces visible overload with grouped alarms and keeps the dominant hypothesis stable", () => {
    const store = new AuraSessionStore({ session_index: 14, tick_duration_sec: 5 });

    for (let tick = 0; tick < 8; tick += 1) {
      store.advanceTick();
    }

    const snapshot = store.getSnapshot();

    expect(snapshot.alarm_set.active_alarm_count).toBeGreaterThan(0);
    expect(snapshot.alarm_intelligence.visible_alarm_card_count).toBeLessThan(snapshot.alarm_set.active_alarm_count);
    expect(snapshot.reasoning_snapshot.dominant_hypothesis_id).toBe("hyp_feedwater_degradation");
    expect(snapshot.reasoning_snapshot.stable_for_ticks).toBeGreaterThanOrEqual(4);
  });

  it("updates the first-response lane as plant state changes", () => {
    const store = new AuraSessionStore({ session_index: 15, tick_duration_sec: 5 });

    for (let tick = 0; tick < 4; tick += 1) {
      store.advanceTick();
    }

    const onsetLaneItems = store.getSnapshot().first_response_lane.items.map((item) => item.item_id);
    store.requestAction({
      action_id: "act_adjust_feedwater",
      requested_value: 82,
      ui_region: "procedure_lane",
      reason_note: "Phase 2 lane test correction",
    });
    store.runUntilComplete(60);
    const recoveryLaneItems = store.getSnapshot().first_response_lane.items.map((item) => item.item_id);

    expect(onsetLaneItems).toContain("fw_action_ack");
    expect(recoveryLaneItems).not.toContain("fw_action_ack");
    expect(recoveryLaneItems).toContain("fw_watch_recovery");
  });
});

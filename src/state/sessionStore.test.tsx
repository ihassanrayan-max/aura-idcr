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
    support_mode: snapshot.support_mode,
    active_alarm_ids: snapshot.alarm_set.active_alarm_ids,
    alarm_cards: snapshot.alarm_intelligence.visible_alarm_card_count,
    dominant_hypothesis_id: snapshot.reasoning_snapshot.dominant_hypothesis_id,
    stable_for_ticks: snapshot.reasoning_snapshot.stable_for_ticks,
    operator_state: snapshot.operator_state,
    combined_risk: {
      combined_risk_score: snapshot.combined_risk.combined_risk_score,
      combined_risk_band: snapshot.combined_risk.combined_risk_band,
      top_contributing_factors: snapshot.combined_risk.top_contributing_factors,
      confidence_caveat: snapshot.combined_risk.confidence_caveat,
      what_changed: snapshot.combined_risk.what_changed,
      factor_breakdown: snapshot.combined_risk.factor_breakdown.map((factor) => ({
        factor_id: factor.factor_id,
        raw_index: factor.raw_index,
        contribution: factor.contribution,
      })),
    },
    support_refinement: {
      current_support_focus: snapshot.support_refinement.current_support_focus,
      emphasized_lane_item_ids: snapshot.support_refinement.emphasized_lane_item_ids,
      summary_explanation: snapshot.support_refinement.summary_explanation,
      operator_context_note: snapshot.support_refinement.operator_context_note,
      degraded_confidence_caution: snapshot.support_refinement.degraded_confidence_caution,
      watch_now_summary: snapshot.support_refinement.watch_now_summary,
      wording_style: snapshot.support_refinement.wording_style,
    },
    support_policy: {
      current_mode_reason: snapshot.support_policy.current_mode_reason,
      transition_reason: snapshot.support_policy.transition_reason,
      mode_change_summary: snapshot.support_policy.mode_change_summary,
      support_behavior_changes: snapshot.support_policy.support_behavior_changes,
      degraded_confidence_effect: snapshot.support_policy.degraded_confidence_effect,
      critical_visibility: snapshot.support_policy.critical_visibility,
    },
    first_response_item_cues: snapshot.first_response_lane.items.map((item) => ({
      item_id: item.item_id,
      emphasized: item.presentation_cue?.emphasized ?? false,
      urgency_level: item.presentation_cue?.urgency_level ?? "standard",
      wording_style: item.presentation_cue?.wording_style ?? "explicit",
    })),
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
    expect(screen.getAllByText(/operator_state_snapshot_recorded/i).length).toBeGreaterThan(0);
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
    expect(eventTypes).toContain("operator_state_snapshot_recorded");
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

  it("records deterministic degraded mode early and recovers confidence after a successful correction", () => {
    const initialStore = new AuraSessionStore({ session_index: 16, tick_duration_sec: 5 });
    const initialOperatorState = initialStore.getSnapshot().operator_state;
    const successfulStore = runSuccessfulSession();
    const finalOperatorState = successfulStore.getSnapshot().operator_state;

    expect(initialOperatorState.degraded_mode_active).toBe(true);
    expect(initialOperatorState.signal_confidence).toBeLessThan(70);
    expect(initialOperatorState.degraded_mode_reason).toMatch(/short observation window/i);

    expect(finalOperatorState.degraded_mode_active).toBe(false);
    expect(finalOperatorState.signal_confidence).toBeGreaterThanOrEqual(70);
    expect(finalOperatorState.workload_index).toBeGreaterThanOrEqual(0);
    expect(finalOperatorState.workload_index).toBeLessThanOrEqual(100);
  });

  it("publishes inspectable combined-risk outputs alongside the Phase 2 reasoning snapshot", () => {
    const snapshot = runSuccessfulSession().getSnapshot();
    const reasoningEvents = snapshot.events.filter((event) => event.event_type === "reasoning_snapshot_published");
    const operatorEvents = snapshot.events.filter((event) => event.event_type === "operator_state_snapshot_recorded");
    const lastReasoningPayload = reasoningEvents[reasoningEvents.length - 1]?.payload as Record<string, unknown>;
    const lastOperatorPayload = operatorEvents[operatorEvents.length - 1]?.payload as Record<string, unknown>;

    expect(operatorEvents.length).toBeGreaterThan(0);
    expect(lastOperatorPayload.workload_index).toBe(snapshot.operator_state.workload_index);
    expect(lastOperatorPayload.attention_stability_index).toBe(snapshot.operator_state.attention_stability_index);
    expect(lastOperatorPayload.signal_confidence).toBe(snapshot.operator_state.signal_confidence);

    expect(snapshot.combined_risk.factor_breakdown.length).toBeGreaterThanOrEqual(5);
    expect(snapshot.combined_risk.top_contributing_factors.length).toBeGreaterThan(0);
    expect(snapshot.combined_risk.why_risk_is_current.length).toBeGreaterThan(0);
    expect(snapshot.combined_risk.confidence_caveat.length).toBeGreaterThan(0);
    expect(lastReasoningPayload.combined_risk_score).toBe(snapshot.combined_risk.combined_risk_score);
    expect(lastReasoningPayload.combined_risk_band).toBe(snapshot.combined_risk.combined_risk_band);
    expect(lastReasoningPayload.factor_breakdown).toBeDefined();
    expect(snapshot.support_refinement.current_support_focus.length).toBeGreaterThan(0);
    expect(snapshot.support_refinement.summary_explanation.length).toBeGreaterThan(0);
    expect(snapshot.support_refinement.watch_now_summary.length).toBeGreaterThan(0);
    expect(snapshot.support_policy.current_mode_reason.length).toBeGreaterThan(0);
    expect(snapshot.support_policy.support_behavior_changes.length).toBeGreaterThan(0);
    expect(snapshot.support_policy.critical_visibility.pinned_alarm_ids.length).toBeGreaterThanOrEqual(0);
    expect(lastReasoningPayload.current_support_focus).toBe(snapshot.support_refinement.current_support_focus);
    expect(lastReasoningPayload.emphasized_lane_item_ids).toEqual(snapshot.support_refinement.emphasized_lane_item_ids);
    expect(lastReasoningPayload.wording_style).toBe(snapshot.support_refinement.wording_style);
    expect(lastReasoningPayload.support_mode).toBe(snapshot.support_mode);
    expect(lastReasoningPayload.current_mode_reason).toBe(snapshot.support_policy.current_mode_reason);
  });

  it("logs a replay-inspectable support-mode transition when the scenario escalates", () => {
    const store = new AuraSessionStore({ session_index: 17, tick_duration_sec: 5 });

    for (let tick = 0; tick < 8; tick += 1) {
      store.advanceTick();
    }

    const transitionEvents = store.getSnapshot().events.filter((event) => event.event_type === "support_mode_changed");
    const lastTransitionPayload = transitionEvents[transitionEvents.length - 1]?.payload as Record<string, unknown>;

    expect(transitionEvents.length).toBeGreaterThan(0);
    expect(store.getSnapshot().support_mode).toBe("protected_response");
    expect(lastTransitionPayload.from_mode).toBe("guided_support");
    expect(lastTransitionPayload.to_mode).toBe("protected_response");
    expect(String(lastTransitionPayload.trigger_reason)).toMatch(/Escalated immediately/i);
  });

  it("renders the compact support-state risk outputs in the HMI", () => {
    const store = new AuraSessionStore({ session_index: 18, tick_duration_sec: 5 });
    render(<App store={store} autoRun={false} />);

    expect(screen.getByText("Support State / Combined Risk")).toBeInTheDocument();
    expect(screen.getByText("Workload")).toBeInTheDocument();
    expect(screen.getByText("Attention Stability")).toBeInTheDocument();
    expect(screen.getByText("Signal Confidence")).toBeInTheDocument();
    expect(screen.getByText(/Why risk is here now/i)).toBeInTheDocument();
    expect(screen.getAllByText(/Confidence caveat/i).length).toBeGreaterThan(0);
    expect(screen.getByText(/Current support focus/i)).toBeInTheDocument();
    expect(screen.getAllByText(/Watch next/i).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/Why this is emphasized now/i).length).toBeGreaterThan(0);
    expect(screen.getByText(/Current assistance mode/i)).toBeInTheDocument();
    expect(screen.getAllByText(/Critical visibility guardrails/i).length).toBeGreaterThan(0);
  });

  it("keeps critical alarms visibly pinned in the alarm area when they are active", () => {
    const store = new AuraSessionStore({ session_index: 19, tick_duration_sec: 5 });
    for (let tick = 0; tick < 8; tick += 1) {
      store.advanceTick();
    }
    render(<App store={store} autoRun={false} />);

    expect(screen.getByText(/Critical alarms pinned in view/i)).toBeInTheDocument();
    expect(screen.getAllByTestId("critical-alarm-chip").length).toBeGreaterThan(0);
  });
});

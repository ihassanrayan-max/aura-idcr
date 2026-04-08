import { act, fireEvent, render, screen } from "@testing-library/react";
import { vi } from "vitest";
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

function runSuccessfulLoopSession(): AuraSessionStore {
  const store = new AuraSessionStore({
    session_index: 111,
    tick_duration_sec: 5,
    scenario_id: "scn_loss_of_offsite_power_sbo",
  });
  store.advanceTick();
  store.advanceTick();
  store.advanceTick();
  store.advanceTick();
  store.requestAction({
    action_id: "act_adjust_isolation_condenser",
    requested_value: 68,
    ui_region: "plant_mimic",
    reason_note: "Deterministic LoOP recovery test correction",
  });
  store.runUntilComplete(80);
  return store;
}

function runSuccessfulMainSteamIsolationSession(): AuraSessionStore {
  const store = new AuraSessionStore({
    session_index: 211,
    tick_duration_sec: 5,
    scenario_id: "scn_main_steam_isolation_upset",
  });
  store.advanceTick();
  store.advanceTick();
  store.advanceTick();
  store.advanceTick();
  store.requestAction({
    action_id: "act_adjust_isolation_condenser",
    requested_value: 72,
    ui_region: "plant_mimic",
    reason_note: "Deterministic steam isolation recovery test correction",
  });
  store.runUntilComplete(80);
  return store;
}

function advanceUntil(
  store: AuraSessionStore,
  predicate: (snapshot: ReturnType<AuraSessionStore["getSnapshot"]>) => boolean,
  maxTicks = 40,
): void {
  let guard = 0;
  while (!predicate(store.getSnapshot()) && guard < maxTicks) {
    store.advanceTick();
    guard += 1;
  }
}

function openReviewWorkspace(): void {
  fireEvent.click(screen.getByRole("tab", { name: /Review/i }));
}

function openTutorialGuideMenu(): void {
  fireEvent.click(screen.getByRole("button", { name: /Tutorial guide/i }));
}

function startTutorialPath(label: RegExp): void {
  fireEvent.click(screen.getByRole("button", { name: label }));
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
    human_monitoring: {
      snapshot_id: snapshot.human_monitoring.snapshot_id,
      mode: snapshot.human_monitoring.mode,
      freshness_status: snapshot.human_monitoring.freshness_status,
      aggregate_confidence: snapshot.human_monitoring.aggregate_confidence,
      degraded_state_active: snapshot.human_monitoring.degraded_state_active,
      degraded_state_reason: snapshot.human_monitoring.degraded_state_reason,
      status_summary: snapshot.human_monitoring.status_summary,
      window_tick_span: snapshot.human_monitoring.window_tick_span,
      window_duration_sec: snapshot.human_monitoring.window_duration_sec,
      connected_source_count: snapshot.human_monitoring.connected_source_count,
      active_source_count: snapshot.human_monitoring.active_source_count,
      current_source_count: snapshot.human_monitoring.current_source_count,
      degraded_source_count: snapshot.human_monitoring.degraded_source_count,
      stale_source_count: snapshot.human_monitoring.stale_source_count,
      contributing_source_count: snapshot.human_monitoring.contributing_source_count,
      sources: snapshot.human_monitoring.sources.map((source) => ({
        source_id: source.source_id,
        source_kind: source.source_kind,
        availability: source.availability,
        freshness_status: source.freshness_status,
        confidence: source.confidence,
        contributes_to_aggregate: source.contributes_to_aggregate,
      })),
      interpretation_input: snapshot.human_monitoring.interpretation_input,
    },
    operator_state: snapshot.operator_state,
    combined_risk: {
      risk_model_id: snapshot.combined_risk.risk_model_id,
      combined_risk_score: snapshot.combined_risk.combined_risk_score,
      combined_risk_band: snapshot.combined_risk.combined_risk_band,
      plant_urgency_index: snapshot.combined_risk.plant_urgency_index,
      human_pressure_index: snapshot.combined_risk.human_pressure_index,
      fusion_confidence: snapshot.combined_risk.fusion_confidence,
      human_influence_scale: snapshot.combined_risk.human_influence_scale,
      recommended_assistance_mode: snapshot.combined_risk.recommended_assistance_mode,
      recommended_assistance_reason: snapshot.combined_risk.recommended_assistance_reason,
      top_contributing_factors: snapshot.combined_risk.top_contributing_factors,
      confidence_caveat: snapshot.combined_risk.confidence_caveat,
      why_risk_is_current: snapshot.combined_risk.why_risk_is_current,
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

function installTutorialDomMocks() {
  const scrollIntoView = vi.fn();
  const focus = vi.fn();

  Object.defineProperty(HTMLElement.prototype, "scrollIntoView", {
    configurable: true,
    value: scrollIntoView,
  });
  Object.defineProperty(HTMLElement.prototype, "focus", {
    configurable: true,
    value: focus,
  });

  return { scrollIntoView, focus };
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
    expect(finalSnapshot.completed_review).toBeDefined();
    expect(finalSnapshot.completed_review?.terminal_outcome.outcome).toBe(finalSnapshot.outcome?.outcome);
  });

  it("keeps the rendered HMI synchronized with the session store", () => {
    const store = new AuraSessionStore({ session_index: 13, tick_duration_sec: 5 });
    render(<App store={store} autoRun={false} />);

    expect(screen.getByText("00:00")).toBeInTheDocument();
    expect(screen.getAllByText(/Vessel Water Level/i).length).toBeGreaterThan(0);
    expect(screen.getByTestId("operate-workspace")).toBeInTheDocument();

    act(() => {
      store.advanceTick();
    });

    expect(screen.getByText("00:05")).toBeInTheDocument();
    expect(screen.getByText(/Operator Orientation/i)).toBeInTheDocument();
  });

  it("records the required baseline log events for the corrected run", () => {
    const snapshot = runSuccessfulSession().getSnapshot();
    const eventTypes = snapshot.events.map((event) => event.event_type);

    expect(eventTypes).toContain("session_started");
    expect(eventTypes).toContain("phase_changed");
    expect(eventTypes).toContain("plant_tick_recorded");
    expect(eventTypes).toContain("alarm_set_updated");
    expect(eventTypes).toContain("human_monitoring_snapshot_recorded");
    expect(eventTypes).toContain("action_requested");
    expect(eventTypes).toContain("action_validated");
    expect(eventTypes).toContain("operator_action_applied");
    expect(eventTypes).toContain("operator_state_snapshot_recorded");
    expect(eventTypes).toContain("reasoning_snapshot_published");
    expect(eventTypes).toContain("diagnosis_committed");
    expect(eventTypes).toContain("scenario_outcome_recorded");
    expect(eventTypes).toContain("session_ended");
    expect(eventTypes).toContain("kpi_summary_generated");
    expect(snapshot.kpi_summary).toBeDefined();
    expect(snapshot.kpi_summary?.completeness).toBe("complete");
    expect(snapshot.completed_review).toBeDefined();
    expect(snapshot.completed_review?.schema_version).toBe(1);
    expect(snapshot.completed_review?.session_id).toBe(snapshot.session_id);
    expect(snapshot.completed_review?.terminal_outcome.outcome).toBe(snapshot.outcome?.outcome);
    expect(snapshot.completed_review?.kpi_summary.kpi_summary_id).toBe(snapshot.kpi_summary?.kpi_summary_id);
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

  it("logs session_mode on session_started and uses adaptive as the default store configuration", () => {
    const store = new AuraSessionStore({ session_index: 27, tick_duration_sec: 5 });
    const started = store.getSnapshot().events.find((event) => event.event_type === "session_started");
    expect(started?.payload.session_mode).toBe("adaptive");
    expect(store.getSnapshot().session_mode).toBe("adaptive");
    expect(store.getSnapshot().plant_tick.session_mode).toBe("adaptive");
  });

  it("keeps baseline session mode free of support_mode_changed events and monitoring support", () => {
    const store = new AuraSessionStore({ session_index: 28, tick_duration_sec: 5, session_mode: "baseline" });
    expect(store.getSnapshot().session_mode).toBe("baseline");
    const sessionStarted = store.getSnapshot().events.find((event) => event.event_type === "session_started");
    expect(sessionStarted?.payload.session_mode).toBe("baseline");

    for (let tick = 0; tick < 12; tick += 1) {
      store.advanceTick();
    }

    const transitionEvents = store.getSnapshot().events.filter((event) => event.event_type === "support_mode_changed");
    expect(transitionEvents.length).toBe(0);
    expect(store.getSnapshot().support_mode).toBe("monitoring_support");
  });

  it("passes feedwater actions through in baseline session mode without soft-warning holds", () => {
    const store = new AuraSessionStore({ session_index: 29, tick_duration_sec: 5, session_mode: "baseline" });

    for (let tick = 0; tick < 4; tick += 1) {
      store.advanceTick();
    }

    const applied = store.requestAction({
      action_id: "act_adjust_feedwater",
      requested_value: 70,
      ui_region: "plant_mimic",
      reason_note: "Baseline pass-through test",
    });
    const snapshot = store.getSnapshot();

    expect(applied).toBe(true);
    expect(snapshot.pending_action_confirmation).toBeUndefined();
    expect(snapshot.last_validation_result?.outcome).toBe("pass");
    expect(snapshot.last_validation_result?.reason_code).toBe("baseline_session_pass_through");
    expect(snapshot.executed_actions).toHaveLength(1);
  });

  it("holds a soft warning action until the operator explicitly confirms it", () => {
    const store = new AuraSessionStore({ session_index: 20, tick_duration_sec: 5 });

    for (let tick = 0; tick < 4; tick += 1) {
      store.advanceTick();
    }

    const firstAttemptApplied = store.requestAction({
      action_id: "act_adjust_feedwater",
      requested_value: 70,
      ui_region: "plant_mimic",
      reason_note: "Soft warning confirmation test",
    });
    const warningSnapshot = store.getSnapshot();

    expect(firstAttemptApplied).toBe(false);
    expect(warningSnapshot.pending_action_confirmation).toBeDefined();
    expect(warningSnapshot.last_validation_result?.outcome).toBe("soft_warning");
    expect(warningSnapshot.events.filter((event) => event.event_type === "operator_action_applied")).toHaveLength(0);

    const confirmed = store.confirmPendingAction();
    const confirmedSnapshot = store.getSnapshot();

    expect(confirmed).toBe(true);
    expect(confirmedSnapshot.pending_action_confirmation).toBeUndefined();
    expect(confirmedSnapshot.executed_actions).toHaveLength(1);
    expect(confirmedSnapshot.events.some((event) => event.event_type === "action_confirmation_recorded")).toBe(true);
    expect(confirmedSnapshot.events.some((event) => event.event_type === "operator_action_applied")).toBe(true);
  });

  it("blocks a hard prevent request and logs a prevented-harm signal", () => {
    const store = new AuraSessionStore({ session_index: 21, tick_duration_sec: 5 });

    for (let tick = 0; tick < 4; tick += 1) {
      store.advanceTick();
    }

    const applied = store.requestAction({
      action_id: "act_adjust_feedwater",
      requested_value: 55,
      ui_region: "plant_mimic",
      reason_note: "Hard prevent test",
    });
    const snapshot = store.getSnapshot();
    const validationEvents = snapshot.events.filter((event) => event.event_type === "action_validated");
    const lastValidationPayload = validationEvents[validationEvents.length - 1]?.payload as Record<string, unknown>;

    expect(applied).toBe(false);
    expect(snapshot.executed_actions).toHaveLength(0);
    expect(snapshot.pending_action_confirmation).toBeUndefined();
    expect(snapshot.last_validation_result?.outcome).toBe("hard_prevent");
    expect(lastValidationPayload.outcome).toBe("hard_prevent");
    expect(lastValidationPayload.prevented_harm).toBe(true);
    expect(snapshot.events.some((event) => event.event_type === "operator_action_applied")).toBe(false);
  });

  it("only exposes supervisor override review for override-eligible hard prevents", () => {
    const store = new AuraSessionStore({ session_index: 121, tick_duration_sec: 5 });

    for (let tick = 0; tick < 4; tick += 1) {
      store.advanceTick();
    }

    store.requestAction({
      action_id: "act_adjust_feedwater",
      requested_value: 55,
      ui_region: "plant_mimic",
      reason_note: "Non-overrideable hard prevent test",
    });

    const snapshot = store.getSnapshot();

    expect(snapshot.last_validation_result?.outcome).toBe("hard_prevent");
    expect(snapshot.last_validation_result?.override_allowed).toBe(false);
    expect(snapshot.pending_supervisor_override).toBeUndefined();
    expect(store.requestSupervisorOverrideReview("should not be allowed")).toBe(false);
  });

  it("supports a bounded one-shot supervisor override for eligible hard prevents", () => {
    const store = new AuraSessionStore({
      session_index: 122,
      tick_duration_sec: 5,
      scenario_id: "scn_main_steam_isolation_upset",
    });

    advanceUntil(
      store,
      (snapshot) =>
        Number(snapshot.plant_tick.plant_state.vessel_pressure_mpa) >= 7.42 ||
        Number(snapshot.plant_tick.plant_state.containment_pressure_kpa) >= 108 ||
        snapshot.alarm_set.active_alarm_ids.includes("ALM_CONTAINMENT_PRESSURE_HIGH") ||
        snapshot.alarm_set.active_alarm_ids.includes("ALM_SRV_STUCK_OPEN"),
      40,
    );

    const blocked = store.requestAction({
      action_id: "act_adjust_isolation_condenser",
      requested_value: 48,
      ui_region: "plant_mimic",
      reason_note: "Override-eligible hard prevent test",
    });

    expect(blocked).toBe(false);
    expect(store.getSnapshot().pending_supervisor_override?.request_status).toBe("available");
    expect(store.getSnapshot().validation_demo_state.hard_prevent_demonstrated.demonstrated).toBe(true);

    const requested = store.requestSupervisorOverrideReview("Bounded demo request");
    expect(requested).toBe(true);
    expect(store.getSnapshot().pending_supervisor_override?.request_status).toBe("requested");

    const approved = store.approvePendingSupervisorOverride("Supervisor approved bounded demo");
    const snapshot = store.getSnapshot();
    const appliedEvents = snapshot.events.filter((event) => event.event_type === "operator_action_applied");
    const lastAppliedPayload = appliedEvents[appliedEvents.length - 1]?.payload as Record<string, unknown>;

    expect(approved).toBe(true);
    expect(snapshot.pending_supervisor_override).toBeUndefined();
    expect(snapshot.executed_actions).toHaveLength(1);
    expect(snapshot.validation_demo_state.supervisor_override_demonstrated.demonstrated).toBe(true);
    expect(snapshot.events.some((event) => event.event_type === "supervisor_override_requested")).toBe(true);
    expect(snapshot.events.some((event) => event.event_type === "supervisor_override_decided")).toBe(true);
    expect(snapshot.events.some((event) => event.event_type === "supervisor_override_action_applied")).toBe(true);
    expect(lastAppliedPayload.override_applied).toBe(true);
  });

  it("supports supervisor override denial without applying the blocked action", () => {
    const store = new AuraSessionStore({
      session_index: 123,
      tick_duration_sec: 5,
      scenario_id: "scn_main_steam_isolation_upset",
    });

    advanceUntil(
      store,
      (snapshot) =>
        Number(snapshot.plant_tick.plant_state.vessel_pressure_mpa) >= 7.42 ||
        Number(snapshot.plant_tick.plant_state.containment_pressure_kpa) >= 108 ||
        snapshot.alarm_set.active_alarm_ids.includes("ALM_CONTAINMENT_PRESSURE_HIGH") ||
        snapshot.alarm_set.active_alarm_ids.includes("ALM_SRV_STUCK_OPEN"),
      40,
    );

    store.requestAction({
      action_id: "act_adjust_isolation_condenser",
      requested_value: 48,
      ui_region: "plant_mimic",
      reason_note: "Override denial test",
    });

    expect(store.getSnapshot().pending_supervisor_override?.request_status).toBe("available");
    expect(store.requestSupervisorOverrideReview("Please review")).toBe(true);

    const denied = store.denyPendingSupervisorOverride("Denied for demo");
    const snapshot = store.getSnapshot();
    const decisionEvents = snapshot.events.filter((event) => event.event_type === "supervisor_override_decided");
    const decisionEvent = decisionEvents[decisionEvents.length - 1];
    const decisionPayload = decisionEvent?.payload as Record<string, unknown>;

    expect(denied).toBe(true);
    expect(snapshot.pending_supervisor_override).toBeUndefined();
    expect(snapshot.executed_actions).toHaveLength(0);
    expect(snapshot.validation_demo_state.supervisor_override_demonstrated.demonstrated).toBe(false);
    expect(decisionPayload.decision).toBe("denied");
  });

  it("keeps low-concern acknowledgement actions quiet and pass-through", () => {
    const store = new AuraSessionStore({ session_index: 22, tick_duration_sec: 5 });
    const applied = store.requestAction({
      action_id: "act_ack_alarm",
      ui_region: "alarm_area",
      reason_note: "Validation quiet-pass acknowledgement test",
    });

    expect(applied).toBe(true);
    expect(store.getSnapshot().last_validation_result?.outcome).toBe("pass");
    expect(store.getSnapshot().pending_action_confirmation).toBeUndefined();
  });

  it("records deterministic degraded mode early and recovers confidence after a successful correction", () => {
    const initialStore = new AuraSessionStore({ session_index: 16, tick_duration_sec: 5 });
    const initialOperatorState = initialStore.getSnapshot().operator_state;
    const initialHumanMonitoring = initialStore.getSnapshot().human_monitoring;
    const successfulStore = runSuccessfulSession();
    const finalOperatorState = successfulStore.getSnapshot().operator_state;
    const finalHumanMonitoring = successfulStore.getSnapshot().human_monitoring;

    expect(initialOperatorState.degraded_mode_active).toBe(true);
    expect(initialOperatorState.signal_confidence).toBeLessThan(70);
    expect(initialOperatorState.degraded_mode_reason).toMatch(/short observation window/i);
    expect(initialHumanMonitoring.mode).toBe("placeholder_compatibility");
    expect(initialHumanMonitoring.degraded_state_active).toBe(true);

    expect(finalOperatorState.degraded_mode_active).toBe(false);
    expect(finalOperatorState.signal_confidence).toBeGreaterThanOrEqual(70);
    expect(finalOperatorState.workload_index).toBeGreaterThanOrEqual(0);
    expect(finalOperatorState.workload_index).toBeLessThanOrEqual(100);
    expect(finalHumanMonitoring.mode).toBe("placeholder_compatibility");
    expect(finalHumanMonitoring.connected_source_count).toBe(2);
    expect(
      successfulStore
        .getSnapshot()
        .events.filter((event) => event.event_type === "human_monitoring_snapshot_recorded")
        .some((event) => {
          const payload = event.payload as Record<string, unknown>;
          return payload.mode === "live_sources";
        }),
    ).toBe(true);
  });

  it("publishes inspectable combined-risk outputs alongside the Phase 2 reasoning snapshot", () => {
    const snapshot = runSuccessfulSession().getSnapshot();
    const reasoningEvents = snapshot.events.filter((event) => event.event_type === "reasoning_snapshot_published");
    const monitoringEvents = snapshot.events.filter((event) => event.event_type === "human_monitoring_snapshot_recorded");
    const operatorEvents = snapshot.events.filter((event) => event.event_type === "operator_state_snapshot_recorded");
    const lastMonitoringPayload = monitoringEvents[monitoringEvents.length - 1]?.payload as Record<string, unknown>;
    const lastReasoningPayload = reasoningEvents[reasoningEvents.length - 1]?.payload as Record<string, unknown>;
    const lastOperatorPayload = operatorEvents[operatorEvents.length - 1]?.payload as Record<string, unknown>;

    expect(monitoringEvents.length).toBeGreaterThan(0);
    expect(lastMonitoringPayload.mode).toBe(snapshot.human_monitoring.mode);
    expect(lastMonitoringPayload.freshness_status).toBe(snapshot.human_monitoring.freshness_status);
    expect(lastMonitoringPayload.aggregate_confidence).toBe(snapshot.human_monitoring.aggregate_confidence);
    expect(lastMonitoringPayload.connected_source_count).toBe(snapshot.human_monitoring.connected_source_count);
    expect(lastMonitoringPayload.contributing_source_count).toBe(snapshot.human_monitoring.contributing_source_count);
    expect(lastMonitoringPayload.sources).toBeDefined();
    expect(lastMonitoringPayload.interpretation_input).toBeDefined();
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

  it("keeps the human-monitoring foundation wired into snapshot and log state on startup and tick advance", () => {
    const store = new AuraSessionStore({ session_index: 301, tick_duration_sec: 5 });
    const initialSnapshot = store.getSnapshot();

    expect(initialSnapshot.human_monitoring.mode).toBe("placeholder_compatibility");
    expect(initialSnapshot.human_monitoring.sources).toHaveLength(3);
    expect(initialSnapshot.human_monitoring.interpretation_input?.provenance).toBe("legacy_runtime_placeholder");
    expect(
      initialSnapshot.human_monitoring.sources.some((source) => source.source_kind === "interaction_telemetry"),
    ).toBe(true);
    expect(
      initialSnapshot.human_monitoring.sources.some(
        (source) => source.source_kind === "camera_cv" && source.availability === "not_connected",
      ),
    ).toBe(true);
    expect(initialSnapshot.events.some((event) => event.event_type === "human_monitoring_snapshot_recorded")).toBe(true);

    store.advanceTick();
    const nextSnapshot = store.getSnapshot();
    const latestMonitoringEvent = [...nextSnapshot.events]
      .reverse()
      .find((event) => event.event_type === "human_monitoring_snapshot_recorded");

    expect(nextSnapshot.human_monitoring.snapshot_id).toBe("hm_t0001");
    expect(nextSnapshot.plant_tick.source_event_ids).toContain(latestMonitoringEvent?.event_id);
  });

  it("publishes monitoring-only webcam refreshes without recomputing combined risk or support mode", () => {
    const store = new AuraSessionStore({ session_index: 322, tick_duration_sec: 5 });
    const before = store.getSnapshot();
    const beforeEventCount = before.events.length;

    store.setCameraCvIntent(true);
    store.recordCameraCvObservation({
      observation_kind: "stable_face",
      face_count: 1,
      strongest_face_confidence: 82,
      face_center_offset: 0.1,
      head_motion_delta: 0.08,
      face_area_ratio: 0.14,
      note: "single stable face for store test",
    });

    const after = store.getSnapshot();
    const cameraSource = after.human_monitoring.sources.find((source) => source.source_kind === "camera_cv");

    expect(cameraSource?.contributes_to_aggregate).toBe(true);
    expect(after.operator_state.signal_confidence).toBeGreaterThanOrEqual(before.operator_state.signal_confidence);
    expect(after.combined_risk.combined_risk_score).toBe(before.combined_risk.combined_risk_score);
    expect(after.support_mode).toBe(before.support_mode);
    expect(after.plant_tick.tick_id).toBe(before.plant_tick.tick_id);
    expect(after.events.length).toBeGreaterThan(beforeEventCount);
    expect(after.events.filter((event) => event.event_type === "human_monitoring_snapshot_recorded").length).toBeGreaterThan(
      before.events.filter((event) => event.event_type === "human_monitoring_snapshot_recorded").length,
    );
  });

  it("lets real UI interactions contribute through the canonical interaction telemetry source on the next tick", () => {
    const store = new AuraSessionStore({ session_index: 321, tick_duration_sec: 5 });
    render(<App store={store} autoRun={false} />);

    fireEvent.click(screen.getByRole("tab", { name: /Review/i }));
    fireEvent.click(screen.getByRole("tab", { name: /Operate/i }));
    fireEvent.change(screen.getByLabelText(/Feedwater Demand Target/i), {
      target: { value: "74" },
    });

    act(() => {
      store.advanceTick();
    });

    const snapshot = store.getSnapshot();
    const interactionSource = snapshot.human_monitoring.sources.find(
      (source) => source.source_kind === "interaction_telemetry",
    );

    expect(snapshot.human_monitoring.mode).toBe("live_sources");
    expect(snapshot.human_monitoring.interpretation_input?.contributing_source_ids).toContain(
      "interaction_telemetry",
    );
    expect(interactionSource?.contributes_to_aggregate).toBe(true);
    expect(interactionSource?.sample_count_in_window).toBeGreaterThan(0);
  });

  it("records telemetry-backed monitoring evidence into logs and completed review artifacts", () => {
    const snapshot = runSuccessfulSession().getSnapshot();
    const monitoringEvents = snapshot.events.filter((event) => event.event_type === "human_monitoring_snapshot_recorded");
    const lastMonitoringPayload = monitoringEvents[monitoringEvents.length - 1]?.payload as Record<string, unknown>;
    const reviewMonitoringHighlight = snapshot.completed_review?.highlights.find(
      (highlight) => highlight.kind === "human_monitoring",
    );

    expect(
      monitoringEvents.some((event) => {
        const payload = event.payload as Record<string, unknown>;
        return payload.mode === "live_sources";
      }),
    ).toBe(true);
    expect(Array.isArray(lastMonitoringPayload.sources)).toBe(true);
    expect(
      monitoringEvents.some((event) => {
        const payload = event.payload as Record<string, unknown>;
        const sources = payload.sources as Array<Record<string, unknown>> | undefined;
        return (
          Array.isArray(sources) &&
          sources.some(
            (source) =>
              source.source_kind === "interaction_telemetry" && source.contributes_to_aggregate === true,
          )
        );
      }),
    ).toBe(true);
    expect(reviewMonitoringHighlight?.detail).toMatch(/live monitoring sources contributed evidence during the run/i);
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

  it("renders Packet 5 posture legibility cues in the HMI", () => {
    const store = new AuraSessionStore({ session_index: 18, tick_duration_sec: 5 });
    render(<App store={store} autoRun={false} />);

    expect(screen.getByText("Support Posture")).toBeInTheDocument();
    expect(screen.getByTestId("assistance-posture-cue")).toBeInTheDocument();
    expect(screen.getAllByText(/Active posture/i).length).toBeGreaterThan(0);
    expect(screen.getByText(/Risk recommendation/i)).toBeInTheDocument();
    expect(screen.getAllByText(/What now/i).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/Mode effect/i).length).toBeGreaterThan(0);
    expect(screen.getByText(/Operator still controls/i)).toBeInTheDocument();
    expect(screen.getByText(/Why this posture/i)).toBeInTheDocument();
    expect(screen.getByText(/Top posture drivers/i)).toBeInTheDocument();
    expect(screen.getByText("Signal confidence")).toBeInTheDocument();
    expect(screen.getAllByText(/Combined risk/i).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/Critical visibility guardrails active/i).length).toBeGreaterThan(0);
  });

  it("keeps the baseline operator path calm and non-adaptive", () => {
    const store = new AuraSessionStore({ session_index: 118, tick_duration_sec: 5, session_mode: "baseline" });
    render(<App store={store} autoRun={false} />);

    expect(screen.getByTestId("assistance-posture-cue")).toBeInTheDocument();
    expect(screen.getByText(/Baseline run keeps monitoring only/i)).toBeInTheDocument();
    expect(screen.getByText(/Baseline posture locked/i)).toBeInTheDocument();
    expect(screen.getAllByText(/Baseline session/i).length).toBeGreaterThan(0);
    expect(screen.queryByText(/Guided Support is active now/i)).not.toBeInTheDocument();
  });

  it("renders the bounded soft-warning confirmation flow inside the existing shell", () => {
    const store = new AuraSessionStore({ session_index: 23, tick_duration_sec: 5 });

    for (let tick = 0; tick < 4; tick += 1) {
      store.advanceTick();
    }

    act(() => {
      store.requestAction({
        action_id: "act_adjust_feedwater",
        requested_value: 70,
        ui_region: "plant_mimic",
        reason_note: "HMI soft warning render test",
      });
    });

    render(<App store={store} autoRun={false} />);

    expect(screen.getByText(/Soft warning confirmation required/i)).toBeInTheDocument();
    expect(screen.getByText(/Confirm and apply action/i)).toBeInTheDocument();
    expect(screen.getAllByText(/Validation pending confirmation/i).length).toBeGreaterThan(0);
    expect(screen.getByText(/asking for explicit confirmation before this action proceeds/i)).toBeInTheDocument();
    expect(screen.getByText(/Last action validation/i)).toBeInTheDocument();
  });

  it("renders validator demo presets beside the bounded manual control", () => {
    const store = new AuraSessionStore({ session_index: 223, tick_duration_sec: 5 });
    render(<App store={store} autoRun={false} />);

    expect(screen.getByText(/Validator demo presets/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Show pass/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Show soft warning/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Show hard prevent/i })).toBeInTheDocument();
  });

  it("renders the operator-side supervisor override request affordance for eligible hard prevents", () => {
    const store = new AuraSessionStore({
      session_index: 224,
      tick_duration_sec: 5,
      scenario_id: "scn_main_steam_isolation_upset",
    });

    advanceUntil(
      store,
      (snapshot) =>
        Number(snapshot.plant_tick.plant_state.vessel_pressure_mpa) >= 7.42 ||
        Number(snapshot.plant_tick.plant_state.containment_pressure_kpa) >= 108 ||
        snapshot.alarm_set.active_alarm_ids.includes("ALM_CONTAINMENT_PRESSURE_HIGH") ||
        snapshot.alarm_set.active_alarm_ids.includes("ALM_SRV_STUCK_OPEN"),
      40,
    );

    store.requestAction({
      action_id: "act_adjust_isolation_condenser",
      requested_value: 48,
      ui_region: "plant_mimic",
      reason_note: "HMI override affordance test",
    });

    render(<App store={store} autoRun={false} />);

    expect(screen.getByText(/Supervisor review eligible/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Request Demo\/Research Supervisor Override/i })).toBeInTheDocument();
    openReviewWorkspace();
    expect(screen.getByText(/Validator demo checklist/i)).toBeInTheDocument();
  });

  it("renders supervisor decision controls after review has been requested", () => {
    const store = new AuraSessionStore({
      session_index: 225,
      tick_duration_sec: 5,
      scenario_id: "scn_main_steam_isolation_upset",
    });

    advanceUntil(
      store,
      (snapshot) =>
        Number(snapshot.plant_tick.plant_state.vessel_pressure_mpa) >= 7.42 ||
        Number(snapshot.plant_tick.plant_state.containment_pressure_kpa) >= 108 ||
        snapshot.alarm_set.active_alarm_ids.includes("ALM_CONTAINMENT_PRESSURE_HIGH") ||
        snapshot.alarm_set.active_alarm_ids.includes("ALM_SRV_STUCK_OPEN"),
      40,
    );

    store.requestAction({
      action_id: "act_adjust_isolation_condenser",
      requested_value: 48,
      ui_region: "plant_mimic",
      reason_note: "Supervisor decision controls render test",
    });
    store.requestSupervisorOverrideReview("Need bounded demo approval");

    render(<App store={store} autoRun={false} />);

    openReviewWorkspace();
    expect(screen.getByTestId("supervisor-override-card")).toBeInTheDocument();
    expect(screen.getByText(/Decision required/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/Supervisor note/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Approve one-shot override/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Deny override/i })).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText(/Supervisor note/i), {
      target: { value: "Bounded approval note" },
    });
    expect(screen.getByDisplayValue("Bounded approval note")).toBeInTheDocument();
  });

  it("keeps pass validation quiet while preserving the bounded operator regions", () => {
    const store = new AuraSessionStore({ session_index: 24, tick_duration_sec: 5 });

    for (let tick = 0; tick < 4; tick += 1) {
      store.advanceTick();
    }

    act(() => {
      store.requestAction({
        action_id: "act_adjust_feedwater",
        requested_value: 82,
        ui_region: "plant_mimic",
        reason_note: "Quiet pass render test",
      });
    });

    render(<App store={store} autoRun={false} />);

    expect(screen.queryByText(/Last action validation/i)).not.toBeInTheDocument();
    expect(screen.getByRole("heading", { name: /Next Actions/i })).toBeInTheDocument();
    expect(screen.getByText(/Support Posture/i)).toBeInTheDocument();
    expect(screen.getByText(/Alarm Board/i)).toBeInTheDocument();
  });

  it("makes protected-response hard prevents more prominent without hiding core regions", () => {
    const store = new AuraSessionStore({ session_index: 25, tick_duration_sec: 5 });

    for (let tick = 0; tick < 8; tick += 1) {
      store.advanceTick();
    }

    const protectedSnapshot = {
      ...store.getSnapshot(),
      session_mode: "adaptive" as const,
      outcome: undefined,
      last_validation_result: {
        validation_result_id: "val_9999",
        action_request_id: "actreq_9999",
        sim_time_sec: store.getSnapshot().sim_time_sec,
        outcome: "hard_prevent" as const,
        requires_confirmation: false,
        override_allowed: false,
        reason_code: "test_hard_prevent",
        explanation: "This deterministic hard prevent remains visible in protected response.",
        risk_context: "Protected Response is active and the bounded recovery path is being defended.",
        confidence_note: "Current runtime signals do not indicate degraded confidence limiting this decision.",
        affected_variable_ids: ["feedwater_flow_pct"],
        prevented_harm: true,
        nuisance_flag: false,
        recommended_safe_alternative: "Stay with the bounded recovery target.",
      },
    };
    const mockStore = {
      getSnapshot: () => protectedSnapshot,
      subscribe: () => () => undefined,
      requestAction: () => false,
      confirmPendingAction: () => false,
      dismissPendingActionConfirmation: () => undefined,
      recordInteractionTelemetry: () => undefined,
      setCameraCvIntent: () => undefined,
      updateCameraCvLifecycle: () => undefined,
      recordCameraCvObservation: () => undefined,
      setInteractionTelemetrySuppressed: () => undefined,
      advanceTick: () => protectedSnapshot,
      reset: () => undefined,
    } as unknown as AuraSessionStore;

    render(<App store={mockStore} autoRun={false} />);

    expect(protectedSnapshot.support_mode).toBe("protected_response");
    expect(screen.getAllByText(/Protected validation active/i).length).toBeGreaterThan(0);
    expect(screen.getByText(/Protected Response is elevating this validation result/i)).toBeInTheDocument();
    expect(screen.getByText(/Last action validation/i)).toBeInTheDocument();
    expect(screen.getByTestId("assistance-posture-cue")).toBeInTheDocument();
    expect(screen.getAllByText(/Protected Response is active now/i).length).toBeGreaterThan(0);
    expect(screen.getByText(/Critical variables and pinned alarms stay surfaced/i)).toBeInTheDocument();
    expect(screen.getByText(/Operator authority stays with you/i)).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: /Next Actions/i })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: /Storyline Board/i })).toBeInTheDocument();
  });

  it("renders the completed-session review panel after a terminal outcome", () => {
    const store = runSuccessfulSession();
    render(<App store={store} autoRun={false} />);
    openReviewWorkspace();
    expect(screen.getByTestId("completed-session-review")).toBeInTheDocument();
    expect(screen.getByTestId("kpi-summary-block")).toBeInTheDocument();
    expect(screen.getByTestId("adaptive-evidence-panel")).toBeInTheDocument();
    expect(screen.getByText(/Adaptive support evidence/i)).toBeInTheDocument();
    expect(screen.getByText(/Assistance trajectory/i)).toBeInTheDocument();
    expect(screen.getByText(/Human-monitoring posture/i)).toBeInTheDocument();
    expect(screen.getByText(/Completed run summary/i)).toBeInTheDocument();
  });

  it("renders evaluator export controls after a terminal outcome", () => {
    const store = runSuccessfulSession();
    render(<App store={store} autoRun={false} />);

    openReviewWorkspace();
    expect(screen.getByTestId("evaluation-action-bar")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Download session report/i })).toBeEnabled();
    expect(screen.getByRole("button", { name: /Download comparison report/i })).toBeDisabled();
  });

  it("keeps review artifacts off the default operator screen until the workspace is switched", () => {
    const store = runSuccessfulSession();
    render(<App store={store} autoRun={false} />);

    expect(screen.getByTestId("operate-workspace")).toBeInTheDocument();
    expect(screen.queryByTestId("evaluation-action-bar")).not.toBeInTheDocument();

    openReviewWorkspace();

    expect(screen.getByTestId("review-workspace")).toBeInTheDocument();
    expect(screen.getByTestId("evaluation-action-bar")).toBeInTheDocument();
  });

  it("keeps critical alarms visibly pinned in the alarm area when they are active", () => {
    const store = new AuraSessionStore({ session_index: 19, tick_duration_sec: 5 });
    for (let tick = 0; tick < 8; tick += 1) {
      store.advanceTick();
    }
    render(<App store={store} autoRun={false} />);

    expect(screen.getAllByText(/Pinned critical alarms/i).length).toBeGreaterThan(0);
    expect(screen.getAllByTestId("critical-alarm-chip").length).toBeGreaterThan(0);
  });

  it("uses a fresh log on reset with a deterministic per-run session id", () => {
    const store = new AuraSessionStore({ session_index: 42, tick_duration_sec: 5 });
    expect(store.getSnapshot().session_id).toMatch(/session_042_r1/);
    expect(store.getSnapshot().events.filter((e) => e.event_type === "session_started").length).toBe(1);
    store.reset({ session_mode: "adaptive" });
    expect(store.getSnapshot().session_id).toMatch(/session_042_r2/);
    expect(store.getSnapshot().events.filter((e) => e.event_type === "session_started").length).toBe(1);
  });

  it("retains evaluation_capture for baseline and adaptive across reset", () => {
    const store = new AuraSessionStore({ session_index: 43, tick_duration_sec: 5, session_mode: "baseline" });
    store.runUntilComplete(100);
    const s1 = store.getSnapshot();
    const scenarioKey = `${s1.scenario.scenario_id}@${s1.scenario.version}`;
    expect(s1.evaluation_capture?.[scenarioKey]?.baseline_completed).toBeDefined();
    expect(s1.evaluation_capture?.[scenarioKey]?.adaptive_completed).toBeUndefined();
    store.reset({ session_mode: "adaptive" });
    store.runUntilComplete(100);
    const s2 = store.getSnapshot();
    expect(s2.evaluation_capture?.[scenarioKey]?.baseline_completed).toBeDefined();
    expect(s2.evaluation_capture?.[scenarioKey]?.adaptive_completed).toBeDefined();
  });

  it("does not mutate completed review or evaluation capture after terminal advanceTick calls", () => {
    const store = new AuraSessionStore({ session_index: 143, tick_duration_sec: 5, session_mode: "baseline" });
    store.runUntilComplete(100);

    const before = store.getSnapshot();
    const scenarioKey = `${before.scenario.scenario_id}@${before.scenario.version}`;
    const beforeReview = before.completed_review;
    const beforeCapture = before.evaluation_capture?.[scenarioKey]?.baseline_completed;

    const after = store.advanceTick();

    expect(after.completed_review).toEqual(beforeReview);
    expect(after.evaluation_capture?.[scenarioKey]?.baseline_completed).toEqual(beforeCapture);
    expect(after.events).toEqual(before.events);
  });

  it("renders session comparison when both modes have completed captures", () => {
    const store = new AuraSessionStore({ session_index: 44, tick_duration_sec: 5, session_mode: "baseline" });
    store.runUntilComplete(100);
    store.reset({ session_mode: "adaptive" });
    store.runUntilComplete(100);
    render(<App store={store} autoRun={false} />);
    openReviewWorkspace();
    expect(screen.getByTestId("session-run-comparison")).toBeInTheDocument();
    expect(screen.getByText(/Judge-facing summary/i)).toBeInTheDocument();
  });

  it("applies next-run scenario and session mode together on reset", () => {
    const store = new AuraSessionStore({ session_index: 45, tick_duration_sec: 5 });

    store.advanceTick();
    store.requestAction({
      action_id: "act_ack_alarm",
      ui_region: "alarm_area",
      reason_note: "pre-reset confirmation",
    });
    expect(store.getSnapshot().executed_actions).toHaveLength(1);

    store.reset({
      session_mode: "baseline",
      scenario_id: "scn_loss_of_offsite_power_sbo",
    });

    const snapshot = store.getSnapshot();
    expect(snapshot.session_mode).toBe("baseline");
    expect(snapshot.scenario.scenario_id).toBe("scn_loss_of_offsite_power_sbo");
    expect(snapshot.executed_actions).toHaveLength(0);
    expect(snapshot.pending_action_confirmation).toBeUndefined();
    expect(snapshot.events.find((event) => event.event_type === "session_started")?.payload.session_mode).toBe("baseline");
  });

  it("runs Scenario B deterministically on the bounded successful recovery path", () => {
    const first = summarizeStore(runSuccessfulLoopSession());
    const second = summarizeStore(runSuccessfulLoopSession());

    expect(first).toEqual(second);
    expect(first.outcome?.outcome).toBe("success");
  });

  it("runs Scenario C deterministically on the bounded successful recovery path", () => {
    const first = summarizeStore(runSuccessfulMainSteamIsolationSession());
    const second = summarizeStore(runSuccessfulMainSteamIsolationSession());

    expect(first).toEqual(second);
    expect(first.outcome?.outcome).toBe("success");
  });

  it("reaches a non-success terminal state in Scenario C without corrective IC action", () => {
    const store = new AuraSessionStore({
      session_index: 212,
      tick_duration_sec: 5,
      scenario_id: "scn_main_steam_isolation_upset",
    });
    const finalSnapshot = store.runUntilComplete(90);

    expect(finalSnapshot.outcome).toBeDefined();
    expect(finalSnapshot.outcome?.outcome).not.toBe("success");
    expect(finalSnapshot.completed_review).toBeDefined();
    expect(finalSnapshot.reasoning_snapshot.dominant_hypothesis_id).toBeDefined();
  });

  it("keeps Scenario C free of LoOP storyline drift and surfaces the IC recovery lane after onset", () => {
    const store = new AuraSessionStore({
      session_index: 213,
      tick_duration_sec: 5,
      scenario_id: "scn_main_steam_isolation_upset",
    });

    for (let tick = 0; tick < 6; tick += 1) {
      store.advanceTick();
    }

    const snapshot = store.getSnapshot();
    const itemIds = snapshot.first_response_lane.items.map((item) => item.item_id);

    expect(snapshot.alarm_set.active_alarm_ids).not.toContain("ALM_OFFSITE_POWER_LOSS");
    expect(snapshot.reasoning_snapshot.dominant_hypothesis_id).not.toBe("hyp_loss_of_offsite_power");
    expect(snapshot.reasoning_snapshot.dominant_hypothesis_id).toBe("hyp_main_steam_isolation_upset");
    expect(itemIds).toContain("msi_action_ic_align");
    expect(snapshot.first_response_lane.prototype_notice).toMatch(/steam-isolation scenario/i);
  });

  it("keeps scenario comparison buckets separate between Scenario A and Scenario B", () => {
    const store = new AuraSessionStore({ session_index: 46, tick_duration_sec: 5, session_mode: "baseline" });
    store.runUntilComplete(100);
    store.reset({ session_mode: "adaptive" });
    store.runUntilComplete(100);

    store.reset({ session_mode: "baseline", scenario_id: "scn_loss_of_offsite_power_sbo" });
    store.runUntilComplete(100);
    store.reset({ session_mode: "adaptive", scenario_id: "scn_loss_of_offsite_power_sbo" });
    store.runUntilComplete(100);

    const capture = store.getSnapshot().evaluation_capture ?? {};
    expect(capture["scn_alarm_cascade_root_cause@1.0.0"]?.baseline_completed).toBeDefined();
    expect(capture["scn_alarm_cascade_root_cause@1.0.0"]?.adaptive_completed).toBeDefined();
    expect(capture["scn_loss_of_offsite_power_sbo@1.0.0"]?.baseline_completed).toBeDefined();
    expect(capture["scn_loss_of_offsite_power_sbo@1.0.0"]?.adaptive_completed).toBeDefined();
  });

  it("keeps scenario comparison buckets separate across Scenario A, B, and C", () => {
    const store = new AuraSessionStore({ session_index: 146, tick_duration_sec: 5, session_mode: "baseline" });
    store.runUntilComplete(100);
    store.reset({ session_mode: "adaptive" });
    store.runUntilComplete(100);

    store.reset({ session_mode: "baseline", scenario_id: "scn_loss_of_offsite_power_sbo" });
    store.runUntilComplete(100);
    store.reset({ session_mode: "adaptive", scenario_id: "scn_loss_of_offsite_power_sbo" });
    store.runUntilComplete(100);

    store.reset({ session_mode: "baseline", scenario_id: "scn_main_steam_isolation_upset" });
    store.runUntilComplete(100);
    store.reset({ session_mode: "adaptive", scenario_id: "scn_main_steam_isolation_upset" });
    store.runUntilComplete(100);

    const capture = store.getSnapshot().evaluation_capture ?? {};
    expect(capture["scn_alarm_cascade_root_cause@1.0.0"]?.baseline_completed).toBeDefined();
    expect(capture["scn_alarm_cascade_root_cause@1.0.0"]?.adaptive_completed).toBeDefined();
    expect(capture["scn_loss_of_offsite_power_sbo@1.0.0"]?.baseline_completed).toBeDefined();
    expect(capture["scn_loss_of_offsite_power_sbo@1.0.0"]?.adaptive_completed).toBeDefined();
    expect(capture["scn_main_steam_isolation_upset@1.0.0"]?.baseline_completed).toBeDefined();
    expect(capture["scn_main_steam_isolation_upset@1.0.0"]?.adaptive_completed).toBeDefined();
  });

  it("renders scenario selection and the Scenario B IC control in the HMI", () => {
    const store = new AuraSessionStore({
      session_index: 47,
      tick_duration_sec: 5,
      scenario_id: "scn_loss_of_offsite_power_sbo",
    });

    render(<App store={store} autoRun={false} />);

    expect(screen.getByLabelText(/Next scenario/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/Next run/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/Isolation Condenser Demand Target/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Apply IC alignment/i })).toBeInTheDocument();
    expect(screen.queryByLabelText(/Feedwater Demand Target/i)).not.toBeInTheDocument();
  });

  it("renders Scenario C selection state and the steam-isolation IC control in the HMI", () => {
    const store = new AuraSessionStore({
      session_index: 147,
      tick_duration_sec: 5,
      scenario_id: "scn_main_steam_isolation_upset",
    });

    render(<App store={store} autoRun={false} />);

    expect(screen.getByRole("heading", { name: /Main Steam Isolation Upset/i })).toBeInTheDocument();
    expect(screen.getByLabelText(/Next scenario/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/Isolation Condenser Demand Target/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Apply IC recovery alignment/i })).toBeInTheDocument();
  });

  it("auto-opens the refreshed tutorial when only the legacy dismissal key exists", () => {
    installTutorialDomMocks();
    window.localStorage.clear();
    window.localStorage.setItem("aura-idcr.tutorial.v1.dismissed", "true");

    render(<App />);

    expect(screen.getByLabelText(/Tutorial launcher/i)).toBeInTheDocument();
    expect(screen.getByText(/Runtime paused for onboarding/i)).toBeInTheDocument();
  });

  it("honors the v2 dismissal key on default-app loads", () => {
    installTutorialDomMocks();
    window.localStorage.clear();
    window.localStorage.setItem("aura-idcr.tutorial.v2.dismissed", "true");

    render(<App />);

    expect(screen.queryByLabelText(/Tutorial launcher/i)).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Tutorial guide/i })).toBeInTheDocument();
  });

  it("resets the full tutorial to the intro scenario and locks progression until the required step action completes", () => {
    vi.useFakeTimers();
    installTutorialDomMocks();
    window.localStorage.clear();
    const store = new AuraSessionStore({
      session_index: 301,
      tick_duration_sec: 5,
      scenario_id: "scn_main_steam_isolation_upset",
    });

    render(<App store={store} autoRun={false} />);

    openTutorialGuideMenu();
    startTutorialPath(/Start Full guided walkthrough/i);

    expect(store.getSnapshot().scenario.scenario_id).toBe("scn_alarm_cascade_root_cause");

    fireEvent.click(screen.getByRole("button", { name: /^Next$/i }));
    fireEvent.click(screen.getByRole("button", { name: /^Next$/i }));

    const nextButton = screen.getByRole("button", { name: /^Next$/i });
    expect(screen.getByRole("heading", { name: /Start, pause, resume, step, and reset/i })).toBeInTheDocument();
    expect(nextButton).toBeDisabled();

    fireEvent.click(screen.getByRole("button", { name: /Advance one tick/i }));
    act(() => {
      vi.advanceTimersByTime(300);
    });

    expect(screen.getByRole("heading", { name: /Read the screen in three questions/i })).toBeInTheDocument();
    vi.useRealTimers();
  });

  it("pauses guided pace at checkpoints and turns the run controls into clearer resume actions", () => {
    vi.useFakeTimers();
    const store = new AuraSessionStore({ session_index: 302, tick_duration_sec: 5 });

    render(<App store={store} autoRun={false} />);

    fireEvent.click(screen.getByRole("button", { name: /Run guided pace/i }));
    act(() => {
      vi.advanceTimersByTime(7000);
    });

    expect(screen.getByText(/Checkpoint pause:/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Resume guided pace/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Resume live pace/i })).toBeInTheDocument();
    vi.useRealTimers();
  });

  it("preserves the current scenario state for the review tutorial while guiding the user into Review", () => {
    vi.useFakeTimers();
    installTutorialDomMocks();
    const store = new AuraSessionStore({
      session_index: 303,
      tick_duration_sec: 5,
      scenario_id: "scn_main_steam_isolation_upset",
    });

    store.advanceTick();
    store.advanceTick();

    render(<App store={store} autoRun={false} />);

    openTutorialGuideMenu();
    startTutorialPath(/Start Review workspace tour/i);

    expect(store.getSnapshot().scenario.scenario_id).toBe("scn_main_steam_isolation_upset");
    expect(screen.getByRole("heading", { name: /Why Review is separate/i })).toBeInTheDocument();
    expect(screen.getByText(/Open the Review workspace\./i)).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: /Review/i })).toBeEnabled();
    expect(screen.getByRole("button", { name: /^Next$/i })).toBeDisabled();

    fireEvent.click(screen.getByRole("tab", { name: /Review/i }));
    act(() => {
      vi.advanceTimersByTime(300);
    });

    expect(screen.getByTestId("review-workspace")).toBeInTheDocument();
    expect(screen.getByText(/bounded oversight layer for interventions, event traceability, and demo markers/i)).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: /Why Review is separate/i })).not.toBeInTheDocument();
    expect(store.getSnapshot().scenario.scenario_id).toBe("scn_main_steam_isolation_upset");
    vi.useRealTimers();
  });
});

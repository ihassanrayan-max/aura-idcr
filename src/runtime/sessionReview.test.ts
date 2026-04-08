import { AuraSessionStore } from "../state/sessionStore";
import { buildCompletedSessionReview } from "./sessionReview";
import { computeKpiSummary } from "./kpiSummary";

function runSuccessfulSession(): AuraSessionStore {
  const store = new AuraSessionStore({ session_index: 101, tick_duration_sec: 5 });
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

function runSupervisorOverrideSession(): AuraSessionStore {
  const store = new AuraSessionStore({
    session_index: 102,
    tick_duration_sec: 5,
    scenario_id: "scn_main_steam_isolation_upset",
  });

  let guard = 0;
  while (
    !(
      Number(store.getSnapshot().plant_tick.plant_state.vessel_pressure_mpa) >= 7.42 ||
      Number(store.getSnapshot().plant_tick.plant_state.containment_pressure_kpa) >= 108 ||
      store.getSnapshot().alarm_set.active_alarm_ids.includes("ALM_CONTAINMENT_PRESSURE_HIGH") ||
      store.getSnapshot().alarm_set.active_alarm_ids.includes("ALM_SRV_STUCK_OPEN")
    ) &&
    guard < 40
  ) {
    store.advanceTick();
    guard += 1;
  }

  store.requestAction({
    action_id: "act_adjust_isolation_condenser",
    requested_value: 48,
    ui_region: "plant_mimic",
    reason_note: "Deterministic override review test",
  });
  store.requestSupervisorOverrideReview("Bounded demo request");
  store.approvePendingSupervisorOverride("Bounded supervisor approval");
  store.runUntilComplete(90);
  return store;
}

describe("buildCompletedSessionReview", () => {
  it("is deterministic for the same canonical session data", () => {
    const a = runSuccessfulSession().getSnapshot();
    const b = runSuccessfulSession().getSnapshot();

    const ka = buildCompletedSessionReview({
      session_id: a.session_id,
      session_mode: a.session_mode,
      scenario: {
        scenario_id: a.scenario.scenario_id,
        version: a.scenario.version,
        title: a.scenario.title,
      },
      outcome: a.outcome!,
      kpi_summary: a.kpi_summary!,
      events: a.events,
    });
    const kb = buildCompletedSessionReview({
      session_id: b.session_id,
      session_mode: b.session_mode,
      scenario: {
        scenario_id: b.scenario.scenario_id,
        version: b.scenario.version,
        title: b.scenario.title,
      },
      outcome: b.outcome!,
      kpi_summary: b.kpi_summary!,
      events: b.events,
    });

    expect(ka).toEqual(kb);
    expect(ka.schema_version).toBe(1);
    expect(ka.key_events.length).toBeGreaterThan(0);
    expect(ka.milestones.map((m) => m.kind)).toContain("session_start");
    expect(ka.milestones.map((m) => m.kind)).toContain("terminal_outcome");
    expect(ka.highlights.some((h) => h.kind === "outcome")).toBe(true);
    expect(ka.key_events.some((event) => event.event_type === "human_monitoring_snapshot_recorded")).toBe(true);
    expect(ka.highlights.some((highlight) => highlight.kind === "human_monitoring")).toBe(true);
    expect(
      ka.key_events.find((event) => event.event_type === "human_monitoring_snapshot_recorded")?.summary,
    ).toMatch(/Contributing sources:/i);
    expect(ka.highlights.find((highlight) => highlight.kind === "human_monitoring")?.detail).toMatch(/freshness/i);
    expect(ka.highlights.find((highlight) => highlight.kind === "human_monitoring")?.detail).toMatch(
      /live monitoring sources contributed evidence during the run/i,
    );
  });

  it("always includes terminal key events at the end of the key timeline", () => {
    const s = runSuccessfulSession().getSnapshot();
    const review = buildCompletedSessionReview({
      session_id: s.session_id,
      session_mode: s.session_mode,
      scenario: {
        scenario_id: s.scenario.scenario_id,
        version: s.scenario.version,
        title: s.scenario.title,
      },
      outcome: s.outcome!,
      kpi_summary: s.kpi_summary!,
      events: s.events,
    });

    const types = review.key_events.map((e) => e.event_type);
    const lastThree = types.slice(-3);
    expect(lastThree).toEqual(["scenario_outcome_recorded", "session_ended", "kpi_summary_generated"]);
  });

  it("matches KPI summary passed in (same as computeKpiSummary output)", () => {
    const store = runSuccessfulSession();
    const s = store.getSnapshot();
    const recomputed = computeKpiSummary(s.events, {
      session_id: s.session_id,
      scenario_id: s.scenario.scenario_id,
      session_mode: s.session_mode,
      generated_at_sim_time_sec: s.kpi_summary!.generated_at_sim_time_sec,
    });
    const review = buildCompletedSessionReview({
      session_id: s.session_id,
      session_mode: s.session_mode,
      scenario: {
        scenario_id: s.scenario.scenario_id,
        version: s.scenario.version,
        title: s.scenario.title,
      },
      outcome: s.outcome!,
      kpi_summary: recomputed,
      events: s.events,
    });
    expect(review.kpi_summary.kpi_summary_id).toBe(recomputed.kpi_summary_id);
  });

  it("surfaces supervisor override milestones and demo markers in the completed review", () => {
    const snapshot = runSupervisorOverrideSession().getSnapshot();
    const review = buildCompletedSessionReview({
      session_id: snapshot.session_id,
      session_mode: snapshot.session_mode,
      scenario: {
        scenario_id: snapshot.scenario.scenario_id,
        version: snapshot.scenario.version,
        title: snapshot.scenario.title,
      },
      outcome: snapshot.outcome!,
      kpi_summary: snapshot.kpi_summary!,
      events: snapshot.events,
    });

    expect(review.key_events.map((event) => event.event_type)).toContain("supervisor_override_requested");
    expect(review.key_events.map((event) => event.event_type)).toContain("supervisor_override_decided");
    expect(review.key_events.map((event) => event.event_type)).toContain("supervisor_override_action_applied");
    expect(review.key_events.map((event) => event.event_type)).toContain("validation_demo_marker_recorded");
    expect(review.milestones.map((milestone) => milestone.kind)).toContain("supervisor_override");
    expect(review.highlights.find((highlight) => highlight.kind === "intervention")?.detail).toMatch(
      /Supervisor overrides applied: 1/i,
    );
  });
});

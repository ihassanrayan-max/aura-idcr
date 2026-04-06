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
      generated_at_iso: s.kpi_summary!.generated_at_iso,
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
});

import type { SessionLogEvent } from "../contracts/aura";
import { computeKpiSummary } from "./kpiSummary";

function evt(
  type: SessionLogEvent["event_type"],
  sim_time_sec: number,
  payload: Record<string, unknown>,
): SessionLogEvent {
  return {
    event_id: `evt_${sim_time_sec}`,
    session_id: "session_001",
    scenario_id: "scn_test",
    sim_time_sec,
    event_type: type,
    source_module: "evaluation",
    payload,
    trace_refs: [],
  };
}

describe("computeKpiSummary", () => {
  it("computes demo KPIs from canonical events", () => {
    const events: SessionLogEvent[] = [
      evt("session_started", 0, { session_mode: "adaptive", scenario_id: "scn_test", expected_outcome_window_sec: 600 }),
      evt("operator_state_snapshot_recorded", 5, { workload_index: 44, attention_stability_index: 80, signal_confidence: 90 }),
      evt("operator_state_snapshot_recorded", 10, { workload_index: 72, attention_stability_index: 78, signal_confidence: 88 }),
      evt("diagnosis_committed", 20, { diagnosis_id: "hyp_a", matches_expected_root_cause: true }),
      evt("action_validated", 25, {
        action_request_id: "a1",
        outcome: "hard_prevent",
        reason_code: "x",
        prevented_harm: true,
        nuisance_flag: false,
        requires_confirmation: false,
        override_allowed: false,
      }),
      evt("alarm_set_updated", 30, { active_alarm_count: 8, active_alarm_cluster_count: 2 }),
      evt("reasoning_snapshot_published", 35, { top_hypothesis_id: "hyp_a" }),
      evt("reasoning_snapshot_published", 40, { top_hypothesis_id: "hyp_a" }),
      evt("reasoning_snapshot_published", 45, { top_hypothesis_id: "hyp_a" }),
      evt("operator_action_applied", 50, {
        action_id: "act_adjust_feedwater",
        action_class: "critical",
        correctness_label: "harmful_or_incorrect",
        resulting_state_change: {},
      }),
      evt("operator_action_applied", 55, {
        action_id: "act_adjust_feedwater",
        action_class: "critical",
        correctness_label: "correct_recovery",
        resulting_state_change: {},
      }),
      evt("scenario_outcome_recorded", 120, {
        outcome: "success",
        success: true,
        failure_reason: "",
        stabilized: true,
      }),
    ];

    const summary = computeKpiSummary(events, {
      session_id: "session_001",
      scenario_id: "scn_test",
      session_mode: "adaptive",
      generated_at_sim_time_sec: 120,
    });

    expect(summary.completeness).toBe("complete");
    expect(summary.metrics.find((m) => m.kpi_id === "diagnosis_time_sec")?.value).toBe(20);
    expect(summary.metrics.find((m) => m.kpi_id === "response_stabilization_time_sec")?.value).toBe(120);
    expect(summary.metrics.find((m) => m.kpi_id === "workload_peak_index")?.value).toBe(72);
    expect(summary.metrics.find((m) => m.kpi_id === "harmful_actions_prevented_count")?.value).toBe(1);
    expect(summary.metrics.find((m) => m.kpi_id === "critical_action_error_rate")?.value).toBe(0.5);
  });

  it("marks completeness partial without terminal outcome", () => {
    const events: SessionLogEvent[] = [
      evt("session_started", 0, { session_mode: "baseline", scenario_id: "scn_test", expected_outcome_window_sec: 600 }),
    ];
    const summary = computeKpiSummary(events, {
      session_id: "session_001",
      scenario_id: "scn_test",
      session_mode: "baseline",
      generated_at_sim_time_sec: 0,
    });
    expect(summary.completeness).toBe("partial");
  });

  it("marks stable recovery unavailable when the run does not stabilize", () => {
    const events: SessionLogEvent[] = [
      evt("session_started", 0, { session_mode: "adaptive", scenario_id: "scn_test", expected_outcome_window_sec: 600 }),
      evt("scenario_outcome_recorded", 75, {
        outcome: "failure",
        success: false,
        failure_reason: "missed recovery",
        stabilized: false,
      }),
    ];

    const summary = computeKpiSummary(events, {
      session_id: "session_001",
      scenario_id: "scn_test",
      session_mode: "adaptive",
      generated_at_sim_time_sec: 75,
    });

    expect(summary.metrics.find((m) => m.kpi_id === "response_stabilization_time_sec")).toMatchObject({
      value_status: "unavailable",
      unavailable_reason: "Stable recovery was not achieved in this run.",
    });
  });
});

import type { CompletedSessionReview, KpiSummary } from "../contracts/aura";
import { buildSessionRunComparison } from "./sessionComparison";

function makeKpiSummary(overrides: Partial<KpiSummary> & Pick<KpiSummary, "session_id" | "session_mode">): KpiSummary {
  const metrics = overrides.metrics ?? [
    {
      kpi_id: "diagnosis_time_sec",
      label: "Time to correct diagnosis",
      value: 100,
      unit: "sec",
      audience: "demo_facing" as const,
      dependency_event_types: ["session_started", "diagnosis_committed"],
    },
    {
      kpi_id: "response_stabilization_time_sec",
      label: "Time to stable recovery",
      value: 200,
      unit: "sec",
      audience: "demo_facing" as const,
      dependency_event_types: ["session_started", "scenario_outcome_recorded"],
    },
    {
      kpi_id: "critical_action_error_rate",
      label: "Critical action error rate",
      value: 0,
      unit: "ratio",
      audience: "demo_facing" as const,
      dependency_event_types: ["operator_action_applied"],
    },
    {
      kpi_id: "harmful_actions_prevented_count",
      label: "Harmful actions prevented (hard prevent)",
      value: 0,
      unit: "count",
      audience: "demo_facing" as const,
      dependency_event_types: ["action_validated"],
    },
    {
      kpi_id: "workload_peak_index",
      label: "Peak workload index",
      value: 40,
      unit: "index",
      audience: "demo_facing" as const,
      dependency_event_types: ["operator_state_snapshot_recorded"],
    },
  ];
  return {
    kpi_summary_id: overrides.kpi_summary_id ?? "kpi_test",
    session_id: overrides.session_id,
    scenario_id: overrides.scenario_id ?? "scn_x",
    session_mode: overrides.session_mode,
    generated_at_iso: overrides.generated_at_iso ?? "1970-01-01T00:00:00.000Z",
    completeness: overrides.completeness ?? "complete",
    metrics,
  };
}

function makeReview(params: {
  session_id: string;
  session_mode: "baseline" | "adaptive";
  outcome: "success" | "failure" | "timeout";
  completion_sim_time_sec: number;
  diagnosis_sec?: number;
  stabilization_sec?: number;
  scenario_id?: string;
  scenario_version?: string;
}): CompletedSessionReview {
  const kpi = makeKpiSummary({
    session_id: params.session_id,
    session_mode: params.session_mode,
    metrics: [
      {
        kpi_id: "diagnosis_time_sec",
        label: "Time to correct diagnosis",
        value: params.diagnosis_sec ?? 100,
        unit: "sec",
        audience: "demo_facing",
        dependency_event_types: ["session_started", "diagnosis_committed"],
      },
      {
        kpi_id: "response_stabilization_time_sec",
        label: "Time to stable recovery",
        value: params.stabilization_sec ?? params.completion_sim_time_sec,
        unit: "sec",
        audience: "demo_facing",
        dependency_event_types: ["session_started", "scenario_outcome_recorded"],
      },
      {
        kpi_id: "critical_action_error_rate",
        label: "Critical action error rate",
        value: 0,
        unit: "ratio",
        audience: "demo_facing",
        dependency_event_types: ["operator_action_applied"],
      },
      {
        kpi_id: "harmful_actions_prevented_count",
        label: "Harmful actions prevented (hard prevent)",
        value: 0,
        unit: "count",
        audience: "demo_facing",
        dependency_event_types: ["action_validated"],
      },
      {
        kpi_id: "workload_peak_index",
        label: "Peak workload index",
        value: 40,
        unit: "index",
        audience: "demo_facing",
        dependency_event_types: ["operator_state_snapshot_recorded"],
      },
    ],
  });

  return {
    schema_version: 1,
    session_id: params.session_id,
    session_mode: params.session_mode,
    scenario_id: params.scenario_id ?? "scn_alarm_cascade_root_cause",
    scenario_version: params.scenario_version ?? "1",
    scenario_title: "Test scenario",
    terminal_outcome: {
      outcome: params.outcome,
      stabilized: params.outcome === "success",
      message: "msg",
      sim_time_sec: params.completion_sim_time_sec,
    },
    completion_sim_time_sec: params.completion_sim_time_sec,
    kpi_summary: kpi,
    key_events: [],
    milestones: [
      {
        milestone_id: "m1",
        kind: "session_start",
        sim_time_sec: 0,
        label: "Start",
        detail: "",
        source_event_id: "e1",
      },
      {
        milestone_id: "m2",
        kind: "terminal_outcome",
        sim_time_sec: params.completion_sim_time_sec,
        label: "End",
        detail: "",
        source_event_id: "e2",
      },
    ],
    highlights: [],
  };
}

describe("buildSessionRunComparison", () => {
  it("marks invalid when scenario_id differs", () => {
    const b = makeReview({ session_id: "s1", session_mode: "baseline", outcome: "success", completion_sim_time_sec: 300 });
    const a = makeReview({
      session_id: "s2",
      session_mode: "adaptive",
      outcome: "success",
      completion_sim_time_sec: 280,
      scenario_id: "other_scn",
    });
    const c = buildSessionRunComparison(b, a);
    expect(c.valid).toBe(false);
    expect(c.mismatch_reason).toBeDefined();
    expect(c.judge_summary.overall_favors).toBe("inconclusive");
    expect(c.kpi_deltas).toHaveLength(0);
  });

  it("computes delta as adaptive minus baseline for paired KPIs", () => {
    const b = makeReview({
      session_id: "s1",
      session_mode: "baseline",
      outcome: "success",
      completion_sim_time_sec: 400,
      diagnosis_sec: 120,
      stabilization_sec: 400,
    });
    const a = makeReview({
      session_id: "s2",
      session_mode: "adaptive",
      outcome: "success",
      completion_sim_time_sec: 350,
      diagnosis_sec: 90,
      stabilization_sec: 350,
    });
    const c = buildSessionRunComparison(b, a);
    expect(c.valid).toBe(true);
    const diag = c.kpi_deltas.find((d) => d.kpi_id === "diagnosis_time_sec");
    expect(diag?.delta).toBe(-30);
    expect(diag?.favors).toBe("adaptive");
    expect(c.completion_sim_time_sec_delta).toBe(-50);
  });

  it("is deterministic for the same inputs", () => {
    const b = makeReview({ session_id: "sb", session_mode: "baseline", outcome: "timeout", completion_sim_time_sec: 600 });
    const a = makeReview({ session_id: "sa", session_mode: "adaptive", outcome: "timeout", completion_sim_time_sec: 600 });
    const c1 = buildSessionRunComparison(b, a);
    const c2 = buildSessionRunComparison(b, a);
    expect(c1).toEqual(c2);
  });

  it("prefers higher outcome rank in judge headline path", () => {
    const b = makeReview({ session_id: "b", session_mode: "baseline", outcome: "failure", completion_sim_time_sec: 100 });
    const a = makeReview({ session_id: "a", session_mode: "adaptive", outcome: "success", completion_sim_time_sec: 300 });
    const c = buildSessionRunComparison(b, a);
    expect(c.valid).toBe(true);
    expect(c.judge_summary.overall_favors).toBe("adaptive");
  });
});

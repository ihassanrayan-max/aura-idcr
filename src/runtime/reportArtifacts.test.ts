import type { CompletedSessionReview, KpiSummary } from "../contracts/aura";
import { buildComparisonReportArtifact, buildSessionAfterActionReport } from "./reportArtifacts";
import { buildSessionRunComparison } from "./sessionComparison";
import { buildReportFilename, serializeReportArtifact } from "./reportExport";

function makeKpiSummary(session_id: string, session_mode: "baseline" | "adaptive"): KpiSummary {
  return {
    kpi_summary_id: `kpi_${session_id}`,
    session_id,
    scenario_id: "scn_alarm_cascade_root_cause",
    session_mode,
    generated_at_iso: "t+180s sim time",
    generated_at_sim_time_sec: 180,
    completeness: "complete",
    metrics: [
      {
        kpi_id: "diagnosis_time_sec",
        label: "Time to correct diagnosis",
        value: 90,
        value_status: "measured",
        unit: "sec",
        audience: "demo_facing",
        dependency_event_types: ["session_started", "diagnosis_committed"],
      },
      {
        kpi_id: "response_stabilization_time_sec",
        label: "Time to stable recovery",
        value: 180,
        value_status: "measured",
        unit: "sec",
        audience: "demo_facing",
        dependency_event_types: ["session_started", "scenario_outcome_recorded"],
      },
    ],
  };
}

function makeReview(session_id: string, session_mode: "baseline" | "adaptive"): CompletedSessionReview {
  return {
    schema_version: 1,
    session_id,
    session_mode,
    scenario_id: "scn_alarm_cascade_root_cause",
    scenario_version: "1.0.0",
    scenario_title: "Alarm cascade",
    terminal_outcome: {
      outcome: "success",
      stabilized: true,
      message: "Recovered",
      sim_time_sec: 180,
    },
    completion_sim_time_sec: 180,
    kpi_summary: makeKpiSummary(session_id, session_mode),
    key_events: [
      {
        sequence: 0,
        source_event_id: "evt_1",
        sim_time_sec: 0,
        event_type: "session_started",
        title: "Session started",
        summary: "Runtime initialized.",
      },
    ],
    milestones: [
      {
        milestone_id: "ms_1",
        kind: "session_start",
        sim_time_sec: 0,
        label: "Session start",
        detail: "Runtime logging active.",
        source_event_id: "evt_1",
      },
    ],
    highlights: [
      {
        highlight_id: "hl_1",
        kind: "outcome",
        label: "Run result",
        detail: "SUCCESS at t+180s.",
      },
    ],
  };
}

describe("report artifacts", () => {
  it("builds a deterministic session after-action report", () => {
    const review = makeReview("session_001_r1", "adaptive");
    const reportA = buildSessionAfterActionReport(review);
    const reportB = buildSessionAfterActionReport(review);

    expect(reportA).toEqual(reportB);
    expect(reportA.provenance.derived_from).toBe("CompletedSessionReview");
    expect(buildReportFilename(reportA)).toContain("after_action.json");
  });

  it("builds a deterministic comparison report artifact", () => {
    const baseline = makeReview("session_001_r1", "baseline");
    const adaptive = makeReview("session_001_r2", "adaptive");
    adaptive.kpi_summary.metrics = adaptive.kpi_summary.metrics.map((metric) =>
      metric.kpi_id === "diagnosis_time_sec" ? { ...metric, value: 70 } : metric,
    );

    const comparison = buildSessionRunComparison(baseline, adaptive);
    const artifactA = buildComparisonReportArtifact({
      comparison,
      baseline_review: baseline,
      adaptive_review: adaptive,
    });
    const artifactB = buildComparisonReportArtifact({
      comparison,
      baseline_review: baseline,
      adaptive_review: adaptive,
    });

    expect(artifactA).toEqual(artifactB);
    expect(artifactA.provenance.derived_from).toBe("SessionRunComparison");
    expect(buildReportFilename(artifactA)).toContain("comparison.json");
  });

  it("serializes comparison artifacts with schema and provenance", () => {
    const baseline = makeReview("session_001_r1", "baseline");
    const adaptive = makeReview("session_001_r2", "adaptive");
    const comparison = buildSessionRunComparison(baseline, adaptive);
    const artifact = buildComparisonReportArtifact({
      comparison,
      baseline_review: baseline,
      adaptive_review: adaptive,
    });

    expect(serializeReportArtifact(artifact)).toContain('"schema_version": 1');
    expect(serializeReportArtifact(artifact)).toContain('"derived_from": "SessionRunComparison"');
  });
});

import type {
  ComparisonReportArtifact,
  CompletedSessionReview,
  ReportSummaryBlock,
  SessionAfterActionReport,
  SessionRunComparison,
} from "../contracts/aura";

function judgeRunLabel(mode: CompletedSessionReview["session_mode"]): string {
  return mode === "baseline" ? "Baseline run" : "AURA-assisted (adaptive) run";
}

function buildSessionSummaryBlock(review: CompletedSessionReview): ReportSummaryBlock {
  const proof_points = (review.proof_points ?? []).slice(0, 3).map((proof) => `${proof.label}: ${proof.detail}`);
  const outcomeWord = review.terminal_outcome.outcome.toUpperCase();
  const notable_points = [
    `Mode: ${judgeRunLabel(review.session_mode)}.`,
    `Outcome at t+${review.completion_sim_time_sec}s sim time.`,
    ...(proof_points.length > 0
      ? proof_points
      : review.highlights.slice(0, 3).map((highlight) => `${highlight.label}: ${highlight.detail}`)),
  ];

  return {
    headline: `${review.scenario_title} ${judgeRunLabel(review.session_mode)} ${outcomeWord}.`,
    outcome_line: `${review.terminal_outcome.outcome} at t+${review.completion_sim_time_sec}s sim time${
      review.terminal_outcome.stabilized ? " with stable recovery achieved." : "."
    }`,
    notable_points,
  };
}

export function buildSessionAfterActionReport(review: CompletedSessionReview): SessionAfterActionReport {
  return {
    artifact_kind: "session_after_action_report",
    schema_version: 1,
    report_id: `report_${review.session_id}`.replace(/[^a-zA-Z0-9_.-]/g, "_"),
    scenario: {
      scenario_id: review.scenario_id,
      scenario_version: review.scenario_version,
      scenario_title: review.scenario_title,
    },
    run: {
      session_id: review.session_id,
      session_mode: review.session_mode,
      terminal_outcome: review.terminal_outcome,
      completion_sim_time_sec: review.completion_sim_time_sec,
    },
    summary_block: buildSessionSummaryBlock(review),
    kpi_summary: review.kpi_summary,
    milestones: review.milestones,
    highlights: review.highlights,
    proof_points: review.proof_points ?? [],
    timeline: review.key_events,
    provenance: {
      derived_from: "CompletedSessionReview",
      comparison_compatible: review.kpi_summary.completeness === "complete",
    },
  };
}

export function buildComparisonReportArtifact(params: {
  comparison: SessionRunComparison;
  baseline_review: CompletedSessionReview;
  adaptive_review: CompletedSessionReview;
}): ComparisonReportArtifact {
  const { comparison, baseline_review, adaptive_review } = params;

  return {
    artifact_kind: "session_comparison_report",
    schema_version: 1,
    comparison_id: comparison.comparison_id,
    scenario: {
      scenario_id: comparison.scenario_id,
      scenario_version: comparison.scenario_version,
      scenario_title: comparison.scenario_title,
    },
    baseline_run: {
      session_id: comparison.baseline_session_id,
      outcome: comparison.baseline_outcome,
      stabilized: comparison.baseline_stabilized,
      completion_sim_time_sec: baseline_review.completion_sim_time_sec,
    },
    adaptive_run: {
      session_id: comparison.adaptive_session_id,
      outcome: comparison.adaptive_outcome,
      stabilized: comparison.adaptive_stabilized,
      completion_sim_time_sec: adaptive_review.completion_sim_time_sec,
    },
    judge_summary: comparison.judge_summary,
    proof_summary: comparison.proof_summary,
    kpi_rows: comparison.kpi_deltas,
    milestone_kind_counts: comparison.milestone_kind_counts,
    interpretation_lines: comparison.interpretation_lines,
    source_run_summaries: {
      baseline_summary_block: buildSessionSummaryBlock(baseline_review),
      adaptive_summary_block: buildSessionSummaryBlock(adaptive_review),
    },
    provenance: {
      derived_from: "SessionRunComparison",
      valid: comparison.valid,
      ...(comparison.mismatch_reason ? { mismatch_reason: comparison.mismatch_reason } : {}),
    },
  };
}

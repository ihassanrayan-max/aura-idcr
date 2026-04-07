import type {
  CompletedSessionReview,
  CompletedSessionReviewMilestoneKind,
  SessionRunComparison,
  SessionRunComparisonJudgeSummary,
  SessionRunComparisonKpiDelta,
  SessionRunComparisonMilestoneKindCount,
} from "../contracts/aura";

/** Delta = adaptive.value - baseline.value (see SessionRunComparisonKpiDelta.delta). */
const KPI_LOWER_IS_BETTER: Record<string, boolean> = {
  diagnosis_time_sec: true,
  response_stabilization_time_sec: true,
  critical_action_error_rate: true,
  workload_peak_index: true,
  nuisance_intervention_fraction: true,
  alarm_compression_ratio: true,
  top_cause_stability_pct: false,
  harmful_actions_prevented_count: false,
};

const MILESTONE_KIND_ORDER: CompletedSessionReviewMilestoneKind[] = [
  "session_start",
  "phase_entry",
  "diagnosis",
  "support_escalation",
  "validator_intervention",
  "operator_action",
  "terminal_outcome",
];

function outcomeRank(outcome: SessionRunComparison["baseline_outcome"]): number {
  if (outcome === "success") {
    return 2;
  }
  if (outcome === "timeout") {
    return 1;
  }
  return 0;
}

function countMilestonesByKind(
  milestones: CompletedSessionReview["milestones"],
): Map<CompletedSessionReviewMilestoneKind, number> {
  const map = new Map<CompletedSessionReviewMilestoneKind, number>();
  for (const m of milestones) {
    map.set(m.kind, (map.get(m.kind) ?? 0) + 1);
  }
  return map;
}

function favorForMetric(
  baseline_status: SessionRunComparisonKpiDelta["baseline_value_status"],
  adaptive_status: SessionRunComparisonKpiDelta["adaptive_value_status"],
  baseline_value: number,
  adaptive_value: number,
  lower_is_better: boolean,
): SessionRunComparisonKpiDelta["favors"] {
  if (baseline_status !== "measured" || adaptive_status !== "measured") {
    return "not_comparable";
  }
  if (baseline_value === adaptive_value) {
    return "tie";
  }
  const baselineBetter = lower_is_better ? baseline_value < adaptive_value : baseline_value > adaptive_value;
  const adaptiveBetter = lower_is_better ? adaptive_value < baseline_value : adaptive_value > baseline_value;
  if (baselineBetter) {
    return "baseline";
  }
  if (adaptiveBetter) {
    return "adaptive";
  }
  return "not_comparable";
}

function metricValueLabel(
  value: number,
  unit: string,
  status: SessionRunComparisonKpiDelta["baseline_value_status"],
  unavailable_reason?: string,
): string {
  if (status !== "measured") {
    return unavailable_reason ? `N/A (${unavailable_reason})` : "N/A";
  }
  return `${value} ${unit}`;
}

function buildJudgeSummary(params: {
  valid: boolean;
  baseline: CompletedSessionReview;
  adaptive: CompletedSessionReview;
  kpi_deltas: SessionRunComparisonKpiDelta[];
  baseline_outcome_rank: number;
  adaptive_outcome_rank: number;
}): SessionRunComparisonJudgeSummary {
  const { kpi_deltas, baseline_outcome_rank, adaptive_outcome_rank } = params;

  if (!params.valid) {
    return {
      overall_favors: "inconclusive",
      headline: "Comparison could not be completed for these two runs.",
      metric_bullets: [],
      why_it_matters:
        "Matched runs must use the same scenario_id and version so KPIs and milestones refer to the same event context.",
    };
  }

  const demoDeltas = kpi_deltas.filter((d) =>
    [
      "diagnosis_time_sec",
      "response_stabilization_time_sec",
      "critical_action_error_rate",
      "harmful_actions_prevented_count",
      "workload_peak_index",
    ].includes(d.kpi_id),
  );

  let overall: SessionRunComparisonJudgeSummary["overall_favors"] = "tie";
  if (baseline_outcome_rank !== adaptive_outcome_rank) {
    overall = baseline_outcome_rank > adaptive_outcome_rank ? "baseline" : "adaptive";
  } else if (baseline_outcome_rank === 2) {
    const timeRow = kpi_deltas.find((d) => d.kpi_id === "response_stabilization_time_sec");
    const diagRow = kpi_deltas.find((d) => d.kpi_id === "diagnosis_time_sec");
    const bTime = timeRow?.baseline_value_status === "measured" ? timeRow.baseline_value : undefined;
    const aTime = timeRow?.adaptive_value_status === "measured" ? timeRow.adaptive_value : undefined;
    const bDiag = diagRow?.baseline_value_status === "measured" ? diagRow.baseline_value : undefined;
    const aDiag = diagRow?.adaptive_value_status === "measured" ? diagRow.adaptive_value : undefined;
    const adaptiveLeads =
      ((aTime !== undefined && bTime !== undefined && aTime < bTime) ||
        (aDiag !== undefined && bDiag !== undefined && aDiag < bDiag)) &&
      !((bTime !== undefined && aTime !== undefined && bTime < aTime) ||
        (bDiag !== undefined && aDiag !== undefined && bDiag < aDiag));
    const baselineLeads =
      ((bTime !== undefined && aTime !== undefined && bTime < aTime) ||
        (bDiag !== undefined && aDiag !== undefined && bDiag < aDiag)) &&
      !((aTime !== undefined && bTime !== undefined && aTime < bTime) ||
        (aDiag !== undefined && bDiag !== undefined && aDiag < bDiag));
    if (adaptiveLeads && !baselineLeads) {
      overall = "adaptive";
    } else if (baselineLeads && !adaptiveLeads) {
      overall = "baseline";
    } else if (aTime === bTime && aDiag === bDiag) {
      overall = "tie";
    } else {
      overall = "mixed";
    }
  }

  const metric_bullets: string[] = [];
  for (const d of demoDeltas) {
    if (d.favors === "not_comparable") {
      metric_bullets.push(
        `${d.label}: not comparable in this observed pair (${metricValueLabel(d.baseline_value, d.unit, d.baseline_value_status, d.baseline_unavailable_reason)} vs ${metricValueLabel(d.adaptive_value, d.unit, d.adaptive_value_status, d.adaptive_unavailable_reason)}).`,
      );
    } else if (d.favors === "tie") {
      metric_bullets.push(
        `${d.label}: same value in both observed runs (${metricValueLabel(d.baseline_value, d.unit, d.baseline_value_status)}).`,
      );
    } else {
      const winner = d.favors === "baseline" ? "Baseline" : "Adaptive";
      metric_bullets.push(
        `${d.label}: ${winner} (${metricValueLabel(d.baseline_value, d.unit, d.baseline_value_status)} vs ${metricValueLabel(d.adaptive_value, d.unit, d.adaptive_value_status)}; delta ${d.delta === null ? "N/A" : `${d.delta >= 0 ? "+" : ""}${d.delta.toFixed(4)}`}).`,
      );
    }
  }

  const headline =
    overall === "adaptive"
      ? `On this observed pair, the adaptive run matched or exceeded the baseline run on key evaluation signals.`
      : overall === "baseline"
        ? `On this observed pair, the baseline run matched or exceeded the adaptive run on key evaluation signals.`
        : overall === "mixed"
          ? `Results are mixed: each mode led on different metrics in this observed pair.`
          : `The two runs performed similarly on the summarized metrics in this observed pair.`;

  const why_it_matters =
    "These metrics summarize time-to-diagnosis, recovery, workload, safety-related actions, and assistance-specific signals for this prototype session. They support a structured before/after story for judges; they describe what happened in these runs, not a controlled experiment.";

  return {
    overall_favors: overall,
    headline,
    metric_bullets,
    why_it_matters,
  };
}

export function buildSessionRunComparison(
  baseline: CompletedSessionReview,
  adaptive: CompletedSessionReview,
): SessionRunComparison {
  const scenario_id = baseline.scenario_id;
  const valid = baseline.scenario_id === adaptive.scenario_id && baseline.scenario_version === adaptive.scenario_version;

  const comparison_id = `cmp_${scenario_id}_${baseline.session_id}_vs_${adaptive.session_id}`.replace(/[^a-zA-Z0-9_.-]/g, "_");

  if (!valid) {
    const judge_summary = buildJudgeSummary({
      valid: false,
      baseline,
      adaptive,
      kpi_deltas: [],
      baseline_outcome_rank: 0,
      adaptive_outcome_rank: 0,
    });
    return {
      schema_version: 1,
      comparison_id,
      scenario_id: baseline.scenario_id,
      scenario_version: baseline.scenario_version,
      scenario_title: baseline.scenario_title,
      valid: false,
      mismatch_reason: "scenario_id or scenario_version does not match between reviews",
      baseline_session_id: baseline.session_id,
      adaptive_session_id: adaptive.session_id,
      baseline_outcome: baseline.terminal_outcome.outcome,
      adaptive_outcome: adaptive.terminal_outcome.outcome,
      baseline_stabilized: baseline.terminal_outcome.stabilized,
      adaptive_stabilized: adaptive.terminal_outcome.stabilized,
      completion_sim_time_sec_delta: adaptive.completion_sim_time_sec - baseline.completion_sim_time_sec,
      kpi_deltas: [],
      milestone_kind_counts: [],
      key_event_count_baseline: baseline.key_events.length,
      key_event_count_adaptive: adaptive.key_events.length,
      interpretation_lines: [
        "Cannot compare KPIs or milestones across different scenarios or versions.",
        "Run both modes on the same scenario and version, then reset between captures.",
      ],
      judge_summary,
    };
  }

  const baselineById = new Map(baseline.kpi_summary.metrics.map((m) => [m.kpi_id, m]));
  const adaptiveById = new Map(adaptive.kpi_summary.metrics.map((m) => [m.kpi_id, m]));

  const kpi_deltas: SessionRunComparisonKpiDelta[] = [];
  const allIds = [...new Set([...baselineById.keys(), ...adaptiveById.keys()])].sort((a, b) => a.localeCompare(b));

  for (const kpi_id of allIds) {
    const bm = baselineById.get(kpi_id);
    const am = adaptiveById.get(kpi_id);
    if (!bm || !am) {
      continue;
    }
    const lower_is_better = KPI_LOWER_IS_BETTER[kpi_id] ?? true;
    const delta = bm.value_status === "measured" && am.value_status === "measured" ? am.value - bm.value : Number.NaN;
    kpi_deltas.push({
      kpi_id,
      label: bm.label,
      unit: bm.unit,
      baseline_value: bm.value,
      adaptive_value: am.value,
      baseline_value_status: bm.value_status,
      adaptive_value_status: am.value_status,
      ...(bm.unavailable_reason ? { baseline_unavailable_reason: bm.unavailable_reason } : {}),
      ...(am.unavailable_reason ? { adaptive_unavailable_reason: am.unavailable_reason } : {}),
      delta,
      lower_is_better,
      favors: favorForMetric(bm.value_status, am.value_status, bm.value, am.value, lower_is_better),
    });
  }

  const bc = countMilestonesByKind(baseline.milestones);
  const ac = countMilestonesByKind(adaptive.milestones);
  const milestone_kind_counts: SessionRunComparisonMilestoneKindCount[] = MILESTONE_KIND_ORDER.map((kind) => ({
    kind,
    baseline_count: bc.get(kind) ?? 0,
    adaptive_count: ac.get(kind) ?? 0,
  })).filter((row) => row.baseline_count > 0 || row.adaptive_count > 0);

  const baseline_outcome_rank = outcomeRank(baseline.terminal_outcome.outcome);
  const adaptive_outcome_rank = outcomeRank(adaptive.terminal_outcome.outcome);

  const interpretation_lines: string[] = [];

  interpretation_lines.push(
    `Outcome: baseline ${baseline.terminal_outcome.outcome} (stabilized: ${baseline.terminal_outcome.stabilized}), adaptive ${adaptive.terminal_outcome.outcome} (stabilized: ${adaptive.terminal_outcome.stabilized}).`,
  );

  interpretation_lines.push(
    `Completion time: baseline t+${baseline.completion_sim_time_sec}s, adaptive t+${adaptive.completion_sim_time_sec}s (delta ${adaptive.completion_sim_time_sec - baseline.completion_sim_time_sec >= 0 ? "+" : ""}${adaptive.completion_sim_time_sec - baseline.completion_sim_time_sec}s).`,
  );

  const escB = bc.get("support_escalation") ?? 0;
  const escA = ac.get("support_escalation") ?? 0;
  const valB = bc.get("validator_intervention") ?? 0;
  const valA = ac.get("validator_intervention") ?? 0;
  if (escB !== escA || valB !== valA) {
    interpretation_lines.push(
      `Assistance / validation milestones: support_escalation baseline ${escB} vs adaptive ${escA}; validator_intervention baseline ${valB} vs adaptive ${valA}.`,
    );
  }

  interpretation_lines.push(
    `Key events indexed: baseline ${baseline.key_events.length}, adaptive ${adaptive.key_events.length} (bounded replay lists differ if the run paths differ).`,
  );

  const judge_summary = buildJudgeSummary({
    valid: true,
    baseline,
    adaptive,
    kpi_deltas,
    baseline_outcome_rank,
    adaptive_outcome_rank,
  });

  return {
    schema_version: 1,
    comparison_id,
    scenario_id,
    scenario_version: baseline.scenario_version,
    scenario_title: baseline.scenario_title,
    valid: true,
    baseline_session_id: baseline.session_id,
    adaptive_session_id: adaptive.session_id,
    baseline_outcome: baseline.terminal_outcome.outcome,
    adaptive_outcome: adaptive.terminal_outcome.outcome,
    baseline_stabilized: baseline.terminal_outcome.stabilized,
    adaptive_stabilized: adaptive.terminal_outcome.stabilized,
    completion_sim_time_sec_delta: adaptive.completion_sim_time_sec - baseline.completion_sim_time_sec,
    kpi_deltas,
    milestone_kind_counts,
    key_event_count_baseline: baseline.key_events.length,
    key_event_count_adaptive: adaptive.key_events.length,
    interpretation_lines,
    judge_summary,
  };
}

import type { KpiMetric, KpiSummary, SessionLogEvent, SessionMode, SessionLogEventType } from "../contracts/aura";

type ComputeKpiSummaryParams = {
  session_id: string;
  scenario_id: string;
  session_mode: SessionMode;
  generated_at_iso: string;
};

function metric(
  kpi_id: string,
  label: string,
  value: number,
  unit: string,
  audience: KpiMetric["audience"],
  dependency_event_types: SessionLogEventType[],
): KpiMetric {
  return { kpi_id, label, value, unit, audience, dependency_event_types };
}

export function computeKpiSummary(events: SessionLogEvent[], params: ComputeKpiSummaryParams): KpiSummary {
  const session_started = events.find((event) => event.event_type === "session_started");
  const scenario_outcome = events.find((event) => event.event_type === "scenario_outcome_recorded");
  const session_start_sec = session_started?.sim_time_sec ?? 0;

  const completeness: KpiSummary["completeness"] =
    session_started && scenario_outcome ? "complete" : "partial";

  const diagnosis_events = events.filter((event) => event.event_type === "diagnosis_committed");
  const first_matching_diagnosis = diagnosis_events.find((event) => {
    const payload = event.payload as { matches_expected_root_cause?: boolean };
    return payload.matches_expected_root_cause === true;
  });
  const diagnosis_time_sec =
    first_matching_diagnosis && session_started !== undefined
      ? Math.max(0, first_matching_diagnosis.sim_time_sec - session_start_sec)
      : 0;

  const outcome_payload = scenario_outcome?.payload as
    | { success?: boolean; stabilized?: boolean }
    | undefined;
  const stabilization_eligible =
    scenario_outcome && outcome_payload?.success === true && outcome_payload?.stabilized === true;
  const response_stabilization_time_sec =
    stabilization_eligible && session_started !== undefined
      ? Math.max(0, scenario_outcome!.sim_time_sec - session_start_sec)
      : 0;

  const applied = events.filter((event) => event.event_type === "operator_action_applied");
  const critical_applied = applied.filter((event) => {
    const payload = event.payload as { action_class?: string };
    return payload.action_class === "critical";
  });
  const harmful_critical = critical_applied.filter((event) => {
    const payload = event.payload as { correctness_label?: string };
    return payload.correctness_label === "harmful_or_incorrect";
  });
  const critical_action_error_rate =
    critical_applied.length > 0 ? harmful_critical.length / critical_applied.length : 0;

  const validations = events.filter((event) => event.event_type === "action_validated");
  const harmful_prevented = validations.filter((event) => {
    const payload = event.payload as { outcome?: string; prevented_harm?: boolean };
    return payload.outcome === "hard_prevent" && payload.prevented_harm === true;
  });
  const harmful_actions_prevented_count = harmful_prevented.length;

  const operator_snapshots = events.filter((event) => event.event_type === "operator_state_snapshot_recorded");
  const workload_values = operator_snapshots.map((event) => {
    const payload = event.payload as { workload_index?: number };
    return typeof payload.workload_index === "number" ? payload.workload_index : 0;
  });
  const workload_peak_index = workload_values.length > 0 ? Math.max(...workload_values) : 0;

  const alarm_updates = events.filter((event) => event.event_type === "alarm_set_updated");
  const compression_ratios = alarm_updates.map((event) => {
    const payload = event.payload as { active_alarm_count?: number; active_alarm_cluster_count?: number };
    const count = typeof payload.active_alarm_count === "number" ? payload.active_alarm_count : 0;
    const clusters = typeof payload.active_alarm_cluster_count === "number" ? payload.active_alarm_cluster_count : 1;
    return count / Math.max(clusters, 1);
  });
  const alarm_compression_ratio =
    compression_ratios.length > 0
      ? compression_ratios.reduce((total, value) => total + value, 0) / compression_ratios.length
      : 0;

  const reasoning_snapshots = events.filter((event) => event.event_type === "reasoning_snapshot_published");
  let top_cause_stability_pct = 0;
  if (reasoning_snapshots.length > 3) {
    const slice = reasoning_snapshots.slice(2);
    let matches = 0;
    let comparisons = 0;
    let previous_top: string | undefined;
    for (const event of slice) {
      const payload = event.payload as { top_hypothesis_id?: string };
      const top = payload.top_hypothesis_id;
      if (previous_top !== undefined && top !== undefined) {
        comparisons += 1;
        if (top === previous_top) {
          matches += 1;
        }
      }
      previous_top = top;
    }
    top_cause_stability_pct = comparisons > 0 ? (matches / comparisons) * 100 : 0;
  }

  const non_pass_validations = validations.filter((event) => {
    const payload = event.payload as { outcome?: string };
    return payload.outcome && payload.outcome !== "pass";
  });
  const nuisance_non_pass = non_pass_validations.filter((event) => {
    const payload = event.payload as { nuisance_flag?: boolean };
    return payload.nuisance_flag === true;
  });
  const nuisance_intervention_fraction =
    non_pass_validations.length > 0 ? nuisance_non_pass.length / non_pass_validations.length : 0;

  const metrics: KpiMetric[] = [
    metric(
      "diagnosis_time_sec",
      "Time to correct diagnosis",
      diagnosis_time_sec,
      "sec",
      "demo_facing",
      ["session_started", "diagnosis_committed"],
    ),
    metric(
      "response_stabilization_time_sec",
      "Time to stable recovery",
      response_stabilization_time_sec,
      "sec",
      "demo_facing",
      ["session_started", "scenario_outcome_recorded"],
    ),
    metric(
      "critical_action_error_rate",
      "Critical action error rate",
      critical_action_error_rate,
      "ratio",
      "demo_facing",
      ["operator_action_applied"],
    ),
    metric(
      "harmful_actions_prevented_count",
      "Harmful actions prevented (hard prevent)",
      harmful_actions_prevented_count,
      "count",
      "demo_facing",
      ["action_validated"],
    ),
    metric(
      "workload_peak_index",
      "Peak workload index",
      workload_peak_index,
      "index",
      "demo_facing",
      ["operator_state_snapshot_recorded"],
    ),
    metric(
      "alarm_compression_ratio",
      "Alarm compression ratio (avg)",
      Number(alarm_compression_ratio.toFixed(4)),
      "ratio",
      "internal_only",
      ["alarm_set_updated"],
    ),
    metric(
      "top_cause_stability_pct",
      "Top-cause stability (post-convergence window)",
      Number(top_cause_stability_pct.toFixed(2)),
      "percent",
      "internal_only",
      ["reasoning_snapshot_published"],
    ),
    metric(
      "nuisance_intervention_fraction",
      "Nuisance intervention fraction",
      Number(nuisance_intervention_fraction.toFixed(4)),
      "ratio",
      "internal_only",
      ["action_validated"],
    ),
  ];

  const kpi_summary_id = `kpi_${params.session_id}_${params.generated_at_iso.replace(/[:.]/g, "-")}`;

  return {
    kpi_summary_id,
    session_id: params.session_id,
    scenario_id: params.scenario_id,
    session_mode: params.session_mode,
    generated_at_iso: params.generated_at_iso,
    completeness,
    metrics,
  };
}

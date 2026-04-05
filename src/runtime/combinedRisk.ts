import type {
  AlarmIntelligenceSnapshot,
  AlarmSet,
  CombinedRiskBand,
  CombinedRiskFactor,
  CombinedRiskSnapshot,
  OperatorStateSnapshot,
  PlantStateSnapshot,
  ReasoningSnapshot,
} from "../contracts/aura";
import { clamp } from "../data/plantModel";
import { calculateDiagnosisAmbiguityIndex, calculatePlantSeverityIndex } from "./operatorState";

type BuildCombinedRiskParams = {
  plant_state: PlantStateSnapshot;
  alarm_set: AlarmSet;
  alarm_intelligence: AlarmIntelligenceSnapshot;
  reasoning_snapshot: ReasoningSnapshot;
  operator_state: OperatorStateSnapshot;
  previous_combined_risk?: CombinedRiskSnapshot;
};

function roundScore(value: number): number {
  return Number(clamp(value, 0, 100).toFixed(1));
}

function scoreBand(score: number): CombinedRiskBand {
  if (score >= 70) {
    return "high";
  }

  if (score >= 45) {
    return "elevated";
  }

  if (score >= 25) {
    return "guarded";
  }

  return "low";
}

function numberValue(value: PlantStateSnapshot[string]): number {
  return typeof value === "number" ? value : Number(value);
}

function describePlantSeverity(plant_state: PlantStateSnapshot): string {
  const concerns: string[] = [];

  if (numberValue(plant_state.vessel_water_level_m) < 6.8) {
    concerns.push("vessel level is out of band");
  }

  if (numberValue(plant_state.vessel_pressure_mpa) > 7.35) {
    concerns.push("pressure is climbing");
  }

  if (Boolean(plant_state.safety_relief_valve_open)) {
    concerns.push("SRV relief is active");
  }

  if (Boolean(plant_state.reactor_trip_active)) {
    concerns.push("trip consequences are active");
  }

  if (numberValue(plant_state.containment_pressure_kpa) > 106) {
    concerns.push("containment pressure is elevated");
  }

  if (concerns.length === 0) {
    return "Primary plant cues remain inside the bounded watch band.";
  }

  return `Primary plant cues show that ${concerns.slice(0, 2).join(" and ")}.`;
}

function calculateAlarmBurdenIndex(alarm_set: AlarmSet, alarm_intelligence: AlarmIntelligenceSnapshot): number {
  const p1_count = alarm_set.active_alarms.filter((alarm) => alarm.priority === "P1").length;
  const p2_count = alarm_set.active_alarms.filter((alarm) => alarm.priority === "P2").length;
  const compression_penalty = clamp((alarm_intelligence.compression_ratio - 1) * 6, 0, 10);

  return Math.round(
    clamp(
      alarm_set.active_alarm_count * 7 +
        alarm_intelligence.grouped_alarm_count * 8 +
        p1_count * 10 +
        p2_count * 4 +
        compression_penalty,
      0,
      100,
    ),
  );
}

function describeAlarmBurden(alarm_set: AlarmSet, alarm_intelligence: AlarmIntelligenceSnapshot): string {
  return `${alarm_set.active_alarm_count} active alarms are compressing into ${alarm_intelligence.grouped_alarm_count} visible clusters.`;
}

function describeDiagnosis(reasoning_snapshot: ReasoningSnapshot): string {
  const top_label = reasoning_snapshot.ranked_hypotheses[0]?.label ?? "monitoring only";
  return reasoning_snapshot.changed_since_last_tick
    ? `The dominant storyline changed this tick and ${top_label.toLowerCase()} is still settling.`
    : `${top_label} has been stable for ${reasoning_snapshot.stable_for_ticks} ticks.`;
}

function joinLabels(labels: string[]): string {
  if (labels.length <= 1) {
    return labels[0] ?? "bounded cues";
  }

  if (labels.length === 2) {
    return `${labels[0]} and ${labels[1]}`;
  }

  return `${labels[0]}, ${labels[1]}, and ${labels[2]}`;
}

function buildChangeSummary(
  current_factors: CombinedRiskFactor[],
  current_score: number,
  previous_combined_risk: CombinedRiskSnapshot | undefined,
): string {
  if (!previous_combined_risk) {
    return "Initial combined-risk snapshot established.";
  }

  const delta = roundScore(current_score - previous_combined_risk.combined_risk_score);
  if (Math.abs(delta) < 2.5) {
    return `Risk is steady; ${current_factors[0]?.label.toLowerCase() ?? "the current drivers"} remain the main driver.`;
  }

  const previous_by_id = Object.fromEntries(
    previous_combined_risk.factor_breakdown.map((factor) => [factor.factor_id, factor]),
  ) as Record<string, CombinedRiskFactor>;
  const strongest_shift = [...current_factors]
    .map((factor) => ({
      factor,
      contribution_delta: roundScore(factor.contribution - (previous_by_id[factor.factor_id]?.contribution ?? 0)),
    }))
    .sort((left, right) => Math.abs(right.contribution_delta) - Math.abs(left.contribution_delta))[0];

  if (delta > 0) {
    return `Risk rose ${delta.toFixed(1)} points because ${strongest_shift.factor.label.toLowerCase()} increased.`;
  }

  return `Risk eased ${Math.abs(delta).toFixed(1)} points because ${strongest_shift.factor.label.toLowerCase()} eased.`;
}

export function buildCombinedRiskSnapshot(params: BuildCombinedRiskParams): CombinedRiskSnapshot {
  const plant_severity_index = calculatePlantSeverityIndex(params.plant_state);
  const alarm_burden_index = calculateAlarmBurdenIndex(params.alarm_set, params.alarm_intelligence);
  const diagnosis_uncertainty_index = calculateDiagnosisAmbiguityIndex(params.reasoning_snapshot);
  const attention_instability_index = Math.round(clamp(100 - params.operator_state.attention_stability_index, 0, 100));
  const signal_confidence_penalty_index = Math.round(
    clamp(100 - params.operator_state.signal_confidence + (params.operator_state.degraded_mode_active ? 8 : 0), 0, 100),
  );

  const factor_breakdown = [
    {
      factor_id: "plant_severity",
      label: "Plant severity",
      raw_index: plant_severity_index,
      contribution: roundScore(plant_severity_index * 0.34),
      detail: describePlantSeverity(params.plant_state),
    },
    {
      factor_id: "alarm_burden",
      label: "Alarm burden",
      raw_index: alarm_burden_index,
      contribution: roundScore(alarm_burden_index * 0.22),
      detail: describeAlarmBurden(params.alarm_set, params.alarm_intelligence),
    },
    {
      factor_id: "diagnosis_uncertainty",
      label: "Diagnosis uncertainty",
      raw_index: diagnosis_uncertainty_index,
      contribution: roundScore(diagnosis_uncertainty_index * 0.16),
      detail: describeDiagnosis(params.reasoning_snapshot),
    },
    {
      factor_id: "operator_workload",
      label: "Operator workload",
      raw_index: params.operator_state.workload_index,
      contribution: roundScore(params.operator_state.workload_index * 0.14),
      detail: `Workload proxy is ${params.operator_state.workload_index}/100 from current alarm, plant, and interaction strain cues.`,
    },
    {
      factor_id: "attention_instability",
      label: "Attention instability",
      raw_index: attention_instability_index,
      contribution: roundScore(attention_instability_index * 0.08),
      detail: `Attention stability is ${params.operator_state.attention_stability_index}/100, so instability pressure is ${attention_instability_index}/100.`,
    },
    {
      factor_id: "signal_confidence_penalty",
      label: "Signal confidence penalty",
      raw_index: signal_confidence_penalty_index,
      contribution: roundScore(signal_confidence_penalty_index * 0.06),
      detail: params.operator_state.degraded_mode_active
        ? params.operator_state.degraded_mode_reason
        : `Signal confidence is ${params.operator_state.signal_confidence}/100.`,
    },
  ].sort((left, right) => right.contribution - left.contribution) as CombinedRiskFactor[];

  const combined_risk_score = roundScore(
    factor_breakdown.reduce((total, factor) => total + factor.contribution, 0),
  );
  const combined_risk_band = scoreBand(combined_risk_score);
  const top_contributing_factors = factor_breakdown.slice(0, 3).map((factor) => factor.label);
  const confidence_caveat = params.operator_state.degraded_mode_active
    ? `Degraded proxy confidence: ${params.operator_state.degraded_mode_reason}`
    : `Signal confidence ${params.operator_state.signal_confidence}/100 from current runtime and session cues.`;

  return {
    combined_risk_score,
    combined_risk_band,
    factor_breakdown,
    top_contributing_factors,
    why_risk_is_current: `Combined risk is ${combined_risk_band} because ${joinLabels(
      top_contributing_factors.slice(0, 2),
    ).toLowerCase()} are the strongest current drivers.`,
    what_changed: buildChangeSummary(
      factor_breakdown,
      combined_risk_score,
      params.previous_combined_risk,
    ),
    confidence_caveat,
  };
}

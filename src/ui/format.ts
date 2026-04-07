import type { KpiMetric, SessionRunComparisonKpiDelta } from "../contracts/aura";
import { variableLabels } from "../data/plantModel";

export type StatusTone = "ok" | "neutral" | "alert";

export function formatValue(value: number | boolean | string, unit?: string): string {
  if (typeof value === "boolean") {
    return value ? "Available" : "Unavailable";
  }

  if (typeof value === "number") {
    const digits = Math.abs(value) >= 100 ? 0 : value % 1 === 0 ? 0 : 2;
    return `${value.toFixed(digits)}${unit ? ` ${unit}` : ""}`;
  }

  return value;
}

export function formatClock(simTimeSec: number): string {
  const minutes = Math.floor(simTimeSec / 60);
  const seconds = simTimeSec % 60;
  return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
}

export function formatSignalLabel(signalId: string): string {
  const labels = variableLabels as Record<string, string>;
  return labels[signalId] ?? signalId.replace(/_/g, " ");
}

export function riskBadgeTone(riskBand: "low" | "guarded" | "elevated" | "high"): StatusTone {
  switch (riskBand) {
    case "low":
      return "ok";
    case "guarded":
      return "neutral";
    case "elevated":
    case "high":
      return "alert";
  }
}

export function urgencyBadgeTone(urgencyLevel: "standard" | "priority" | "urgent"): StatusTone {
  switch (urgencyLevel) {
    case "standard":
      return "ok";
    case "priority":
      return "neutral";
    case "urgent":
      return "alert";
  }
}

export function validationBadgeTone(outcome: "pass" | "soft_warning" | "hard_prevent"): StatusTone {
  switch (outcome) {
    case "pass":
      return "ok";
    case "soft_warning":
      return "neutral";
    case "hard_prevent":
      return "alert";
  }
}

export function priorityTone(priority: "standard" | "priority" | "critical" | "P1" | "P2" | "P3"): StatusTone {
  switch (priority) {
    case "standard":
    case "P3":
      return "ok";
    case "priority":
    case "P2":
      return "neutral";
    case "critical":
    case "P1":
      return "alert";
  }
}

export function formatDemoKpiValue(value: number, unit: string): string {
  if (Number.isNaN(value)) {
    return "N/A";
  }

  if (unit === "count" || unit === "index") {
    return String(Math.round(value));
  }

  if (unit === "ratio") {
    return value.toFixed(4);
  }

  if (unit === "sec") {
    return value.toFixed(1);
  }

  return String(value);
}

export function formatKpiMetric(metric: KpiMetric): string {
  if (metric.value_status !== "measured") {
    return metric.unavailable_reason ? `N/A (${metric.unavailable_reason})` : "N/A";
  }

  return `${formatDemoKpiValue(metric.value, metric.unit)} ${metric.unit}`;
}

export function formatComparisonMetricValue(
  value: number,
  unit: string,
  status: SessionRunComparisonKpiDelta["baseline_value_status"],
  unavailableReason?: string,
): string {
  if (status !== "measured") {
    return unavailableReason ? `N/A (${unavailableReason})` : "N/A";
  }

  return `${formatDemoKpiValue(value, unit)} ${unit}`;
}

export function formatComparisonDelta(row: SessionRunComparisonKpiDelta): string {
  if (Number.isNaN(row.delta)) {
    return "N/A";
  }

  return `${row.delta >= 0 ? "+" : ""}${formatDemoKpiValue(row.delta, row.unit)}`;
}

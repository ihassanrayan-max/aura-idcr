import type { ComparisonReportArtifact, SessionAfterActionReport } from "../contracts/aura";

export type ExportableReportArtifact = SessionAfterActionReport | ComparisonReportArtifact;

function sanitizeSegment(segment: string): string {
  return segment.replace(/[^a-zA-Z0-9_.-]/g, "_");
}

export function buildReportFilename(report: ExportableReportArtifact): string {
  if (report.artifact_kind === "session_after_action_report") {
    return `${sanitizeSegment(report.scenario.scenario_id)}_${sanitizeSegment(report.run.session_mode)}_${sanitizeSegment(report.run.session_id)}_after_action.json`;
  }

  return `${sanitizeSegment(report.scenario.scenario_id)}_${sanitizeSegment(report.comparison_id)}_comparison.json`;
}

export function serializeReportArtifact(report: ExportableReportArtifact): string {
  return JSON.stringify(report, null, 2);
}

export function downloadReportArtifact(report: ExportableReportArtifact): void {
  const blob = new Blob([serializeReportArtifact(report)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = buildReportFilename(report);
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}

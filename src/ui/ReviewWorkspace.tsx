import { useEffect, useState } from "react";
import type {
  CompletedSessionReview,
  CounterfactualAdvisorState,
  SessionLogEvent,
  SessionRunComparison,
} from "../contracts/aura";
import { formatClock, formatComparisonDelta, formatComparisonMetricValue, formatKpiMetric } from "./format";
import { EmptyState, SectionShell, StatusPill } from "./primitives";
import type { ReviewWorkspaceModel } from "./viewModel";

const DEMO_KPI_IDS = new Set([
  "diagnosis_time_sec",
  "response_stabilization_time_sec",
  "critical_action_error_rate",
  "harmful_actions_prevented_count",
  "workload_peak_index",
]);

function CompletedSessionReviewPanel(props: {
  review: CompletedSessionReview;
  canonicalEvents: SessionLogEvent[];
}) {
  const { review, canonicalEvents } = props;
  const [eventIndex, setEventIndex] = useState(0);

  useEffect(() => {
    setEventIndex(0);
  }, [review.session_id]);

  const keyEvents = review.key_events;
  const maxIdx = Math.max(0, keyEvents.length - 1);
  const safeIdx = Math.min(eventIndex, maxIdx);
  const selected = keyEvents[safeIdx];
  const rawSelected = selected ? canonicalEvents.find((event) => event.event_id === selected.source_event_id) : undefined;

  function step(delta: number): void {
    setEventIndex((current) => Math.min(maxIdx, Math.max(0, current + delta)));
  }

  return (
    <div className="completed-session-review" data-testid="completed-session-review">
      <div className="review-card">
        <h3>Completed run summary</h3>
        <p>
          <strong>{review.scenario_title}</strong> | {review.scenario_id} v{review.scenario_version} | session{" "}
          <code>{review.session_id}</code> | mode <strong>{review.session_mode}</strong>
        </p>
        <p>
          Outcome <StatusPill tone="alert">{review.terminal_outcome.outcome}</StatusPill> at t+
          {formatClock(review.completion_sim_time_sec)}
        </p>
        <p>{review.terminal_outcome.message}</p>
      </div>

      <div className="review-card" data-testid="kpi-summary-block">
        <h3>Session KPI summary</h3>
        <p>
          Completeness {review.kpi_summary.completeness} | generated {review.kpi_summary.generated_at_iso}
        </p>
        <ul className="review-list">
          {review.kpi_summary.metrics
            .filter((metric) => metric.audience === "demo_facing")
            .map((metric) => (
              <li key={metric.kpi_id}>
                <strong>{metric.label}</strong>: {formatKpiMetric(metric)}
              </li>
            ))}
        </ul>
      </div>

      <div className="review-card">
        <h3>Milestones</h3>
        <ol className="review-list">
          {review.milestones.map((milestone) => (
            <li key={milestone.milestone_id}>
              <strong>{formatClock(milestone.sim_time_sec)}</strong> | {milestone.label} | {milestone.detail}
            </li>
          ))}
        </ol>
      </div>

      <div className="review-card">
        <h3>Highlights</h3>
        <ul className="review-list">
          {review.highlights.map((highlight) => (
            <li key={highlight.highlight_id}>
              <strong>{highlight.label}</strong>: {highlight.detail}
            </li>
          ))}
        </ul>
      </div>

      <div className="review-card">
        <h3>Key events replay</h3>
        <p>Step through the bounded timeline. Canonical payloads stay available behind expansion.</p>
        <div className="review-stepper">
          <button type="button" className="ghost-button" onClick={() => step(-1)} disabled={safeIdx <= 0}>
            Previous
          </button>
          <span>
            {safeIdx + 1} / {keyEvents.length}
          </span>
          <button type="button" className="ghost-button" onClick={() => step(1)} disabled={safeIdx >= maxIdx}>
            Next
          </button>
        </div>
        {selected ? (
          <article className="event-card">
            <div className="section-divider">
              <strong>{selected.title}</strong>
              <span>
                {formatClock(selected.sim_time_sec)} | {selected.event_type}
              </span>
            </div>
            <p>{selected.summary}</p>
            {selected.tick_id ? <p>Tick anchor {selected.tick_id}</p> : null}
            {rawSelected ? (
              <details>
                <summary>Canonical event payload</summary>
                <pre>{JSON.stringify(rawSelected.payload, null, 2)}</pre>
              </details>
            ) : null}
          </article>
        ) : null}
        <ol className="review-list">
          {keyEvents.map((event, index) => (
            <li key={event.source_event_id}>
              <button
                type="button"
                className={index === safeIdx ? "review-link review-link--active" : "review-link"}
                onClick={() => setEventIndex(index)}
              >
                {formatClock(event.sim_time_sec)} | {event.title}
              </button>
            </li>
          ))}
        </ol>
      </div>
    </div>
  );
}

function SessionComparisonPanel(props: { comparison: SessionRunComparison }) {
  const { comparison } = props;
  const demoDeltas = comparison.kpi_deltas.filter((delta) => DEMO_KPI_IDS.has(delta.kpi_id));

  return (
    <div className="session-run-comparison" data-testid="session-run-comparison">
      <div className="review-card">
        <h3>Baseline vs adaptive comparison</h3>
        <p>
          <strong>{comparison.scenario_title}</strong> | {comparison.scenario_id} v{comparison.scenario_version}
        </p>
        {!comparison.valid ? <p>{comparison.mismatch_reason}</p> : null}
      </div>

      <div className="review-card">
        <h3>Judge-facing summary</h3>
        <p className="judge-headline">{comparison.judge_summary.headline}</p>
        <p>
          Overall observed advantage <strong>{comparison.judge_summary.overall_favors}</strong>
        </p>
        <ul className="review-list">
          {comparison.judge_summary.metric_bullets.map((line, index) => (
            <li key={index}>{line}</li>
          ))}
        </ul>
        <p>{comparison.judge_summary.why_it_matters}</p>
      </div>

      <div className="comparison-run-grid">
        <article className="review-card">
          <span className="utility-card__label">Baseline run</span>
          <p>
            <code>{comparison.baseline_session_id}</code>
          </p>
          <p>
            Outcome <StatusPill tone="alert">{comparison.baseline_outcome}</StatusPill>
            {comparison.baseline_stabilized ? " | stabilized" : ""}
          </p>
        </article>
        <article className="review-card">
          <span className="utility-card__label">Adaptive run</span>
          <p>
            <code>{comparison.adaptive_session_id}</code>
          </p>
          <p>
            Outcome <StatusPill tone="alert">{comparison.adaptive_outcome}</StatusPill>
            {comparison.adaptive_stabilized ? " | stabilized" : ""}
          </p>
        </article>
      </div>

      {comparison.valid ? (
        <>
          <div className="review-card">
            <h3>KPI deltas (adaptive - baseline)</h3>
            <table className="comparison-table">
              <thead>
                <tr>
                  <th>Metric</th>
                  <th>Baseline</th>
                  <th>Adaptive</th>
                  <th>Delta</th>
                  <th>Favors</th>
                </tr>
              </thead>
              <tbody>
                {demoDeltas.map((row) => (
                  <tr key={row.kpi_id}>
                    <td>{row.label}</td>
                    <td>{formatComparisonMetricValue(row.baseline_value, row.unit, row.baseline_value_status, row.baseline_unavailable_reason)}</td>
                    <td>{formatComparisonMetricValue(row.adaptive_value, row.unit, row.adaptive_value_status, row.adaptive_unavailable_reason)}</td>
                    <td>{formatComparisonDelta(row)}</td>
                    <td>{row.favors}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="review-card">
            <h3>Milestone counts</h3>
            <table className="comparison-table">
              <thead>
                <tr>
                  <th>Kind</th>
                  <th>Baseline</th>
                  <th>Adaptive</th>
                </tr>
              </thead>
              <tbody>
                {comparison.milestone_kind_counts.map((row) => (
                  <tr key={row.kind}>
                    <td>{row.kind}</td>
                    <td>{row.baseline_count}</td>
                    <td>{row.adaptive_count}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <p>
              Key events baseline {comparison.key_event_count_baseline} | adaptive {comparison.key_event_count_adaptive}
              | completion delta {comparison.completion_sim_time_sec_delta >= 0 ? "+" : ""}
              {comparison.completion_sim_time_sec_delta}s
            </p>
          </div>

          <div className="review-card">
            <h3>Interpretation</h3>
            <ul className="review-list">
              {comparison.interpretation_lines.map((line, index) => (
                <li key={index}>{line}</li>
              ))}
            </ul>
          </div>
        </>
      ) : null}
    </div>
  );
}

type ReviewWorkspaceProps = {
  model: ReviewWorkspaceModel;
  completedReview?: CompletedSessionReview;
  latestCounterfactualAdvisor?: CounterfactualAdvisorState;
  canonicalEvents: SessionLogEvent[];
  sessionRunComparison?: SessionRunComparison;
  sessionReportReady: boolean;
  comparisonReportReady: boolean;
  pendingSupervisorOverrideCard?: {
    actionLabel: string;
    reasonCode: string;
    requestStatus: "available" | "requested";
    explanation: string;
  };
  supervisorOverrideNote: string;
  onSupervisorOverrideNoteChange: (value: string) => void;
  onApproveOverride: () => void;
  onDenyOverride: () => void;
  onDownloadSessionReport: () => void;
  onDownloadComparisonReport: () => void;
};

export function ReviewWorkspace(props: ReviewWorkspaceProps) {
  const {
    model,
    completedReview,
    latestCounterfactualAdvisor,
    canonicalEvents,
    sessionRunComparison,
    sessionReportReady,
    comparisonReportReady,
    pendingSupervisorOverrideCard,
    supervisorOverrideNote,
    onSupervisorOverrideNoteChange,
    onApproveOverride,
    onDenyOverride,
    onDownloadSessionReport,
    onDownloadComparisonReport,
  } = props;

  return (
    <main className="workspace-canvas" data-testid="review-workspace" id="app-workspace">
      <div className="review-stack">
        <SectionShell
          title="Live Oversight"
          subtitle={model.oversightSummary}
          className="review-section"
          data-tutorial-target="review-oversight"
        >
          <div className="oversight-grid">
            <article className="review-card">
              <h3>Validator demo checklist</h3>
              <ul className="review-list">
                {model.demoChecklist.map((item) => (
                  <li key={item.id}>
                    <strong>{item.label}</strong> | {item.done ? "done" : "pending"}
                  </li>
                ))}
              </ul>
            </article>

            {pendingSupervisorOverrideCard ? (
              <article className="review-card" data-testid="supervisor-override-card" aria-live="polite">
                <h3>Demo/Research Supervisor Override</h3>
                <p>
                  <strong>{pendingSupervisorOverrideCard.requestStatus === "requested" ? "Decision required" : "Available if requested"}</strong>
                </p>
                <p>
                  Action {pendingSupervisorOverrideCard.actionLabel} | reason code {pendingSupervisorOverrideCard.reasonCode}
                </p>
                <p>{pendingSupervisorOverrideCard.explanation}</p>
                <p>Demo/Research only. Approval releases one blocked action and does not weaken future validation.</p>
                {pendingSupervisorOverrideCard.requestStatus === "requested" ? (
                  <>
                    <label htmlFor="supervisor-override-note">Supervisor note</label>
                    <input
                      id="supervisor-override-note"
                      name="supervisor_override_note"
                      autoComplete="off"
                      value={supervisorOverrideNote}
                      onChange={(event) => onSupervisorOverrideNoteChange(event.target.value)}
                      placeholder="Bounded demo note"
                    />
                    <div className="utility-action-row">
                      <button type="button" onClick={onApproveOverride}>
                        Approve one-shot override
                      </button>
                      <button type="button" className="ghost-button" onClick={onDenyOverride}>
                        Deny override
                      </button>
                    </div>
                  </>
                ) : null}
              </article>
            ) : (
              <EmptyState
                title="No pending supervisor decision"
                body="If an override-eligible hard prevent is requested, the approval flow will appear here without crowding Operate."
              />
            )}

            {latestCounterfactualAdvisor?.status === "ready" ? (
              <article className="review-card" data-testid="counterfactual-review-card">
                <h3>Counterfactual advisor evidence</h3>
                <p>
                  Source tick <code>{latestCounterfactualAdvisor.source_tick_id}</code> at t+
                  {formatClock(latestCounterfactualAdvisor.source_sim_time_sec)}
                </p>
                <p>
                  Recommendation <strong>{latestCounterfactualAdvisor.narrative?.recommended_branch_id ?? "n/a"}</strong>
                  {" | "}
                  {latestCounterfactualAdvisor.narrative?.provider === "llm" ? "LLM-backed brief" : "Deterministic fallback brief"}
                </p>
                <ul className="review-list">
                  {latestCounterfactualAdvisor.branches.map((branch) => (
                    <li key={branch.branch_id}>
                      <strong>{branch.label}</strong>: {branch.one_line_summary}
                    </li>
                  ))}
                </ul>
                {latestCounterfactualAdvisor.operator_followed_recommendation !== undefined ? (
                  <p>
                    Follow-up:{" "}
                    {latestCounterfactualAdvisor.operator_followed_recommendation
                      ? "the next applied action matched the recommendation."
                      : "the next applied action diverged from the recommendation."}
                  </p>
                ) : null}
              </article>
            ) : null}

            <article className="review-card">
              <h3>Recent event stream</h3>
              <div className="event-feed">
                {model.recentEvents.map((event) => (
                  <article key={event.id} className="event-card">
                    <div className="section-divider">
                      <strong>{event.title}</strong>
                      <span>{event.timeLabel}</span>
                    </div>
                    <p>{event.sourceModule}</p>
                    <details>
                      <summary>Payload</summary>
                      <pre>{event.payloadText}</pre>
                    </details>
                  </article>
                ))}
              </div>
            </article>
          </div>
        </SectionShell>

        <SectionShell
          title="Completed Run"
          subtitle={model.completedRunSummary}
          className="review-section"
          data-tutorial-target="review-completed"
        >
          {completedReview ? (
            <CompletedSessionReviewPanel review={completedReview} canonicalEvents={canonicalEvents} />
          ) : (
            <EmptyState
              title="No completed run yet"
              body="Finish the current scenario to unlock the after-action review, KPI summary, and replay-ready milestones."
            />
          )}
        </SectionShell>

        <SectionShell
          title="Comparison & Export"
          subtitle={model.comparisonSummary}
          className="review-section"
          data-tutorial-target="review-comparison"
        >
          <div className="comparison-run-grid" data-testid="evaluation-action-bar">
            <article className="review-card">
              <span className="utility-card__label">Session report</span>
              <strong>{sessionReportReady ? "Ready" : "Not ready"}</strong>
              <p>{sessionReportReady ? "The current completed run can be exported now." : "Complete a terminal run to generate the after-action artifact."}</p>
              <button type="button" className="ghost-button" disabled={!sessionReportReady} onClick={onDownloadSessionReport}>
                Download session report
              </button>
            </article>
            <article className="review-card">
              <span className="utility-card__label">Comparison report</span>
              <strong>{comparisonReportReady ? "Ready" : "Waiting for paired runs"}</strong>
              <p>{comparisonReportReady ? "Both baseline and adaptive runs are captured for this scenario." : "Capture one baseline and one adaptive completed run on the same scenario/version."}</p>
              <button
                type="button"
                className="ghost-button"
                disabled={!comparisonReportReady}
                onClick={onDownloadComparisonReport}
              >
                Download comparison report
              </button>
            </article>
          </div>

          {sessionRunComparison ? (
            <SessionComparisonPanel comparison={sessionRunComparison} />
          ) : (
            <EmptyState
              title="Comparison not ready"
              body={model.comparisonHint ?? "Once both modes complete on the same scenario, the judge-facing comparison appears here."}
            />
          )}
        </SectionShell>
      </div>
    </main>
  );
}

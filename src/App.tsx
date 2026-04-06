import { useEffect, useMemo, useState } from "react";
import type { AuraSessionStore } from "./state/sessionStore";
import { createDefaultSessionStore, useAuraSessionSnapshot } from "./state/sessionStore";
import type {
  CompletedSessionReview,
  SessionLogEvent,
  SessionMode,
  SessionRunComparison,
} from "./contracts/aura";
import { buildSessionRunComparison } from "./runtime/sessionComparison";
import { criticalVariableIds, variableLabels, variableUnits } from "./data/plantModel";
import { formatSupportModeLabel } from "./runtime/supportModePolicy";
import {
  buildPresentationPolicy,
  orderPresentedLaneItems,
  type SupportSectionId,
} from "./runtime/presentationPolicy";

type AppProps = {
  store?: AuraSessionStore;
  autoRun?: boolean;
};

const defaultStore = createDefaultSessionStore();

function formatValue(value: number | boolean | string, unit?: string): string {
  if (typeof value === "boolean") {
    return value ? "Available" : "Unavailable";
  }

  if (typeof value === "number") {
    const digits = Math.abs(value) >= 100 ? 0 : value % 1 === 0 ? 0 : 2;
    return `${value.toFixed(digits)}${unit ? ` ${unit}` : ""}`;
  }

  return value;
}

function formatClock(simTimeSec: number): string {
  const minutes = Math.floor(simTimeSec / 60);
  const seconds = simTimeSec % 60;
  return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
}

function formatSignalLabel(signalId: string): string {
  const labels = variableLabels as Record<string, string>;
  return labels[signalId] ?? signalId.replace(/_/g, " ");
}

function riskBadgeTone(riskBand: "low" | "guarded" | "elevated" | "high"): "ok" | "neutral" | "alert" {
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

function urgencyBadgeTone(urgencyLevel: "standard" | "priority" | "urgent"): "ok" | "neutral" | "alert" {
  switch (urgencyLevel) {
    case "standard":
      return "ok";
    case "priority":
      return "neutral";
    case "urgent":
      return "alert";
  }
}

function validationBadgeTone(outcome: "pass" | "soft_warning" | "hard_prevent"): "ok" | "neutral" | "alert" {
  switch (outcome) {
    case "pass":
      return "ok";
    case "soft_warning":
      return "neutral";
    case "hard_prevent":
      return "alert";
  }
}

function formatDemoKpiValue(value: number, unit: string): string {
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
  const rawSelected = selected ? canonicalEvents.find((e) => e.event_id === selected.source_event_id) : undefined;

  function step(delta: number): void {
    setEventIndex((current) => Math.min(maxIdx, Math.max(0, current + delta)));
  }

  return (
    <div className="completed-session-review" data-testid="completed-session-review">
      <div className="review-summary-card">
        <h3 className="review-summary-title">Completed session review</h3>
        <p className="muted">
          <strong>{review.scenario_title}</strong> · {review.scenario_id} v{review.scenario_version} · Session{" "}
          <code>{review.session_id}</code> · Mode <strong>{review.session_mode}</strong>
        </p>
        <p className="review-outcome-line">
          Outcome: <span className="badge alert">{review.terminal_outcome.outcome}</span> at{" "}
          <strong>t+{formatClock(review.completion_sim_time_sec)}</strong> sim time
        </p>
        <p className="muted">{review.terminal_outcome.message}</p>
      </div>

      <div className="kpi-summary-block" data-testid="kpi-summary-block">
        <h3 className="kpi-summary-title">Session KPI summary</h3>
        <p className="muted">
          Completeness: {review.kpi_summary.completeness} · Generated {review.kpi_summary.generated_at_iso}
        </p>
        <ul className="kpi-metric-list">
          {review.kpi_summary.metrics
            .filter((entry) => entry.audience === "demo_facing")
            .map((entry) => (
              <li key={entry.kpi_id}>
                <strong>{entry.label}</strong>: {formatDemoKpiValue(entry.value, entry.unit)} {entry.unit}
              </li>
            ))}
        </ul>
      </div>

      <div className="review-milestones">
        <h4 className="review-subheading">Milestones</h4>
        <ol className="review-milestone-list">
          {review.milestones.map((m) => (
            <li key={m.milestone_id}>
              <span className="review-milestone-time">{formatClock(m.sim_time_sec)}</span>{" "}
              <strong>{m.label}</strong> — <span className="muted">{m.detail}</span>
            </li>
          ))}
        </ol>
      </div>

      <div className="review-highlights">
        <h4 className="review-subheading">Highlights</h4>
        <ul className="review-highlight-list">
          {review.highlights.map((h) => (
            <li key={h.highlight_id}>
              <strong>{h.label}</strong>
              <p className="muted">{h.detail}</p>
            </li>
          ))}
        </ul>
      </div>

      <div className="review-key-events">
        <h4 className="review-subheading">Key events (replay)</h4>
        <p className="muted">Step through the bounded timeline. Details use canonical log fields.</p>
        <div className="review-stepper">
          <button type="button" className="ghost-button" onClick={() => step(-1)} disabled={safeIdx <= 0}>
            Previous
          </button>
          <span className="review-stepper-position">
            {safeIdx + 1} / {keyEvents.length}
          </span>
          <button type="button" className="ghost-button" onClick={() => step(1)} disabled={safeIdx >= maxIdx}>
            Next
          </button>
        </div>
        {selected ? (
          <div className="review-selected-event">
            <div className="alarm-title-row">
              <strong>{selected.title}</strong>
              <span>
                {formatClock(selected.sim_time_sec)} · {selected.event_type}
              </span>
            </div>
            <p className="muted">{selected.summary}</p>
            {selected.tick_id ? (
              <p className="alarm-meta">
                Tick anchor: <code>{selected.tick_id}</code>
              </p>
            ) : null}
            {rawSelected ? (
              <details className="review-technical-detail">
                <summary>Canonical event payload (optional)</summary>
                <pre>{JSON.stringify(rawSelected.payload, null, 2)}</pre>
              </details>
            ) : null}
          </div>
        ) : null}
        <ol className="review-key-event-index">
          {keyEvents.map((ke, i) => (
            <li key={ke.source_event_id}>
              <button
                type="button"
                className={`review-key-event-link ${i === safeIdx ? "is-active" : ""}`}
                onClick={() => setEventIndex(i)}
              >
                {formatClock(ke.sim_time_sec)} — {ke.title}
              </button>
            </li>
          ))}
        </ol>
      </div>
    </div>
  );
}

const DEMO_KPI_IDS = new Set([
  "diagnosis_time_sec",
  "response_stabilization_time_sec",
  "critical_action_error_rate",
  "harmful_actions_prevented_count",
  "workload_peak_index",
]);

function SessionComparisonPanel(props: { comparison: SessionRunComparison }) {
  const { comparison: c } = props;
  const demoDeltas = c.kpi_deltas.filter((d) => DEMO_KPI_IDS.has(d.kpi_id));

  return (
    <div className="session-run-comparison" data-testid="session-run-comparison">
      <div className="comparison-summary-card">
        <h3 className="review-summary-title">Baseline vs adaptive comparison</h3>
        <p className="muted">
          <strong>{c.scenario_title}</strong> · {c.scenario_id} v{c.scenario_version}
        </p>
        {!c.valid ? (
          <p className="comparison-invalid">{c.mismatch_reason}</p>
        ) : null}
      </div>

      <div className="judge-summary-card">
        <h4 className="review-subheading">Judge-facing summary</h4>
        <p className="judge-headline">{c.judge_summary.headline}</p>
        <p className="muted judge-overall">
          Overall (observed): <strong>{c.judge_summary.overall_favors}</strong>
        </p>
        <ul className="judge-metric-bullets">
          {c.judge_summary.metric_bullets.map((line, i) => (
            <li key={i}>{line}</li>
          ))}
        </ul>
        <p className="muted judge-why">{c.judge_summary.why_it_matters}</p>
      </div>

      <div className="comparison-run-headers">
        <div className="comparison-run-card">
          <span className="metric-label">Baseline run</span>
          <p>
            <code>{c.baseline_session_id}</code>
          </p>
          <p>
            Outcome: <span className="badge alert">{c.baseline_outcome}</span>
            {c.baseline_stabilized ? " · stabilized" : ""}
          </p>
        </div>
        <div className="comparison-run-card">
          <span className="metric-label">Adaptive run</span>
          <p>
            <code>{c.adaptive_session_id}</code>
          </p>
          <p>
            Outcome: <span className="badge alert">{c.adaptive_outcome}</span>
            {c.adaptive_stabilized ? " · stabilized" : ""}
          </p>
        </div>
      </div>

      {c.valid ? (
        <>
          <div className="comparison-kpi-block">
            <h4 className="review-subheading">KPI deltas (adaptive − baseline)</h4>
            <table className="comparison-kpi-table">
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
                    <td>
                      {formatDemoKpiValue(row.baseline_value, row.unit)} {row.unit}
                    </td>
                    <td>
                      {formatDemoKpiValue(row.adaptive_value, row.unit)} {row.unit}
                    </td>
                    <td>
                      {row.delta >= 0 ? "+" : ""}
                      {formatDemoKpiValue(row.delta, row.unit)}
                    </td>
                    <td>{row.favors}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="comparison-milestone-block">
            <h4 className="review-subheading">Milestone counts (by kind)</h4>
            <table className="comparison-kpi-table">
              <thead>
                <tr>
                  <th>Kind</th>
                  <th>Baseline</th>
                  <th>Adaptive</th>
                </tr>
              </thead>
              <tbody>
                {c.milestone_kind_counts.map((row) => (
                  <tr key={row.kind}>
                    <td>{row.kind}</td>
                    <td>{row.baseline_count}</td>
                    <td>{row.adaptive_count}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <p className="muted">
              Key events indexed: baseline {c.key_event_count_baseline}, adaptive {c.key_event_count_adaptive}. Completion
              time delta: {c.completion_sim_time_sec_delta >= 0 ? "+" : ""}
              {c.completion_sim_time_sec_delta}s sim time.
            </p>
          </div>

          <div className="comparison-interpretation">
            <h4 className="review-subheading">Plain-English interpretation</h4>
            <ul className="review-highlight-list">
              {c.interpretation_lines.map((line, i) => (
                <li key={i}>{line}</li>
              ))}
            </ul>
          </div>
        </>
      ) : null}
    </div>
  );
}

function priorityTone(priority: "standard" | "priority" | "critical"): "ok" | "neutral" | "alert" {
  switch (priority) {
    case "standard":
      return "ok";
    case "priority":
      return "neutral";
    case "critical":
      return "alert";
  }
}

export default function App({ store = defaultStore, autoRun = true }: AppProps) {
  const snapshot = useAuraSessionSnapshot(store);
  const [isRunning, setIsRunning] = useState(true);
  const [feedwaterDemand, setFeedwaterDemand] = useState(82);
  const [expandedClusterIds, setExpandedClusterIds] = useState<string[]>([]);
  const [selectedSessionMode, setSelectedSessionMode] = useState<SessionMode>("adaptive");

  useEffect(() => {
    if (!autoRun || !isRunning || snapshot.outcome) {
      return undefined;
    }

    const timer = window.setInterval(() => {
      store.advanceTick();
    }, 450);

    return () => window.clearInterval(timer);
  }, [autoRun, isRunning, snapshot.outcome, store]);

  const activeAlarmIds = useMemo(
    () => new Set(snapshot.alarm_set.active_alarm_ids),
    [snapshot.alarm_set.active_alarm_ids],
  );
  const actionLabels = useMemo(
    () =>
      Object.fromEntries(snapshot.scenario.allowed_operator_actions.map((action) => [action.action_id, action.label])) as Record<
        string,
        string
      >,
    [snapshot.scenario.allowed_operator_actions],
  );
  const recentEvents = snapshot.events.slice(-8).reverse();
  const pinnedCriticalAlarmIds = new Set(snapshot.support_policy.critical_visibility.pinned_alarm_ids);
  const pinnedCriticalAlarms = snapshot.alarm_set.active_alarms.filter((alarm) => pinnedCriticalAlarmIds.has(alarm.alarm_id));
  const pendingConfirmation = snapshot.pending_action_confirmation;
  const actionConfirmationPending = Boolean(pendingConfirmation);
  const lastValidation = snapshot.last_validation_result;
  const presentationPolicy = useMemo(
    () =>
      buildPresentationPolicy({
        session_mode: snapshot.session_mode,
        support_mode: snapshot.support_mode,
        support_policy: snapshot.support_policy,
        support_refinement: snapshot.support_refinement,
        last_validation_result: snapshot.last_validation_result,
        pending_action_confirmation: snapshot.pending_action_confirmation,
      }),
    [
      snapshot.session_mode,
      snapshot.last_validation_result,
      snapshot.pending_action_confirmation,
      snapshot.support_mode,
      snapshot.support_policy,
      snapshot.support_refinement,
    ],
  );
  const presentedLaneItems = useMemo(
    () => orderPresentedLaneItems(snapshot.first_response_lane.items, presentationPolicy.procedure_item_order),
    [presentationPolicy.procedure_item_order, snapshot.first_response_lane.items],
  );
  const supportCards = useMemo(() => {
    const cardMap: Record<SupportSectionId, { title: string; body: string }> = {
      mode: {
        title: "Current assistance mode",
        body: snapshot.support_policy.current_mode_reason,
      },
      watch: {
        title: "Watch next",
        body: snapshot.support_refinement.watch_now_summary,
      },
      effect: {
        title: "Mode effect on presentation",
        body: snapshot.support_policy.support_behavior_changes.join(" "),
      },
      focus: {
        title: "Current support focus",
        body: snapshot.support_refinement.current_support_focus,
      },
      guardrails: {
        title: "Critical visibility guardrails",
        body: snapshot.support_policy.critical_visibility.summary,
      },
      confidence: {
        title: "Degraded-confidence effect",
        body: snapshot.support_policy.degraded_confidence_effect,
      },
      operator: {
        title: "Operator context",
        body: snapshot.support_refinement.operator_context_note,
      },
      transition: {
        title: "Mode transition status",
        body: `${snapshot.support_policy.transition_reason} ${snapshot.support_policy.mode_change_summary}`.trim(),
      },
      risk: {
        title: "Why this is emphasized now",
        body: snapshot.support_refinement.summary_explanation,
      },
    };

    return presentationPolicy.support_section_order.map((id) => ({
      id,
      ...cardMap[id],
    }));
  }, [presentationPolicy.support_section_order, snapshot.support_policy, snapshot.support_refinement]);

  const sessionRunComparison = useMemo(() => {
    const cap = snapshot.evaluation_capture;
    if (!cap?.baseline_completed || !cap?.adaptive_completed) {
      return undefined;
    }
    return buildSessionRunComparison(cap.baseline_completed, cap.adaptive_completed);
  }, [snapshot.evaluation_capture]);

  const comparisonCaptureHint =
    snapshot.evaluation_capture &&
    Boolean(snapshot.evaluation_capture.baseline_completed) !== Boolean(snapshot.evaluation_capture.adaptive_completed);

  function toggleCluster(clusterId: string): void {
    setExpandedClusterIds((current) =>
      current.includes(clusterId) ? current.filter((entry) => entry !== clusterId) : [...current, clusterId],
    );
  }

  function requestLaneAction(actionId: string, recommendedValue?: number | boolean | string): void {
    store.requestAction({
      action_id: actionId,
      requested_value: typeof recommendedValue === "number" ? recommendedValue : undefined,
      ui_region: "procedure_lane",
      reason_note:
        actionId === "act_ack_alarm"
          ? snapshot.alarm_set.active_alarm_ids[0] ?? "no_active_alarm"
          : `Phase 2 first-response guidance for ${snapshot.reasoning_snapshot.dominant_hypothesis_id ?? "monitoring"}`,
    });
  }

  return (
    <div className="app-shell">
      <header className="top-status-bar">
        <div>
          <p className="eyebrow">{presentationPolicy.shell_slice_label}</p>
          <h1>{snapshot.scenario.title}</h1>
          <p className="muted">{snapshot.current_phase.label}</p>
          <p className="mode-summary-note">{presentationPolicy.shell_mode_summary}</p>
        </div>
        <div className="status-grid">
          <div className="status-cell">
            <span className="status-label">Session Mode</span>
            <div className="session-mode-row">
              <strong>{snapshot.session_mode}</strong>
              <label className="muted session-mode-label" htmlFor="session-mode-select">
                Next run
              </label>
              <select
                id="session-mode-select"
                value={selectedSessionMode}
                onChange={(event) => setSelectedSessionMode(event.target.value as SessionMode)}
              >
                <option value="adaptive">adaptive</option>
                <option value="baseline">baseline</option>
              </select>
            </div>
          </div>
          <div className="status-cell">
            <span className="status-label">Support Mode</span>
            <strong>{formatSupportModeLabel(snapshot.support_mode)}</strong>
          </div>
          <div className="status-cell">
            <span className="status-label">Simulation Clock</span>
            <strong>{formatClock(snapshot.sim_time_sec)}</strong>
          </div>
          <div className="status-cell">
            <span className="status-label">Alarm Compression</span>
            <strong>{snapshot.alarm_intelligence.compression_ratio.toFixed(2)}x</strong>
          </div>
        </div>
        <div className="badge-row">
          <span className="badge ok">{snapshot.logging_active ? "Logging active" : "Logging offline"}</span>
          <span className={`badge ${snapshot.validation_status_available ? presentationPolicy.status_tone : "neutral"}`}>
            {snapshot.validation_status_available ? presentationPolicy.validation_status_label : "Validation offline"}
          </span>
          <span className={`badge ${snapshot.outcome ? "alert" : "ok"}`}>
            {snapshot.outcome ? `Outcome: ${snapshot.outcome.outcome}` : "Scenario running"}
          </span>
        </div>
        <p className="top-status-note">{presentationPolicy.validation_status_summary}</p>
      </header>

      <main className="layout-grid">
        <section className="panel plant-panel">
          <div className="panel-header">
            <h2>Plant Mimic Area</h2>
            <p className="muted">Closed-loop baseline view with continuously visible critical variables.</p>
          </div>
          <div className="mimic-flow">
            <div className="mimic-node">
              <span>Reactor</span>
              <strong>{formatValue(snapshot.plant_tick.plant_state.reactor_power_pct, "% rated")}</strong>
            </div>
            <div className="mimic-line" />
            <div className="mimic-node">
              <span>Vessel Level</span>
              <strong>{formatValue(snapshot.plant_tick.plant_state.vessel_water_level_m, "m")}</strong>
            </div>
            <div className="mimic-line" />
            <div className="mimic-node">
              <span>Steam Path</span>
              <strong>{formatValue(snapshot.plant_tick.plant_state.main_steam_flow_pct, "% rated")}</strong>
            </div>
            <div className="mimic-line" />
            <div className="mimic-node">
              <span>Turbine / Generator</span>
              <strong>{formatValue(snapshot.plant_tick.plant_state.turbine_output_mwe, "MW_e")}</strong>
            </div>
            <div className="mimic-line" />
            <div className="mimic-node">
              <span>Condenser</span>
              <strong>
                {snapshot.plant_tick.plant_state.condenser_heat_sink_available ? "Heat sink available" : "Heat sink lost"}
              </strong>
            </div>
          </div>

          <div className="metric-grid">
            {criticalVariableIds.map((variableId) => (
              <article key={variableId} className="metric-card">
                <span className="metric-label">{variableLabels[variableId]}</span>
                <strong>{formatValue(snapshot.plant_tick.plant_state[variableId], variableUnits[variableId])}</strong>
              </article>
            ))}
          </div>

          <div className="state-strip">
            <span className={snapshot.plant_tick.plant_state.reactor_trip_active ? "state-bad" : "state-good"}>
              Reactor trip: {snapshot.plant_tick.plant_state.reactor_trip_active ? "Active" : "Clear"}
            </span>
            <span className={snapshot.plant_tick.plant_state.safety_relief_valve_open ? "state-bad" : "state-good"}>
              SRV: {snapshot.plant_tick.plant_state.safety_relief_valve_open ? "Open" : "Closed"}
            </span>
            <span className={snapshot.plant_tick.plant_state.offsite_power_available ? "state-good" : "state-bad"}>
              Offsite power: {snapshot.plant_tick.plant_state.offsite_power_available ? "Available" : "Lost"}
            </span>
            <span
              className={
                snapshot.plant_tick.plant_state.isolation_condenser_available ? "state-good" : "state-bad"
              }
            >
              Isolation condenser: {snapshot.plant_tick.plant_state.isolation_condenser_available ? "Available" : "Unavailable"}
            </span>
          </div>
        </section>

        <aside className="panel alarm-panel">
          <div className="panel-header">
            <h2>Alarm Intelligence Area</h2>
            <p className="muted">Grouped, inspectable alarm clusters with critical signals still surfaced.</p>
          </div>
          <div className="alarm-summary-grid">
            <article className="metric-card compact">
              <span className="metric-label">Raw active alarms</span>
              <strong>{snapshot.alarm_set.active_alarm_count}</strong>
            </article>
            <article className="metric-card compact">
              <span className="metric-label">Visible grouped cards</span>
              <strong>{snapshot.alarm_intelligence.visible_alarm_card_count}</strong>
            </article>
            <article className="metric-card compact">
              <span className="metric-label">Active clusters</span>
              <strong>{snapshot.alarm_set.active_alarm_cluster_count}</strong>
            </article>
          </div>
          <div className="critical-alarm-strip">
            <div className="alarm-title-row">
              <strong>Critical alarms pinned in view</strong>
              <span>{pinnedCriticalAlarms.length}</span>
            </div>
            <p className="muted">{snapshot.support_policy.critical_visibility.summary}</p>
            <div className="badge-row cluster-badges">
              {pinnedCriticalAlarms.length > 0 ? (
                pinnedCriticalAlarms.map((alarm) => (
                  <span
                    key={alarm.alarm_id}
                    className={`badge priority-chip priority-${alarm.priority}`}
                    data-testid="critical-alarm-chip"
                  >
                    {alarm.title}
                  </span>
                ))
              ) : (
                <span className="badge ok">No active P1/P2 or always-visible alarms</span>
              )}
            </div>
          </div>
          <div className="alarm-list">
            {snapshot.alarm_intelligence.clusters.length === 0 ? (
              <p className="muted">No active alarm clusters yet.</p>
            ) : (
              snapshot.alarm_intelligence.clusters.map((cluster) => (
                <article
                  key={cluster.cluster_id}
                  className={`alarm-card active priority-${cluster.priority}`}
                >
                  <div className="alarm-title-row">
                    <strong>{cluster.title}</strong>
                    <span>{cluster.priority}</span>
                  </div>
                  <p className="alarm-meta">
                    {cluster.grouped_alarm_count} related alarms | critical visible: {cluster.critical_alarm_ids.length}
                  </p>
                  <p className="muted">{cluster.summary}</p>
                  <div className="badge-row cluster-badges">
                    {cluster.alarms
                      .filter((alarm) => cluster.primary_alarm_ids.includes(alarm.alarm_id))
                      .map((alarm) => (
                        <span key={alarm.alarm_id} className={`badge priority-chip priority-${alarm.priority}`}>
                          {alarm.title}
                        </span>
                      ))}
                  </div>
                  <button type="button" className="ghost-button" onClick={() => toggleCluster(cluster.cluster_id)}>
                    {expandedClusterIds.includes(cluster.cluster_id) ? "Hide raw alarms" : "Inspect raw alarms"}
                  </button>
                  {expandedClusterIds.includes(cluster.cluster_id) ? (
                    <div className="cluster-detail-list">
                      {cluster.alarms.map((alarm) => (
                        <article
                          key={alarm.alarm_id}
                          className={`alarm-card nested ${activeAlarmIds.has(alarm.alarm_id) ? "active" : "inactive"} priority-${alarm.priority}`}
                        >
                          <div className="alarm-title-row">
                            <strong>{alarm.title}</strong>
                            <span>{alarm.priority}</span>
                          </div>
                          <p className="alarm-meta">
                            {alarm.subsystem_tag} | {alarm.visibility_rule === "always_visible" ? "Always visible" : "Grouped"}
                          </p>
                        </article>
                      ))}
                    </div>
                  ) : null}
                </article>
              ))
            )}
          </div>
        </aside>

        <section className="panel placeholder-panel">
          <div className="panel-header">
            <h2>Storyline / Root-Cause Area</h2>
          </div>
          <div className="storyline-card">
            <div className="alarm-title-row">
              <strong>
                {snapshot.reasoning_snapshot.ranked_hypotheses[0]?.label ?? "Monitoring only"}
              </strong>
              <span>{snapshot.reasoning_snapshot.ranked_hypotheses[0]?.confidence_band ?? "low"} confidence</span>
            </div>
            <p className="muted">{snapshot.reasoning_snapshot.dominant_summary}</p>
            <div className="badge-row">
              <span className={`badge ${snapshot.reasoning_snapshot.expected_root_cause_aligned ? "ok" : "neutral"}`}>
                {snapshot.reasoning_snapshot.expected_root_cause_aligned ? "Aligned with scenario driver" : "Alternative storyline active"}
              </span>
              <span className="badge neutral">Stable for {snapshot.reasoning_snapshot.stable_for_ticks} ticks</span>
              <span className={`badge ${snapshot.support_refinement.wording_style === "concise" ? "neutral" : "ok"}`}>
                Wording: {snapshot.support_refinement.wording_style}
              </span>
            </div>
            <div className="storyline-context">
              <article className="storyline-context-card">
                <span className="metric-label">Support focus now</span>
                <p className="muted">{snapshot.support_refinement.current_support_focus}</p>
              </article>
              <article className="storyline-context-card">
                <span className="metric-label">Why emphasis changed</span>
                <p className="muted">{snapshot.support_refinement.summary_explanation}</p>
              </article>
              <article className="storyline-context-card">
                <span className="metric-label">Operator context</span>
                <p className="muted">{snapshot.support_refinement.operator_context_note}</p>
              </article>
            </div>
          </div>
          <div className="storyline-list">
            {snapshot.reasoning_snapshot.ranked_hypotheses.map((hypothesis) => (
              <article key={hypothesis.hypothesis_id} className="storyline-item">
                <div className="alarm-title-row">
                  <strong>
                    #{hypothesis.rank} {hypothesis.label}
                  </strong>
                  <span>{hypothesis.score.toFixed(2)}</span>
                </div>
                <p className="muted">{hypothesis.summary}</p>
                <div className="evidence-list">
                  {hypothesis.evidence.map((evidence) => (
                    <article key={evidence.evidence_id} className="evidence-card">
                      <strong>{evidence.label}</strong>
                      <p className="muted">{evidence.detail}</p>
                    </article>
                  ))}
                </div>
                <p className="alarm-meta">Watch: {hypothesis.watch_items.map(formatSignalLabel).join(", ")}</p>
              </article>
            ))}
          </div>
        </section>

        <section className="panel controls-panel">
          <div className="panel-header">
            <h2>Dynamic First-Response Lane</h2>
            <p className="muted">Prototype guidance only. The lane narrows the bounded first checks and actions for the current storyline.</p>
          </div>

          <div className={`procedure-lane ${presentationPolicy.support_panel_mode_class}`}>
            <p className="muted">{snapshot.first_response_lane.prototype_notice}</p>
            <div className="badge-row">
              <span className={`badge ${riskBadgeTone(snapshot.combined_risk.combined_risk_band)}`}>
                Focus: {snapshot.support_refinement.current_support_focus}
              </span>
              <span className="badge neutral">Emphasized items: {snapshot.support_refinement.emphasized_lane_item_ids.length}</span>
              <span className={`badge ${presentationPolicy.watch_badge_tone}`}>Watch next: {snapshot.support_refinement.watch_now_summary}</span>
            </div>
            <p className="mode-summary-note">{snapshot.support_policy.support_behavior_changes.join(" ")}</p>
            <div className="procedure-list">
              {presentedLaneItems.map((item) => (
                <article
                  key={item.item_id}
                  className={`procedure-item ${item.presentation_cue?.emphasized ? "emphasized" : ""} ${presentationPolicy.support_panel_mode_class}`}
                >
                  <div className="alarm-title-row">
                    <strong>{item.label}</strong>
                    <span>{item.item_kind}</span>
                  </div>
                  {item.presentation_cue ? (
                    <div className="badge-row">
                      <span className={`badge ${urgencyBadgeTone(item.presentation_cue.urgency_level)}`}>
                        {item.presentation_cue.urgency_level}
                      </span>
                      {item.presentation_cue.emphasized ? <span className="badge ok">Emphasized now</span> : null}
                      <span className={`badge ${item.presentation_cue.wording_style === "concise" ? "neutral" : "ok"}`}>
                        {item.presentation_cue.wording_style}
                      </span>
                    </div>
                  ) : null}
                  <p className="muted">{item.why}</p>
                  {item.presentation_cue ? <p className="lane-why-now">{item.presentation_cue.why_this_matters_now}</p> : null}
                  {item.presentation_cue?.attention_sensitive_caution ? (
                    <p className="lane-caution">{item.presentation_cue.attention_sensitive_caution}</p>
                  ) : null}
                  {item.presentation_cue?.degraded_confidence_caveat ? (
                    <p className="lane-caution">{item.presentation_cue.degraded_confidence_caveat}</p>
                  ) : null}
                  <p className="alarm-meta">{item.completion_hint}</p>
                  {item.source_variable_ids.length > 0 ? (
                    <p className="alarm-meta">Signals: {item.source_variable_ids.map(formatSignalLabel).join(", ")}</p>
                  ) : null}
                  {item.recommended_action_id ? (
                    <button
                      type="button"
                      className="lane-action-button"
                      disabled={actionConfirmationPending}
                      onClick={() => requestLaneAction(item.recommended_action_id!, item.recommended_value)}
                    >
                      {actionLabels[item.recommended_action_id] ?? item.recommended_action_id}
                      {typeof item.recommended_value === "number" ? ` (${item.recommended_value}% rated)` : ""}
                    </button>
                  ) : null}
                </article>
              ))}
            </div>
          </div>

          <div className="control-block">
            <div className="panel-header compact-header">
              <h3>Manual Control Input</h3>
              <p className="muted">The baseline bounded controls remain available for deterministic replay.</p>
            </div>
            <label htmlFor="feedwater-demand">Feedwater Demand Target</label>
            <input
              id="feedwater-demand"
              type="range"
              min={35}
              max={95}
              value={feedwaterDemand}
              onChange={(event) => setFeedwaterDemand(Number(event.target.value))}
            />
            <div className="control-row">
              <strong>{feedwaterDemand}% rated</strong>
              <button
                type="button"
                disabled={actionConfirmationPending}
                onClick={() =>
                  store.requestAction({
                    action_id: "act_adjust_feedwater",
                    requested_value: feedwaterDemand,
                    ui_region: "plant_mimic",
                    reason_note: "Manual feedwater correction request from the baseline HMI.",
                  })
                }
              >
                Apply feedwater correction
              </button>
            </div>
          </div>

          <div className="control-row">
            <button
              type="button"
                disabled={actionConfirmationPending}
              onClick={() =>
                store.requestAction({
                  action_id: "act_ack_alarm",
                  ui_region: "alarm_area",
                  reason_note: snapshot.alarm_set.active_alarm_ids[0] ?? "no_active_alarm",
                })
              }
            >
              Acknowledge top alarm
            </button>
            <button type="button" onClick={() => setIsRunning((value) => !value)}>
              {isRunning ? "Hold runtime loop" : "Resume runtime loop"}
            </button>
            <button type="button" onClick={() => store.advanceTick()}>
              Advance one tick
            </button>
            <button
              type="button"
              onClick={() => {
                setIsRunning(true);
                setFeedwaterDemand(82);
                store.setSessionMode(selectedSessionMode);
              }}
            >
              Reset session
            </button>
          </div>

          {pendingConfirmation ? (
            <div
              className={`validation-banner ${presentationPolicy.validation_mode_class}`}
              data-testid="pending-validation-banner"
            >
              <div className="alarm-title-row">
                <strong>Soft warning confirmation required</strong>
                <span>{actionLabels[pendingConfirmation.action_request.action_id] ?? pendingConfirmation.action_request.action_id}</span>
              </div>
              <p className="mode-summary-note">{presentationPolicy.pending_confirmation_intro}</p>
              <p className="muted">{pendingConfirmation.validation_result.explanation}</p>
              <p className="lane-why-now">{pendingConfirmation.validation_result.risk_context}</p>
              <p className="lane-caution">{pendingConfirmation.validation_result.confidence_note}</p>
              {pendingConfirmation.validation_result.recommended_safe_alternative ? (
                <p className="alarm-meta">Safer direction: {pendingConfirmation.validation_result.recommended_safe_alternative}</p>
              ) : null}
              <div className="control-row">
                <button type="button" onClick={() => store.confirmPendingAction()}>
                  Confirm and apply action
                </button>
                <button type="button" className="ghost-button" onClick={() => store.dismissPendingActionConfirmation()}>
                  Cancel warning
                </button>
              </div>
            </div>
          ) : null}
        </section>

        <section className={`panel support-panel ${presentationPolicy.support_panel_mode_class}`}>
          <div className="panel-header">
            <h2>Support State / Combined Risk</h2>
            <p className="muted">Compact deterministic assistance-state output, bounded action validation status, and enforced critical visibility.</p>
          </div>
          <div className="support-summary-grid">
            <article className="metric-card compact">
              <span className="metric-label">Workload</span>
              <strong>{snapshot.operator_state.workload_index}/100</strong>
            </article>
            <article className="metric-card compact">
              <span className="metric-label">Attention Stability</span>
              <strong>{snapshot.operator_state.attention_stability_index}/100</strong>
            </article>
            <article className="metric-card compact">
              <span className="metric-label">Signal Confidence</span>
              <strong>{snapshot.operator_state.signal_confidence}/100</strong>
            </article>
            <article className="metric-card compact">
              <span className="metric-label">Degraded Mode</span>
              <strong>{snapshot.operator_state.degraded_mode_active ? "Active" : "Clear"}</strong>
            </article>
            <article className="metric-card compact">
              <span className="metric-label">Assistance Mode</span>
              <strong>{formatSupportModeLabel(snapshot.support_mode)}</strong>
            </article>
            <article className="metric-card compact">
              <span className="metric-label">Combined Risk</span>
              <strong>
                {snapshot.combined_risk.combined_risk_score.toFixed(1)}/100 {snapshot.combined_risk.combined_risk_band}
              </strong>
            </article>
          </div>
          <div className="badge-row">
            <span className={`badge ${snapshot.operator_state.degraded_mode_active ? "alert" : "ok"}`}>
              Degraded mode: {snapshot.operator_state.degraded_mode_active ? "active" : "clear"}
            </span>
            <span className={`badge ${snapshot.support_mode === "protected_response" ? "alert" : snapshot.support_mode === "guided_support" ? "neutral" : "ok"}`}>
              Assistance: {formatSupportModeLabel(snapshot.support_mode)}
            </span>
            <span className={`badge ${riskBadgeTone(snapshot.combined_risk.combined_risk_band)}`}>
              Combined risk: {snapshot.combined_risk.combined_risk_band}
            </span>
            <span className="badge ok">Critical visibility guardrails active</span>
            <span className="badge ok">Rule-based storyline active</span>
            <span className="badge ok">Dynamic first-response lane active</span>
          </div>
          <div className={`mode-presentation-banner ${presentationPolicy.support_panel_mode_class}`}>
            <strong>{formatSupportModeLabel(snapshot.support_mode)}</strong>
            <p className="muted">{snapshot.support_policy.support_behavior_changes.join(" ")}</p>
            <p className="muted">{presentationPolicy.validation_status_summary}</p>
          </div>
          <div className="support-refinement-grid">
            {supportCards.map((card) => (
              <article key={card.id} className="support-explanation-card">
                <span className="metric-label">{card.title}</span>
                <p className="muted">{card.body}</p>
              </article>
            ))}
          </div>
          {snapshot.support_refinement.degraded_confidence_caution ? (
            <div className={`support-caution-banner caution-${presentationPolicy.caution_priority}`}>
              <strong>Degraded-confidence caveat</strong>
              <p className="muted">{snapshot.support_refinement.degraded_confidence_caution}</p>
            </div>
          ) : null}
          {lastValidation && presentationPolicy.validator_should_surface ? (
            <div className={`validation-banner ${presentationPolicy.validation_mode_class}`}>
              <div className="alarm-title-row">
                <strong>Last action validation</strong>
                <span className={`badge ${validationBadgeTone(lastValidation.outcome)}`}>{lastValidation.outcome}</span>
              </div>
              <p className="mode-summary-note">{presentationPolicy.validator_mode_summary}</p>
              <p className="muted">{lastValidation.explanation}</p>
              <p className="alarm-meta">Reason code: {lastValidation.reason_code}</p>
              <p className="lane-why-now">{lastValidation.risk_context}</p>
              {lastValidation.recommended_safe_alternative ? (
                <p className="alarm-meta">Safer direction: {lastValidation.recommended_safe_alternative}</p>
              ) : null}
              <p className="lane-caution">{lastValidation.confidence_note}</p>
              <div className="badge-row">
                <span className={`badge ${lastValidation.requires_confirmation ? "neutral" : "ok"}`}>
                  {lastValidation.requires_confirmation ? "Confirmation required" : "No confirmation required"}
                </span>
                <span className={`badge ${lastValidation.prevented_harm ? "alert" : "neutral"}`}>
                  {lastValidation.prevented_harm ? "Prevented-harm signal: yes" : "Prevented-harm signal: no"}
                </span>
              </div>
            </div>
          ) : null}
          <div className="support-explanation-grid">
            <article className="support-explanation-card">
              <span className="metric-label">Why risk is here now</span>
              <p className="muted">{snapshot.combined_risk.why_risk_is_current}</p>
            </article>
            <article className="support-explanation-card">
              <span className="metric-label">Confidence caveat</span>
              <p className="muted">{snapshot.combined_risk.confidence_caveat}</p>
            </article>
            <article className="support-explanation-card">
              <span className="metric-label">What changed</span>
              <p className="muted">{snapshot.combined_risk.what_changed}</p>
            </article>
          </div>
          <div className="support-factor-list">
            {snapshot.combined_risk.factor_breakdown.slice(0, 3).map((factor) => (
              <article key={factor.factor_id} className="support-factor-card">
                <div className="alarm-title-row">
                  <strong>{factor.label}</strong>
                  <span>+{factor.contribution.toFixed(1)}</span>
                </div>
                <p className="alarm-meta">Raw index: {factor.raw_index}/100</p>
                <p className="muted">{factor.detail}</p>
              </article>
            ))}
          </div>
        </section>

        <aside className="panel log-panel">
          <div className="panel-header">
            <h2>Supervisor / Log Preview</h2>
            <p className="muted">
              {snapshot.completed_review
                ? "Completed run — deterministic single-session review, KPI comparison when both modes are captured, and bounded replay."
                : "Structured runtime event stream for replay-ready verification."}
            </p>
          </div>
          {sessionRunComparison ? <SessionComparisonPanel comparison={sessionRunComparison} /> : null}
          {comparisonCaptureHint ? (
            <p className="muted comparison-capture-hint">
              Capture comparison: run the other session mode (Next run), then <strong>Reset session</strong> and complete a
              terminal outcome for that mode. Both baseline and adaptive completed runs are kept for this browser session.
            </p>
          ) : null}
          {snapshot.completed_review ? (
            <CompletedSessionReviewPanel review={snapshot.completed_review} canonicalEvents={snapshot.events} />
          ) : (
            <>
              {snapshot.kpi_summary ? (
                <div className="kpi-summary-block" data-testid="kpi-summary-block">
                  <h3 className="kpi-summary-title">Session KPI summary</h3>
                  <p className="muted">
                    Completeness: {snapshot.kpi_summary.completeness} · Generated {snapshot.kpi_summary.generated_at_iso}
                  </p>
                  <ul className="kpi-metric-list">
                    {snapshot.kpi_summary.metrics
                      .filter((entry) => entry.audience === "demo_facing")
                      .map((entry) => (
                        <li key={entry.kpi_id}>
                          <strong>{entry.label}</strong>: {formatDemoKpiValue(entry.value, entry.unit)} {entry.unit}
                        </li>
                      ))}
                  </ul>
                </div>
              ) : null}
              <div className="log-list">
                {recentEvents.map((event) => (
                  <article key={event.event_id} className="log-card">
                    <div className="alarm-title-row">
                      <strong>{event.event_type}</strong>
                      <span>t+{event.sim_time_sec}s</span>
                    </div>
                    <p className="muted">{event.source_module}</p>
                    <pre>{JSON.stringify(event.payload, null, 2)}</pre>
                  </article>
                ))}
              </div>
            </>
          )}
        </aside>
      </main>
    </div>
  );
}

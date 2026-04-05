import { useEffect, useMemo, useState } from "react";
import type { AuraSessionStore } from "./state/sessionStore";
import { createDefaultSessionStore, useAuraSessionSnapshot } from "./state/sessionStore";
import { criticalVariableIds, variableLabels, variableUnits } from "./data/plantModel";

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

export default function App({ store = defaultStore, autoRun = true }: AppProps) {
  const snapshot = useAuraSessionSnapshot(store);
  const [isRunning, setIsRunning] = useState(true);
  const [feedwaterDemand, setFeedwaterDemand] = useState(82);
  const [expandedClusterIds, setExpandedClusterIds] = useState<string[]>([]);

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
          <p className="eyebrow">AURA-IDCR Phase 2</p>
          <h1>{snapshot.scenario.title}</h1>
          <p className="muted">{snapshot.current_phase.label}</p>
        </div>
        <div className="status-grid">
          <div className="status-cell">
            <span className="status-label">Session Mode</span>
            <strong>{snapshot.session_mode}</strong>
          </div>
          <div className="status-cell">
            <span className="status-label">Support Mode</span>
            <strong>{snapshot.support_mode}</strong>
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
          <span className="badge neutral">
            {snapshot.validation_status_available ? "Validation ready" : "Validation placeholder only"}
          </span>
          <span className={`badge ${snapshot.outcome ? "alert" : "ok"}`}>
            {snapshot.outcome ? `Outcome: ${snapshot.outcome.outcome}` : "Scenario running"}
          </span>
        </div>
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

          <div className="procedure-lane">
            <p className="muted">{snapshot.first_response_lane.prototype_notice}</p>
            <div className="procedure-list">
              {snapshot.first_response_lane.items.map((item) => (
                <article key={item.item_id} className="procedure-item">
                  <div className="alarm-title-row">
                    <strong>{item.label}</strong>
                    <span>{item.item_kind}</span>
                  </div>
                  <p className="muted">{item.why}</p>
                  <p className="alarm-meta">{item.completion_hint}</p>
                  {item.source_variable_ids.length > 0 ? (
                    <p className="alarm-meta">Signals: {item.source_variable_ids.map(formatSignalLabel).join(", ")}</p>
                  ) : null}
                  {item.recommended_action_id ? (
                    <button
                      type="button"
                      className="lane-action-button"
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
                store.reset();
              }}
            >
              Reset session
            </button>
          </div>
        </section>

        <section className="panel support-panel">
          <div className="panel-header">
            <h2>Phase 2 Scope Guardrail</h2>
          </div>
          <div className="badge-row">
            <span className="badge ok">Alarm grouping active</span>
            <span className="badge ok">Rule-based storyline active</span>
            <span className="badge ok">Dynamic first-response lane active</span>
            <span className="badge neutral">No human monitoring or adaptive mode shifts in this slice</span>
          </div>
        </section>

        <aside className="panel log-panel">
          <div className="panel-header">
            <h2>Supervisor / Log Preview</h2>
            <p className="muted">Structured runtime event stream for replay-ready verification.</p>
          </div>
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
        </aside>
      </main>
    </div>
  );
}

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

export default function App({ store = defaultStore, autoRun = true }: AppProps) {
  const snapshot = useAuraSessionSnapshot(store);
  const [isRunning, setIsRunning] = useState(true);
  const [feedwaterDemand, setFeedwaterDemand] = useState(82);

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
  const recentEvents = snapshot.events.slice(-8).reverse();

  return (
    <div className="app-shell">
      <header className="top-status-bar">
        <div>
          <p className="eyebrow">AURA-IDCR Phase 1</p>
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
            <span className="status-label">Outcome Window</span>
            <strong>{snapshot.scenario.expected_duration_sec}s</strong>
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
            <h2>Raw Alarm Area</h2>
            <p className="muted">
              {snapshot.alarm_set.active_alarm_count} active alarms, {snapshot.alarm_set.active_alarm_cluster_count} active groups
            </p>
          </div>
          <div className="alarm-list">
            {snapshot.alarm_history.length === 0 ? (
              <p className="muted">No alarms have activated in this session.</p>
            ) : (
              snapshot.alarm_history.map((alarm) => (
                <article
                  key={alarm.alarm_id}
                  className={`alarm-card ${activeAlarmIds.has(alarm.alarm_id) ? "active" : "inactive"} priority-${alarm.priority}`}
                >
                  <div className="alarm-title-row">
                    <strong>{alarm.title}</strong>
                    <span>{alarm.priority}</span>
                  </div>
                  <p className="alarm-meta">
                    #{alarm.activation_order} | t+{alarm.activated_at_sec}s | {activeAlarmIds.has(alarm.alarm_id) ? "Active" : "Inactive"}
                  </p>
                  <p className="muted">{alarm.subsystem_tag}</p>
                </article>
              ))
            )}
          </div>
        </aside>

        <section className="panel placeholder-panel">
          <div className="panel-header">
            <h2>Transparency / Root-Cause Area</h2>
          </div>
          <p className="muted">
            Phase 1 placeholder only. Later phases may rank hypotheses and evidence here, but this slice keeps the operator-facing
            shell stable without adding root-cause logic yet.
          </p>
          <ul className="placeholder-list">
            <li>Initiating event: {snapshot.scenario.initiating_event}</li>
            <li>Training goal: {snapshot.scenario.training_goal}</li>
            <li>Current dominant visible stressor: feedwater-side inventory loss</li>
          </ul>
        </section>

        <section className="panel controls-panel">
          <div className="panel-header">
            <h2>Basic Control Input Area</h2>
            <p className="muted">Bounded operator actions only; no later-phase guidance or interception logic is active here.</p>
          </div>

          <div className="control-block">
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

          <div className="procedure-placeholder">
            <h3>Procedure / First-Response Placeholder</h3>
            <p className="muted">
              Future procedure guidance will live here. Phase 1 keeps this region visible but intentionally static.
            </p>
          </div>
        </section>

        <section className="panel support-panel">
          <div className="panel-header">
            <h2>Support-State Placeholder</h2>
          </div>
          <p className="muted">
            Baseline mode only. Support state remains visible for later adaptive behavior, but no human monitoring or assistance shifts
            are implemented in this slice.
          </p>
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

import { startTransition, useEffect, useMemo, useState } from "react";
import type { ScenarioControlRangeSchema, SessionMode } from "./contracts/aura";
import { buildPresentationPolicy, orderPresentedLaneItems } from "./runtime/presentationPolicy";
import { buildComparisonReportArtifact, buildSessionAfterActionReport } from "./runtime/reportArtifacts";
import { downloadReportArtifact } from "./runtime/reportExport";
import { buildSessionRunComparison } from "./runtime/sessionComparison";
import { formatSupportModeLabel } from "./runtime/supportModePolicy";
import type { AuraSessionStore } from "./state/sessionStore";
import { createDefaultSessionStore, useAuraSessionSnapshot } from "./state/sessionStore";
import { formatClock, riskBadgeTone } from "./ui/format";
import { OperateWorkspace } from "./ui/OperateWorkspace";
import { MetricStrip, StatusPill } from "./ui/primitives";
import { ReviewWorkspace } from "./ui/ReviewWorkspace";
import { buildOperateWorkspaceModel, buildReviewWorkspaceModel, type WorkspaceId } from "./ui/viewModel";

type AppProps = {
  store?: AuraSessionStore;
  autoRun?: boolean;
};

const defaultStore = createDefaultSessionStore();

export default function App({ store = defaultStore, autoRun = true }: AppProps) {
  const snapshot = useAuraSessionSnapshot(store);
  const [workspace, setWorkspace] = useState<WorkspaceId>("operate");
  const [isRunning, setIsRunning] = useState(true);
  const [controlValues, setControlValues] = useState<Record<string, number>>({});
  const [expandedClusterIds, setExpandedClusterIds] = useState<string[]>([]);
  const [selectedSessionMode, setSelectedSessionMode] = useState<SessionMode>("adaptive");
  const [selectedScenarioId, setSelectedScenarioId] = useState(snapshot.scenario.scenario_id);
  const [supervisorOverrideNote, setSupervisorOverrideNote] = useState("");

  useEffect(() => {
    setSelectedSessionMode(snapshot.session_mode);
    setSelectedScenarioId(snapshot.scenario.scenario_id);
    setControlValues(
      Object.fromEntries(
        snapshot.manual_control_schema.controls.map((control) => [control.control_id, control.default_value]),
      ) as Record<string, number>,
    );
  }, [snapshot.manual_control_schema.controls, snapshot.scenario.scenario_id, snapshot.session_mode]);

  useEffect(() => {
    if (!autoRun || !isRunning || snapshot.outcome) {
      return undefined;
    }

    const timer = window.setInterval(() => {
      store.advanceTick();
    }, 450);

    return () => window.clearInterval(timer);
  }, [autoRun, isRunning, snapshot.outcome, store]);

  useEffect(() => {
    if (snapshot.outcome) {
      setIsRunning(false);
    }
  }, [snapshot.outcome, snapshot.session_id]);

  useEffect(() => {
    setSupervisorOverrideNote("");
  }, [snapshot.pending_supervisor_override?.action_request.action_request_id, snapshot.pending_supervisor_override?.request_status]);

  useEffect(() => {
    setExpandedClusterIds([]);
    setWorkspace("operate");
  }, [snapshot.session_id]);

  const actionLabels = useMemo(
    () =>
      Object.fromEntries(snapshot.scenario.allowed_operator_actions.map((action) => [action.action_id, action.label])) as Record<
        string,
        string
      >,
    [snapshot.scenario.allowed_operator_actions],
  );

  const pendingConfirmation = snapshot.pending_action_confirmation;
  const pendingSupervisorOverride = snapshot.pending_supervisor_override;
  const actionConfirmationPending =
    Boolean(pendingConfirmation) || pendingSupervisorOverride?.request_status === "requested";

  const presentationPolicy = useMemo(
    () =>
      buildPresentationPolicy({
        session_mode: snapshot.session_mode,
        support_mode: snapshot.support_mode,
        support_policy: snapshot.support_policy,
        support_refinement: snapshot.support_refinement,
        last_validation_result: snapshot.last_validation_result,
        pending_action_confirmation: snapshot.pending_action_confirmation,
        pending_supervisor_override: snapshot.pending_supervisor_override,
      }),
    [
      snapshot.session_mode,
      snapshot.last_validation_result,
      snapshot.pending_action_confirmation,
      snapshot.pending_supervisor_override,
      snapshot.support_mode,
      snapshot.support_policy,
      snapshot.support_refinement,
    ],
  );

  const presentedLaneItems = useMemo(
    () => orderPresentedLaneItems(snapshot.first_response_lane.items, presentationPolicy.procedure_item_order),
    [presentationPolicy.procedure_item_order, snapshot.first_response_lane.items],
  );

  const comparisonCapture = useMemo(() => {
    const captureKey = `${snapshot.scenario.scenario_id}@${snapshot.scenario.version}`;
    return snapshot.evaluation_capture?.[captureKey];
  }, [snapshot.evaluation_capture, snapshot.scenario.scenario_id, snapshot.scenario.version]);

  const sessionRunComparison = useMemo(() => {
    if (!comparisonCapture?.baseline_completed || !comparisonCapture.adaptive_completed) {
      return undefined;
    }

    return buildSessionRunComparison(comparisonCapture.baseline_completed, comparisonCapture.adaptive_completed);
  }, [comparisonCapture]);

  const sessionAfterActionReport = useMemo(
    () => (snapshot.completed_review ? buildSessionAfterActionReport(snapshot.completed_review) : undefined),
    [snapshot.completed_review],
  );

  const comparisonReportArtifact = useMemo(() => {
    if (!sessionRunComparison || !comparisonCapture?.baseline_completed || !comparisonCapture.adaptive_completed) {
      return undefined;
    }

    return buildComparisonReportArtifact({
      comparison: sessionRunComparison,
      baseline_review: comparisonCapture.baseline_completed,
      adaptive_review: comparisonCapture.adaptive_completed,
    });
  }, [comparisonCapture, sessionRunComparison]);

  const comparisonCaptureHint = useMemo(
    () => comparisonCapture && Boolean(comparisonCapture.baseline_completed) !== Boolean(comparisonCapture.adaptive_completed),
    [comparisonCapture],
  );

  const operateModel = useMemo(
    () =>
      buildOperateWorkspaceModel({
        snapshot,
        actionLabels,
        expandedClusterIds,
        presentedLaneItems,
        pendingConfirmation,
        pendingSupervisorOverride,
      }),
    [actionLabels, expandedClusterIds, pendingConfirmation, pendingSupervisorOverride, presentedLaneItems, snapshot],
  );

  const reviewModel = useMemo(
    () =>
      buildReviewWorkspaceModel({
        snapshot,
        sessionRunComparison,
        comparisonCaptureHint: Boolean(comparisonCaptureHint),
      }),
    [comparisonCaptureHint, sessionRunComparison, snapshot],
  );

  const commandMetrics = useMemo(
    () => [
      {
        label: "Simulation clock",
        value: formatClock(snapshot.sim_time_sec),
      },
      {
        label: "Support mode",
        value: formatSupportModeLabel(snapshot.support_mode),
      },
      {
        label: "Alarm compression",
        value: `${snapshot.alarm_intelligence.compression_ratio.toFixed(2)}x`,
      },
      {
        label: "Review status",
        value: snapshot.completed_review || pendingSupervisorOverride ? "Ready" : "Standby",
      },
    ],
    [pendingSupervisorOverride, snapshot.alarm_intelligence.compression_ratio, snapshot.completed_review, snapshot.sim_time_sec, snapshot.support_mode],
  );

  const pendingSupervisorOverrideCard = pendingSupervisorOverride
    ? {
        actionLabel:
          actionLabels[pendingSupervisorOverride.action_request.action_id] ?? pendingSupervisorOverride.action_request.action_id,
        reasonCode: pendingSupervisorOverride.validation_result.reason_code,
        requestStatus: pendingSupervisorOverride.request_status,
        explanation: pendingSupervisorOverride.validation_result.explanation,
      }
    : undefined;

  function openWorkspace(nextWorkspace: WorkspaceId): void {
    startTransition(() => setWorkspace(nextWorkspace));
  }

  function toggleCluster(clusterId: string): void {
    setExpandedClusterIds((current) =>
      current.includes(clusterId) ? current.filter((entry) => entry !== clusterId) : [...current, clusterId],
    );
  }

  function requestLaneAction(actionId: string, recommendedValue?: number): void {
    store.requestAction({
      action_id: actionId,
      requested_value: recommendedValue,
      ui_region: "procedure_lane",
      reason_note:
        actionId === "act_ack_alarm"
          ? snapshot.alarm_set.active_alarm_ids[0] ?? "no_active_alarm"
          : `Operator-first lane guidance for ${snapshot.reasoning_snapshot.dominant_hypothesis_id ?? "monitoring"}`,
    });
  }

  function applyControlAction(control: ScenarioControlRangeSchema, requestedValue: number): void {
    store.requestAction({
      action_id: control.action_id,
      requested_value: requestedValue,
      ui_region: "plant_mimic",
      reason_note: control.reason_note,
    });
  }

  function triggerValidationDemoPreset(control: ScenarioControlRangeSchema, requestedValue: number, label: string): void {
    setControlValues((current) => ({
      ...current,
      [control.control_id]: requestedValue,
    }));
    store.requestAction({
      action_id: control.action_id,
      requested_value: requestedValue,
      ui_region: "plant_mimic",
      reason_note: `${label} demo preset for ${snapshot.runtime_profile_id}`,
    });
  }

  function acknowledgeTopAlarm(): void {
    store.requestAction({
      action_id: "act_ack_alarm",
      ui_region: "alarm_area",
      reason_note: snapshot.alarm_set.active_alarm_ids[0] ?? "no_active_alarm",
    });
  }

  function resetSession(): void {
    setIsRunning(true);
    store.reset({
      session_mode: selectedSessionMode,
      scenario_id: selectedScenarioId,
    });
  }

  return (
    <div className="app-shell">
      <a className="skip-link" href="#app-workspace">
        Skip to workspace
      </a>
      <header className="command-bar">
        <div className="command-bar__identity">
          <p className="eyebrow">AURA-IDCR operator-first shell</p>
          <h1>{snapshot.scenario.title}</h1>
          <p className="command-bar__phase">{snapshot.current_phase.label}</p>
          <p className="command-bar__summary">{presentationPolicy.shell_mode_summary}</p>
        </div>

        <div className="command-bar__controls">
          <div className="workspace-switch" role="tablist" aria-label="Workspace switch">
            <button
              type="button"
              role="tab"
              aria-selected={workspace === "operate"}
              className={workspace === "operate" ? "workspace-switch__button is-active" : "workspace-switch__button"}
              onClick={() => openWorkspace("operate")}
            >
              Operate
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={workspace === "review"}
              className={workspace === "review" ? "workspace-switch__button is-active" : "workspace-switch__button"}
              onClick={() => openWorkspace("review")}
            >
              Review
            </button>
          </div>

          <div className="command-control-grid">
            <label className="command-field">
              <span>Next scenario</span>
              <select name="scenario_id" value={selectedScenarioId} onChange={(event) => setSelectedScenarioId(event.target.value)}>
                {snapshot.scenario_catalog.map((scenario) => (
                  <option key={scenario.scenario_id} value={scenario.scenario_id}>
                    {scenario.title}
                  </option>
                ))}
              </select>
            </label>
            <label className="command-field">
              <span>Next run</span>
              <select
                name="session_mode"
                value={selectedSessionMode}
                onChange={(event) => setSelectedSessionMode(event.target.value as SessionMode)}
              >
                <option value="adaptive">adaptive</option>
                <option value="baseline">baseline</option>
              </select>
            </label>
            <div className="command-actions">
              <button type="button" className="ghost-button" onClick={() => setIsRunning((value) => !value)} disabled={Boolean(snapshot.outcome)}>
                {isRunning ? "Hold runtime loop" : "Resume runtime loop"}
              </button>
              <button type="button" className="ghost-button" onClick={() => store.advanceTick()} disabled={Boolean(snapshot.outcome)}>
                Advance one tick
              </button>
              <button type="button" onClick={resetSession}>
                Reset session
              </button>
            </div>
          </div>
        </div>

        <div className="command-bar__status">
          <MetricStrip items={commandMetrics} className="metric-strip--compact" />
          <div className="pill-row">
            <StatusPill tone="ok">{snapshot.logging_active ? "Logging active" : "Logging offline"}</StatusPill>
            <StatusPill tone={snapshot.validation_status_available ? presentationPolicy.status_tone : "neutral"}>
              {snapshot.validation_status_available ? presentationPolicy.validation_status_label : "Validation offline"}
            </StatusPill>
            <StatusPill tone={snapshot.outcome ? "alert" : riskBadgeTone(snapshot.combined_risk.combined_risk_band)}>
              {snapshot.outcome ? `Outcome ${snapshot.outcome.outcome}` : "Scenario running"}
            </StatusPill>
            {snapshot.completed_review ? <StatusPill tone="neutral">Review evidence ready</StatusPill> : null}
          </div>
          <p className="command-bar__summary">{presentationPolicy.validation_status_summary}</p>
        </div>
      </header>

      {workspace === "operate" ? (
        <OperateWorkspace
          snapshot={snapshot}
          model={operateModel}
          controlValues={controlValues}
          actionConfirmationPending={actionConfirmationPending}
          pendingConfirmation={pendingConfirmation}
          pendingSupervisorOverride={pendingSupervisorOverride}
          presentationPolicy={presentationPolicy}
          onToggleCluster={toggleCluster}
          onRequestLaneAction={requestLaneAction}
          onChangeControlValue={(controlId, value) =>
            setControlValues((current) => ({
              ...current,
              [controlId]: value,
            }))
          }
          onApplyControlAction={applyControlAction}
          onTriggerValidationDemoPreset={triggerValidationDemoPreset}
          onAcknowledgeTopAlarm={acknowledgeTopAlarm}
          onConfirmPendingAction={() => store.confirmPendingAction()}
          onDismissPendingActionConfirmation={() => store.dismissPendingActionConfirmation()}
          onRequestSupervisorOverrideReview={() => store.requestSupervisorOverrideReview()}
          onOpenReview={() => openWorkspace("review")}
        />
      ) : (
        <ReviewWorkspace
          model={reviewModel}
          completedReview={snapshot.completed_review}
          canonicalEvents={snapshot.events}
          sessionRunComparison={sessionRunComparison}
          sessionReportReady={Boolean(sessionAfterActionReport)}
          comparisonReportReady={Boolean(comparisonReportArtifact)}
          pendingSupervisorOverrideCard={pendingSupervisorOverrideCard}
          supervisorOverrideNote={supervisorOverrideNote}
          onSupervisorOverrideNoteChange={setSupervisorOverrideNote}
          onApproveOverride={() => store.approvePendingSupervisorOverride(supervisorOverrideNote)}
          onDenyOverride={() => store.denyPendingSupervisorOverride(supervisorOverrideNote)}
          onDownloadSessionReport={() => {
            if (sessionAfterActionReport) {
              downloadReportArtifact(sessionAfterActionReport);
            }
          }}
          onDownloadComparisonReport={() => {
            if (comparisonReportArtifact) {
              downloadReportArtifact(comparisonReportArtifact);
            }
          }}
        />
      )}
    </div>
  );
}

import { startTransition, useEffect, useMemo, useRef, useState } from "react";
import type {
  AiAfterActionReviewerBriefing,
  AiIncidentCommanderBriefing,
  AiWhyAssistantBriefing,
  ScenarioControlRangeSchema,
  SessionMode,
} from "./contracts/aura";
import { buildPresentationPolicy, orderPresentedLaneItems } from "./runtime/presentationPolicy";
import { buildComparisonReportArtifact, buildSessionAfterActionReport } from "./runtime/reportArtifacts";
import { downloadReportArtifact } from "./runtime/reportExport";
import { buildSessionRunComparison } from "./runtime/sessionComparison";
import { formatSupportModeLabel } from "./runtime/supportModePolicy";
import type { AuraSessionStore } from "./state/sessionStore";
import { createDefaultSessionStore, useAuraSessionSnapshot } from "./state/sessionStore";
import { formatClock, riskBadgeTone } from "./ui/format";
import { HumanMonitoringWorkspace } from "./ui/HumanMonitoringWorkspace";
import { OperateWorkspace } from "./ui/OperateWorkspace";
import { MetricStrip, StatusPill } from "./ui/primitives";
import { ReviewWorkspace } from "./ui/ReviewWorkspace";
import { TutorialOverlay } from "./ui/TutorialOverlay";
import { useAiBriefing } from "./ui/useAiBriefing";
import { useWebcamMonitoring } from "./ui/useWebcamMonitoring";
import {
  getTutorialFlow,
  type RunPace,
  type TutorialActionId,
  type TutorialPathId,
  type TutorialSignal,
} from "./ui/tutorial";
import {
  buildHumanMonitoringWorkspaceModel,
  buildOperateWorkspaceModel,
  buildReviewWorkspaceModel,
  type WorkspaceId,
} from "./ui/viewModel";

type AppProps = {
  store?: AuraSessionStore;
  autoRun?: boolean;
};

type TutorialState =
  | {
      mode: "closed";
    }
  | {
      mode: "menu";
    }
  | {
      mode: "running";
      pathId: TutorialPathId;
      stepIndex: number;
      signals: Set<TutorialSignal>;
    };

const defaultStore = createDefaultSessionStore();
const tutorialDismissKey = "aura-idcr.tutorial.v2.dismissed";
const introScenarioId = "scn_alarm_cascade_root_cause";
const emptyTutorialSignals: ReadonlySet<TutorialSignal> = new Set();

function readTutorialDismissed(): boolean {
  if (typeof window === "undefined") {
    return true;
  }

  try {
    return window.localStorage.getItem(tutorialDismissKey) === "true";
  } catch {
    return true;
  }
}

function writeTutorialDismissed(): void {
  if (typeof window === "undefined") {
    return;
  }

  try {
    window.localStorage.setItem(tutorialDismissKey, "true");
  } catch {
    // Ignore storage failures and keep the tutorial usable.
  }
}

function checkpointPauseReason(
  previousSnapshot: ReturnType<AuraSessionStore["getSnapshot"]>,
  nextSnapshot: ReturnType<AuraSessionStore["getSnapshot"]>,
): string | undefined {
  if (previousSnapshot.session_id !== nextSnapshot.session_id) {
    return undefined;
  }

  if (!previousSnapshot.outcome && nextSnapshot.outcome) {
    return "Checkpoint pause: the scenario reached a terminal outcome and review evidence is now ready.";
  }

  if (previousSnapshot.current_phase.phase_id !== nextSnapshot.current_phase.phase_id) {
    return `Checkpoint pause: the scenario entered ${nextSnapshot.current_phase.label}.`;
  }

  if (previousSnapshot.alarm_set.active_alarm_count === 0 && nextSnapshot.alarm_set.active_alarm_count > 0) {
    return "Checkpoint pause: the first abnormal alarms entered the picture.";
  }

  if (
    previousSnapshot.support_mode !== nextSnapshot.support_mode &&
    nextSnapshot.session_mode === "adaptive"
  ) {
    return `Checkpoint pause: support mode changed to ${formatSupportModeLabel(nextSnapshot.support_mode)}.`;
  }

  if (!previousSnapshot.pending_action_confirmation && nextSnapshot.pending_action_confirmation) {
    return "Checkpoint pause: a soft warning is waiting for explicit confirmation.";
  }

  if (
    previousSnapshot.last_validation_result?.outcome !== "hard_prevent" &&
    nextSnapshot.last_validation_result?.outcome === "hard_prevent"
  ) {
    return "Checkpoint pause: the validator blocked a high-risk action.";
  }

  if (
    previousSnapshot.pending_supervisor_override?.request_status !== "requested" &&
    nextSnapshot.pending_supervisor_override?.request_status === "requested"
  ) {
    return "Checkpoint pause: a supervisor decision is pending in Review.";
  }

  return undefined;
}

function aiProviderLabel(entry?: { provider?: "llm" | "deterministic_fallback"; model?: string; used_fallback?: boolean }): string | undefined {
  if (!entry?.provider) {
    return undefined;
  }

  if (entry.provider === "llm") {
    return `LLM briefing${entry.model ? ` (${entry.model})` : ""}`;
  }

  return entry.used_fallback ? "Deterministic fallback" : undefined;
}

function aiFallbackNote(entry?: { used_fallback?: boolean; failure_kind?: string }): string | undefined {
  if (!entry?.used_fallback) {
    return undefined;
  }

  switch (entry.failure_kind) {
    case "rate_limited":
      return "Fallback is shown because the structured AI request was rate-limited.";
    case "not_configured":
      return "Fallback is shown because the server-side AI key is not configured.";
    case "invalid_response":
      return "Fallback is shown because the AI response failed structured validation.";
    case "network_error":
      return "Fallback is shown because the AI request failed before a server response was available.";
    default:
      return "Fallback is shown because the structured AI response was unavailable.";
  }
}

export default function App({ store = defaultStore, autoRun = false }: AppProps) {
  const snapshot = useAuraSessionSnapshot(store);
  const [workspace, setWorkspace] = useState<WorkspaceId>("operate");
  const [isRunning, setIsRunning] = useState(autoRun);
  const [runPace, setRunPace] = useState<RunPace>("guided");
  const [checkpointPauseEnabled, setCheckpointPauseEnabled] = useState(true);
  const [runtimePauseReason, setRuntimePauseReason] = useState(
    "Simulation paused. Guided pace is the learning/demo mode, live pace is the faster continuous mode, and one-tick stepping lets you inspect cause and effect.",
  );
  const [controlValues, setControlValues] = useState<Record<string, number>>({});
  const [expandedClusterIds, setExpandedClusterIds] = useState<string[]>([]);
  const [selectedSessionMode, setSelectedSessionMode] = useState<SessionMode>("adaptive");
  const [selectedScenarioId, setSelectedScenarioId] = useState(snapshot.scenario.scenario_id);
  const [supervisorOverrideNote, setSupervisorOverrideNote] = useState("");
  const [tutorialState, setTutorialState] = useState<TutorialState>(() =>
    store === defaultStore && !readTutorialDismissed() ? { mode: "menu" } : { mode: "closed" },
  );
  const webcamMonitoring = useWebcamMonitoring({ store, snapshot });
  const aiBriefing = useAiBriefing({
    store,
    snapshot,
    completedReview: snapshot.completed_review,
  });

  const previousSnapshotRef = useRef(snapshot);
  const tutorialAutoAdvanceStepRef = useRef<string | null>(null);
  const tutorialRestartPendingRef = useRef<TutorialPathId | null>(null);

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
    if (!isRunning || snapshot.outcome) {
      return undefined;
    }

    const intervalMs = runPace === "guided" ? 1200 : 450;
    const timer = window.setInterval(() => {
      store.advanceTick();
    }, intervalMs);

    return () => window.clearInterval(timer);
  }, [isRunning, runPace, snapshot.outcome, store]);

  useEffect(() => {
    const previousSnapshot = previousSnapshotRef.current;
    if (checkpointPauseEnabled && isRunning) {
      const reason = checkpointPauseReason(previousSnapshot, snapshot);
      if (reason) {
        setIsRunning(false);
        setRuntimePauseReason(reason);
      }
    }

    previousSnapshotRef.current = snapshot;
  }, [checkpointPauseEnabled, isRunning, snapshot]);

  useEffect(() => {
    if (snapshot.outcome) {
      setIsRunning(false);
      setRuntimePauseReason("Scenario complete. Review evidence is now ready.");
    }
  }, [snapshot.outcome, snapshot.session_id]);

  useEffect(() => {
    setSupervisorOverrideNote("");
  }, [snapshot.pending_supervisor_override?.action_request.action_request_id, snapshot.pending_supervisor_override?.request_status]);

  useEffect(() => {
    store.setInteractionTelemetrySuppressed(tutorialState.mode !== "closed");
  }, [store, tutorialState.mode]);

  useEffect(() => {
    setExpandedClusterIds([]);
    setWorkspace("operate");
    setRunPace("guided");
    setIsRunning(false);
    setRuntimePauseReason(
      tutorialRestartPendingRef.current
        ? "Tutorial loaded the introductory feedwater scenario and paused the runtime."
        : "Session reset. Guided pace is the learning/demo mode, live pace is the faster continuous mode, and one-tick stepping lets you inspect cause and effect.",
    );
    tutorialRestartPendingRef.current = null;
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
  const monitoringModel = useMemo(
    () =>
      buildHumanMonitoringWorkspaceModel({
        snapshot,
      }),
    [snapshot],
  );

  const tutorialFlow = tutorialState.mode === "running" ? getTutorialFlow(tutorialState.pathId) : undefined;
  const tutorialStep =
    tutorialState.mode === "running" && tutorialFlow
      ? tutorialFlow.steps[tutorialState.stepIndex] ?? tutorialFlow.steps[0]
      : undefined;
  const tutorialSignals = tutorialState.mode === "running" ? tutorialState.signals : emptyTutorialSignals;

  const tutorialContext = useMemo(
    () => ({
      snapshot,
      workspace,
      isRunning,
      runPace,
      checkpointPauseEnabled,
      expandedClusterIds,
      signals: tutorialSignals,
    }),
    [checkpointPauseEnabled, expandedClusterIds, isRunning, runPace, snapshot, tutorialSignals, workspace],
  );

  const tutorialStepComplete = tutorialStep
    ? tutorialStep.completion.kind === "manual" || tutorialStep.completion.isComplete(tutorialContext)
    : true;

  const tutorialCanAdvance = tutorialStep ? tutorialStep.completion.kind === "manual" || tutorialStepComplete : false;
  const lockedTutorialActions = tutorialStep?.lockedActionIds;
  const checkpointPauseActive = !isRunning && runtimePauseReason.startsWith("Checkpoint pause:");
  const guidedRunLabel = checkpointPauseActive ? "Resume guided pace" : "Run guided pace";
  const liveRunLabel = checkpointPauseActive ? "Resume live pace" : "Run live pace";
  const commandControlHint = isRunning
    ? runPace === "guided"
      ? "Guided pace is the learning/demo mode. The twin will pause itself again at the next teaching checkpoint."
      : "Live pace keeps the session moving continuously. Pause or step when you want to inspect the event picture more closely."
    : checkpointPauseActive
      ? "Checkpoint pause active. Resume guided pace to stay in teachable-stop mode, resume live pace for faster continuous playback, or step one tick to inspect a single update."
      : "Guided pace is the safer learning/demo mode. Live pace is the faster continuous mode, and one-tick stepping is best for close reading.";

  const commandMetrics = useMemo(
    () => [
      {
        label: "Simulation clock",
        value: formatClock(snapshot.sim_time_sec),
      },
      {
        label: "Runtime state",
        value: isRunning ? `${runPace === "guided" ? "Guided" : "Live"} pace` : "Paused",
      },
      {
        label: "Support mode",
        value: formatSupportModeLabel(snapshot.support_mode),
      },
      {
        label: "Alarm compression",
        value: `${snapshot.alarm_intelligence.compression_ratio.toFixed(2)}x`,
      },
    ],
    [isRunning, runPace, snapshot.alarm_intelligence.compression_ratio, snapshot.sim_time_sec, snapshot.support_mode],
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

  const incidentCommanderEntry =
    aiBriefing.incidentCommander.entry?.kind === "incident_commander" ? aiBriefing.incidentCommander.entry : undefined;
  const incidentCommanderView = incidentCommanderEntry
    ? {
        status: incidentCommanderEntry.status,
        stale: aiBriefing.incidentCommander.stale,
        providerLabel: aiProviderLabel(incidentCommanderEntry),
        fallbackNote: aiFallbackNote(incidentCommanderEntry),
        response: incidentCommanderEntry.response as AiIncidentCommanderBriefing | undefined,
      }
    : undefined;

  const afterActionReviewerEntry =
    aiBriefing.afterActionReviewer.entry?.kind === "after_action_reviewer"
      ? aiBriefing.afterActionReviewer.entry
      : undefined;
  const afterActionReviewerView = afterActionReviewerEntry
    ? {
        status: afterActionReviewerEntry.status,
        providerLabel: aiProviderLabel(afterActionReviewerEntry),
        fallbackNote: aiFallbackNote(afterActionReviewerEntry),
        response: afterActionReviewerEntry.response as AiAfterActionReviewerBriefing | undefined,
      }
    : undefined;

  const supportCurrentWhyEntry =
    aiBriefing.whyAssistant.entries.support_current?.kind === "why_assistant"
      ? aiBriefing.whyAssistant.entries.support_current
      : undefined;
  const supportAlternativeWhyEntry =
    aiBriefing.whyAssistant.entries.support_alternative?.kind === "why_assistant"
      ? aiBriefing.whyAssistant.entries.support_alternative
      : undefined;
  const validatorWhyEntry =
    aiBriefing.whyAssistant.entries.validator_last_result?.kind === "why_assistant"
      ? aiBriefing.whyAssistant.entries.validator_last_result
      : undefined;
  const whyAssistantView = {
    supportCurrent: supportCurrentWhyEntry
      ? {
          status: supportCurrentWhyEntry.status,
          stale: aiBriefing.whyAssistant.stale.support_current,
          providerLabel: aiProviderLabel(supportCurrentWhyEntry),
          fallbackNote: aiFallbackNote(supportCurrentWhyEntry),
          response: supportCurrentWhyEntry.response as AiWhyAssistantBriefing | undefined,
        }
      : undefined,
    supportAlternative: supportAlternativeWhyEntry
      ? {
          status: supportAlternativeWhyEntry.status,
          stale: aiBriefing.whyAssistant.stale.support_alternative,
          providerLabel: aiProviderLabel(supportAlternativeWhyEntry),
          fallbackNote: aiFallbackNote(supportAlternativeWhyEntry),
          response: supportAlternativeWhyEntry.response as AiWhyAssistantBriefing | undefined,
        }
      : undefined,
    validator: validatorWhyEntry
      ? {
          status: validatorWhyEntry.status,
          stale: aiBriefing.whyAssistant.stale.validator_last_result,
          providerLabel: aiProviderLabel(validatorWhyEntry),
          fallbackNote: aiFallbackNote(validatorWhyEntry),
          response: validatorWhyEntry.response as AiWhyAssistantBriefing | undefined,
        }
      : undefined,
  };

  function recordTutorialSignal(signal: TutorialSignal): void {
    setTutorialState((current) => {
      if (current.mode !== "running") {
        return current;
      }

      const signals = new Set(current.signals);
      signals.add(signal);
      return {
        ...current,
        signals,
      };
    });
  }

  function isTutorialActionAllowed(actionId: TutorialActionId): boolean {
    if (tutorialState.mode !== "running" || !lockedTutorialActions || lockedTutorialActions.length === 0) {
      return true;
    }

    return lockedTutorialActions.includes(actionId);
  }

  function openWorkspace(nextWorkspace: WorkspaceId): void {
    if (
      nextWorkspace !== "monitoring" &&
      !isTutorialActionAllowed(nextWorkspace === "review" ? "workspace:review" : "workspace:operate")
    ) {
      return;
    }

    if (nextWorkspace === "review") {
      recordTutorialSignal("workspace-review-opened");
    } else if (nextWorkspace === "operate") {
      recordTutorialSignal("workspace-operate-opened");
    }

    store.recordInteractionTelemetry({
      event_kind: "workspace_switch",
      ui_region: "workspace_switcher",
      workspace: nextWorkspace,
      target_id: nextWorkspace,
      detail: `Workspace switched to ${nextWorkspace}.`,
    });

    startTransition(() => setWorkspace(nextWorkspace));
  }

  function toggleCluster(clusterId: string): void {
    if (!isTutorialActionAllowed("alarm:inspect-cluster")) {
      return;
    }

    store.recordInteractionTelemetry({
      event_kind: "alarm_cluster_toggle",
      ui_region: "alarm_cluster",
      workspace,
      target_id: clusterId,
      detail: "Alarm cluster inspection toggled.",
    });

    setExpandedClusterIds((current) => {
      const nextExpanded = current.includes(clusterId)
        ? current.filter((entry) => entry !== clusterId)
        : [...current, clusterId];

      if (nextExpanded.includes(clusterId)) {
        recordTutorialSignal("alarm-cluster-opened");
      }

      return nextExpanded;
    });
  }

  function requestLaneAction(actionId: string, recommendedValue?: number): void {
    if (!isTutorialActionAllowed("actions:lane-primary")) {
      return;
    }

    recordTutorialSignal("lane-action-requested");
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
    if (!isTutorialActionAllowed("actions:manual-apply")) {
      return;
    }

    store.requestAction({
      action_id: control.action_id,
      requested_value: requestedValue,
      ui_region: "plant_mimic",
      reason_note: control.reason_note,
    });
  }

  function requestCounterfactualAdvisor(control?: ScenarioControlRangeSchema, requestedValue?: number): void {
    void store.requestCounterfactualAdvisor({
      requested_control_id: control?.control_id,
      requested_value: requestedValue,
    });
  }

  function triggerValidationDemoPreset(control: ScenarioControlRangeSchema, requestedValue: number, label: string): void {
    if (!isTutorialActionAllowed("actions:demo-preset")) {
      return;
    }

    recordTutorialSignal("validator-demo-requested");
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
    if (!isTutorialActionAllowed("actions:ack-top-alarm")) {
      return;
    }

    store.requestAction({
      action_id: "act_ack_alarm",
      ui_region: "alarm_area",
      reason_note: snapshot.alarm_set.active_alarm_ids[0] ?? "no_active_alarm",
    });
  }

  function beginRun(nextRunPace: RunPace): void {
    if (!isTutorialActionAllowed(nextRunPace === "guided" ? "runtime:run-guided" : "runtime:run-live") || snapshot.outcome) {
      return;
    }

    setRunPace(nextRunPace);
    setIsRunning(true);
    store.recordInteractionTelemetry({
      event_kind: "runtime_control",
      ui_region: "runtime_controls",
      workspace,
      target_id: nextRunPace === "guided" ? "run_guided" : "run_live",
      detail: `Runtime ${nextRunPace} pace started.`,
    });
    setRuntimePauseReason(
      nextRunPace === "guided"
        ? "Guided pace running. Checkpoint pauses will stop the scenario at teachable moments so you can study the cause-and-effect chain."
        : "Live pace running. Pause or step whenever you want to inspect the system more closely.",
    );
    recordTutorialSignal(nextRunPace === "guided" ? "runtime-guided-started" : "runtime-live-started");
  }

  function pauseRun(): void {
    if (!isTutorialActionAllowed("runtime:pause")) {
      return;
    }

    setIsRunning(false);
    store.recordInteractionTelemetry({
      event_kind: "runtime_control",
      ui_region: "runtime_controls",
      workspace,
      target_id: "pause",
      detail: "Runtime paused.",
    });
    setRuntimePauseReason(
      "Runtime paused. Resume guided pace for learning/demo mode, resume live pace for faster playback, or step one tick for a single deterministic update.",
    );
  }

  function advanceOneTick(): void {
    if (!isTutorialActionAllowed("runtime:advance") || snapshot.outcome) {
      return;
    }

    recordTutorialSignal("runtime-advanced");
    store.recordInteractionTelemetry({
      event_kind: "runtime_control",
      ui_region: "runtime_controls",
      workspace,
      target_id: "advance_one_tick",
      detail: "Runtime advanced one deterministic tick.",
    });
    store.advanceTick();
    setRuntimePauseReason("Advanced one deterministic simulation tick. Step again or resume guided/live pace when you are ready.");
  }

  function resetSession(): void {
    if (!isTutorialActionAllowed("runtime:reset")) {
      return;
    }

    setIsRunning(false);
    setRunPace("guided");
    setRuntimePauseReason(
      "Session reset. Guided pace is the learning/demo mode, live pace is the faster continuous mode, and one-tick stepping lets you inspect cause and effect.",
    );
    store.recordInteractionTelemetry({
      event_kind: "runtime_control",
      ui_region: "runtime_controls",
      workspace,
      target_id: "reset_session",
      detail: "Session reset requested from the command bar.",
    });
    store.reset({
      session_mode: selectedSessionMode,
      scenario_id: selectedScenarioId,
    });
  }

  function closeTutorial(): void {
    writeTutorialDismissed();
    tutorialAutoAdvanceStepRef.current = null;
    setTutorialState({ mode: "closed" });
  }

  function openTutorialMenu(): void {
    setIsRunning(false);
    setRuntimePauseReason(
      "Runtime paused while the tutorial menu is open. Choose a walkthrough to learn the surface or close it to continue the current session.",
    );
    setTutorialState({ mode: "menu" });
  }

  function startTutorial(pathId: TutorialPathId): void {
    const flow = getTutorialFlow(pathId);

    setIsRunning(false);
    setCheckpointPauseEnabled(true);
    setRunPace("guided");
    tutorialAutoAdvanceStepRef.current = null;

    if (flow.restartMode === "reset_intro_session") {
      tutorialRestartPendingRef.current = pathId;
      setSelectedSessionMode("adaptive");
      setSelectedScenarioId(introScenarioId);
      setWorkspace("operate");
      setExpandedClusterIds([]);
      store.reset({
        session_mode: "adaptive",
        scenario_id: introScenarioId,
      });
    } else {
      setWorkspace("operate");
      setExpandedClusterIds([]);
      setRuntimePauseReason(
        "Runtime paused while the Review tutorial is active. Open Review when you are ready to inspect oversight and evidence.",
      );
    }

    setTutorialState({
      mode: "running",
      pathId,
      stepIndex: 0,
      signals: new Set<TutorialSignal>(),
    });
  }

  function goToNextTutorialStep(): void {
    setTutorialState((current) => {
      if (current.mode !== "running") {
        return current;
      }

      const flow = getTutorialFlow(current.pathId);
      if (current.stepIndex >= flow.steps.length - 1) {
        writeTutorialDismissed();
        tutorialAutoAdvanceStepRef.current = null;
        return { mode: "closed" };
      }

      tutorialAutoAdvanceStepRef.current = null;
      return {
        ...current,
        stepIndex: current.stepIndex + 1,
      };
    });
  }

  function goToPreviousTutorialStep(): void {
    setTutorialState((current) => {
      if (current.mode !== "running") {
        return current;
      }

      tutorialAutoAdvanceStepRef.current = null;
      return {
        ...current,
        stepIndex: Math.max(0, current.stepIndex - 1),
      };
    });
  }

  function completeRunForTutorial(): void {
    if (!isTutorialActionAllowed("tutorial:complete-run")) {
      return;
    }

    setIsRunning(false);
    recordTutorialSignal("tutorial-run-completed");
    store.runUntilComplete(120);
    setRuntimePauseReason("Tutorial checkpoint reached: the run was carried forward so Review can inspect real evidence.");
  }

  useEffect(() => {
    if (tutorialState.mode !== "running" || !tutorialStep) {
      return;
    }

    const tutorialWorkspace = tutorialStep.workspace;
    if (
      tutorialWorkspace &&
      !tutorialStep.requiresManualWorkspaceSwitch &&
      tutorialWorkspace !== workspace
    ) {
      startTransition(() => setWorkspace(tutorialWorkspace));
    }
  }, [tutorialState, tutorialStep, workspace]);

  useEffect(() => {
    if (
      tutorialState.mode !== "running" ||
      !tutorialStep ||
      tutorialStep.completion.kind === "manual" ||
      !tutorialStep.completion.autoAdvance ||
      !tutorialStepComplete
    ) {
      return;
    }

    if (tutorialAutoAdvanceStepRef.current === tutorialStep.id) {
      return;
    }

    tutorialAutoAdvanceStepRef.current = tutorialStep.id;
    const timer = window.setTimeout(() => {
      goToNextTutorialStep();
    }, 220);

    return () => window.clearTimeout(timer);
  }, [tutorialState, tutorialStep, tutorialStepComplete]);

  return (
    <div className="app-shell">
      <a className="skip-link" href="#app-workspace">
        Skip to workspace
      </a>
      <header className="command-bar" data-tutorial-target="command-bar">
        <div className="command-bar__identity">
          <p className="eyebrow">AURA-IDCR operator-first shell</p>
          <h1>{snapshot.scenario.title}</h1>
          <p className="command-bar__phase">{snapshot.current_phase.label}</p>
          <p className="command-bar__summary">{presentationPolicy.shell_mode_summary}</p>
          <div className="pill-row">
            <StatusPill tone="neutral">Runtime {isRunning ? "active" : "paused"}</StatusPill>
            <StatusPill tone={checkpointPauseEnabled ? "ok" : "neutral"}>
              Checkpoint pauses {checkpointPauseEnabled ? "on" : "off"}
            </StatusPill>
            <StatusPill tone={webcamMonitoring.statusTone}>{webcamMonitoring.statusLabel}</StatusPill>
            <button type="button" className="ghost-button" onClick={openTutorialMenu}>
              Tutorial guide
            </button>
          </div>
        </div>

        <div className="command-bar__controls">
          <div className="workspace-switch" role="tablist" aria-label="Workspace switch" data-tutorial-target="workspace-switch">
            <button
              type="button"
              role="tab"
              aria-selected={workspace === "operate"}
              className={workspace === "operate" ? "workspace-switch__button is-active" : "workspace-switch__button"}
              disabled={!isTutorialActionAllowed("workspace:operate")}
              onClick={() => openWorkspace("operate")}
            >
              Operate
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={workspace === "monitoring"}
              className={workspace === "monitoring" ? "workspace-switch__button is-active" : "workspace-switch__button"}
              disabled={tutorialState.mode === "running"}
              onClick={() => openWorkspace("monitoring")}
            >
              Human Monitoring
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={workspace === "review"}
              className={workspace === "review" ? "workspace-switch__button is-active" : "workspace-switch__button"}
              disabled={!isTutorialActionAllowed("workspace:review")}
              onClick={() => openWorkspace("review")}
            >
              Review
            </button>
          </div>

          <div className="command-control-grid" data-tutorial-target="runtime-controls">
            <label className="command-field">
              <span>Next scenario</span>
              <select
                name="scenario_id"
                value={selectedScenarioId}
                disabled={!isTutorialActionAllowed("runtime:change-scenario")}
                onChange={(event) => setSelectedScenarioId(event.target.value)}
              >
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
                disabled={!isTutorialActionAllowed("runtime:change-mode")}
                onChange={(event) => setSelectedSessionMode(event.target.value as SessionMode)}
              >
                <option value="adaptive">adaptive</option>
                <option value="baseline">baseline</option>
              </select>
            </label>
            <p className="command-help-text">{commandControlHint}</p>
            <div className="command-actions">
              <button type="button" disabled={Boolean(snapshot.outcome) || !isTutorialActionAllowed("runtime:run-guided")} onClick={() => beginRun("guided")}>
                {guidedRunLabel}
              </button>
              <button
                type="button"
                className="ghost-button"
                disabled={Boolean(snapshot.outcome) || !isTutorialActionAllowed("runtime:run-live")}
                onClick={() => beginRun("live")}
              >
                {liveRunLabel}
              </button>
              <button
                type="button"
                className="ghost-button"
                disabled={!isRunning || !isTutorialActionAllowed("runtime:pause")}
                onClick={pauseRun}
              >
                Pause
              </button>
              <button
                type="button"
                className="ghost-button"
                disabled={Boolean(snapshot.outcome) || !isTutorialActionAllowed("runtime:advance")}
                onClick={advanceOneTick}
              >
                Advance one tick
              </button>
              <button type="button" disabled={!isTutorialActionAllowed("runtime:reset")} onClick={resetSession}>
                Reset session
              </button>
            </div>
            <div className="command-actions">
              <button
                type="button"
                className="ghost-button"
                disabled={!isTutorialActionAllowed("runtime:toggle-checkpoint")}
                onClick={() => setCheckpointPauseEnabled((value) => !value)}
              >
                {checkpointPauseEnabled ? "Turn checkpoint pauses off" : "Turn checkpoint pauses on"}
              </button>
              <button
                type="button"
                className="ghost-button"
                disabled={webcamMonitoring.disabled}
                onClick={webcamMonitoring.toggle}
              >
                {webcamMonitoring.buttonLabel}
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
              {snapshot.outcome ? `Outcome ${snapshot.outcome.outcome}` : "Scenario active"}
            </StatusPill>
            {snapshot.completed_review ? <StatusPill tone="neutral">Review evidence ready</StatusPill> : null}
          </div>
          <p className="command-bar__summary">{runtimePauseReason}</p>
          <p className="command-bar__summary">{presentationPolicy.validation_status_summary}</p>
          <p className="command-bar__summary">{webcamMonitoring.statusDetail}</p>
        </div>
      </header>

      {workspace === "operate" ? (
        <OperateWorkspace
          snapshot={snapshot}
          model={operateModel}
          controlValues={controlValues}
          incidentCommander={incidentCommanderView}
          whyAssistant={whyAssistantView}
          actionConfirmationPending={actionConfirmationPending}
          pendingConfirmation={pendingConfirmation}
          pendingSupervisorOverride={pendingSupervisorOverride}
          presentationPolicy={presentationPolicy}
          isTutorialActionAllowed={isTutorialActionAllowed}
          onToggleCluster={toggleCluster}
          onLoadIncidentCommander={aiBriefing.loadIncidentCommander}
          onLoadWhyAssistant={aiBriefing.loadWhyAssistant}
          onClearWhyAssistant={aiBriefing.clearWhyAssistant}
          onRequestLaneAction={requestLaneAction}
          onChangeControlValue={(controlId, value) =>
            {
              store.recordInteractionTelemetry({
                event_kind: "manual_control_adjustment",
                ui_region: "plant_mimic",
                workspace: "operate",
                target_id: controlId,
                requested_value: value,
                detail: "Manual control slider adjusted.",
              });
              setControlValues((current) => ({
                ...current,
                [controlId]: value,
              }));
            }
          }
          onApplyControlAction={applyControlAction}
          onRequestCounterfactualAdvisor={requestCounterfactualAdvisor}
          onTriggerValidationDemoPreset={triggerValidationDemoPreset}
          onAcknowledgeTopAlarm={acknowledgeTopAlarm}
          onConfirmPendingAction={() => store.confirmPendingAction()}
          onDismissPendingActionConfirmation={() => store.dismissPendingActionConfirmation()}
          onRequestSupervisorOverrideReview={() => store.requestSupervisorOverrideReview()}
          onOpenReview={() => openWorkspace("review")}
        />
      ) : workspace === "monitoring" ? (
        <HumanMonitoringWorkspace model={monitoringModel} webcamMonitoring={webcamMonitoring} />
      ) : (
        <ReviewWorkspace
          model={reviewModel}
          completedReview={snapshot.completed_review}
          latestCounterfactualAdvisor={snapshot.counterfactual_advisor}
          canonicalEvents={snapshot.events}
          sessionRunComparison={sessionRunComparison}
          sessionReportReady={Boolean(sessionAfterActionReport)}
          comparisonReportReady={Boolean(comparisonReportArtifact)}
          afterActionReviewer={afterActionReviewerView}
          pendingSupervisorOverrideCard={pendingSupervisorOverrideCard}
          supervisorOverrideNote={supervisorOverrideNote}
          onSupervisorOverrideNoteChange={setSupervisorOverrideNote}
          onLoadAfterActionReviewer={aiBriefing.loadAfterActionReviewer}
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

      {tutorialState.mode !== "closed" ? (
        <TutorialOverlay
          mode={tutorialState.mode}
          flow={tutorialFlow}
          step={tutorialStep}
          stepIndex={tutorialState.mode === "running" ? tutorialState.stepIndex : undefined}
          targetId={tutorialStep?.targetId}
          canAdvance={tutorialCanAdvance}
          isTaskComplete={tutorialStepComplete}
          lockedActionCount={lockedTutorialActions?.length ?? 0}
          onBack={goToPreviousTutorialStep}
          onNext={goToNextTutorialStep}
          onSkip={closeTutorial}
          onStartPath={startTutorial}
          onPanelAction={tutorialStep?.panelActionId === "complete-run" ? completeRunForTutorial : undefined}
        />
      ) : null}
    </div>
  );
}

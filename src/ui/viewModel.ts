import type {
  PendingActionConfirmation,
  PendingSupervisorOverride,
  SessionSnapshot,
  SessionRunComparison,
} from "../contracts/aura";
import { criticalVariableIds, variableLabels, variableUnits } from "../data/plantModel";
import { formatSupportModeLabel } from "../runtime/supportModePolicy";
import {
  formatClock,
  formatSignalLabel,
  formatValue,
  priorityTone,
  riskBadgeTone,
  type StatusTone,
  urgencyBadgeTone,
  validationBadgeTone,
} from "./format";
import type { MetricItemModel, StatusPillModel } from "./primitives";
import type { SupportSectionId } from "../runtime/presentationPolicy";

export type WorkspaceId = "operate" | "monitoring" | "review";

export type OperateAssistanceCueModel = {
  eyebrow: string;
  headline: string;
  body: string;
  tone: StatusTone;
  pills: StatusPillModel[];
};

export type OperateGuidanceCardModel = {
  id: string;
  label: string;
  headline: string;
  body: string;
  tone: StatusTone;
};

export type OperateSupportSectionModel = {
  id: SupportSectionId;
  label: string;
  headline: string;
  body: string;
  tone: StatusTone;
  meta?: string;
  pills?: StatusPillModel[];
};

export type OperateWorkspaceModel = {
  orientationCards: Array<{
    id: string;
    eyebrow: string;
    headline: string;
    body: string;
    tone: StatusTone;
    meta?: string;
  }>;
  criticalMetrics: MetricItemModel[];
  situationRibbon: StatusPillModel[];
  alarmMetrics: MetricItemModel[];
  pinnedAlarms: Array<{
    id: string;
    label: string;
    tone: StatusTone;
  }>;
  clusters: Array<{
    id: string;
    title: string;
    priorityLabel: string;
    priorityTone: StatusTone;
    summary: string;
    groupedCount: number;
    criticalCount: number;
    primaryLabels: string[];
    expanded: boolean;
    alarms: Array<{
      id: string;
      title: string;
      priorityLabel: string;
      priorityTone: StatusTone;
      subsystemTag: string;
      visibilityLabel: string;
      active: boolean;
    }>;
  }>;
  dominantHypothesis: {
    title: string;
    confidence: string;
    summary: string;
    evidence: Array<{ id: string; label: string; detail: string }>;
    chips: StatusPillModel[];
    supportContext: Array<{ label: string; body: string }>;
  };
  secondaryHypotheses: Array<{
    id: string;
    title: string;
    score: string;
    summary: string;
    watchSignals: string;
  }>;
  laneBadges: StatusPillModel[];
  counterfactualAdvisor?: {
    status: "idle" | "loading" | "ready";
    headline: string;
    summary: string;
    providerLabel?: string;
    confidenceCaveat?: string;
    topWatchSignals: string[];
    branches: Array<{
      id: string;
      title: string;
      summary: string;
      recommended: boolean;
      tone: StatusTone;
      meta: string;
    }>;
    followup?: string;
  };
  laneItems: Array<{
    id: string;
    label: string;
    kind: string;
    why: string;
    whyNow?: string;
    cautions: string[];
    completionHint: string;
    signals?: string;
    actionLabel?: string;
    actionId?: string;
    actionValue?: number;
    actionValueLabel?: string;
    emphasis: boolean;
    badges: StatusPillModel[];
  }>;
  assistanceCue: OperateAssistanceCueModel;
  laneGuidanceCards: OperateGuidanceCardModel[];
  laneSummaryNote: string;
  validatorHumanMonitoringNote?: string;
  supportMetrics: MetricItemModel[];
  supportPills: StatusPillModel[];
  supportSections: OperateSupportSectionModel[];
  topFactors: Array<{ id: string; label: string; contribution: string; detail: string }>;
  reviewHint: string;
};

export type HumanMonitoringWorkspaceModel = {
  summaryMetrics: MetricItemModel[];
  summaryPills: StatusPillModel[];
  summaryHeadline: string;
  summaryBody: string;
  operateCrossReference: string;
  sourceCards: Array<{
    id: string;
    title: string;
    tone: StatusTone;
    summary: string;
    detail: string;
    metrics: MetricItemModel[];
    pills: StatusPillModel[];
  }>;
  webcam: {
    statusPills: StatusPillModel[];
    summary: string;
    detail: string;
    metrics: MetricItemModel[];
    observationCards: Array<{
      id: string;
      title: string;
      detail: string;
      metrics: MetricItemModel[];
    }>;
  };
  interactionTelemetry: {
    statusPills: StatusPillModel[];
    summary: string;
    detail: string;
    metrics: MetricItemModel[];
    recordCards: Array<{
      id: string;
      title: string;
      detail: string;
      pills: StatusPillModel[];
    }>;
  };
  extractedFeatures: Array<{
    id: string;
    title: string;
    tone: StatusTone;
    summary: string;
    metrics: MetricItemModel[];
    riskCues: Array<{ label: string; value: string }>;
    note: string;
  }>;
  fusedInterpretation?: {
    summary: string;
    detail: string;
    metrics: MetricItemModel[];
    riskCues: Array<{ label: string; value: string }>;
    pills: StatusPillModel[];
  };
  finalOutput: {
    summary: string;
    detail: string;
    metrics: MetricItemModel[];
    pills: StatusPillModel[];
  };
  downstreamImpact: {
    summary: string;
    detail: string;
    metrics: MetricItemModel[];
    pills: StatusPillModel[];
    implications: Array<{ label: string; body: string }>;
    factors: Array<{ id: string; label: string; detail: string }>;
  };
};

export type ReviewWorkspaceModel = {
  demoChecklist: Array<{ id: string; label: string; done: boolean }>;
  recentEvents: Array<{
    id: string;
    title: string;
    timeLabel: string;
    sourceModule: string;
    payloadText: string;
  }>;
  comparisonHint?: string;
  oversightSummary: string;
  completedRunSummary: string;
  comparisonSummary: string;
};

function supportModeTone(mode: SessionSnapshot["support_mode"]): StatusTone {
  switch (mode) {
    case "monitoring_support":
      return "ok";
    case "guided_support":
      return "neutral";
    case "protected_response":
      return "alert";
  }
}

function buildSupportAlignmentNote(snapshot: SessionSnapshot, activeLabel: string, recommendedLabel: string): string {
  if (snapshot.session_mode === "baseline") {
    return snapshot.combined_risk.recommended_assistance_mode === "monitoring_support"
      ? "Baseline session keeps Monitoring Support only; adaptive escalation is intentionally off."
      : `Baseline session keeps ${activeLabel} only even though the live risk picture would otherwise recommend ${recommendedLabel}.`;
  }

  if (snapshot.support_mode === snapshot.combined_risk.recommended_assistance_mode) {
    return `${activeLabel} matches the current risk recommendation.`;
  }

  return `${recommendedLabel} is recommended, but ${activeLabel} remains active while bounded dwell logic avoids mode chatter.`;
}

function buildSupportTransitionHeadline(snapshot: SessionSnapshot): string {
  if (snapshot.session_mode === "baseline") {
    return "Baseline posture stays intentionally fixed.";
  }

  if (snapshot.support_policy.mode_change_summary !== "No support-mode change this tick.") {
    return "Posture changed this tick.";
  }

  if (snapshot.support_mode !== snapshot.combined_risk.recommended_assistance_mode) {
    return "Posture is holding while the recommendation settles.";
  }

  return "Posture held steady this tick.";
}

function buildOperatorControlNote(snapshot: SessionSnapshot): string {
  if (snapshot.pending_supervisor_override?.request_status === "requested") {
    return "Operator authority is preserved, but one blocked action is paused until Review records a bounded supervisor decision.";
  }

  if (snapshot.pending_action_confirmation) {
    return "Operator authority is preserved; the current action only proceeds if the operator explicitly confirms it.";
  }

  if (snapshot.last_validation_result?.outcome === "hard_prevent") {
    return "Operator authority is preserved, but the last blocked action remains prevented because the validator marked it as a bounded high-risk move.";
  }

  return "Operator authority is preserved. Lane guidance remains advisory, and validation only adds friction when a bounded higher-risk action needs confirmation or review.";
}

type HumanMonitoringOperateIntegration = {
  statusLabel: string;
  effectLabel: string;
  tone: StatusTone;
  summary: string;
  orientationMatterNote: string;
  nextActionNote?: string;
  laneNote: string;
  validatorNote?: string;
  storylineNote: string;
  watchCardHeadline: string;
  watchCardBody: string;
  effectCardHeadline: string;
  effectCardBody: string;
  confidenceHeadline: string;
  confidenceBody: string;
  confidenceMeta: string;
  confidencePills: StatusPillModel[];
  workspaceCrossReference: string;
  tightenLanePresentation: boolean;
};

function buildHumanMonitoringOperateIntegration(snapshot: SessionSnapshot): HumanMonitoringOperateIntegration {
  const monitoringMode = monitoringModeLabel(snapshot.human_monitoring.mode);
  const freshnessLabel = snapshot.human_monitoring.freshness_status;
  const aggregateConfidenceLabel = `${snapshot.human_monitoring.aggregate_confidence}/100`;
  const monitoringUnavailable =
    snapshot.human_monitoring.mode === "unavailable" ||
    snapshot.human_monitoring.freshness_status === "no_observations" ||
    (snapshot.human_monitoring.connected_source_count === 0 && snapshot.human_monitoring.contributing_source_count === 0);
  const monitoringLimited =
    !monitoringUnavailable &&
    (snapshot.human_monitoring.mode === "degraded" ||
      snapshot.human_monitoring.freshness_status === "stale" ||
      snapshot.human_monitoring.degraded_state_active ||
      snapshot.operator_state.degraded_mode_active ||
      snapshot.operator_state.signal_confidence < 70 ||
      snapshot.human_monitoring.aggregate_confidence < 70);
  const highHumanPressure =
    snapshot.combined_risk.human_pressure_index >= 48 ||
    snapshot.operator_state.workload_index >= 70 ||
    snapshot.operator_state.attention_stability_index <= 72;
  const attentionTight = snapshot.operator_state.attention_stability_index <= 76;

  if (snapshot.session_mode === "baseline") {
    return {
      statusLabel: "HM2 informational",
      effectLabel: "No adaptive HM2 change",
      tone: "ok",
      summary:
        "Baseline mode keeps Human Monitoring 2.0 informational only, so Operate does not tighten posture, pacing, or validator wording from human-side cues.",
      orientationMatterNote: "Human-side cues stay informational only in baseline mode.",
      nextActionNote:
        "Baseline mode keeps the broader action grouping instead of applying human-aware pacing changes.",
      laneNote:
        "Baseline mode keeps the broader guided grouping and leaves Human Monitoring 2.0 informational only.",
      storylineNote:
        "Baseline mode keeps the storyline broad and informational; human-side cues do not change narrowing strength here.",
      watchCardHeadline: snapshot.support_refinement.watch_now_summary,
      watchCardBody: `${snapshot.support_refinement.current_support_focus} Baseline mode keeps the broader grouping intact.`,
      effectCardHeadline: "No adaptive HM2 change",
      effectCardBody:
        "Human Monitoring 2.0 remains available for inspection, but baseline Operate stays calm and does not change pacing or caution wording from that signal.",
      confidenceHeadline: "Human Monitoring 2.0 stays informational in baseline.",
      confidenceBody: `Mode ${monitoringMode}; freshness ${freshnessLabel}; aggregate confidence ${aggregateConfidenceLabel}.`,
      confidenceMeta: "Adaptive HM2 wording changes are disabled in baseline mode.",
      confidencePills: [
        { label: monitoringMode, tone: "neutral" },
        { label: `Freshness ${freshnessLabel}`, tone: freshnessTone(freshnessLabel) },
        { label: "Informational only", tone: "ok" },
      ],
      workspaceCrossReference:
        "This workspace shows the evidence behind the informational monitoring status while baseline Operate remains calm and non-adaptive.",
      tightenLanePresentation: false,
    };
  }

  if (monitoringUnavailable) {
    return {
      statusLabel: "HM2 unavailable",
      effectLabel: "Verification bias active",
      tone: "neutral",
      summary:
        "Human Monitoring 2.0 is unavailable, so plant and alarm state remain primary. Operate keeps verification explicit but avoids stronger human-side narrowing.",
      orientationMatterNote: "Human-side input is unavailable, so critical plant and alarm cues stay primary.",
      nextActionNote:
        "Lead with one bounded step, then keep one watch item visible while human-side input is unavailable.",
      laneNote:
        "Monitoring is unavailable, so the lane is using a verify-then-commit pattern with one lead step and one watch item.",
      validatorNote:
        "Human-side confidence is limited or unavailable, so verification is being kept explicit before the action commits.",
      storylineNote:
        "Human-side input is unavailable, so the storyline is being held broader and verification-biased instead of narrowing harder.",
      watchCardHeadline: snapshot.support_refinement.watch_now_summary,
      watchCardBody:
        "Plant and alarm state stay primary while the lane keeps one lead step and one watch item visible.",
      effectCardHeadline: "Verification bias active",
      effectCardBody:
        "Operate is staying explicit and bounded because Human Monitoring 2.0 is unavailable; no extra human-side escalation is being applied.",
      confidenceHeadline: "Human Monitoring 2.0 unavailable",
      confidenceBody: `Mode ${monitoringMode}; freshness ${freshnessLabel}; aggregate confidence ${aggregateConfidenceLabel}.`,
      confidenceMeta: "No extra HM2 escalation is being applied while monitoring is unavailable.",
      confidencePills: [
        { label: monitoringMode, tone: "neutral" },
        { label: `Freshness ${freshnessLabel}`, tone: freshnessTone(freshnessLabel) },
        { label: "Verification bias active", tone: "neutral" },
      ],
      workspaceCrossReference:
        "This workspace explains why Operate is staying verification-biased and avoiding stronger human-side pacing changes while monitoring is unavailable.",
      tightenLanePresentation: true,
    };
  }

  if (monitoringLimited) {
    return {
      statusLabel: "HM2 degraded",
      effectLabel: "Verification bias active",
      tone: snapshot.support_mode === "protected_response" ? "alert" : "neutral",
      summary:
        "Human Monitoring 2.0 is degraded, so recommendations stay bounded, caution wording is stronger, and the adaptive layer avoids over-committing on human-side cues.",
      orientationMatterNote: "Human-side confidence is reduced, so the watch picture stays explicit.",
      nextActionNote:
        "Lead with one bounded step, then keep one watch item visible while confidence is limited.",
      laneNote:
        "Monitoring confidence is reduced, so the lane is tightening to one lead step and one watch item before you commit.",
      validatorNote:
        "Human-side confidence is limited, so verification is being kept explicit before the action commits.",
      storylineNote:
        "Human-side confidence is reduced, so the storyline is being held broader and biased toward verification.",
      watchCardHeadline: snapshot.support_refinement.watch_now_summary,
      watchCardBody:
        "Confidence is limited, so the lane keeps one lead step and one watch item up front instead of broadening the response picture.",
      effectCardHeadline: "Verification bias active",
      effectCardBody:
        "Operate is strengthening caution wording and holding a verify-then-commit pattern because Human Monitoring 2.0 is degraded.",
      confidenceHeadline: "Human Monitoring 2.0 degraded",
      confidenceBody: `Mode ${monitoringMode}; freshness ${freshnessLabel}; aggregate confidence ${aggregateConfidenceLabel}.`,
      confidenceMeta: snapshot.support_policy.degraded_confidence_effect,
      confidencePills: [
        { label: monitoringMode, tone: "neutral" },
        { label: `Freshness ${freshnessLabel}`, tone: freshnessTone(freshnessLabel) },
        { label: "Verification bias active", tone: "neutral" },
      ],
      workspaceCrossReference:
        "This workspace explains why Operate is tightening posture wording, watch emphasis, and validator cautioning while Human Monitoring 2.0 confidence is limited.",
      tightenLanePresentation: true,
    };
  }

  if (highHumanPressure) {
    const effectLabel = attentionTight ? "Watch emphasis tightened" : "Pacing tightened";
    return {
      statusLabel: "HM2 current",
      effectLabel,
      tone: snapshot.support_mode === "protected_response" ? "alert" : "neutral",
      summary:
        "Current human-side strain is visible, so Operate tightens watch emphasis and execution pacing while plant state stays primary.",
      orientationMatterNote: "Human-side strain is high, so the next watch picture stays tighter.",
      nextActionNote: "Take one bounded step, then re-check the watch item before broadening the search.",
      laneNote:
        "Human-side strain is elevated, so the lane shows one lead step and one watch item with firmer caution wording.",
      validatorNote:
        "Human-side strain is elevated even though confidence is current, so execution is being kept slower and bounded.",
      storylineNote:
        "Human-side strain is elevated, so the storyline is narrowed more cautiously around the current watch signals.",
      watchCardHeadline: snapshot.support_refinement.watch_now_summary,
      watchCardBody:
        "Workload and attention strain are tightening the immediate watch picture, so Operate keeps one lead step plus one watch item up front.",
      effectCardHeadline: effectLabel,
      effectCardBody:
        "Operate is slowing the recommendation pace into a bounded verify-then-commit rhythm because current human-side strain is elevated.",
      confidenceHeadline: "Human Monitoring 2.0 is current, but strain is elevated.",
      confidenceBody: `Mode ${monitoringMode}; freshness ${freshnessLabel}; aggregate confidence ${aggregateConfidenceLabel}.`,
      confidenceMeta: snapshot.support_refinement.operator_context_note,
      confidencePills: [
        { label: monitoringMode, tone: "ok" },
        { label: `Freshness ${freshnessLabel}`, tone: freshnessTone(freshnessLabel) },
        { label: effectLabel, tone: snapshot.support_mode === "protected_response" ? "alert" : "neutral" },
      ],
      workspaceCrossReference:
        "This workspace explains why Operate is tightening watch emphasis, slowing recommendation pacing, and using firmer caution wording even though Human Monitoring 2.0 remains current.",
      tightenLanePresentation: true,
    };
  }

  return {
    statusLabel: "HM2 current",
    effectLabel: "No extra constraint",
    tone: "ok",
    summary:
      "Current monitoring is supporting nominal confidence, so Operate can keep direct wording without extra verification bias.",
    orientationMatterNote:
      "Human-side cues are current, so plant and alarm state can stay primary without extra confidence gating.",
    laneNote:
      "Current monitoring supports the broader guided grouping; no extra verification bias or pacing clamp is active.",
    storylineNote:
      "Human-side cues are current, so the storyline can stay direct without extra verification bias.",
    watchCardHeadline: snapshot.support_refinement.watch_now_summary,
    watchCardBody: snapshot.support_refinement.current_support_focus,
    effectCardHeadline: "Current confidence",
    effectCardBody:
      "Human Monitoring 2.0 is current, so the adaptive layer is not adding extra confidence gating beyond the normal bounded support posture.",
    confidenceHeadline: `Human Monitoring 2.0 current (${aggregateConfidenceLabel}).`,
    confidenceBody: `Mode ${monitoringMode}; freshness ${freshnessLabel}; plant state and pinned alarms remain primary.`,
    confidenceMeta: "Human Monitoring 2.0 remains advisory only; no extra HM2 constraint is active.",
    confidencePills: [
      { label: monitoringMode, tone: "ok" },
      { label: `Freshness ${freshnessLabel}`, tone: freshnessTone(freshnessLabel) },
      { label: "No extra constraint", tone: "ok" },
    ],
    workspaceCrossReference:
      "This workspace explains why Operate can stay direct right now: Human Monitoring 2.0 is current enough that no extra verification bias is being applied.",
    tightenLanePresentation: false,
  };
}

function selectOperateLaneItems(
  items: OperateWorkspaceModel["laneItems"],
  tightenLanePresentation: boolean,
): OperateWorkspaceModel["laneItems"] {
  if (!tightenLanePresentation || items.length <= 2) {
    return items;
  }

  const leadItem = items.find((item) => item.kind !== "watch") ?? items[0];
  const watchItem = items.find((item) => item.kind === "watch" && item.id !== leadItem?.id);
  const selectedIds = new Set<string>();
  const selectedItems: OperateWorkspaceModel["laneItems"] = [];

  for (const item of [leadItem, watchItem]) {
    if (item && !selectedIds.has(item.id)) {
      selectedIds.add(item.id);
      selectedItems.push(item);
    }
  }

  if (selectedItems.length < 2) {
    for (const item of items) {
      if (!selectedIds.has(item.id)) {
        selectedIds.add(item.id);
        selectedItems.push(item);
      }
      if (selectedItems.length >= 2) {
        break;
      }
    }
  }

  return selectedItems;
}

type BuildOperateWorkspaceModelParams = {
  snapshot: SessionSnapshot;
  actionLabels: Record<string, string>;
  expandedClusterIds: string[];
  presentedLaneItems: SessionSnapshot["first_response_lane"]["items"];
  pendingConfirmation?: PendingActionConfirmation;
  pendingSupervisorOverride?: PendingSupervisorOverride;
};

export function buildOperateWorkspaceModel(params: BuildOperateWorkspaceModelParams): OperateWorkspaceModel {
  const { snapshot, actionLabels, expandedClusterIds, presentedLaneItems, pendingConfirmation, pendingSupervisorOverride } =
    params;

  const pinnedCriticalAlarmIds = new Set(snapshot.support_policy.critical_visibility.pinned_alarm_ids);
  const pinnedCriticalAlarms = snapshot.alarm_set.active_alarms.filter((alarm) => pinnedCriticalAlarmIds.has(alarm.alarm_id));
  const dominantHypothesis = snapshot.reasoning_snapshot.ranked_hypotheses[0];
  const nextLaneItem = presentedLaneItems[0];
  const activeSupportLabel = formatSupportModeLabel(snapshot.support_mode);
  const recommendedSupportLabel = formatSupportModeLabel(snapshot.combined_risk.recommended_assistance_mode);
  const activeSupportTone = supportModeTone(snapshot.support_mode);
  const recommendedSupportTone = supportModeTone(snapshot.combined_risk.recommended_assistance_mode);
  const supportAlignmentNote = buildSupportAlignmentNote(snapshot, activeSupportLabel, recommendedSupportLabel);
  const operatorControlNote = buildOperatorControlNote(snapshot);
  const confidenceBody =
    snapshot.support_refinement.degraded_confidence_caution ||
    snapshot.combined_risk.confidence_caveat ||
    snapshot.support_policy.degraded_confidence_effect;
  const transitionHeadline = buildSupportTransitionHeadline(snapshot);
  const monitoringIntegration = buildHumanMonitoringOperateIntegration(snapshot);

  let nextHeadline = "Continue monitoring";
  let nextBody = "No operator action is being pushed right now. Stay with critical variables and grouped alarms.";
  let nextTone: StatusTone = "ok";
  let nextMeta: string | undefined;

  if (pendingConfirmation) {
    nextHeadline = "Confirm or cancel the held action";
    nextBody = pendingConfirmation.validation_result.explanation;
    nextTone = "neutral";
    nextMeta = actionLabels[pendingConfirmation.action_request.action_id] ?? pendingConfirmation.action_request.action_id;
  } else if (pendingSupervisorOverride?.request_status === "requested") {
    nextHeadline = "Supervisor decision is pending";
    nextBody = "Open Review to approve or deny the blocked action while keeping the current recovery path visible.";
    nextTone = "alert";
    nextMeta = actionLabels[pendingSupervisorOverride.action_request.action_id] ?? pendingSupervisorOverride.action_request.action_id;
  } else if (nextLaneItem) {
    nextHeadline = nextLaneItem.label;
    nextBody = nextLaneItem.why;
    nextTone = urgencyBadgeTone(nextLaneItem.presentation_cue?.urgency_level ?? "standard");
    nextMeta = nextLaneItem.recommended_action_id
      ? actionLabels[nextLaneItem.recommended_action_id] ?? nextLaneItem.recommended_action_id
      : undefined;
  }

  const criticalAlarmTitle =
    pinnedCriticalAlarms.length > 0 ? pinnedCriticalAlarms.map((alarm) => alarm.title).slice(0, 2).join(" | ") : "No pinned P1/P2 alarms";
  const matterBody =
    pinnedCriticalAlarms.length > 0
      ? `${criticalAlarmTitle}. ${snapshot.support_policy.critical_visibility.summary} ${monitoringIntegration.orientationMatterNote}`
      : `${snapshot.support_refinement.watch_now_summary}. ${snapshot.support_policy.critical_visibility.summary} ${monitoringIntegration.orientationMatterNote}`;
  const baseLaneItems: OperateWorkspaceModel["laneItems"] = presentedLaneItems.map((item) => ({
    id: item.item_id,
    label: item.label,
    kind: item.item_kind,
    why: item.why,
    whyNow: item.presentation_cue?.why_this_matters_now,
    cautions: [
      item.presentation_cue?.attention_sensitive_caution,
      item.presentation_cue?.degraded_confidence_caveat,
    ].filter((value): value is string => Boolean(value)),
    completionHint: item.completion_hint,
    signals: item.source_variable_ids.length > 0 ? item.source_variable_ids.map(formatSignalLabel).join(", ") : undefined,
    actionLabel: item.recommended_action_id ? actionLabels[item.recommended_action_id] ?? item.recommended_action_id : undefined,
    actionId: item.recommended_action_id,
    actionValue: typeof item.recommended_value === "number" ? item.recommended_value : undefined,
    actionValueLabel: typeof item.recommended_value === "number" ? `${item.recommended_value}% rated` : undefined,
    emphasis: item.presentation_cue?.emphasized ?? false,
    badges: item.presentation_cue
      ? [
          {
            label: item.presentation_cue.urgency_level,
            tone: urgencyBadgeTone(item.presentation_cue.urgency_level),
          },
          ...(item.presentation_cue.emphasized ? [{ label: "Emphasized now", tone: "ok" as const }] : []),
          {
            label: item.presentation_cue.wording_style,
            tone: item.presentation_cue.wording_style === "concise" ? "neutral" : "ok",
          },
        ]
      : [],
  }));
  const laneItems = selectOperateLaneItems(baseLaneItems, monitoringIntegration.tightenLanePresentation);

  return {
    orientationCards: [
      {
        id: "happening",
        eyebrow: "What's happening",
        headline: dominantHypothesis?.label ?? "Monitoring only",
        body: snapshot.reasoning_snapshot.dominant_summary || snapshot.current_phase.label,
        tone: riskBadgeTone(snapshot.combined_risk.combined_risk_band),
        meta: `Phase ${snapshot.current_phase.label}`,
      },
      {
        id: "matters",
        eyebrow: "What matters",
        headline: snapshot.support_refinement.watch_now_summary,
        body: matterBody,
        tone: pinnedCriticalAlarms.length > 0 ? "alert" : "neutral",
        meta: `Active posture ${activeSupportLabel}`,
      },
      {
        id: "next",
        eyebrow: "Do next",
        headline: nextHeadline,
        body:
          pendingConfirmation || pendingSupervisorOverride?.request_status === "requested" || !monitoringIntegration.nextActionNote
            ? nextBody
            : `${nextBody} ${monitoringIntegration.nextActionNote}`,
        tone: nextTone,
        meta: nextMeta,
      },
    ],
    criticalMetrics: criticalVariableIds.map((variableId) => ({
      label: variableLabels[variableId],
      value: formatValue(snapshot.plant_tick.plant_state[variableId], variableUnits[variableId]),
    })),
    situationRibbon: [
      {
        label: `Reactor trip ${snapshot.plant_tick.plant_state.reactor_trip_active ? "active" : "clear"}`,
        tone: snapshot.plant_tick.plant_state.reactor_trip_active ? "alert" : "ok",
      },
      {
        label: `SRV ${snapshot.plant_tick.plant_state.safety_relief_valve_open ? "open" : "closed"}`,
        tone: snapshot.plant_tick.plant_state.safety_relief_valve_open ? "alert" : "ok",
      },
      {
        label: `Offsite power ${snapshot.plant_tick.plant_state.offsite_power_available ? "available" : "lost"}`,
        tone: snapshot.plant_tick.plant_state.offsite_power_available ? "ok" : "alert",
      },
      {
        label: `Isolation condenser ${
          snapshot.plant_tick.plant_state.isolation_condenser_available ? "available" : "unavailable"
        }`,
        tone: snapshot.plant_tick.plant_state.isolation_condenser_available ? "ok" : "alert",
      },
    ],
    alarmMetrics: [
      { label: "Raw active alarms", value: String(snapshot.alarm_set.active_alarm_count) },
      { label: "Grouped cards", value: String(snapshot.alarm_intelligence.visible_alarm_card_count) },
      { label: "Active clusters", value: String(snapshot.alarm_set.active_alarm_cluster_count) },
    ],
    pinnedAlarms: pinnedCriticalAlarms.map((alarm) => ({
      id: alarm.alarm_id,
      label: alarm.title,
      tone: priorityTone(alarm.priority),
    })),
    clusters: snapshot.alarm_intelligence.clusters.map((cluster) => ({
      id: cluster.cluster_id,
      title: cluster.title,
      priorityLabel: cluster.priority,
      priorityTone: priorityTone(cluster.priority),
      summary: cluster.summary,
      groupedCount: cluster.grouped_alarm_count,
      criticalCount: cluster.critical_alarm_ids.length,
      primaryLabels: cluster.alarms
        .filter((alarm) => cluster.primary_alarm_ids.includes(alarm.alarm_id))
        .map((alarm) => alarm.title),
      expanded: expandedClusterIds.includes(cluster.cluster_id),
      alarms: cluster.alarms.map((alarm) => ({
        id: alarm.alarm_id,
        title: alarm.title,
        priorityLabel: alarm.priority,
        priorityTone: priorityTone(alarm.priority),
        subsystemTag: alarm.subsystem_tag,
        visibilityLabel: alarm.visibility_rule === "always_visible" ? "Always visible" : "Grouped",
        active: snapshot.alarm_set.active_alarm_ids.includes(alarm.alarm_id),
      })),
    })),
    dominantHypothesis: {
      title: dominantHypothesis?.label ?? "Monitoring only",
      confidence: dominantHypothesis ? `${dominantHypothesis.confidence_band} confidence` : "low confidence",
      summary: snapshot.reasoning_snapshot.dominant_summary,
      evidence:
        dominantHypothesis?.evidence.slice(0, 3).map((evidence) => ({
          id: evidence.evidence_id,
          label: evidence.label,
          detail: evidence.detail,
        })) ?? [],
      chips: [
        {
          label: snapshot.reasoning_snapshot.expected_root_cause_aligned
            ? "Aligned with scenario driver"
            : "Alternative storyline active",
          tone: snapshot.reasoning_snapshot.expected_root_cause_aligned ? "ok" : "neutral",
        },
        {
          label: `Stable for ${snapshot.reasoning_snapshot.stable_for_ticks} ticks`,
          tone: "neutral",
        },
        {
          label: `Wording ${snapshot.support_refinement.wording_style}`,
          tone: snapshot.support_refinement.wording_style === "concise" ? "neutral" : "ok",
        },
      ],
      supportContext: [
        {
          label: "Support focus now",
          body: snapshot.support_refinement.current_support_focus,
        },
        {
          label: "Why emphasis changed",
          body: snapshot.support_refinement.summary_explanation,
        },
        {
          label: "Operator context",
          body: `${snapshot.support_refinement.operator_context_note} ${monitoringIntegration.storylineNote}`.trim(),
        },
      ],
    },
    secondaryHypotheses: snapshot.reasoning_snapshot.ranked_hypotheses.slice(1).map((hypothesis) => ({
      id: hypothesis.hypothesis_id,
      title: `#${hypothesis.rank} ${hypothesis.label}`,
      score: hypothesis.score.toFixed(2),
      summary: hypothesis.summary,
      watchSignals: hypothesis.watch_items.map(formatSignalLabel).join(", "),
    })),
    laneBadges: [
      {
        label: `Active ${activeSupportLabel}`,
        tone: activeSupportTone,
      },
      {
        label:
          snapshot.support_mode === snapshot.combined_risk.recommended_assistance_mode
            ? "Posture aligned with risk"
            : `Recommend ${recommendedSupportLabel}`,
        tone:
          snapshot.support_mode === snapshot.combined_risk.recommended_assistance_mode ? "ok" : recommendedSupportTone,
      },
      {
        label: snapshot.pending_action_confirmation ? "Validation pending confirmation" : "Validation inline and active",
        tone: snapshot.pending_action_confirmation ? "neutral" : "ok",
      },
    ],
    ...(snapshot.counterfactual_advisor
      ? {
          counterfactualAdvisor: {
            status: snapshot.counterfactual_advisor.status,
            headline:
              snapshot.counterfactual_advisor.status === "loading"
                ? "Generating bounded branch preview"
                : snapshot.counterfactual_advisor.narrative
                  ? `Recommended branch: ${
                      snapshot.counterfactual_advisor.branches.find(
                        (branch) => branch.branch_id === snapshot.counterfactual_advisor?.narrative?.recommended_branch_id,
                      )?.label ?? snapshot.counterfactual_advisor.narrative.recommended_branch_id
                    }`
                  : "Latest branch preview",
            summary:
              snapshot.counterfactual_advisor.status === "loading"
                ? "The advisor is cloning the current twin state, comparing three bounded branches, and preparing a short brief."
                : snapshot.counterfactual_advisor.narrative?.rationale ??
                  "Branch preview ready. Compare the short-horizon consequences before acting.",
            providerLabel:
              snapshot.counterfactual_advisor.status === "ready" && snapshot.counterfactual_advisor.narrative
                ? snapshot.counterfactual_advisor.narrative.provider === "llm"
                  ? `LLM summary${snapshot.counterfactual_advisor.narrative.model ? ` (${snapshot.counterfactual_advisor.narrative.model})` : ""}`
                  : "Deterministic fallback summary"
                : undefined,
            confidenceCaveat:
              snapshot.counterfactual_advisor.status === "ready"
                ? snapshot.counterfactual_advisor.narrative?.confidence_caveat
                : undefined,
            topWatchSignals:
              snapshot.counterfactual_advisor.status === "ready"
                ? snapshot.counterfactual_advisor.narrative?.top_watch_signals ?? []
                : [],
            branches: snapshot.counterfactual_advisor.branches.map((branch) => ({
              id: branch.branch_id,
              title: branch.label,
              summary: branch.one_line_summary,
              recommended: branch.branch_id === snapshot.counterfactual_advisor?.narrative?.recommended_branch_id,
              tone:
                branch.branch_id === snapshot.counterfactual_advisor?.narrative?.recommended_branch_id
                  ? "ok"
                  : branch.projected_risk_trend === "worsening" || branch.validator_risk_exposure === "hard_prevent"
                    ? "alert"
                    : "neutral",
              meta: [
                branch.final_outcome ? `Outcome ${branch.final_outcome}` : `Risk ${branch.final_combined_risk_band}`,
                `Validator ${branch.validator_risk_exposure}`,
              ].join(" | "),
            })),
            followup:
              snapshot.counterfactual_advisor.status === "ready" &&
              snapshot.counterfactual_advisor.operator_followed_recommendation !== undefined
                ? snapshot.counterfactual_advisor.operator_followed_recommendation
                  ? "The next applied action matched the recommended branch."
                  : "The next applied action diverged from the recommended branch."
                : undefined,
          },
        }
      : {}),
    laneItems,
    assistanceCue: {
      eyebrow: "Assistance posture",
      headline: snapshot.session_mode === "baseline" ? "Baseline run keeps monitoring only." : `${activeSupportLabel} is active now.`,
      body: `${supportAlignmentNote} ${monitoringIntegration.summary}`,
      tone: monitoringIntegration.tone,
      pills: [
        {
          label: snapshot.session_mode === "baseline" ? "Baseline posture locked" : "Adaptive posture active",
          tone: snapshot.session_mode === "baseline" ? "ok" : activeSupportTone,
        },
        {
          label: monitoringIntegration.statusLabel,
          tone: monitoringIntegration.tone,
        },
        {
          label: monitoringIntegration.effectLabel,
          tone: monitoringIntegration.tone,
        },
        {
          label: "Critical cues stay pinned",
          tone: "ok",
        },
      ],
    },
    laneGuidanceCards: [
      {
        id: "watch",
        label: "What now",
        headline: monitoringIntegration.watchCardHeadline,
        body: monitoringIntegration.watchCardBody,
        tone: monitoringIntegration.tone,
      },
      {
        id: "effect",
        label: "Mode effect",
        headline: monitoringIntegration.effectCardHeadline,
        body: monitoringIntegration.effectCardBody,
        tone: monitoringIntegration.tone,
      },
    ],
    laneSummaryNote: monitoringIntegration.laneNote,
    validatorHumanMonitoringNote: monitoringIntegration.validatorNote,
    supportMetrics: [
      {
        label: "Active posture",
        value: activeSupportLabel,
        caption:
          snapshot.session_mode === "baseline"
            ? "Baseline posture stays fixed"
            : snapshot.support_mode === snapshot.combined_risk.recommended_assistance_mode
              ? "Aligned with current risk recommendation"
              : "Held by bounded mode policy",
        tone: activeSupportTone,
      },
      {
        label: "Risk recommendation",
        value: recommendedSupportLabel,
        caption: snapshot.combined_risk.recommended_assistance_reason,
        tone: recommendedSupportTone,
      },
      {
        label: "Combined risk",
        value: `${snapshot.combined_risk.combined_risk_score.toFixed(1)}/100`,
        caption: `${snapshot.combined_risk.combined_risk_band} | fusion ${snapshot.combined_risk.fusion_confidence.toFixed(1)}/100`,
        tone: riskBadgeTone(snapshot.combined_risk.combined_risk_band),
      },
      {
        label: "Operator load",
        value: `${snapshot.operator_state.workload_index}/100`,
        caption: `Attention stability ${snapshot.operator_state.attention_stability_index}/100`,
      },
      {
        label: "Signal confidence",
        value: `${snapshot.operator_state.signal_confidence}/100`,
        caption: `${monitoringIntegration.statusLabel} | influence ${snapshot.combined_risk.human_influence_scale.toFixed(2)}`,
      },
    ],
    supportPills: [
      {
        label: snapshot.session_mode === "baseline" ? "Baseline session" : "Adaptive session",
        tone: snapshot.session_mode === "baseline" ? "ok" : activeSupportTone,
      },
      {
        label: "Critical visibility guardrails active",
        tone: "ok",
      },
      {
        label: "Operator authority retained",
        tone: "ok",
      },
      {
        label: monitoringIntegration.statusLabel,
        tone: monitoringIntegration.tone,
      },
      {
        label: monitoringIntegration.effectLabel,
        tone: monitoringIntegration.tone,
      },
      {
        label: `Degraded mode ${snapshot.operator_state.degraded_mode_active ? "active" : "clear"}`,
        tone: snapshot.operator_state.degraded_mode_active ? "alert" : "ok",
      },
      {
        label:
          snapshot.last_validation_result && validationBadgeTone(snapshot.last_validation_result.outcome) === "alert"
            ? "Protected validation active"
            : "Validator ready",
        tone: snapshot.last_validation_result ? validationBadgeTone(snapshot.last_validation_result.outcome) : "neutral",
      },
    ],
    supportSections: [
      {
        id: "mode",
        label: "Active posture",
        headline: `${activeSupportLabel} is active now.`,
        body: snapshot.support_policy.current_mode_reason,
        tone: activeSupportTone,
        meta: supportAlignmentNote,
        pills: [
          {
            label: `Active ${activeSupportLabel}`,
            tone: activeSupportTone,
          },
          {
            label: `Recommend ${recommendedSupportLabel}`,
            tone: recommendedSupportTone,
          },
        ],
      },
      {
        id: "watch",
        label: "What now",
        headline: monitoringIntegration.watchCardHeadline,
        body: monitoringIntegration.watchCardBody,
        tone: monitoringIntegration.tone,
        meta: snapshot.support_refinement.summary_explanation,
      },
      {
        id: "effect",
        label: "Mode effect",
        headline: monitoringIntegration.effectCardHeadline,
        body: monitoringIntegration.effectCardBody,
        tone: monitoringIntegration.tone,
        meta: snapshot.support_policy.current_mode_reason,
      },
      {
        id: "focus",
        label: "Focus",
        headline: snapshot.support_refinement.current_support_focus,
        body: snapshot.support_refinement.summary_explanation,
        tone: activeSupportTone,
      },
      {
        id: "guardrails",
        label: "Guardrails",
        headline: "Critical variables and pinned alarms stay surfaced.",
        body: snapshot.support_policy.critical_visibility.summary,
        tone: "ok",
      },
      {
        id: "confidence",
        label: "Human monitoring status",
        headline: monitoringIntegration.confidenceHeadline,
        body: monitoringIntegration.confidenceBody,
        tone: monitoringIntegration.tone,
        meta: monitoringIntegration.confidenceMeta || confidenceBody,
        pills: monitoringIntegration.confidencePills,
      },
      {
        id: "operator",
        label: "Operator still controls",
        headline: "Operator authority stays with you.",
        body: operatorControlNote,
        tone: "ok",
        meta: snapshot.support_refinement.operator_context_note,
      },
      {
        id: "transition",
        label: "What changed",
        headline: transitionHeadline,
        body: `${snapshot.combined_risk.what_changed} ${monitoringIntegration.summary}`.trim(),
        tone: snapshot.support_mode === snapshot.combined_risk.recommended_assistance_mode ? "neutral" : recommendedSupportTone,
        meta: snapshot.support_policy.mode_change_summary,
      },
      {
        id: "risk",
        label: "Posture rationale",
        headline: snapshot.combined_risk.recommended_assistance_reason,
        body: snapshot.combined_risk.why_risk_is_current,
        tone: riskBadgeTone(snapshot.combined_risk.combined_risk_band),
        meta:
          snapshot.combined_risk.top_contributing_factors.length > 0
            ? `Top drivers: ${snapshot.combined_risk.top_contributing_factors.slice(0, 2).join(" and ")}.`
            : undefined,
      },
    ],
    topFactors: snapshot.combined_risk.factor_breakdown.slice(0, 3).map((factor) => ({
      id: factor.factor_id,
      label: factor.label,
      contribution: `+${factor.contribution.toFixed(1)}`,
      detail: factor.detail,
    })),
    reviewHint:
      pendingSupervisorOverride?.request_status === "requested"
        ? "Supervisor review is active. Open Review to approve or deny the blocked action."
        : snapshot.completed_review
          ? `Completed run evidence is ready in Review for session ${snapshot.completed_review.session_id}.`
          : "Open Review for live oversight, completed-run evidence, and comparison/export when ready.",
  };
}

function monitoringSourceLabel(sourceKind: SessionSnapshot["human_monitoring"]["sources"][number]["source_kind"]): string {
  switch (sourceKind) {
    case "legacy_runtime_placeholder":
      return "Legacy runtime placeholder";
    case "interaction_telemetry":
      return "Interaction telemetry";
    case "camera_cv":
      return "Webcam / CV";
    case "manual_annotation":
      return "Manual annotation";
  }
}

function monitoringModeLabel(mode: SessionSnapshot["human_monitoring"]["mode"]): string {
  switch (mode) {
    case "placeholder_compatibility":
      return "Placeholder compatibility";
    case "live_sources":
      return "Live sources";
    case "degraded":
      return "Degraded";
    case "unavailable":
      return "Unavailable";
  }
}

function freshnessTone(
  freshnessStatus: SessionSnapshot["human_monitoring"]["freshness_status"],
): StatusTone {
  switch (freshnessStatus) {
    case "current":
      return "ok";
    case "aging":
    case "no_observations":
      return "neutral";
    case "stale":
      return "alert";
  }
}

function availabilityTone(
  availability: SessionSnapshot["human_monitoring"]["sources"][number]["availability"],
): StatusTone {
  switch (availability) {
    case "active":
      return "ok";
    case "degraded":
    case "not_connected":
      return "neutral";
    case "unavailable":
      return "alert";
  }
}

function lifecycleTone(
  lifecycleStatus: NonNullable<SessionSnapshot["human_monitoring_inspection"]>["camera_cv"]["lifecycle_status"],
): StatusTone {
  switch (lifecycleStatus) {
    case "active":
      return "ok";
    case "degraded":
    case "initializing":
    case "off":
      return "neutral";
    case "unavailable":
      return "alert";
  }
}

function sourceOverallTone(source: SessionSnapshot["human_monitoring"]["sources"][number]): StatusTone {
  if (source.freshness_status === "stale") {
    return "alert";
  }

  if (source.availability === "active" && source.contributes_to_aggregate) {
    return "ok";
  }

  return availabilityTone(source.availability);
}

function cueLabel(cueId: keyof NonNullable<SessionSnapshot["human_monitoring"]["interpretation_input"]>["risk_cues"]): string {
  switch (cueId) {
    case "hesitation_pressure":
      return "Hesitation";
    case "latency_trend_pressure":
      return "Latency trend";
    case "reversal_oscillation_pressure":
      return "Reversal / oscillation";
    case "inactivity_pressure":
      return "Inactivity";
    case "burstiness_pressure":
      return "Burstiness";
    case "navigation_instability_pressure":
      return "Navigation instability";
    case "advisory_visual_attention_pressure":
      return "Visual attention proxy";
  }
}

function buildRiskCueRows(
  riskCues: NonNullable<SessionSnapshot["human_monitoring"]["interpretation_input"]>["risk_cues"],
): Array<{ label: string; value: string }> {
  return (Object.keys(riskCues) as Array<keyof typeof riskCues>).map((cueId) => ({
    label: cueLabel(cueId),
    value: `${riskCues[cueId]}/100`,
  }));
}

type BuildHumanMonitoringWorkspaceModelParams = {
  snapshot: SessionSnapshot;
};

export function buildHumanMonitoringWorkspaceModel(
  params: BuildHumanMonitoringWorkspaceModelParams,
): HumanMonitoringWorkspaceModel {
  const { snapshot } = params;
  const inspection: NonNullable<SessionSnapshot["human_monitoring_inspection"]> =
    snapshot.human_monitoring_inspection ?? {
    sources: snapshot.human_monitoring.sources.map((source) => ({
      source_id: source.source_id,
      source_kind: source.source_kind,
      latest_features: undefined,
    })),
    interaction_telemetry: {
      suppressed: false,
      recent_records: [],
    },
    camera_cv: {
      intent_enabled: false,
      lifecycle_status: "off" as const,
      unavailable_reason: undefined,
      status_note: "Webcam monitoring is off until manually enabled.",
      last_refresh_bucket: "off",
      recent_observations: [],
    },
  };
  const inspectionSourceById = new Map(inspection.sources.map((source) => [source.source_id, source]));
  const interactionRecords = [...inspection.interaction_telemetry.recent_records].reverse();
  const cameraObservations = [...inspection.camera_cv.recent_observations].reverse();
  const latestCameraObservation = cameraObservations[0];
  const contributorLabels =
    snapshot.human_monitoring.interpretation_input?.contributing_source_ids.map((sourceId) => {
      const source = snapshot.human_monitoring.sources.find((candidate) => candidate.source_id === sourceId);
      return source ? monitoringSourceLabel(source.source_kind) : sourceId;
    }) ?? [];
  const extractedFeatureEntries = snapshot.human_monitoring.sources.flatMap((source) => {
    const latestFeatures = inspectionSourceById.get(source.source_id)?.latest_features;
    return latestFeatures ? [{ source, latestFeatures }] : [];
  });

  return {
    summaryMetrics: [
      {
        label: "Monitoring mode",
        value: monitoringModeLabel(snapshot.human_monitoring.mode),
        caption: `Freshness ${snapshot.human_monitoring.freshness_status}`,
        tone: freshnessTone(snapshot.human_monitoring.freshness_status),
      },
      {
        label: "Aggregate confidence",
        value: `${snapshot.human_monitoring.aggregate_confidence}/100`,
        caption: `${snapshot.human_monitoring.contributing_source_count} contributing source(s)`,
        tone: snapshot.human_monitoring.degraded_state_active ? "alert" : "ok",
      },
      {
        label: "Operator workload",
        value: `${snapshot.operator_state.workload_index}/100`,
        caption: `Attention ${snapshot.operator_state.attention_stability_index}/100`,
        tone: snapshot.operator_state.degraded_mode_active ? "neutral" : "ok",
      },
      {
        label: "Downstream support",
        value: formatSupportModeLabel(snapshot.support_mode),
        caption: `Recommended ${formatSupportModeLabel(snapshot.combined_risk.recommended_assistance_mode)}`,
        tone: riskBadgeTone(snapshot.combined_risk.combined_risk_band),
      },
    ],
    summaryPills: [
      {
        label: `Freshness ${snapshot.human_monitoring.freshness_status}`,
        tone: freshnessTone(snapshot.human_monitoring.freshness_status),
      },
      {
        label: snapshot.human_monitoring.degraded_state_active ? "Degraded state active" : "Degraded state clear",
        tone: snapshot.human_monitoring.degraded_state_active ? "alert" : "ok",
      },
      {
        label: inspection.interaction_telemetry.suppressed ? "Telemetry capture suppressed" : "Telemetry capture live",
        tone: inspection.interaction_telemetry.suppressed ? "neutral" : "ok",
      },
    ],
    summaryHeadline: snapshot.human_monitoring.status_summary,
    summaryBody: snapshot.human_monitoring.degraded_state_active
      ? snapshot.human_monitoring.degraded_state_reason
      : "Monitoring is currently publishing a bounded, inspectable advisory picture into the runtime.",
    operateCrossReference: buildHumanMonitoringOperateIntegration(snapshot).workspaceCrossReference,
    sourceCards: snapshot.human_monitoring.sources.map((source) => {
      const latestFeatures = inspectionSourceById.get(source.source_id)?.latest_features;
      return {
        id: source.source_id,
        title: monitoringSourceLabel(source.source_kind),
        tone: sourceOverallTone(source),
        summary: source.status_note,
        detail: latestFeatures?.degraded_mode_active
          ? latestFeatures.degraded_mode_reason
          : source.contributes_to_aggregate
            ? "This source is currently contributing to the fused interpretation."
            : "This source is currently present for inspection but not contributing to the fused interpretation.",
        metrics: [
          {
            label: "Availability",
            value: source.availability.replace(/_/g, " "),
            caption: `Freshness ${source.freshness_status}`,
            tone: availabilityTone(source.availability),
          },
          {
            label: "Confidence",
            value: `${source.confidence}/100`,
            caption:
              typeof source.latest_observation_age_sec === "number"
                ? `Latest sample age ${source.latest_observation_age_sec}s`
                : "No current sample age available",
          },
          {
            label: "Window",
            value: `${source.sample_count_in_window} sample(s)`,
            caption: `${source.window_duration_sec}s across ${source.window_tick_span} tick(s)`,
          },
        ],
        pills: [
          {
            label: source.contributes_to_aggregate ? "Contributing" : "Not contributing",
            tone: source.contributes_to_aggregate ? "ok" : "neutral",
          },
          {
            label:
              source.source_kind === "legacy_runtime_placeholder"
                ? "Fallback compatibility path"
                : "Live-source path",
            tone: source.source_kind === "legacy_runtime_placeholder" ? "neutral" : "ok",
          },
        ],
      };
    }),
    webcam: {
      statusPills: [
        {
          label: `Lifecycle ${inspection.camera_cv.lifecycle_status.replace(/_/g, " ")}`,
          tone: lifecycleTone(inspection.camera_cv.lifecycle_status),
        },
        {
          label: inspection.camera_cv.intent_enabled ? "Intent enabled" : "Intent off",
          tone: inspection.camera_cv.intent_enabled ? "ok" : "neutral",
        },
        {
          label: latestCameraObservation
            ? `Latest ${latestCameraObservation.observation_kind.replace(/_/g, " ")}`
            : "No observation yet",
          tone: latestCameraObservation ? lifecycleTone(inspection.camera_cv.lifecycle_status) : "neutral",
        },
      ],
      summary: inspection.camera_cv.status_note,
      detail: inspection.camera_cv.unavailable_reason
        ? `Unavailable reason: ${inspection.camera_cv.unavailable_reason.replace(/_/g, " ")}.`
        : latestCameraObservation
          ? `Latest bounded visual observation arrived at t+${formatClock(latestCameraObservation.sim_time_sec)}.`
          : "No bounded visual observation has been captured yet.",
      metrics: [
        {
          label: "Observation window",
          value: `${inspection.camera_cv.recent_observations.length} sample(s)`,
          caption: `Refresh bucket ${inspection.camera_cv.last_refresh_bucket ?? "unknown"}`,
        },
        {
          label: "Latest confidence",
          value: latestCameraObservation
            ? `${Math.round(latestCameraObservation.strongest_face_confidence)}/100`
            : "N/A",
          caption: latestCameraObservation
            ? `Face count ${latestCameraObservation.face_count}`
            : "Awaiting observation",
          tone: latestCameraObservation ? lifecycleTone(inspection.camera_cv.lifecycle_status) : "neutral",
        },
      ],
      observationCards: cameraObservations.map((observation) => ({
        id: observation.observation_id,
        title: `${observation.observation_kind.replace(/_/g, " ")} at t+${formatClock(observation.sim_time_sec)}`,
        detail: observation.note,
        metrics: [
          {
            label: "Face confidence",
            value: `${Math.round(observation.strongest_face_confidence)}/100`,
            caption: `Faces ${observation.face_count}`,
          },
          {
            label: "Center offset",
            value: observation.face_center_offset.toFixed(2),
            caption: `Head motion ${observation.head_motion_delta.toFixed(2)}`,
          },
          {
            label: "Face area",
            value: observation.face_area_ratio.toFixed(2),
            caption: `Tick ${observation.tick_index}`,
          },
        ],
      })),
    },
    interactionTelemetry: {
      statusPills: [
        {
          label: inspection.interaction_telemetry.suppressed ? "Suppressed" : "Capturing",
          tone: inspection.interaction_telemetry.suppressed ? "neutral" : "ok",
        },
        {
          label: `${inspection.interaction_telemetry.recent_records.length} recent event(s)`,
          tone: inspection.interaction_telemetry.recent_records.length > 0 ? "ok" : "neutral",
        },
      ],
      summary:
        interactionRecords[0]?.detail ??
        "Recent UI actions, run controls, and workspace switches appear here as the real interaction telemetry feed.",
      detail:
        interactionRecords[0]
          ? `Latest interaction arrived at t+${formatClock(interactionRecords[0].sim_time_sec)} from ${interactionRecords[0].ui_region.replace(/_/g, " ")}.`
          : "No recent interaction telemetry is currently in the bounded window.",
      metrics: [
        {
          label: "Recent records",
          value: String(inspection.interaction_telemetry.recent_records.length),
          caption: interactionRecords[0]
            ? `Latest tick ${interactionRecords[0].tick_index}`
            : "Window empty",
        },
        {
          label: "Workspace touches",
          value: String(
            new Set(
              inspection.interaction_telemetry.recent_records
                .map((record) => record.workspace)
                .filter((workspace): workspace is NonNullable<typeof workspace> => Boolean(workspace)),
            ).size,
          ),
          caption: "Operate / monitoring / review coverage",
        },
      ],
      recordCards: interactionRecords.map((record) => ({
        id: record.interaction_id,
        title: `${record.event_kind.replace(/_/g, " ")} at t+${formatClock(record.sim_time_sec)}`,
        detail:
          record.detail ??
          `${record.ui_region.replace(/_/g, " ")}${record.target_id ? ` targeted ${record.target_id}` : ""}.`,
        pills: [
          {
            label: record.ui_region.replace(/_/g, " "),
            tone: "neutral",
          },
          ...(record.workspace
            ? [
                {
                  label: `${record.workspace} workspace`,
                  tone: "ok" as const,
                },
              ]
            : []),
          ...(typeof record.requested_value === "number"
            ? [
                {
                  label: `Value ${record.requested_value}`,
                  tone: "neutral" as const,
                },
              ]
            : []),
        ],
      })),
    },
    extractedFeatures: extractedFeatureEntries.map(({ source, latestFeatures }) => ({
        id: source.source_id,
        title: monitoringSourceLabel(source.source_kind),
        tone: latestFeatures.degraded_mode_active ? "neutral" : sourceOverallTone(source),
        summary: `${monitoringSourceLabel(source.source_kind)} is producing bounded feature values for the live inspection surface.`,
        metrics: [
          {
            label: "Workload",
            value: `${latestFeatures.workload_index}/100`,
            caption: `Attention ${latestFeatures.attention_stability_index}/100`,
          },
          {
            label: "Signal confidence",
            value: `${latestFeatures.signal_confidence}/100`,
            caption: `Window ${latestFeatures.observation_window_ticks} tick(s)`,
            tone: latestFeatures.degraded_mode_active ? "neutral" : "ok",
          },
        ],
        riskCues: buildRiskCueRows(latestFeatures.risk_cues),
        note: latestFeatures.interpretation_note,
      })),
    fusedInterpretation: snapshot.human_monitoring.interpretation_input
      ? {
          summary: snapshot.human_monitoring.interpretation_input.interpretation_note,
          detail: snapshot.human_monitoring.interpretation_input.degraded_mode_active
            ? snapshot.human_monitoring.interpretation_input.degraded_mode_reason
            : "The fused interpretation is currently confident enough to inform downstream support logic.",
          metrics: [
            {
              label: "Workload index",
              value: `${snapshot.human_monitoring.interpretation_input.workload_index}/100`,
              caption: `Attention ${snapshot.human_monitoring.interpretation_input.attention_stability_index}/100`,
            },
            {
              label: "Fused confidence",
              value: `${snapshot.human_monitoring.interpretation_input.signal_confidence}/100`,
              caption: `${snapshot.human_monitoring.interpretation_input.observation_window_ticks} tick(s)`,
              tone: snapshot.human_monitoring.interpretation_input.degraded_mode_active ? "neutral" : "ok",
            },
          ],
          riskCues: buildRiskCueRows(snapshot.human_monitoring.interpretation_input.risk_cues),
          pills: [
            {
              label: `Provenance ${snapshot.human_monitoring.interpretation_input.provenance.replace(/_/g, " ")}`,
              tone:
                snapshot.human_monitoring.interpretation_input.provenance === "canonical_source_pipeline"
                  ? "ok"
                  : "neutral",
            },
            ...contributorLabels.map((label) => ({
              label,
              tone: "neutral" as const,
            })),
          ],
        }
      : undefined,
    finalOutput: {
      summary: `Operator-state output is publishing workload ${snapshot.operator_state.workload_index}/100, attention ${snapshot.operator_state.attention_stability_index}/100, and signal confidence ${snapshot.operator_state.signal_confidence}/100.`,
      detail: snapshot.operator_state.degraded_mode_active
        ? snapshot.operator_state.degraded_mode_reason
        : "Final output state is currently stable enough for advisory use.",
      metrics: [
        {
          label: "Human-monitoring mode",
          value: monitoringModeLabel(snapshot.human_monitoring.mode),
          caption: `Aggregate confidence ${snapshot.human_monitoring.aggregate_confidence}/100`,
          tone: freshnessTone(snapshot.human_monitoring.freshness_status),
        },
        {
          label: "Operator output",
          value: `${snapshot.operator_state.workload_index}/100`,
          caption: `Attention ${snapshot.operator_state.attention_stability_index}/100`,
        },
        {
          label: "Output confidence",
          value: `${snapshot.operator_state.signal_confidence}/100`,
          caption: `${snapshot.operator_state.observation_window_ticks} tick(s)`,
          tone: snapshot.operator_state.degraded_mode_active ? "alert" : "ok",
        },
      ],
      pills: [
        {
          label: snapshot.operator_state.degraded_mode_active ? "Output degraded" : "Output current",
          tone: snapshot.operator_state.degraded_mode_active ? "alert" : "ok",
        },
        {
          label: `Freshness ${snapshot.human_monitoring.freshness_status}`,
          tone: freshnessTone(snapshot.human_monitoring.freshness_status),
        },
      ],
    },
    downstreamImpact: {
      summary: snapshot.combined_risk.recommended_assistance_reason,
      detail: snapshot.combined_risk.why_risk_is_current,
      metrics: [
        {
          label: "Human pressure",
          value: `${snapshot.combined_risk.human_pressure_index}/100`,
          caption: `Human influence ${snapshot.combined_risk.human_influence_scale.toFixed(2)}`,
        },
        {
          label: "Combined risk",
          value: `${snapshot.combined_risk.combined_risk_score.toFixed(1)}/100`,
          caption: snapshot.combined_risk.combined_risk_band,
          tone: riskBadgeTone(snapshot.combined_risk.combined_risk_band),
        },
        {
          label: "Active support",
          value: formatSupportModeLabel(snapshot.support_mode),
          caption: `Recommended ${formatSupportModeLabel(snapshot.combined_risk.recommended_assistance_mode)}`,
          tone: supportModeTone(snapshot.support_mode),
        },
      ],
      pills: [
        {
          label: `Risk band ${snapshot.combined_risk.combined_risk_band}`,
          tone: riskBadgeTone(snapshot.combined_risk.combined_risk_band),
        },
        {
          label: snapshot.session_mode === "baseline" ? "Baseline gating active" : "Adaptive gating active",
          tone: snapshot.session_mode === "baseline" ? "neutral" : "ok",
        },
      ],
      implications: [
        {
          label: "Support posture meaning",
          body: snapshot.support_policy.current_mode_reason,
        },
        {
          label: "Watch-now emphasis",
          body: snapshot.support_refinement.watch_now_summary,
        },
        {
          label: "Degraded/fallback effect",
          body:
            snapshot.support_policy.degraded_confidence_effect ||
            snapshot.support_refinement.degraded_confidence_caution ||
            "No extra degraded-confidence caution is active right now.",
        },
        {
          label: "Critical visibility guardrail",
          body: snapshot.support_policy.critical_visibility.summary,
        },
      ],
      factors: snapshot.combined_risk.factor_breakdown.slice(0, 4).map((factor) => ({
        id: factor.factor_id,
        label: factor.label,
        detail: factor.detail,
      })),
    },
  };
}

type BuildReviewWorkspaceModelParams = {
  snapshot: SessionSnapshot;
  sessionRunComparison?: SessionRunComparison;
  comparisonCaptureHint: boolean;
};

export function buildReviewWorkspaceModel(params: BuildReviewWorkspaceModelParams): ReviewWorkspaceModel {
  const { snapshot, sessionRunComparison, comparisonCaptureHint } = params;

  return {
    demoChecklist: Object.values(snapshot.validation_demo_state).map((marker) => ({
      id: marker.marker_kind,
      label: marker.marker_kind.replace(/_/g, " "),
      done: marker.demonstrated,
    })),
    recentEvents: snapshot.events.slice(-8).reverse().map((event) => ({
      id: event.event_id,
      title: event.event_type,
      timeLabel: `t+${formatClock(event.sim_time_sec)}`,
      sourceModule: event.source_module,
      payloadText: JSON.stringify(event.payload, null, 2),
    })),
    comparisonHint: comparisonCaptureHint
      ? "Capture the other session mode on this scenario, then reset and complete the run to unlock the Baseline run vs AURA-assisted (adaptive) run comparison."
      : undefined,
    oversightSummary: snapshot.pending_supervisor_override?.request_status === "requested"
      ? "A supervisor decision is currently blocking a high-risk action."
      : "Use this workspace for validator oversight, pending approvals, and recent event traceability.",
    completedRunSummary: snapshot.completed_review
      ? `Completed run evidence is available for ${snapshot.completed_review.session_id} at t+${formatClock(
          snapshot.completed_review.completion_sim_time_sec,
        )}.`
      : "Complete a run to unlock the bounded after-action review and KPI evidence.",
    comparisonSummary: sessionRunComparison
      ? `Comparison is ready for Baseline run ${sessionRunComparison.baseline_session_id} vs AURA-assisted (adaptive) run ${sessionRunComparison.adaptive_session_id}.`
      : "Comparison and export stay empty until both Baseline and AURA-assisted (adaptive) runs are completed on the same scenario and version.",
  };
}

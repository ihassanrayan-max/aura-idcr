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

export type WorkspaceId = "operate" | "review";

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
  supportMetrics: MetricItemModel[];
  supportPills: StatusPillModel[];
  supportNotes: Array<{ label: string; body: string }>;
  topFactors: Array<{ id: string; label: string; contribution: string; detail: string }>;
  supportCaution?: string;
  reviewHint: string;
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
      ? `${criticalAlarmTitle}. ${snapshot.support_policy.critical_visibility.summary}`
      : `${snapshot.support_refinement.watch_now_summary}. ${snapshot.support_policy.critical_visibility.summary}`;

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
        meta: `Combined risk ${snapshot.combined_risk.combined_risk_band}`,
      },
      {
        id: "next",
        eyebrow: "Do next",
        headline: nextHeadline,
        body: nextBody,
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
          body: snapshot.support_refinement.operator_context_note,
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
        label: `Focus ${snapshot.support_refinement.current_support_focus}`,
        tone: riskBadgeTone(snapshot.combined_risk.combined_risk_band),
      },
      {
        label: `Watch next ${snapshot.support_refinement.watch_now_summary}`,
        tone: riskBadgeTone(snapshot.combined_risk.combined_risk_band),
      },
      {
        label: snapshot.pending_action_confirmation ? "Validation pending confirmation" : "Validation inline and active",
        tone: snapshot.pending_action_confirmation ? "neutral" : "ok",
      },
    ],
    laneItems: presentedLaneItems.map((item) => ({
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
    })),
    supportMetrics: [
      { label: "Combined risk", value: `${snapshot.combined_risk.combined_risk_score.toFixed(1)}/100`, caption: snapshot.combined_risk.combined_risk_band },
      { label: "Assistance mode", value: formatSupportModeLabel(snapshot.support_mode) },
      { label: "Workload", value: `${snapshot.operator_state.workload_index}/100` },
      { label: "Attention stability", value: `${snapshot.operator_state.attention_stability_index}/100` },
      { label: "Signal confidence", value: `${snapshot.operator_state.signal_confidence}/100` },
    ],
    supportPills: [
      {
        label: `Degraded mode ${snapshot.operator_state.degraded_mode_active ? "active" : "clear"}`,
        tone: snapshot.operator_state.degraded_mode_active ? "alert" : "ok",
      },
      {
        label: "Critical visibility guardrails active",
        tone: "ok",
      },
      {
        label: "Rule-based storyline active",
        tone: "ok",
      },
      {
        label:
          snapshot.last_validation_result && validationBadgeTone(snapshot.last_validation_result.outcome) === "alert"
            ? "Protected validation active"
            : "Validator ready",
        tone: snapshot.last_validation_result ? validationBadgeTone(snapshot.last_validation_result.outcome) : "neutral",
      },
    ],
    supportNotes: [
      {
        label: "Mode effect now",
        body: snapshot.support_policy.support_behavior_changes.join(" "),
      },
      {
        label: "Why risk is here now",
        body: snapshot.combined_risk.why_risk_is_current,
      },
      {
        label: "Confidence caveat",
        body: snapshot.support_refinement.degraded_confidence_caution ?? snapshot.combined_risk.confidence_caveat,
      },
      {
        label: "What changed",
        body: snapshot.combined_risk.what_changed,
      },
    ],
    topFactors: snapshot.combined_risk.factor_breakdown.slice(0, 3).map((factor) => ({
      id: factor.factor_id,
      label: factor.label,
      contribution: `+${factor.contribution.toFixed(1)}`,
      detail: factor.detail,
    })),
    supportCaution: snapshot.support_refinement.degraded_confidence_caution,
    reviewHint:
      pendingSupervisorOverride?.request_status === "requested"
        ? "Supervisor review is active. Open Review to approve or deny the blocked action."
        : snapshot.completed_review
          ? `Completed run evidence is ready in Review for session ${snapshot.completed_review.session_id}.`
          : "Open Review for live oversight, completed-run evidence, and comparison/export when ready.",
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
      ? "Capture the other session mode on this scenario, then reset and complete the run to unlock the paired comparison."
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
      ? `Comparison is ready for baseline ${sessionRunComparison.baseline_session_id} vs adaptive ${sessionRunComparison.adaptive_session_id}.`
      : "Comparison and export stay empty until both baseline and adaptive runs are completed on the same scenario and version.",
  };
}

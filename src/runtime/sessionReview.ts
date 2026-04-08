import type {
  CompletedSessionReview,
  CompletedSessionReviewEvent,
  CompletedSessionReviewHighlight,
  CompletedSessionReviewMilestone,
  KpiSummary,
  ReviewProofPoint,
  ScenarioOutcome,
  SessionLogEvent,
  SessionLogEventType,
  SessionMode,
} from "../contracts/aura";

export type BuildCompletedSessionReviewParams = {
  session_id: string;
  session_mode: SessionMode;
  scenario: { scenario_id: string; version: string; title: string };
  outcome: ScenarioOutcome;
  kpi_summary: KpiSummary;
  events: SessionLogEvent[];
};

const KEY_EVENT_TYPES: ReadonlySet<SessionLogEventType> = new Set([
  "session_started",
  "phase_changed",
  "human_monitoring_snapshot_recorded",
  "operator_state_snapshot_recorded",
  "reasoning_snapshot_published",
  "diagnosis_committed",
  "support_mode_changed",
  "action_requested",
  "action_validated",
  "action_confirmation_recorded",
  "supervisor_override_requested",
  "supervisor_override_decided",
  "supervisor_override_action_applied",
  "validation_demo_marker_recorded",
  "operator_action_applied",
  "scenario_outcome_recorded",
  "session_ended",
  "kpi_summary_generated",
]);

const MAX_KEY_EVENTS = 28;
const TERMINAL_KEY_TYPES: ReadonlySet<SessionLogEventType> = new Set([
  "scenario_outcome_recorded",
  "session_ended",
  "kpi_summary_generated",
]);
const STICKY_KEY_TYPES: ReadonlySet<SessionLogEventType> = new Set([
  "supervisor_override_requested",
  "supervisor_override_decided",
  "supervisor_override_action_applied",
  "validation_demo_marker_recorded",
]);
const HUMAN_FACTOR_LABELS = new Set([
  "Human workload pressure",
  "Attention instability",
  "Interaction friction",
  "Human confidence penalty",
]);

type MonitoringProofStatus = "active" | "degraded" | "unavailable";

function tickIdFromEvent(event: SessionLogEvent): string | undefined {
  const tick = event.trace_refs.find((ref) => ref.ref_type === "tick_id");
  return tick?.ref_value;
}

function stringValue(value: unknown): string | undefined {
  return typeof value === "string" ? value : undefined;
}

function numberValue(value: unknown): number | undefined {
  return typeof value === "number" ? value : undefined;
}

function booleanValue(value: unknown): boolean | undefined {
  return typeof value === "boolean" ? value : undefined;
}

function stringArrayValue(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((entry): entry is string => typeof entry === "string") : [];
}

function formatValidationOutcome(payload: Record<string, unknown>): string {
  const outcome = payload.outcome;
  if (outcome === "pass") return "pass";
  if (outcome === "soft_warning") return "soft warning (confirmation may be required)";
  if (outcome === "hard_prevent") return "hard prevent";
  return String(outcome ?? "unknown");
}

function formatSupportModeLabel(mode: string): string {
  switch (mode) {
    case "monitoring_support":
      return "Monitoring Support";
    case "guided_support":
      return "Guided Support";
    case "protected_response":
      return "Protected Response";
    default:
      return mode.replace(/_/g, " ");
  }
}

function sourceKindLabel(source_kind: string): string {
  switch (source_kind) {
    case "legacy_runtime_placeholder":
      return "Legacy compatibility placeholder";
    case "interaction_telemetry":
      return "Interaction telemetry";
    case "camera_cv":
      return "Advisory webcam/CV";
    case "manual_annotation":
      return "Manual annotation";
    default:
      return source_kind.replace(/_/g, " ");
  }
}

function contributingSourceLabels(sources: unknown): string[] {
  if (!Array.isArray(sources)) {
    return [];
  }

  return sources
    .filter(
      (source) =>
        source &&
        typeof source === "object" &&
        "source_kind" in source &&
        "contributes_to_aggregate" in source &&
        source.contributes_to_aggregate === true &&
        typeof source.source_kind === "string",
    )
    .map((source) => sourceKindLabel(source.source_kind));
}

function liveMonitoringContributorLabels(sources: unknown): string[] {
  if (!Array.isArray(sources)) {
    return [];
  }

  return sources
    .filter(
      (source) =>
        source &&
        typeof source === "object" &&
        "source_kind" in source &&
        "contributes_to_aggregate" in source &&
        source.contributes_to_aggregate === true &&
        (source.source_kind === "interaction_telemetry" || source.source_kind === "camera_cv"),
    )
    .map((source) => (source.source_kind === "camera_cv" ? "Webcam monitoring" : "Interaction telemetry"));
}

function monitoringPostureFromPayload(payload: Record<string, unknown>): MonitoringProofStatus {
  const mode = stringValue(payload.mode);
  const freshness_status = stringValue(payload.freshness_status);
  const degraded_state_active = booleanValue(payload.degraded_state_active) ?? false;
  const contributing_source_count = numberValue(payload.contributing_source_count) ?? 0;

  if (mode === "unavailable") {
    return "unavailable";
  }

  if (mode === "live_sources" && freshness_status === "current" && !degraded_state_active && contributing_source_count > 0) {
    return "active";
  }

  return "degraded";
}

function summarizeEventForReview(event: SessionLogEvent): { title: string; summary: string } {
  const p = event.payload;
  switch (event.event_type) {
    case "session_started": {
      const mode = stringValue(p.session_mode);
      return {
        title: "Session started",
        summary: mode ? `Mode: ${mode}. Scenario runtime initialized.` : "Scenario runtime initialized.",
      };
    }
    case "phase_changed": {
      const toPhase = stringValue(p.to_phase_id);
      const fromPhase = stringValue(p.from_phase_id);
      return {
        title: "Phase changed",
        summary: toPhase ? `Now in ${toPhase}${fromPhase ? ` (from ${fromPhase})` : ""}.` : "Scenario phase updated.",
      };
    }
    case "human_monitoring_snapshot_recorded": {
      const mode = stringValue(p.mode);
      const freshness = stringValue(p.freshness_status);
      const status = stringValue(p.status_summary);
      const connected = numberValue(p.connected_source_count) ?? 0;
      const contributing = numberValue(p.contributing_source_count) ?? 0;
      const liveContributors = liveMonitoringContributorLabels(p.sources);
      return {
        title: "Human-monitoring snapshot recorded",
        summary:
          [
            mode && `Mode: ${mode}.`,
            freshness && `Freshness: ${freshness}.`,
            `Connected sources: ${connected}.`,
            `Contributing sources: ${contributing}.`,
            liveContributors.length > 0 ? `${liveContributors.join(" and ")} contributed live evidence.` : "",
            status,
          ]
            .filter(Boolean)
            .join(" ") || "Human-monitoring foundation snapshot recorded.",
      };
    }
    case "operator_state_snapshot_recorded": {
      const workload = numberValue(p.workload_index);
      const attention = numberValue(p.attention_stability_index);
      const confidence = numberValue(p.signal_confidence);
      const degraded = booleanValue(p.degraded_mode_active) ?? false;
      const degradedReason = stringValue(p.degraded_mode_reason);
      return {
        title: "Operator-state snapshot recorded",
        summary:
          [
            workload !== undefined ? `Workload ${workload}/100.` : "",
            attention !== undefined ? `Attention stability ${attention}/100.` : "",
            confidence !== undefined ? `Signal confidence ${confidence}/100.` : "",
            degraded ? "Degraded mode active." : "",
            degraded && degradedReason ? degradedReason : "",
          ]
            .filter(Boolean)
            .join(" ") || "Operator-state snapshot recorded.",
      };
    }
    case "reasoning_snapshot_published": {
      const dominant = stringValue(p.dominant_summary);
      const riskBand = stringValue(p.combined_risk_band);
      const recommendation = stringValue(p.recommended_assistance_mode);
      const topFactors = stringArrayValue(p.top_contributing_factors);
      return {
        title: "Reasoning snapshot published",
        summary:
          [
            dominant,
            riskBand ? `Risk band: ${riskBand}.` : "",
            topFactors.length > 0 ? `Top contributors: ${topFactors.slice(0, 2).join(" and ")}.` : "",
            recommendation ? `Recommended posture: ${recommendation}.` : "",
          ]
            .filter(Boolean)
            .join(" ") || "Reasoning snapshot published with updated risk and storyline context.",
      };
    }
    case "diagnosis_committed": {
      const id = stringValue(p.diagnosis_id);
      const aligned = p.matches_expected_root_cause === true;
      return {
        title: "Diagnosis committed",
        summary: id ? `${id}${aligned ? " (aligned with scenario driver)" : ""}.` : "Dominant hypothesis committed to the log.",
      };
    }
    case "support_mode_changed": {
      const from = stringValue(p.from_mode);
      const to = stringValue(p.to_mode);
      const recommendation = stringValue(p.recommended_mode);
      const reason = stringValue(p.trigger_reason);
      return {
        title: "Assistance mode changed",
        summary: [
          from && to ? `${from} -> ${to}` : to || from || "Support mode updated",
          recommendation ? `(risk recommended ${recommendation})` : "",
          reason && `- ${reason}`,
        ]
          .filter(Boolean)
          .join(" "),
      };
    }
    case "action_requested": {
      const actionId = stringValue(p.action_id);
      const region = stringValue(p.ui_region);
      return {
        title: "Operator action requested",
        summary: [actionId && `Action: ${actionId}`, region && `from ${region}`].filter(Boolean).join(" | ") || "Operator request logged.",
      };
    }
    case "action_validated": {
      const actionId = stringValue(p.action_id);
      const outcome = formatValidationOutcome(p);
      const prevented = p.prevented_harm === true ? " Prevented-harm signal." : "";
      return {
        title: "Action validated",
        summary: `${actionId ? `${actionId}: ` : ""}${outcome}.${prevented}`.trim(),
      };
    }
    case "action_confirmation_recorded":
      return {
        title: "Soft-warning confirmation recorded",
        summary: "Operator confirmed proceeding past a soft warning.",
      };
    case "supervisor_override_requested":
      return {
        title: "Supervisor override requested",
        summary: "Operator requested bounded demo/research supervisor review for one blocked action.",
      };
    case "supervisor_override_decided": {
      const decision = stringValue(p.decision);
      return {
        title: "Supervisor override decided",
        summary: decision ? `Supervisor decision: ${decision}.` : "Supervisor review decision recorded.",
      };
    }
    case "supervisor_override_action_applied":
      return {
        title: "Supervisor override applied",
        summary: "One blocked action was released through the bounded demo/research supervisor path.",
      };
    case "validation_demo_marker_recorded": {
      const marker_kind = stringValue(p.marker_kind);
      return {
        title: "Validator demo checkpoint recorded",
        summary: marker_kind ? `Checkpoint: ${marker_kind}.` : "A validator demo checkpoint was recorded.",
      };
    }
    case "operator_action_applied": {
      const actionId = stringValue(p.action_id);
      const correctness = stringValue(p.correctness_label);
      const overrideApplied = p.override_applied === true ? " | override applied" : "";
      return {
        title: "Operator action applied to plant",
        summary:
          ([actionId && `Action: ${actionId}`, correctness && `label: ${correctness}`].filter(Boolean).join(" | ") || "Action applied.") +
          overrideApplied,
      };
    }
    case "scenario_outcome_recorded": {
      const outcome = stringValue(p.outcome);
      const message = stringValue(p.failure_reason);
      return {
        title: "Scenario outcome recorded",
        summary: outcome ? `${outcome}.${message ? ` ${message}` : ""}` : "Terminal outcome written to the log.",
      };
    }
    case "session_ended": {
      const final = stringValue(p.final_outcome);
      return {
        title: "Session ended",
        summary: final ? `Final outcome: ${final}.` : "Session closed for evaluation.",
      };
    }
    case "kpi_summary_generated": {
      const completeness = stringValue(p.completeness);
      return {
        title: "KPI summary generated",
        summary: completeness ? `Completeness: ${completeness}.` : "Session KPI bundle computed from canonical events.",
      };
    }
    default:
      return {
        title: event.event_type,
        summary: "See canonical log for payload detail.",
      };
  }
}

function findReasoningEventForTick(
  events: SessionLogEvent[],
  tick_id: string | undefined,
  sim_time_sec: number,
): SessionLogEvent | undefined {
  if (tick_id) {
    const sameTick = events.find(
      (event) => event.event_type === "reasoning_snapshot_published" && tickIdFromEvent(event) === tick_id,
    );
    if (sameTick) {
      return sameTick;
    }
  }

  return events.find(
    (event) => event.event_type === "reasoning_snapshot_published" && event.sim_time_sec === sim_time_sec,
  );
}

function buildMonitoringStatusProofPoint(events: SessionLogEvent[]): ReviewProofPoint | undefined {
  const monitoringEvents = events.filter((event) => event.event_type === "human_monitoring_snapshot_recorded");
  if (monitoringEvents.length === 0) {
    return undefined;
  }

  const chosen =
    monitoringEvents.find((event) => {
      const posture = monitoringPostureFromPayload(event.payload);
      return posture === "active" || posture === "degraded";
    }) ?? monitoringEvents[monitoringEvents.length - 1];

  const posture = monitoringPostureFromPayload(chosen.payload);
  const freshness = stringValue(chosen.payload.freshness_status) ?? "unknown";
  const contributingSources = contributingSourceLabels(chosen.payload.sources);
  const contributingCount = numberValue(chosen.payload.contributing_source_count) ?? contributingSources.length;
  const confidence = numberValue(chosen.payload.aggregate_confidence) ?? 0;
  const statusSummary = stringValue(chosen.payload.status_summary) ?? "Monitoring posture recorded.";

  return {
    proof_id: `proof_monitoring_${chosen.event_id}`,
    kind: "monitoring_status",
    label:
      posture === "active" ? "Monitoring active" : posture === "degraded" ? "Monitoring degraded" : "Monitoring unavailable",
    detail: [
      `Monitoring was ${posture} at t+${chosen.sim_time_sec}s.`,
      `Freshness ${freshness}.`,
      `Contributing sources ${contributingCount}${contributingSources.length > 0 ? ` (${contributingSources.join(", ")})` : ""}.`,
      `Confidence ${confidence.toFixed(1)}/100.`,
      statusSummary,
    ].join(" "),
    sim_time_sec: chosen.sim_time_sec,
    source_event_id: chosen.event_id,
    tick_id: tickIdFromEvent(chosen),
  };
}

function buildHumanIndicatorShiftProofPoint(events: SessionLogEvent[]): ReviewProofPoint | undefined {
  const operatorEvents = events.filter((event) => event.event_type === "operator_state_snapshot_recorded");
  if (operatorEvents.length < 2) {
    return undefined;
  }

  const earliest = operatorEvents[0];
  const strongestLater = operatorEvents.slice(1).reduce((best, candidate) => {
    const candidateScore =
      (numberValue(candidate.payload.workload_index) ?? 0) +
      (100 - (numberValue(candidate.payload.attention_stability_index) ?? 100)) +
      ((booleanValue(candidate.payload.degraded_mode_active) ?? false) ? 20 : 0);
    const bestScore =
      (numberValue(best.payload.workload_index) ?? 0) +
      (100 - (numberValue(best.payload.attention_stability_index) ?? 100)) +
      ((booleanValue(best.payload.degraded_mode_active) ?? false) ? 20 : 0);
    return candidateScore >= bestScore ? candidate : best;
  });

  const earliestWorkload = numberValue(earliest.payload.workload_index) ?? 0;
  const latestWorkload = numberValue(strongestLater.payload.workload_index) ?? 0;
  const earliestAttention = numberValue(earliest.payload.attention_stability_index) ?? 100;
  const latestAttention = numberValue(strongestLater.payload.attention_stability_index) ?? 100;
  const earliestConfidence = numberValue(earliest.payload.signal_confidence) ?? 0;
  const latestConfidence = numberValue(strongestLater.payload.signal_confidence) ?? 0;
  const workloadRise = latestWorkload - earliestWorkload;
  const attentionDrop = earliestAttention - latestAttention;
  const degradedActivated =
    (booleanValue(earliest.payload.degraded_mode_active) ?? false) === false &&
    (booleanValue(strongestLater.payload.degraded_mode_active) ?? false) === true;

  if (workloadRise < 8 && attentionDrop < 8 && !degradedActivated) {
    return undefined;
  }

  return {
    proof_id: `proof_human_shift_${strongestLater.event_id}`,
    kind: "human_indicator_shift",
    label: degradedActivated ? "Operator state entered degraded mode" : "Operator strain increased",
    detail: [
      `Workload moved ${earliestWorkload}/100 -> ${latestWorkload}/100.`,
      `Attention stability moved ${earliestAttention}/100 -> ${latestAttention}/100.`,
      `Signal confidence moved ${earliestConfidence.toFixed(1)}/100 -> ${latestConfidence.toFixed(1)}/100.`,
      degradedActivated ? "Degraded mode became active during the run." : "",
    ]
      .filter(Boolean)
      .join(" "),
    sim_time_sec: strongestLater.sim_time_sec,
    source_event_id: strongestLater.event_id,
    tick_id: tickIdFromEvent(strongestLater),
  };
}

function buildSupportTransitionProofPoint(events: SessionLogEvent[], session_mode: SessionMode): ReviewProofPoint | undefined {
  if (session_mode === "baseline") {
    const reasoningEvent =
      events.find((event) => {
        if (event.event_type !== "reasoning_snapshot_published") {
          return false;
        }
        return stringValue(event.payload.recommended_assistance_mode) !== stringValue(event.payload.support_mode);
      }) ??
      [...events].reverse().find((event) => event.event_type === "reasoning_snapshot_published");

    if (!reasoningEvent) {
      return undefined;
    }

    const support_mode = stringValue(reasoningEvent.payload.support_mode) ?? "monitoring_support";
    const recommended_mode = stringValue(reasoningEvent.payload.recommended_assistance_mode);
    const current_mode_reason = stringValue(reasoningEvent.payload.current_mode_reason);
    const recommended_reason = stringValue(reasoningEvent.payload.recommended_assistance_reason);
    const what_changed = stringValue(reasoningEvent.payload.what_changed);

    return {
      proof_id: `proof_support_${reasoningEvent.event_id}`,
      kind: "support_transition",
      label: "Baseline posture fixed",
      detail: [
        `Baseline run kept ${formatSupportModeLabel(support_mode)} fixed.`,
        recommended_mode && recommended_mode !== support_mode
          ? `The live risk layer would otherwise recommend ${formatSupportModeLabel(recommended_mode)}.`
          : "",
        current_mode_reason,
        recommended_reason,
        what_changed,
      ]
        .filter(Boolean)
        .join(" "),
      sim_time_sec: reasoningEvent.sim_time_sec,
      source_event_id: reasoningEvent.event_id,
      tick_id: tickIdFromEvent(reasoningEvent),
    };
  }

  const supportChange = events.find((event) => event.event_type === "support_mode_changed");
  if (supportChange) {
    const tick_id = tickIdFromEvent(supportChange);
    const reasoningEvent = findReasoningEventForTick(events, tick_id, supportChange.sim_time_sec);
    const from_mode = stringValue(supportChange.payload.from_mode);
    const to_mode = stringValue(supportChange.payload.to_mode);
    const recommended_reason =
      stringValue(supportChange.payload.recommended_reason) ??
      stringValue(reasoningEvent?.payload.recommended_assistance_reason);
    const trigger_reason = stringValue(supportChange.payload.trigger_reason);
    const current_mode_reason =
      stringValue(supportChange.payload.current_mode_reason) ??
      stringValue(reasoningEvent?.payload.current_mode_reason);
    const what_changed = stringValue(reasoningEvent?.payload.what_changed);

    return {
      proof_id: `proof_support_${supportChange.event_id}`,
      kind: "support_transition",
      label: to_mode ? `Support shifted to ${formatSupportModeLabel(to_mode)}` : "Support posture changed",
      detail: [
        from_mode && to_mode
          ? `Transition ${formatSupportModeLabel(from_mode)} -> ${formatSupportModeLabel(to_mode)}.`
          : "Adaptive posture changed.",
        recommended_reason,
        trigger_reason,
        current_mode_reason,
        what_changed,
      ]
        .filter(Boolean)
        .join(" "),
      sim_time_sec: supportChange.sim_time_sec,
      source_event_id: supportChange.event_id,
      tick_id,
    };
  }

  const fallbackReasoning = [...events].reverse().find((event) => event.event_type === "reasoning_snapshot_published");
  if (!fallbackReasoning) {
    return undefined;
  }

  return {
    proof_id: `proof_support_${fallbackReasoning.event_id}`,
    kind: "support_transition",
    label: "Adaptive posture held steady",
    detail: [
      stringValue(fallbackReasoning.payload.current_mode_reason),
      stringValue(fallbackReasoning.payload.recommended_assistance_reason),
      stringValue(fallbackReasoning.payload.what_changed),
    ]
      .filter(Boolean)
      .join(" "),
    sim_time_sec: fallbackReasoning.sim_time_sec,
    source_event_id: fallbackReasoning.event_id,
    tick_id: tickIdFromEvent(fallbackReasoning),
  };
}

function buildValidatorReasonProofPoint(events: SessionLogEvent[]): ReviewProofPoint | undefined {
  const validationEvent = events.find(
    (event) => event.event_type === "action_validated" && stringValue(event.payload.outcome) !== "pass",
  );

  if (validationEvent) {
    const outcome = stringValue(validationEvent.payload.outcome) ?? "unknown";
    const reason_code = stringValue(validationEvent.payload.reason_code);
    const explanation = stringValue(validationEvent.payload.explanation);
    const risk_context = stringValue(validationEvent.payload.risk_context);
    const safe_alternative = stringValue(validationEvent.payload.recommended_safe_alternative);

    return {
      proof_id: `proof_validator_${validationEvent.event_id}`,
      kind: "validator_reason",
      label:
        outcome === "hard_prevent"
          ? "Validator blocked a high-risk action"
          : outcome === "soft_warning"
            ? "Validator required explicit confirmation"
            : "Validator recorded a bounded review moment",
      detail: [
        `Outcome ${formatValidationOutcome(validationEvent.payload)}.`,
        reason_code ? `Reason code ${reason_code}.` : "",
        explanation,
        risk_context,
        safe_alternative ? `Safe alternative: ${safe_alternative}.` : "",
      ]
        .filter(Boolean)
        .join(" "),
      sim_time_sec: validationEvent.sim_time_sec,
      source_event_id: validationEvent.event_id,
      tick_id: tickIdFromEvent(validationEvent),
    };
  }

  const overrideEvent = events.find((event) => event.event_type === "supervisor_override_decided");
  if (!overrideEvent) {
    return undefined;
  }

  const decision = stringValue(overrideEvent.payload.decision) ?? "recorded";
  const reason_code = stringValue(overrideEvent.payload.reason_code);
  const supervisor_note = stringValue(overrideEvent.payload.supervisor_note);

  return {
    proof_id: `proof_validator_${overrideEvent.event_id}`,
    kind: "validator_reason",
    label:
      decision === "approved"
        ? "Supervisor override released one blocked action"
        : "Supervisor override denied the blocked action",
    detail: [
      `Override decision ${decision}.`,
      reason_code ? `Reason code ${reason_code}.` : "",
      supervisor_note ? `Supervisor note: ${supervisor_note}.` : "",
    ]
      .filter(Boolean)
      .join(" "),
    sim_time_sec: overrideEvent.sim_time_sec,
    source_event_id: overrideEvent.event_id,
    tick_id: tickIdFromEvent(overrideEvent),
  };
}

function buildHumanAwareAdaptationProofPoint(events: SessionLogEvent[]): ReviewProofPoint | undefined {
  const tickOrder: string[] = [];
  const tickGroups = new Map<string, SessionLogEvent[]>();

  for (const event of events) {
    const tick_id = tickIdFromEvent(event);
    if (!tick_id) {
      continue;
    }
    if (!tickGroups.has(tick_id)) {
      tickGroups.set(tick_id, []);
      tickOrder.push(tick_id);
    }
    tickGroups.get(tick_id)!.push(event);
  }

  for (const tick_id of tickOrder) {
    const group = tickGroups.get(tick_id) ?? [];
    const monitoringEvent = group.find((event) => event.event_type === "human_monitoring_snapshot_recorded");
    const operatorEvent = group.find((event) => event.event_type === "operator_state_snapshot_recorded");
    const reasoningEvent = group.find((event) => event.event_type === "reasoning_snapshot_published");
    const supportEvent = group.find((event) => event.event_type === "support_mode_changed");
    const validationEvent = group.find(
      (event) => event.event_type === "action_validated" && stringValue(event.payload.outcome) !== "pass",
    );
    const supportMode = stringValue(reasoningEvent?.payload.support_mode);

    if (!monitoringEvent || !operatorEvent || !reasoningEvent || (!supportEvent && !validationEvent && !supportMode)) {
      continue;
    }

    const monitoringPosture = monitoringPostureFromPayload(monitoringEvent.payload);
    if (monitoringPosture === "unavailable") {
      continue;
    }

    const workload = numberValue(operatorEvent.payload.workload_index) ?? 0;
    const attention = numberValue(operatorEvent.payload.attention_stability_index) ?? 100;
    const degraded = booleanValue(operatorEvent.payload.degraded_mode_active) ?? false;
    const humanInfluenceScale = numberValue(reasoningEvent.payload.human_influence_scale) ?? 0;
    const topContributors = stringArrayValue(reasoningEvent.payload.top_contributing_factors);
    const humanFactorVisible = topContributors.some((factor) => HUMAN_FACTOR_LABELS.has(factor));
    const meaningfulHumanSignal = workload >= 40 || attention <= 78 || degraded || monitoringPosture === "degraded";

    if (!meaningfulHumanSignal || (!(humanFactorVisible || humanInfluenceScale > 0.4))) {
      continue;
    }

    const freshness = stringValue(monitoringEvent.payload.freshness_status) ?? "unknown";
    const confidence = numberValue(monitoringEvent.payload.aggregate_confidence) ?? 0;
    const whyRisk = stringValue(reasoningEvent.payload.why_risk_is_current);
    const whatChanged = stringValue(reasoningEvent.payload.what_changed);
    const sourceEvent = supportEvent ?? validationEvent ?? reasoningEvent;
    const supportDetail =
      stringValue(supportEvent?.payload.current_mode_reason) ??
      stringValue(supportEvent?.payload.trigger_reason) ??
      stringValue(reasoningEvent.payload.current_mode_reason) ??
      (supportMode ? `${formatSupportModeLabel(supportMode)} stayed active.` : undefined);

    return {
      proof_id: `proof_human_aware_${sourceEvent.event_id}`,
      kind: "human_aware_adaptation",
      label: supportEvent || supportMode ? "Human-aware signals shaped support" : "Human-aware signals shaped intervention",
      detail: [
        `At t+${reasoningEvent.sim_time_sec}s monitoring was ${monitoringPosture} (${freshness}; ${confidence.toFixed(1)}/100 confidence).`,
        `Operator state showed workload ${workload}/100 and attention stability ${attention}/100${degraded ? " with degraded mode active" : ""}.`,
        whyRisk,
        supportEvent || supportMode
          ? `Support response: ${supportDetail ?? "Adaptive posture remained active."}`
          : `Validator response: ${stringValue(validationEvent?.payload.explanation) ?? formatValidationOutcome(validationEvent?.payload ?? {})}.`,
        whatChanged,
        humanFactorVisible
          ? "Human-side factors were visible in the top contributors."
          : `Human influence scale was ${humanInfluenceScale.toFixed(2)}.`,
      ]
        .filter(Boolean)
        .join(" "),
      sim_time_sec: sourceEvent.sim_time_sec,
      source_event_id: sourceEvent.event_id,
      tick_id,
    };
  }

  return undefined;
}

function buildProofPoints(events: SessionLogEvent[], session_mode: SessionMode): ReviewProofPoint[] {
  return [
    buildMonitoringStatusProofPoint(events),
    buildHumanIndicatorShiftProofPoint(events),
    buildSupportTransitionProofPoint(events, session_mode),
    buildValidatorReasonProofPoint(events),
    buildHumanAwareAdaptationProofPoint(events),
  ].filter((proof): proof is ReviewProofPoint => Boolean(proof));
}

function selectKeyEvents(
  events: SessionLogEvent[],
  milestones: CompletedSessionReviewMilestone[],
  proof_points: ReviewProofPoint[],
): SessionLogEvent[] {
  const keyStream = events.filter((event) => KEY_EVENT_TYPES.has(event.event_type));
  const keyIds = new Set(keyStream.map((event) => event.event_id));
  const selectedIds = new Set<string>();

  for (const event of keyStream) {
    if (TERMINAL_KEY_TYPES.has(event.event_type)) {
      selectedIds.add(event.event_id);
    }
  }

  for (const event of keyStream) {
    if (STICKY_KEY_TYPES.has(event.event_type)) {
      selectedIds.add(event.event_id);
    }
  }

  for (const milestone of milestones) {
    if (keyIds.has(milestone.source_event_id)) {
      selectedIds.add(milestone.source_event_id);
    }
  }

  for (const proof of proof_points) {
    if (proof.source_event_id && keyIds.has(proof.source_event_id)) {
      selectedIds.add(proof.source_event_id);
    }
  }

  if (selectedIds.size < MAX_KEY_EVENTS) {
    for (const event of keyStream) {
      if (selectedIds.size >= MAX_KEY_EVENTS) {
        break;
      }
      selectedIds.add(event.event_id);
    }
  }

  return keyStream.filter((event) => selectedIds.has(event.event_id));
}

function buildMilestones(events: SessionLogEvent[]): CompletedSessionReviewMilestone[] {
  const milestones: CompletedSessionReviewMilestone[] = [];

  const started = events.find((event) => event.event_type === "session_started");
  if (started) {
    milestones.push({
      milestone_id: `ms_${started.event_id}`,
      kind: "session_start",
      sim_time_sec: started.sim_time_sec,
      label: "Session start",
      detail: "Runtime logging and scenario clock active.",
      source_event_id: started.event_id,
    });
  }

  const firstPhase = events.find((event) => event.event_type === "phase_changed");
  if (firstPhase) {
    const to = stringValue(firstPhase.payload.to_phase_id);
    milestones.push({
      milestone_id: `ms_${firstPhase.event_id}`,
      kind: "phase_entry",
      sim_time_sec: firstPhase.sim_time_sec,
      label: "First phase transition",
      detail: to ? `Entered ${to}.` : "Scenario phase changed.",
      source_event_id: firstPhase.event_id,
    });
  }

  const diagnosis = events.find((event) => event.event_type === "diagnosis_committed");
  if (diagnosis) {
    const id = stringValue(diagnosis.payload.diagnosis_id);
    milestones.push({
      milestone_id: `ms_${diagnosis.event_id}`,
      kind: "diagnosis",
      sim_time_sec: diagnosis.sim_time_sec,
      label: "Diagnosis committed",
      detail: id ? `Committed hypothesis: ${id}.` : "Dominant hypothesis committed.",
      source_event_id: diagnosis.event_id,
    });
  }

  const escalation = events.find(
    (event) => event.event_type === "support_mode_changed" && stringValue(event.payload.to_mode) === "protected_response",
  );
  const anySupport = events.find((event) => event.event_type === "support_mode_changed");
  const supportMilestone = escalation ?? anySupport;
  if (supportMilestone) {
    const to = stringValue(supportMilestone.payload.to_mode);
    milestones.push({
      milestone_id: `ms_${supportMilestone.event_id}`,
      kind: "support_escalation",
      sim_time_sec: supportMilestone.sim_time_sec,
      label: escalation ? "Escalated assistance" : "Assistance mode shift",
      detail: to ? `Support mode: ${to}.` : "Assistance mode changed.",
      source_event_id: supportMilestone.event_id,
    });
  }

  const intervention = events.find((event) => {
    if (event.event_type !== "action_validated") return false;
    const outcome = stringValue(event.payload.outcome);
    return outcome === "soft_warning" || outcome === "hard_prevent";
  });
  if (intervention) {
    milestones.push({
      milestone_id: `ms_${intervention.event_id}`,
      kind: "validator_intervention",
      sim_time_sec: intervention.sim_time_sec,
      label: "Validator intervention",
      detail: `Validation result: ${formatValidationOutcome(intervention.payload)}.`,
      source_event_id: intervention.event_id,
    });
  }

  const overrideApplied = events.find((event) => event.event_type === "supervisor_override_action_applied");
  if (overrideApplied) {
    milestones.push({
      milestone_id: `ms_${overrideApplied.event_id}`,
      kind: "supervisor_override",
      sim_time_sec: overrideApplied.sim_time_sec,
      label: "Supervisor override applied",
      detail: "A bounded demo/research supervisor override released one blocked action.",
      source_event_id: overrideApplied.event_id,
    });
  }

  const firstApplied = events.find((event) => event.event_type === "operator_action_applied");
  if (firstApplied) {
    const actionId = stringValue(firstApplied.payload.action_id);
    milestones.push({
      milestone_id: `ms_${firstApplied.event_id}`,
      kind: "operator_action",
      sim_time_sec: firstApplied.sim_time_sec,
      label: "Plant action applied",
      detail: actionId ? `First applied action: ${actionId}.` : "Operator action reached the plant twin.",
      source_event_id: firstApplied.event_id,
    });
  }

  const outcomeEvent = events.find((event) => event.event_type === "scenario_outcome_recorded");
  if (outcomeEvent) {
    const outcome = stringValue(outcomeEvent.payload.outcome);
    milestones.push({
      milestone_id: `ms_${outcomeEvent.event_id}`,
      kind: "terminal_outcome",
      sim_time_sec: outcomeEvent.sim_time_sec,
      label: "Terminal outcome",
      detail: outcome ? `Recorded outcome: ${outcome}.` : "Scenario outcome recorded.",
      source_event_id: outcomeEvent.event_id,
    });
  }

  return milestones.sort((left, right) => {
    if (left.sim_time_sec !== right.sim_time_sec) return left.sim_time_sec - right.sim_time_sec;
    return left.source_event_id.localeCompare(right.source_event_id);
  });
}

function buildHighlights(events: SessionLogEvent[], outcome: ScenarioOutcome): CompletedSessionReviewHighlight[] {
  const highlights: CompletedSessionReviewHighlight[] = [];

  const lastReasoning = [...events].reverse().find((event) => event.event_type === "reasoning_snapshot_published");
  if (lastReasoning) {
    const top = stringValue(lastReasoning.payload.top_hypothesis_id);
    const summary = stringValue(lastReasoning.payload.dominant_summary);
    highlights.push({
      highlight_id: `hl_story_${lastReasoning.event_id}`,
      kind: "storyline",
      label: "Latest storyline snapshot",
      detail: [top && `Top hypothesis: ${top}.`, summary].filter(Boolean).join(" ") || "Reasoning snapshot available in the log stream.",
    });
  }

  const supportEvents = events.filter((event) => event.event_type === "support_mode_changed");
  const lastReasoningEvent = [...events].reverse().find((event) => event.event_type === "reasoning_snapshot_published");
  if (supportEvents.length > 0) {
    const last = supportEvents[supportEvents.length - 1]!;
    const to = stringValue(last.payload.to_mode);
    const recommended = stringValue(last.payload.recommended_mode);
    const fusionConfidence = numberValue(lastReasoningEvent?.payload.fusion_confidence);
    highlights.push({
      highlight_id: `hl_asst_${last.event_id}`,
      kind: "assistance",
      label: "Assistance trajectory",
      detail:
        supportEvents.length === 1
          ? `One assistance transition recorded${to ? ` (now ${to})` : ""}.${recommended ? ` Risk recommendation ended at ${recommended}.` : ""}${fusionConfidence !== undefined ? ` Fusion confidence ${fusionConfidence.toFixed(1)}/100.` : ""}`
          : `${supportEvents.length} assistance transitions; final mode${to ? `: ${to}` : " recorded"}.${recommended ? ` Risk recommendation ended at ${recommended}.` : ""}${fusionConfidence !== undefined ? ` Fusion confidence ${fusionConfidence.toFixed(1)}/100.` : ""}`,
    });
  } else if (lastReasoningEvent) {
    const recommended = stringValue(lastReasoningEvent.payload.recommended_assistance_mode);
    const fusionConfidence = numberValue(lastReasoningEvent.payload.fusion_confidence);
    if (recommended) {
      highlights.push({
        highlight_id: `hl_asst_${lastReasoningEvent.event_id}`,
        kind: "assistance",
        label: "Assistance trajectory",
        detail: `No mode transition was required; the latest risk recommendation remained ${recommended}.${fusionConfidence !== undefined ? ` Fusion confidence ${fusionConfidence.toFixed(1)}/100.` : ""}`,
      });
    }
  }

  const latestMonitoring = [...events].reverse().find((event) => event.event_type === "human_monitoring_snapshot_recorded");
  if (latestMonitoring) {
    const mode = stringValue(latestMonitoring.payload.mode) ?? "unavailable";
    const freshness = stringValue(latestMonitoring.payload.freshness_status) ?? "no_observations";
    const connected = numberValue(latestMonitoring.payload.connected_source_count) ?? 0;
    const contributing = numberValue(latestMonitoring.payload.contributing_source_count) ?? 0;
    const status = stringValue(latestMonitoring.payload.status_summary) ?? "";
    const liveContributors = liveMonitoringContributorLabels(latestMonitoring.payload.sources);
    const interactionActiveEver = events
      .filter((event) => event.event_type === "human_monitoring_snapshot_recorded")
      .some((event) => liveMonitoringContributorLabels(event.payload.sources).length > 0);
    highlights.push({
      highlight_id: `hl_monitoring_${latestMonitoring.event_id}`,
      kind: "human_monitoring",
      label: "Human-monitoring posture",
      detail: `Mode ${mode}; freshness ${freshness}; connected sources ${connected}; contributing sources ${contributing}.${interactionActiveEver ? " Live monitoring sources contributed evidence during the run." : ""}${liveContributors.length > 0 ? ` ${liveContributors.join(" and ")} remained current in the latest snapshot.` : ""} ${status}`.trim(),
    });
  }

  const prevents = events.filter(
    (event) => event.event_type === "action_validated" && event.payload.outcome === "hard_prevent" && event.payload.prevented_harm === true,
  );
  const softWarnings = events.filter(
    (event) => event.event_type === "action_validated" && event.payload.outcome === "soft_warning",
  );
  const overrides = events.filter((event) => event.event_type === "supervisor_override_action_applied");
  const demoMarkers = events.filter((event) => event.event_type === "validation_demo_marker_recorded");
  if (prevents.length > 0 || softWarnings.length > 0 || overrides.length > 0) {
    highlights.push({
      highlight_id: "hl_intervention",
      kind: "intervention",
      label: "Interceptor activity",
      detail: `Hard prevents (harm-marked): ${prevents.length}. Soft warnings: ${softWarnings.length}. Supervisor overrides applied: ${overrides.length}. Demo checkpoints completed: ${demoMarkers.length}/3.`,
    });
  }

  const operatorSnapshots = events.filter((event) => event.event_type === "operator_state_snapshot_recorded");
  if (operatorSnapshots.length > 0) {
    let peakWorkload = 0;
    for (const event of operatorSnapshots) {
      const workload = numberValue(event.payload.workload_index);
      if (workload !== undefined && workload > peakWorkload) peakWorkload = workload;
    }
    highlights.push({
      highlight_id: "hl_workload",
      kind: "workload",
      label: "Operator load",
      detail: `Peak workload index observed: ${peakWorkload} (from operator snapshots).`,
    });
  }

  highlights.push({
    highlight_id: "hl_outcome",
    kind: "outcome",
    label: "Run result",
    detail: `${outcome.outcome.toUpperCase()} at t+${outcome.sim_time_sec}s - ${outcome.message}`,
  });

  return highlights;
}

export function buildCompletedSessionReview(params: BuildCompletedSessionReviewParams): CompletedSessionReview {
  const { session_id, session_mode, scenario, outcome, kpi_summary, events } = params;

  const milestones = buildMilestones(events);
  const highlights = buildHighlights(events, outcome);
  const proof_points = buildProofPoints(events, session_mode);
  const keySource = selectKeyEvents(events, milestones, proof_points);
  const key_events: CompletedSessionReviewEvent[] = keySource.map((event, index) => {
    const { title, summary } = summarizeEventForReview(event);
    const tick_id = tickIdFromEvent(event);
    return {
      sequence: index,
      source_event_id: event.event_id,
      sim_time_sec: event.sim_time_sec,
      event_type: event.event_type,
      title,
      summary,
      ...(tick_id ? { tick_id } : {}),
    };
  });

  return {
    schema_version: 1,
    session_id,
    session_mode,
    scenario_id: scenario.scenario_id,
    scenario_version: scenario.version,
    scenario_title: scenario.title,
    terminal_outcome: outcome,
    completion_sim_time_sec: outcome.sim_time_sec,
    kpi_summary,
    key_events,
    milestones,
    highlights,
    proof_points,
  };
}

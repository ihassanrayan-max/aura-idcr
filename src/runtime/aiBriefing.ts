import type {
  AiAfterActionReviewerBriefing,
  AiBriefingEvidenceRef,
  AiBriefingFailureKind,
  AiBriefingGenerationResult,
  AiBriefingKind,
  AiBriefingRequest,
  AiBriefingResponseMap,
  AiBriefingWhySubjectId,
  AiIncidentCommanderBriefing,
  AiWhyAssistantBriefing,
  CompletedSessionReview,
  SessionLogEvent,
  SessionSnapshot,
} from "../contracts/aura";
import { formatSupportModeLabel } from "./supportModePolicy";

export const AI_BRIEFING_SCHEMA_VERSION = 1 as const;

type AiIncidentCommanderRequest = AiBriefingRequest & {
  kind: "incident_commander";
};

type AiAfterActionReviewerRequest = AiBriefingRequest & {
  kind: "after_action_reviewer";
};

type AiWhyAssistantRequest = AiBriefingRequest & {
  kind: "why_assistant";
  subject_id: AiBriefingWhySubjectId;
};

type TypedAiBriefingRequestMap = {
  incident_commander: AiIncidentCommanderRequest;
  after_action_reviewer: AiAfterActionReviewerRequest;
  why_assistant: AiWhyAssistantRequest;
};

type RequestAiBriefingParams<K extends AiBriefingKind> = {
  request: TypedAiBriefingRequestMap[K];
  fallback: AiBriefingResponseMap[K];
};

type ApiPayload = Record<string, unknown>;

function pushUniqueRef(target: AiBriefingEvidenceRef[], ref: AiBriefingEvidenceRef | undefined): void {
  if (!ref || target.some((entry) => entry.ref_id === ref.ref_id && entry.ref_type === ref.ref_type)) {
    return;
  }
  target.push(ref);
}

function trimText(value: unknown): string | undefined {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : undefined;
}

function trimStringList(value: unknown, maxItems: number): string[] {
  return Array.isArray(value)
    ? value
        .filter((entry): entry is string => typeof entry === "string" && entry.trim().length > 0)
        .map((entry) => entry.trim())
        .slice(0, maxItems)
    : [];
}

function formatPhaseLabel(snapshot: SessionSnapshot): string {
  return `${snapshot.current_phase.label} (${snapshot.current_phase.phase_id})`;
}

function formatSignalLabel(signal: string): string {
  return signal.replace(/_/g, " ");
}

function operatorAuthorityNote(snapshot: SessionSnapshot): string {
  if (snapshot.pending_supervisor_override?.request_status === "requested") {
    return "Operator authority is preserved. One blocked action is paused until Review records a bounded supervisor decision.";
  }

  if (snapshot.pending_action_confirmation) {
    return "Operator authority is preserved. The current action only proceeds if the operator explicitly confirms it.";
  }

  if (snapshot.last_validation_result?.outcome === "hard_prevent") {
    return "Operator authority is preserved, but the last requested action remains blocked because the validator marked it as a bounded high-risk move.";
  }

  return "Operator authority is preserved. The AI briefing is advisory and does not change plant state, support mode, or validator outcomes.";
}

function supportAlternativeLabels(activeMode: SessionSnapshot["support_mode"]): string[] {
  const allModes: SessionSnapshot["support_mode"][] = [
    "monitoring_support",
    "guided_support",
    "protected_response",
  ];
  return allModes.filter((mode) => mode !== activeMode).map((mode) => formatSupportModeLabel(mode));
}

function incidentCommanderEvidenceCatalog(snapshot: SessionSnapshot): AiBriefingEvidenceRef[] {
  const refs: AiBriefingEvidenceRef[] = [
    {
      ref_id: snapshot.plant_tick.tick_id,
      ref_type: "tick_id",
      label: `Live tick ${snapshot.plant_tick.tick_id}`,
      detail: `Sim time t+${snapshot.sim_time_sec}s.`,
    },
    {
      ref_id: snapshot.current_phase.phase_id,
      ref_type: "phase_id",
      label: formatPhaseLabel(snapshot),
      detail: snapshot.current_phase.description,
    },
  ];

  if (snapshot.reasoning_snapshot.dominant_hypothesis_id) {
    pushUniqueRef(refs, {
      ref_id: snapshot.reasoning_snapshot.dominant_hypothesis_id,
      ref_type: "hypothesis_id",
      label: snapshot.reasoning_snapshot.ranked_hypotheses[0]?.label ?? snapshot.reasoning_snapshot.dominant_hypothesis_id,
      detail: snapshot.reasoning_snapshot.dominant_summary,
    });
  }

  for (const alarm of snapshot.alarm_set.active_alarms.slice(0, 3)) {
    pushUniqueRef(refs, {
      ref_id: alarm.alarm_id,
      ref_type: "alarm_id",
      label: alarm.title,
      detail: `${alarm.priority} | ${alarm.subsystem_tag}`,
    });
  }

  for (const item of snapshot.first_response_lane.items.slice(0, 3)) {
    pushUniqueRef(refs, {
      ref_id: item.item_id,
      ref_type: "lane_item_id",
      label: item.label,
      detail: item.why,
    });
  }

  for (const factor of snapshot.combined_risk.factor_breakdown.slice(0, 3)) {
    pushUniqueRef(refs, {
      ref_id: factor.factor_id,
      ref_type: "risk_factor_id",
      label: factor.label,
      detail: factor.detail,
    });
  }

  if (snapshot.last_validation_result) {
    pushUniqueRef(refs, {
      ref_id: snapshot.last_validation_result.validation_result_id,
      ref_type: "validation_result_id",
      label: `Validator ${snapshot.last_validation_result.outcome}`,
      detail: snapshot.last_validation_result.explanation,
    });
  }

  return refs;
}

function afterActionEvidenceCatalog(review: CompletedSessionReview): AiBriefingEvidenceRef[] {
  const refs: AiBriefingEvidenceRef[] = [
    {
      ref_id: review.session_id,
      ref_type: "event_id",
      label: `Completed review ${review.session_id}`,
      detail: `${review.scenario_title} | ${review.terminal_outcome.outcome}`,
    },
  ];

  for (const milestone of review.milestones.slice(0, 5)) {
    pushUniqueRef(refs, {
      ref_id: milestone.milestone_id,
      ref_type: "milestone_id",
      label: milestone.label,
      detail: milestone.detail,
    });
  }

  for (const proof of review.proof_points.slice(0, 5)) {
    pushUniqueRef(refs, {
      ref_id: proof.proof_id,
      ref_type: "proof_id",
      label: proof.label,
      detail: proof.detail,
    });
  }

  for (const highlight of review.highlights.slice(0, 4)) {
    pushUniqueRef(refs, {
      ref_id: highlight.highlight_id,
      ref_type: "highlight_id",
      label: highlight.label,
      detail: highlight.detail,
    });
  }

  return refs;
}

function whyEvidenceCatalog(
  snapshot: SessionSnapshot,
  subjectId: AiBriefingWhySubjectId,
): AiBriefingEvidenceRef[] {
  const refs = incidentCommanderEvidenceCatalog(snapshot);

  if (subjectId === "validator_last_result" && snapshot.last_validation_result) {
    return refs.filter(
      (ref) =>
        ref.ref_type === "tick_id" ||
        ref.ref_type === "validation_result_id" ||
        ref.ref_type === "risk_factor_id" ||
        ref.ref_type === "lane_item_id",
    );
  }

  return refs.filter(
    (ref) =>
      ref.ref_type === "tick_id" ||
      ref.ref_type === "phase_id" ||
      ref.ref_type === "hypothesis_id" ||
      ref.ref_type === "risk_factor_id" ||
      ref.ref_type === "lane_item_id",
  );
}

function evidenceSubset(
  catalog: AiBriefingEvidenceRef[],
  desiredIds: string[],
  fallbackCount = 3,
): AiBriefingEvidenceRef[] {
  const selected = desiredIds
    .map((id) => catalog.find((ref) => ref.ref_id === id))
    .filter((ref): ref is AiBriefingEvidenceRef => Boolean(ref));
  if (selected.length > 0) {
    return selected;
  }
  return catalog.slice(0, fallbackCount);
}

function summarizeRecentEvents(events: SessionLogEvent[]): Array<{ event_type: string; summary: string }> {
  return events
    .filter(
      (event) =>
        !["plant_tick_recorded", "human_monitoring_snapshot_recorded", "operator_state_snapshot_recorded"].includes(
          event.event_type,
        ),
    )
    .slice(-5)
    .map((event) => ({
      event_type: event.event_type,
      summary: JSON.stringify(event.payload),
    }));
}

export function buildIncidentCommanderRequest(snapshot: SessionSnapshot): AiIncidentCommanderRequest {
  const evidence_catalog = incidentCommanderEvidenceCatalog(snapshot);

  return {
    kind: "incident_commander",
    anchor: {
      anchor_kind: "live_tick",
      anchor_id: snapshot.plant_tick.tick_id,
      session_id: snapshot.session_id,
      sim_time_sec: snapshot.sim_time_sec,
    },
    schema_version: AI_BRIEFING_SCHEMA_VERSION,
    context: {
      scenario: {
        scenario_id: snapshot.scenario.scenario_id,
        title: snapshot.scenario.title,
      },
      phase: {
        phase_id: snapshot.current_phase.phase_id,
        label: snapshot.current_phase.label,
        description: snapshot.current_phase.description,
      },
      live_state: {
        support_mode: snapshot.support_mode,
        support_mode_label: formatSupportModeLabel(snapshot.support_mode),
        combined_risk_band: snapshot.combined_risk.combined_risk_band,
        combined_risk_score: Number(snapshot.combined_risk.combined_risk_score.toFixed(1)),
        recommended_assistance_mode: snapshot.combined_risk.recommended_assistance_mode,
        recommended_assistance_reason: snapshot.combined_risk.recommended_assistance_reason,
        watch_now_summary: snapshot.support_refinement.watch_now_summary,
        current_support_focus: snapshot.support_refinement.current_support_focus,
        dominant_summary: snapshot.reasoning_snapshot.dominant_summary,
        dominant_hypothesis_id: snapshot.reasoning_snapshot.dominant_hypothesis_id ?? "monitoring_only",
        active_alarm_titles: snapshot.alarm_set.active_alarms.slice(0, 4).map((alarm) => alarm.title),
        pinned_alarm_ids: snapshot.support_policy.critical_visibility.pinned_alarm_ids,
        lane_items: snapshot.first_response_lane.items.slice(0, 4).map((item) => ({
          item_id: item.item_id,
          label: item.label,
          why: item.why,
          recommended_action_id: item.recommended_action_id ?? null,
        })),
        top_risk_factors: snapshot.combined_risk.factor_breakdown.slice(0, 3).map((factor) => ({
          factor_id: factor.factor_id,
          label: factor.label,
          detail: factor.detail,
          contribution: Number(factor.contribution.toFixed(1)),
        })),
        last_validation_result: snapshot.last_validation_result
          ? {
              validation_result_id: snapshot.last_validation_result.validation_result_id,
              outcome: snapshot.last_validation_result.outcome,
              explanation: snapshot.last_validation_result.explanation,
              risk_context: snapshot.last_validation_result.risk_context,
              recommended_safe_alternative: snapshot.last_validation_result.recommended_safe_alternative ?? null,
            }
          : null,
        pending_supervisor_override: snapshot.pending_supervisor_override
          ? {
              request_status: snapshot.pending_supervisor_override.request_status,
              action_id: snapshot.pending_supervisor_override.action_request.action_id,
            }
          : null,
        operator_authority_note: operatorAuthorityNote(snapshot),
      },
      recent_events: summarizeRecentEvents(snapshot.events),
      evidence_catalog,
    },
  };
}

export function buildAfterActionReviewerRequest(
  review: CompletedSessionReview,
): AiAfterActionReviewerRequest {
  const evidence_catalog = afterActionEvidenceCatalog(review);

  return {
    kind: "after_action_reviewer",
    anchor: {
      anchor_kind: "completed_review",
      anchor_id: review.session_id,
      session_id: review.session_id,
      sim_time_sec: review.completion_sim_time_sec,
    },
    schema_version: AI_BRIEFING_SCHEMA_VERSION,
    context: {
      scenario: {
        scenario_id: review.scenario_id,
        scenario_title: review.scenario_title,
      },
      run: {
        session_id: review.session_id,
        session_mode: review.session_mode,
        terminal_outcome: review.terminal_outcome,
        completion_sim_time_sec: review.completion_sim_time_sec,
      },
      kpi_summary: review.kpi_summary.metrics
        .filter((metric) => metric.audience === "demo_facing")
        .map((metric) => ({
          kpi_id: metric.kpi_id,
          label: metric.label,
          value: metric.value,
          unit: metric.unit,
          value_status: metric.value_status,
        })),
      milestones: review.milestones.map((milestone) => ({
        milestone_id: milestone.milestone_id,
        kind: milestone.kind,
        label: milestone.label,
        detail: milestone.detail,
      })),
      highlights: review.highlights.map((highlight) => ({
        highlight_id: highlight.highlight_id,
        kind: highlight.kind,
        label: highlight.label,
        detail: highlight.detail,
      })),
      proof_points: review.proof_points.map((proof) => ({
        proof_id: proof.proof_id,
        kind: proof.kind,
        label: proof.label,
        detail: proof.detail,
      })),
      key_events: review.key_events.slice(0, 10).map((event) => ({
        source_event_id: event.source_event_id,
        event_type: event.event_type,
        title: event.title,
        summary: event.summary,
      })),
      evidence_catalog,
    },
  };
}

export function buildWhyAssistantRequest(
  snapshot: SessionSnapshot,
  subject_id: AiBriefingWhySubjectId,
): AiWhyAssistantRequest {
  const evidence_catalog = whyEvidenceCatalog(snapshot, subject_id);

  return {
    kind: "why_assistant",
    anchor: {
      anchor_kind: "live_tick",
      anchor_id: snapshot.plant_tick.tick_id,
      session_id: snapshot.session_id,
      sim_time_sec: snapshot.sim_time_sec,
    },
    subject_id,
    schema_version: AI_BRIEFING_SCHEMA_VERSION,
    context: {
      support_mode: snapshot.support_mode,
      support_mode_label: formatSupportModeLabel(snapshot.support_mode),
      recommended_assistance_mode: snapshot.combined_risk.recommended_assistance_mode,
      recommended_assistance_reason: snapshot.combined_risk.recommended_assistance_reason,
      why_risk_is_current: snapshot.combined_risk.why_risk_is_current,
      what_changed: snapshot.combined_risk.what_changed,
      support_mode_reason: snapshot.support_policy.current_mode_reason,
      transition_reason: snapshot.support_policy.transition_reason,
      support_refinement_summary: snapshot.support_refinement.summary_explanation,
      top_risk_factors: snapshot.combined_risk.factor_breakdown.slice(0, 3).map((factor) => ({
        factor_id: factor.factor_id,
        label: factor.label,
        detail: factor.detail,
      })),
      last_validation_result: snapshot.last_validation_result
        ? {
            validation_result_id: snapshot.last_validation_result.validation_result_id,
            outcome: snapshot.last_validation_result.outcome,
            reason_code: snapshot.last_validation_result.reason_code,
            explanation: snapshot.last_validation_result.explanation,
            risk_context: snapshot.last_validation_result.risk_context,
            confidence_note: snapshot.last_validation_result.confidence_note,
            recommended_safe_alternative: snapshot.last_validation_result.recommended_safe_alternative ?? null,
            override_allowed: snapshot.last_validation_result.override_allowed,
          }
        : null,
      evidence_catalog,
    },
  };
}

export function buildIncidentCommanderFallback(snapshot: SessionSnapshot): AiIncidentCommanderBriefing {
  const dominantHypothesis = snapshot.reasoning_snapshot.ranked_hypotheses[0];
  const evidence_catalog = incidentCommanderEvidenceCatalog(snapshot);
  const activeAlarmTitles = snapshot.alarm_set.active_alarms.slice(0, 2).map((alarm) => alarm.title);
  const laneItems = snapshot.first_response_lane.items.slice(0, 3);
  const priority_actions = [
    snapshot.pending_action_confirmation
      ? "Resolve the held soft-warning action before adding another manual move."
      : undefined,
    snapshot.pending_supervisor_override?.request_status === "requested"
      ? "Keep the blocked action on hold and record the bounded supervisor decision in Review."
      : undefined,
    ...laneItems.map((item) =>
      item.recommended_action_id
        ? `${item.label}: ${item.why}`
        : `${item.label}: keep watching because ${item.why.toLowerCase()}`,
    ),
    snapshot.last_validation_result?.recommended_safe_alternative
      ? `If manual intervention is still needed, prefer ${snapshot.last_validation_result.recommended_safe_alternative}.`
      : undefined,
  ]
    .filter((entry): entry is string => Boolean(entry))
    .slice(0, 4);

  const watchouts = [
    ...(snapshot.reasoning_snapshot.ranked_hypotheses[0]?.watch_items.map((item) => formatSignalLabel(item)) ?? []),
    ...activeAlarmTitles,
    snapshot.support_refinement.watch_now_summary,
    snapshot.last_validation_result?.risk_context,
  ]
    .filter((entry): entry is string => Boolean(entry))
    .slice(0, 4);

  return {
    headline: dominantHypothesis
      ? `${dominantHypothesis.label} remains the lead picture.`
      : `Monitor ${snapshot.current_phase.label} closely.`,
    situation_now: [
      snapshot.reasoning_snapshot.dominant_summary,
      activeAlarmTitles.length > 0 ? `Active alarm pressure is led by ${activeAlarmTitles.join(" and ")}.` : "",
      `Risk is ${snapshot.combined_risk.combined_risk_band} at ${snapshot.combined_risk.combined_risk_score.toFixed(1)}/100.`,
    ]
      .filter(Boolean)
      .join(" "),
    command_intent:
      priority_actions[0] ??
      `Stay with ${snapshot.support_refinement.current_support_focus.toLowerCase()} while ${snapshot.support_refinement.watch_now_summary.toLowerCase()}.`,
    priority_actions:
      priority_actions.length > 0
        ? priority_actions
        : ["No bounded action is being pushed right now. Keep critical variables and pinned alarms in view."],
    watchouts:
      watchouts.length > 0
        ? watchouts
        : ["No new watch items are dominant beyond the currently pinned alarms and critical variables."],
    confidence_note:
      snapshot.support_refinement.degraded_confidence_caution ||
      snapshot.combined_risk.confidence_caveat ||
      "Grounded directly in the live deterministic snapshot.",
    operator_authority_note: operatorAuthorityNote(snapshot),
    review_handoff_needed: snapshot.pending_supervisor_override?.request_status === "requested",
    evidence_refs: evidenceSubset(
      evidence_catalog,
      [
        snapshot.plant_tick.tick_id,
        snapshot.reasoning_snapshot.dominant_hypothesis_id ?? "",
        snapshot.alarm_set.active_alarms[0]?.alarm_id ?? "",
        snapshot.first_response_lane.items[0]?.item_id ?? "",
      ],
      4,
    ),
  };
}

export function buildAfterActionReviewerFallback(review: CompletedSessionReview): AiAfterActionReviewerBriefing {
  const evidence_catalog = afterActionEvidenceCatalog(review);
  const turningPointMilestones = review.milestones.filter((milestone) =>
    ["phase_entry", "diagnosis", "support_escalation", "validator_intervention", "terminal_outcome"].includes(
      milestone.kind,
    ),
  );
  const adaptationObservations = [
    ...review.proof_points
      .filter((proof) => proof.kind === "human_aware_adaptation" || proof.kind === "support_transition")
      .map((proof) => `${proof.label}: ${proof.detail}`),
    ...review.highlights
      .filter((highlight) => highlight.kind === "assistance" || highlight.kind === "human_monitoring")
      .map((highlight) => `${highlight.label}: ${highlight.detail}`),
  ].slice(0, 4);
  const validatorObservations = [
    ...review.proof_points
      .filter((proof) => proof.kind === "validator_reason")
      .map((proof) => `${proof.label}: ${proof.detail}`),
    ...review.highlights
      .filter((highlight) => highlight.kind === "intervention")
      .map((highlight) => `${highlight.label}: ${highlight.detail}`),
  ].slice(0, 3);
  const workloadProof = review.proof_points.find((proof) => proof.kind === "human_indicator_shift");

  return {
    overall_assessment: [
      `${review.scenario_title} ended in ${review.terminal_outcome.outcome}.`,
      review.terminal_outcome.message,
      adaptationObservations.length > 0
        ? "Adaptive support added bounded prioritization and traceable support shifts during the run."
        : "The deterministic review did not log a distinct adaptive support change beyond the steady baseline posture.",
    ]
      .filter(Boolean)
      .join(" "),
    turning_points:
      turningPointMilestones.length > 0
        ? turningPointMilestones.map((milestone) => `${milestone.label}: ${milestone.detail}`).slice(0, 4)
        : ["No major turning-point milestone was captured beyond the terminal outcome."],
    adaptation_observations:
      adaptationObservations.length > 0
        ? adaptationObservations
        : ["No additional adaptive support event was logged beyond the deterministic posture already shown in Review."],
    validator_observations:
      validatorObservations.length > 0
        ? validatorObservations
        : ["No validator warning or block materially changed the run path."],
    training_takeaways: [
      turningPointMilestones[0]
        ? `Rehearse from ${turningPointMilestones[0].label.toLowerCase()} onward, because that was the first clear decision-pressure shift.`
        : undefined,
      workloadProof ? `${workloadProof.label}: ${workloadProof.detail}` : undefined,
      review.highlights.find((highlight) => highlight.kind === "assistance")
        ? "Review how the assistance posture changed the operator's search burden and what it likely reduced."
        : "Compare the run against baseline posture to discuss what remained operator-driven without added narrowing.",
      validatorObservations.length > 0
        ? "Use the validator observation as a training pause to reinforce safer alternatives under pressure."
        : "Focus the debrief on storyline recognition and early watch-item tracking rather than validator behavior.",
    ].filter((entry): entry is string => Boolean(entry)),
    confidence_note: "Grounded directly in completed review milestones, highlights, proof points, and KPI evidence.",
    evidence_refs: evidenceSubset(
      evidence_catalog,
      [
        turningPointMilestones[0]?.milestone_id ?? "",
        review.proof_points[0]?.proof_id ?? "",
        review.highlights[0]?.highlight_id ?? "",
      ],
      4,
    ),
  };
}

function postureWhyNotBullets(snapshot: SessionSnapshot): string[] {
  const activeMode = snapshot.support_mode;
  const alternatives = supportAlternativeLabels(activeMode);

  if (activeMode === "monitoring_support") {
    return [
      `${alternatives[0] ?? "Guided Support"} is not active because the current risk picture does not justify stronger narrowing.`,
      `${alternatives[1] ?? "Protected Response"} is not active because the validator is not signaling a bounded block that requires the highest posture.`,
    ];
  }

  if (activeMode === "guided_support") {
    return [
      `${alternatives.find((label) => label.includes("Monitoring")) ?? "Monitoring Support"} is not enough because the current risk drivers still warrant stronger prioritization.`,
      `${alternatives.find((label) => label.includes("Protected")) ?? "Protected Response"} is not active because the current picture still fits bounded guidance rather than a highest-friction posture.`,
    ];
  }

  return [
    `${alternatives.find((label) => label.includes("Monitoring")) ?? "Monitoring Support"} is not enough because the current risk picture needs tighter guardrails.`,
    `${alternatives.find((label) => label.includes("Guided")) ?? "Guided Support"} is not enough because the validator or risk state has already crossed into a protected-response posture.`,
  ];
}

export function buildWhyAssistantFallback(
  snapshot: SessionSnapshot,
  subject_id: AiBriefingWhySubjectId,
): AiWhyAssistantBriefing {
  const evidence_catalog = whyEvidenceCatalog(snapshot, subject_id);

  if (subject_id === "validator_last_result") {
    const validation = snapshot.last_validation_result;
    return {
      question_label: "Why this result?",
      short_answer: validation?.explanation ?? "No validator result is available on this tick.",
      why_bullets: validation
        ? [
            validation.risk_context,
            `Reason code ${validation.reason_code}.`,
            validation.recommended_safe_alternative
              ? `Safer direction: ${validation.recommended_safe_alternative}.`
              : undefined,
          ].filter((entry): entry is string => Boolean(entry))
        : ["No validator result is currently available."],
      why_not_bullets: validation
        ? validation.outcome === "pass"
          ? ["The request stayed inside the current bounded risk envelope, so no extra friction was added."]
          : validation.outcome === "soft_warning"
            ? [
                "This was not a pass because the request added meaningful risk under the current state.",
                "This was not a hard prevent because explicit confirmation keeps the action bounded.",
              ]
            : [
                "This was not a pass because the request crossed a bounded high-risk threshold.",
                validation.override_allowed
                  ? "This was not reduced to a soft warning because the bounded path requires block-plus-review instead."
                  : "This was not reduced to a soft warning because no lower-friction path was safe enough.",
              ]
        : [],
      confidence_note: validation?.confidence_note ?? "Grounded directly in the current validator state.",
      evidence_refs: evidenceSubset(
        evidence_catalog,
        [
          validation?.validation_result_id ?? "",
          snapshot.plant_tick.tick_id,
          snapshot.combined_risk.factor_breakdown[0]?.factor_id ?? "",
        ],
        3,
      ),
    };
  }

  if (subject_id === "support_alternative") {
    return {
      question_label: "Why not the other posture?",
      short_answer: `${formatSupportModeLabel(snapshot.support_mode)} remains the bounded fit for the current risk picture.`,
      why_bullets: [
        snapshot.combined_risk.recommended_assistance_reason,
        snapshot.support_policy.current_mode_reason,
      ].filter((entry): entry is string => Boolean(entry)),
      why_not_bullets: postureWhyNotBullets(snapshot),
      confidence_note:
        snapshot.support_refinement.degraded_confidence_caution ||
        snapshot.combined_risk.confidence_caveat ||
        "Grounded directly in the current support and risk state.",
      evidence_refs: evidenceSubset(
        evidence_catalog,
        [
          snapshot.plant_tick.tick_id,
          snapshot.combined_risk.factor_breakdown[0]?.factor_id ?? "",
          snapshot.first_response_lane.items[0]?.item_id ?? "",
        ],
        3,
      ),
    };
  }

  return {
    question_label: "Why this posture?",
    short_answer: snapshot.combined_risk.recommended_assistance_reason,
    why_bullets: [
      snapshot.combined_risk.why_risk_is_current,
      snapshot.support_policy.current_mode_reason,
      snapshot.support_refinement.summary_explanation,
    ].filter((entry): entry is string => Boolean(entry)),
    why_not_bullets: postureWhyNotBullets(snapshot),
    confidence_note:
      snapshot.support_refinement.degraded_confidence_caution ||
      snapshot.combined_risk.confidence_caveat ||
        "Grounded directly in the current support and risk state.",
    evidence_refs: evidenceSubset(
      evidence_catalog,
      [
        snapshot.plant_tick.tick_id,
        snapshot.reasoning_snapshot.dominant_hypothesis_id ?? "",
        snapshot.combined_risk.factor_breakdown[0]?.factor_id ?? "",
      ],
      3,
    ),
  };
}

function failureKindFromResponse(status: number): AiBriefingFailureKind {
  if (status === 429) {
    return "rate_limited";
  }
  if (status === 503) {
    return "not_configured";
  }
  if (status === 400) {
    return "invalid_request";
  }
  return "upstream_error";
}

function isEvidenceRef(value: unknown): value is AiBriefingEvidenceRef {
  return Boolean(
    value &&
      typeof value === "object" &&
      trimText((value as AiBriefingEvidenceRef).ref_id) &&
      trimText((value as AiBriefingEvidenceRef).ref_type) &&
      trimText((value as AiBriefingEvidenceRef).label),
  );
}

function parseIncidentCommanderBriefing(payload: ApiPayload): AiIncidentCommanderBriefing | undefined {
  if (
    !trimText(payload.headline) ||
    !trimText(payload.situation_now) ||
    !trimText(payload.command_intent) ||
    !trimText(payload.confidence_note) ||
    !trimText(payload.operator_authority_note) ||
    typeof payload.review_handoff_needed !== "boolean"
  ) {
    return undefined;
  }

  const evidence_refs = Array.isArray(payload.evidence_refs)
    ? payload.evidence_refs.filter(isEvidenceRef).slice(0, 5)
    : [];

  return {
    headline: payload.headline as string,
    situation_now: payload.situation_now as string,
    command_intent: payload.command_intent as string,
    priority_actions: trimStringList(payload.priority_actions, 4),
    watchouts: trimStringList(payload.watchouts, 4),
    confidence_note: payload.confidence_note as string,
    operator_authority_note: payload.operator_authority_note as string,
    review_handoff_needed: payload.review_handoff_needed,
    evidence_refs,
  };
}

function parseAfterActionReviewerBriefing(payload: ApiPayload): AiAfterActionReviewerBriefing | undefined {
  if (!trimText(payload.overall_assessment) || !trimText(payload.confidence_note)) {
    return undefined;
  }

  const evidence_refs = Array.isArray(payload.evidence_refs)
    ? payload.evidence_refs.filter(isEvidenceRef).slice(0, 5)
    : [];

  return {
    overall_assessment: payload.overall_assessment as string,
    turning_points: trimStringList(payload.turning_points, 4),
    adaptation_observations: trimStringList(payload.adaptation_observations, 4),
    validator_observations: trimStringList(payload.validator_observations, 4),
    training_takeaways: trimStringList(payload.training_takeaways, 4),
    confidence_note: payload.confidence_note as string,
    evidence_refs,
  };
}

function parseWhyAssistantBriefing(payload: ApiPayload): AiWhyAssistantBriefing | undefined {
  if (!trimText(payload.question_label) || !trimText(payload.short_answer) || !trimText(payload.confidence_note)) {
    return undefined;
  }

  const evidence_refs = Array.isArray(payload.evidence_refs)
    ? payload.evidence_refs.filter(isEvidenceRef).slice(0, 5)
    : [];

  return {
    question_label: payload.question_label as string,
    short_answer: payload.short_answer as string,
    why_bullets: trimStringList(payload.why_bullets, 4),
    why_not_bullets: trimStringList(payload.why_not_bullets, 4),
    confidence_note: payload.confidence_note as string,
    evidence_refs,
  };
}

function parseApiResult<K extends AiBriefingKind>(
  kind: K,
  payload: ApiPayload,
): AiBriefingGenerationResult<K> | undefined {
  if (payload.provider !== "llm") {
    return undefined;
  }

  const responsePayload =
    payload.response && typeof payload.response === "object" ? (payload.response as ApiPayload) : undefined;
  if (!responsePayload) {
    return undefined;
  }

  if (kind === "incident_commander") {
    const response = parseIncidentCommanderBriefing(responsePayload);
    if (!response) {
      return undefined;
    }
    return {
      kind,
      provider: "llm",
      model: trimText(payload.model),
      used_fallback: false,
      response,
    } as AiBriefingGenerationResult<K>;
  }

  if (kind === "after_action_reviewer") {
    const response = parseAfterActionReviewerBriefing(responsePayload);
    if (!response) {
      return undefined;
    }
    return {
      kind,
      provider: "llm",
      model: trimText(payload.model),
      used_fallback: false,
      response,
    } as AiBriefingGenerationResult<K>;
  }

  const response = parseWhyAssistantBriefing(responsePayload);
  if (!response) {
    return undefined;
  }
  return {
    kind,
    provider: "llm",
    model: trimText(payload.model),
    used_fallback: false,
    response,
  } as AiBriefingGenerationResult<K>;
}

function buildFallbackResult<K extends AiBriefingKind>(
  kind: K,
  failure_kind: AiBriefingFailureKind,
  response: AiBriefingResponseMap[K],
): AiBriefingGenerationResult<K> {
  return {
    kind,
    provider: "deterministic_fallback",
    used_fallback: true,
    failure_kind,
    response,
  } as AiBriefingGenerationResult<K>;
}

export function requestAiBriefing(
  params: RequestAiBriefingParams<"incident_commander">,
): Promise<AiBriefingGenerationResult<"incident_commander">>;
export function requestAiBriefing(
  params: RequestAiBriefingParams<"after_action_reviewer">,
): Promise<AiBriefingGenerationResult<"after_action_reviewer">>;
export function requestAiBriefing(
  params: RequestAiBriefingParams<"why_assistant">,
): Promise<AiBriefingGenerationResult<"why_assistant">>;
export async function requestAiBriefing(
  params: RequestAiBriefingParams<AiBriefingKind>,
): Promise<AiBriefingGenerationResult<AiBriefingKind>> {
  if (typeof fetch !== "function") {
    return buildFallbackResult(params.request.kind, "network_error", params.fallback);
  }

  try {
    const response = await fetch("/api/ai-briefing", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(params.request),
    });

    if (!response.ok) {
      return buildFallbackResult(
        params.request.kind,
        failureKindFromResponse(response.status),
        params.fallback,
      );
    }

    const payload = (await response.json()) as ApiPayload;
    const parsed = parseApiResult(params.request.kind, payload);
    if (!parsed) {
      return buildFallbackResult(params.request.kind, "invalid_response", params.fallback);
    }

    return parsed;
  } catch {
    return buildFallbackResult(params.request.kind, "network_error", params.fallback);
  }
}

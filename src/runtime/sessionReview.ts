import type {
  CompletedSessionReview,
  CompletedSessionReviewEvent,
  CompletedSessionReviewHighlight,
  CompletedSessionReviewMilestone,
  KpiSummary,
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

function tickIdFromEvent(event: SessionLogEvent): string | undefined {
  const tick = event.trace_refs.find((ref) => ref.ref_type === "tick_id");
  return tick?.ref_value;
}

function formatValidationOutcome(payload: Record<string, unknown>): string {
  const outcome = payload.outcome;
  if (outcome === "pass") return "pass";
  if (outcome === "soft_warning") return "soft warning (confirmation may be required)";
  if (outcome === "hard_prevent") return "hard prevent";
  return String(outcome ?? "unknown");
}

function summarizeEventForReview(event: SessionLogEvent): { title: string; summary: string } {
  const p = event.payload;
  switch (event.event_type) {
    case "session_started": {
      const mode = typeof p.session_mode === "string" ? p.session_mode : "";
      return {
        title: "Session started",
        summary: mode ? `Mode: ${mode}. Scenario runtime initialized.` : "Scenario runtime initialized.",
      };
    }
    case "phase_changed": {
      const toPhase = typeof p.to_phase_id === "string" ? p.to_phase_id : "";
      const fromPhase = typeof p.from_phase_id === "string" ? p.from_phase_id : "";
      return {
        title: "Phase changed",
        summary: toPhase ? `Now in ${toPhase}${fromPhase ? ` (from ${fromPhase})` : ""}.` : "Scenario phase updated.",
      };
    }
    case "human_monitoring_snapshot_recorded": {
      const mode = typeof p.mode === "string" ? p.mode : "";
      const status = typeof p.status_summary === "string" ? p.status_summary : "";
      const connected = typeof p.connected_source_count === "number" ? p.connected_source_count : 0;
      return {
        title: "Human-monitoring snapshot recorded",
        summary:
          [mode && `Mode: ${mode}.`, `Connected sources: ${connected}.`, status]
            .filter(Boolean)
            .join(" ") || "Human-monitoring foundation snapshot recorded.",
      };
    }
    case "diagnosis_committed": {
      const id = typeof p.diagnosis_id === "string" ? p.diagnosis_id : "";
      const aligned = p.matches_expected_root_cause === true;
      return {
        title: "Diagnosis committed",
        summary: id ? `${id}${aligned ? " (aligned with scenario driver)" : ""}.` : "Dominant hypothesis committed to the log.",
      };
    }
    case "support_mode_changed": {
      const from = typeof p.from_mode === "string" ? p.from_mode : "";
      const to = typeof p.to_mode === "string" ? p.to_mode : "";
      const reason = typeof p.trigger_reason === "string" ? p.trigger_reason : "";
      return {
        title: "Assistance mode changed",
        summary: [from && to ? `${from} -> ${to}` : to || from || "Support mode updated", reason && `- ${reason}`]
          .filter(Boolean)
          .join(" "),
      };
    }
    case "action_requested": {
      const actionId = typeof p.action_id === "string" ? p.action_id : "";
      const region = typeof p.ui_region === "string" ? p.ui_region : "";
      return {
        title: "Operator action requested",
        summary: [actionId && `Action: ${actionId}`, region && `from ${region}`].filter(Boolean).join(" · ") || "Operator request logged.",
      };
    }
    case "action_validated": {
      const actionId = typeof p.action_id === "string" ? p.action_id : "";
      const outcome = formatValidationOutcome(p);
      const prevented = p.prevented_harm === true ? " Prevented-harm signal." : "";
      return {
        title: "Action validated",
        summary: `${actionId ? `${actionId}: ` : ""}${outcome}.${prevented}`.trim(),
      };
    }
    case "action_confirmation_recorded": {
      return {
        title: "Soft-warning confirmation recorded",
        summary: "Operator confirmed proceeding past a soft warning.",
      };
    }
    case "supervisor_override_requested": {
      return {
        title: "Supervisor override requested",
        summary: "Operator requested bounded demo/research supervisor review for one blocked action.",
      };
    }
    case "supervisor_override_decided": {
      const decision = typeof p.decision === "string" ? p.decision : "";
      return {
        title: "Supervisor override decided",
        summary: decision ? `Supervisor decision: ${decision}.` : "Supervisor review decision recorded.",
      };
    }
    case "supervisor_override_action_applied": {
      return {
        title: "Supervisor override applied",
        summary: "One blocked action was released through the bounded demo/research supervisor path.",
      };
    }
    case "validation_demo_marker_recorded": {
      const marker_kind = typeof p.marker_kind === "string" ? p.marker_kind : "";
      return {
        title: "Validator demo checkpoint recorded",
        summary: marker_kind ? `Checkpoint: ${marker_kind}.` : "A validator demo checkpoint was recorded.",
      };
    }
    case "operator_action_applied": {
      const actionId = typeof p.action_id === "string" ? p.action_id : "";
      const correctness = typeof p.correctness_label === "string" ? p.correctness_label : "";
      const overrideApplied = p.override_applied === true ? " · override applied" : "";
      return {
        title: "Operator action applied to plant",
        summary:
          ([actionId && `Action: ${actionId}`, correctness && `label: ${correctness}`].filter(Boolean).join(" · ") || "Action applied.") +
          overrideApplied,
      };
    }
    case "scenario_outcome_recorded": {
      const o = typeof p.outcome === "string" ? p.outcome : "";
      const msg = typeof p.failure_reason === "string" ? p.failure_reason : "";
      return {
        title: "Scenario outcome recorded",
        summary: o ? `${o}.${msg ? ` ${msg}` : ""}` : "Terminal outcome written to the log.",
      };
    }
    case "session_ended": {
      const final = typeof p.final_outcome === "string" ? p.final_outcome : "";
      return {
        title: "Session ended",
        summary: final ? `Final outcome: ${final}.` : "Session closed for evaluation.",
      };
    }
    case "kpi_summary_generated": {
      const completeness = typeof p.completeness === "string" ? p.completeness : "";
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

function selectKeyEvents(events: SessionLogEvent[]): SessionLogEvent[] {
  const keyStream = events.filter((e) => KEY_EVENT_TYPES.has(e.event_type));
  const terminal = keyStream.filter((e) => TERMINAL_KEY_TYPES.has(e.event_type));
  const nonTerminal = keyStream.filter((e) => !TERMINAL_KEY_TYPES.has(e.event_type));
  const budget = Math.max(0, MAX_KEY_EVENTS - terminal.length);
  const head = nonTerminal.slice(0, budget);
  return [...head, ...terminal];
}

function buildMilestones(events: SessionLogEvent[]): CompletedSessionReviewMilestone[] {
  const milestones: CompletedSessionReviewMilestone[] = [];

  const started = events.find((e) => e.event_type === "session_started");
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

  const firstPhase = events.find((e) => e.event_type === "phase_changed");
  if (firstPhase) {
    const p = firstPhase.payload;
    const to = typeof p.to_phase_id === "string" ? p.to_phase_id : "";
    milestones.push({
      milestone_id: `ms_${firstPhase.event_id}`,
      kind: "phase_entry",
      sim_time_sec: firstPhase.sim_time_sec,
      label: "First phase transition",
      detail: to ? `Entered ${to}.` : "Scenario phase changed.",
      source_event_id: firstPhase.event_id,
    });
  }

  const diagnosis = events.find((e) => e.event_type === "diagnosis_committed");
  if (diagnosis) {
    const p = diagnosis.payload;
    const id = typeof p.diagnosis_id === "string" ? p.diagnosis_id : "";
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
    (e) => e.event_type === "support_mode_changed" && typeof e.payload.to_mode === "string" && e.payload.to_mode === "protected_response",
  );
  const anySupport = events.find((e) => e.event_type === "support_mode_changed");
  const supportMilestone = escalation ?? anySupport;
  if (supportMilestone) {
    const p = supportMilestone.payload;
    const to = typeof p.to_mode === "string" ? p.to_mode : "";
    milestones.push({
      milestone_id: `ms_${supportMilestone.event_id}`,
      kind: "support_escalation",
      sim_time_sec: supportMilestone.sim_time_sec,
      label: escalation ? "Escalated assistance" : "Assistance mode shift",
      detail: to ? `Support mode: ${to}.` : "Assistance mode changed.",
      source_event_id: supportMilestone.event_id,
    });
  }

  const intervention = events.find((e) => {
    if (e.event_type !== "action_validated") return false;
    const o = e.payload.outcome;
    return o === "soft_warning" || o === "hard_prevent";
  });
  if (intervention) {
    const p = intervention.payload;
    const o = formatValidationOutcome(p);
    milestones.push({
      milestone_id: `ms_${intervention.event_id}`,
      kind: "validator_intervention",
      sim_time_sec: intervention.sim_time_sec,
      label: "Validator intervention",
      detail: `Validation result: ${o}.`,
      source_event_id: intervention.event_id,
    });
  }

  const overrideApplied = events.find((e) => e.event_type === "supervisor_override_action_applied");
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

  const firstApplied = events.find((e) => e.event_type === "operator_action_applied");
  if (firstApplied) {
    const p = firstApplied.payload;
    const actionId = typeof p.action_id === "string" ? p.action_id : "";
    milestones.push({
      milestone_id: `ms_${firstApplied.event_id}`,
      kind: "operator_action",
      sim_time_sec: firstApplied.sim_time_sec,
      label: "Plant action applied",
      detail: actionId ? `First applied action: ${actionId}.` : "Operator action reached the plant twin.",
      source_event_id: firstApplied.event_id,
    });
  }

  const outcomeEv = events.find((e) => e.event_type === "scenario_outcome_recorded");
  if (outcomeEv) {
    const p = outcomeEv.payload;
    const o = typeof p.outcome === "string" ? p.outcome : "";
    milestones.push({
      milestone_id: `ms_${outcomeEv.event_id}`,
      kind: "terminal_outcome",
      sim_time_sec: outcomeEv.sim_time_sec,
      label: "Terminal outcome",
      detail: o ? `Recorded outcome: ${o}.` : "Scenario outcome recorded.",
      source_event_id: outcomeEv.event_id,
    });
  }

  return milestones.sort((a, b) => {
    if (a.sim_time_sec !== b.sim_time_sec) return a.sim_time_sec - b.sim_time_sec;
    return a.source_event_id.localeCompare(b.source_event_id);
  });
}

function buildHighlights(events: SessionLogEvent[], outcome: ScenarioOutcome): CompletedSessionReviewHighlight[] {
  const highlights: CompletedSessionReviewHighlight[] = [];

  const lastReasoning = [...events].reverse().find((e) => e.event_type === "reasoning_snapshot_published");
  if (lastReasoning) {
    const p = lastReasoning.payload;
    const top = typeof p.top_hypothesis_id === "string" ? p.top_hypothesis_id : "";
    const summary = typeof p.dominant_summary === "string" ? p.dominant_summary : "";
    highlights.push({
      highlight_id: `hl_story_${lastReasoning.event_id}`,
      kind: "storyline",
      label: "Latest storyline snapshot",
      detail: [top && `Top hypothesis: ${top}.`, summary].filter(Boolean).join(" ") || "Reasoning snapshot available in the log stream.",
    });
  }

  const support = events.filter((e) => e.event_type === "support_mode_changed");
  if (support.length > 0) {
    const last = support[support.length - 1]!;
    const p = last.payload;
    const to = typeof p.to_mode === "string" ? p.to_mode : "";
    highlights.push({
      highlight_id: `hl_asst_${last.event_id}`,
      kind: "assistance",
      label: "Assistance trajectory",
      detail:
        support.length === 1
          ? `One assistance transition recorded${to ? ` (now ${to})` : ""}.`
          : `${support.length} assistance transitions; final mode${to ? `: ${to}` : " recorded"}.`,
    });
  }

  const latestMonitoring = [...events].reverse().find((e) => e.event_type === "human_monitoring_snapshot_recorded");
  if (latestMonitoring) {
    const p = latestMonitoring.payload;
    const mode = typeof p.mode === "string" ? p.mode : "unavailable";
    const connected = typeof p.connected_source_count === "number" ? p.connected_source_count : 0;
    const status = typeof p.status_summary === "string" ? p.status_summary : "";
    highlights.push({
      highlight_id: `hl_monitoring_${latestMonitoring.event_id}`,
      kind: "human_monitoring",
      label: "Human-monitoring posture",
      detail: `Mode ${mode}; connected sources ${connected}. ${status}`.trim(),
    });
  }

  const prevents = events.filter((e) => e.event_type === "action_validated" && e.payload.outcome === "hard_prevent" && e.payload.prevented_harm === true);
  const soft = events.filter((e) => e.event_type === "action_validated" && e.payload.outcome === "soft_warning");
  const overrides = events.filter((e) => e.event_type === "supervisor_override_action_applied");
  const demoMarkers = events.filter((e) => e.event_type === "validation_demo_marker_recorded");
  if (prevents.length > 0 || soft.length > 0 || overrides.length > 0) {
    highlights.push({
      highlight_id: "hl_intervention",
      kind: "intervention",
      label: "Interceptor activity",
      detail: `Hard prevents (harm-marked): ${prevents.length}. Soft warnings: ${soft.length}. Supervisor overrides applied: ${overrides.length}. Demo checkpoints completed: ${demoMarkers.length}/3.`,
    });
  }

  const opSnaps = events.filter((e) => e.event_type === "operator_state_snapshot_recorded");
  if (opSnaps.length > 0) {
    let peak = 0;
    for (const e of opSnaps) {
      const w = e.payload.workload_index;
      if (typeof w === "number" && w > peak) peak = w;
    }
    highlights.push({
      highlight_id: "hl_workload",
      kind: "workload",
      label: "Operator load",
      detail: `Peak workload index observed: ${peak} (from operator snapshots).`,
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

  const keySource = selectKeyEvents(events);
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
    milestones: buildMilestones(events),
    highlights: buildHighlights(events, outcome),
  };
}

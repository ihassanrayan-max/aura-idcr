import type {
  ActionRequest,
  ActionValidationResult,
  PendingActionConfirmation,
  PendingSupervisorOverride,
  SupportMode,
  SupportPolicySnapshot,
  SupportRefinementSnapshot,
} from "../contracts/aura";
import { buildPresentationPolicy, orderPresentedLaneItems } from "./presentationPolicy";

function makeSupportPolicy(): SupportPolicySnapshot {
  return {
    current_mode_reason: "Mode is active because bounded risk cues require it.",
    transition_reason: "No support-mode change this tick.",
    mode_change_summary: "Support mode remained stable.",
    support_behavior_changes: ["Tighten emphasis onto the strongest current items."],
    degraded_confidence_effect: "Degraded confidence keeps narrowing explicit.",
    critical_visibility: {
      critical_variable_ids: ["vessel_water_level_m"],
      always_visible_alarm_ids: ["ALM_RPV_LEVEL_LOW"],
      pinned_alarm_ids: ["ALM_RPV_LEVEL_LOW"],
      summary: "Critical visibility guardrails are active: level and priority alarms stay pinned.",
    },
  };
}

function makeSupportRefinement(): SupportRefinementSnapshot {
  return {
    current_support_focus: "Track bounded recovery and watch for consequence drift.",
    emphasized_lane_item_ids: ["fw_action_recover"],
    summary_explanation: "Bounded recovery is emphasized because combined risk remains guarded.",
    operator_context_note: "Workload remains controlled in this deterministic slice.",
    degraded_confidence_caution: "Degraded confidence remains bounded and explicit.",
    watch_now_summary: "Watch vessel level and pressure after correction.",
    wording_style: "explicit",
  };
}

function makeValidationResult(outcome: ActionValidationResult["outcome"]): ActionValidationResult {
  return {
    validation_result_id: "val_0001",
    action_request_id: "actreq_0001",
    sim_time_sec: 20,
    outcome,
    requires_confirmation: outcome === "soft_warning",
    override_allowed: false,
    reason_code: "test_reason",
    explanation: "Deterministic validation explanation.",
    risk_context: "Deterministic validation risk context.",
    confidence_note: "Deterministic confidence note.",
    affected_variable_ids: ["feedwater_flow_pct"],
    prevented_harm: outcome === "hard_prevent",
    nuisance_flag: false,
    recommended_safe_alternative: "Stay near the bounded target.",
  };
}

function makePendingConfirmation(): PendingActionConfirmation {
  const action_request: ActionRequest = {
    action_request_id: "actreq_0002",
    session_id: "session_001",
    scenario_id: "scn_alarm_cascade_root_cause",
    sim_time_sec: 25,
    actor_role: "operator",
    action_id: "act_adjust_feedwater",
    target_subsystem: "feedwater_flow_pct",
    requested_value: 70,
    ui_region: "plant_mimic",
    reason_note: "Pending confirmation fixture",
  };

  return {
    action_request,
    validation_result: makeValidationResult("soft_warning"),
  };
}

function makePendingSupervisorOverride(): PendingSupervisorOverride {
  const pending = makePendingConfirmation();
  return {
    action_request: {
      ...pending.action_request,
      action_request_id: "actreq_0003",
      requested_value: 70,
    },
    validation_result: {
      ...makeValidationResult("hard_prevent"),
      override_allowed: true,
      reason_code: "reduced_feedwater_during_escalation",
    },
    request_status: "requested",
    blocked_at_sim_time_sec: 25,
    requested_at_sim_time_sec: 25,
    request_note: "Bounded demo request",
    demo_research_only: true,
  };
}

function buildPolicy(mode: SupportMode, overrides?: Partial<Parameters<typeof buildPresentationPolicy>[0]>) {
  return buildPresentationPolicy({
    session_mode: "adaptive",
    support_mode: mode,
    support_policy: makeSupportPolicy(),
    support_refinement: makeSupportRefinement(),
    ...overrides,
  });
}

describe("buildPresentationPolicy", () => {
  it("keeps pass results quiet in monitoring support", () => {
    const policy = buildPolicy("monitoring_support", {
      last_validation_result: makeValidationResult("pass"),
    });

    expect(policy.validation_status_label).toBe("Validation ready");
    expect(policy.validator_should_surface).toBe(false);
    expect(policy.procedure_item_order).toBe("original");
    expect(policy.support_section_order.slice(0, 2)).toEqual(["mode", "effect"]);
  });

  it("elevates pending soft-warning confirmation in guided support", () => {
    const policy = buildPolicy("guided_support", {
      pending_action_confirmation: makePendingConfirmation(),
    });

    expect(policy.validation_status_label).toBe("Validation pending confirmation");
    expect(policy.validator_priority).toBe("priority");
    expect(policy.validator_should_surface).toBe(true);
    expect(policy.pending_confirmation_intro).toMatch(/Guided Support is asking/i);
    expect(policy.procedure_item_order).toBe("emphasized_first");
  });

  it("makes hard prevents most prominent in protected response", () => {
    const policy = buildPolicy("protected_response", {
      last_validation_result: makeValidationResult("hard_prevent"),
    });

    expect(policy.validation_status_label).toBe("Protected validation active");
    expect(policy.status_tone).toBe("alert");
    expect(policy.validator_priority).toBe("critical");
    expect(policy.support_section_order.slice(0, 3)).toEqual(["mode", "guardrails", "watch"]);
  });

  it("surfaces pending supervisor review as the top validator state", () => {
    const policy = buildPolicy("protected_response", {
      last_validation_result: {
        ...makeValidationResult("hard_prevent"),
        override_allowed: true,
      },
      pending_supervisor_override: makePendingSupervisorOverride(),
    });

    expect(policy.validation_status_label).toBe("Supervisor override review pending");
    expect(policy.validator_should_surface).toBe(true);
    expect(policy.validator_priority).toBe("critical");
    expect(policy.supervisor_override_summary).toMatch(/waiting for a supervisor decision/i);
    expect(policy.validator_mode_summary).toMatch(/review is pending/i);
  });
});

describe("orderPresentedLaneItems", () => {
  it("moves emphasized and higher-urgency items forward when narrowing is active", () => {
    const ordered = orderPresentedLaneItems(
      [
        {
          item_id: "watch_standard",
          label: "Watch",
          item_kind: "watch",
          why: "Why",
          completion_hint: "Hint",
          source_alarm_ids: [],
          source_variable_ids: [],
          presentation_cue: {
            emphasized: false,
            urgency_level: "standard",
            why_this_matters_now: "Why now",
            wording_style: "explicit",
          },
        },
        {
          item_id: "action_priority",
          label: "Action",
          item_kind: "action",
          why: "Why",
          completion_hint: "Hint",
          source_alarm_ids: [],
          source_variable_ids: [],
          presentation_cue: {
            emphasized: true,
            urgency_level: "priority",
            why_this_matters_now: "Why now",
            wording_style: "explicit",
          },
        },
      ],
      "emphasized_first",
    );

    expect(ordered.map((item) => item.item_id)).toEqual(["action_priority", "watch_standard"]);
  });
});

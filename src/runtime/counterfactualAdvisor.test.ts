import { afterEach, describe, expect, it, vi } from "vitest";
import type { CounterfactualBranchResult, SessionSnapshot } from "../contracts/aura";
import {
  buildDeterministicCounterfactualNarrative,
  recommendedBranchFromDeterministicScore,
  summarizeCounterfactualAdvisor,
} from "./counterfactualAdvisor";

function makeSnapshot(): SessionSnapshot {
  return {
    session_id: "session_001_r1",
    session_mode: "adaptive",
    support_mode: "guided_support",
    scenario: {
      scenario_id: "scn_alarm_cascade_root_cause",
      version: "1.0.0",
      title: "Alarm cascade",
      summary: "summary",
      training_goal: "goal",
      initiating_event: "event",
      difficulty: "moderate",
      tags: [],
      expected_duration_sec: 180,
      deterministic_seed: "seed",
      initial_plant_state: {},
      phases: [],
      event_injections: [],
      alarm_hooks: [],
      allowed_operator_actions: [],
      success_condition: { elapsed_time_sec_gte: 10 },
      failure_condition: { elapsed_time_sec_gte: 20 },
      timeout_condition: { elapsed_time_sec_gte: 30 },
    },
    scenario_catalog: [],
    runtime_profile_id: "feedwater_degradation",
    manual_control_schema: {
      title: "Manual controls",
      helper_text: "helper",
      controls: [],
    },
    current_phase: {
      phase_id: "phase_a",
      label: "Phase A",
      description: "desc",
      completion_condition: { elapsed_time_sec_gte: 30 },
      nominal_duration_sec: 30,
    },
    sim_time_sec: 25,
    tick_index: 5,
    plant_tick: {
      tick_id: "tick_0005",
      session_id: "session_001_r1",
      scenario_id: "scn_alarm_cascade_root_cause",
      session_mode: "adaptive",
      sim_time_sec: 25,
      phase_id: "phase_a",
      plant_state: {},
      derived_state: {
        alarm_load_count: 2,
        active_alarm_cluster_count: 1,
      },
      source_event_ids: [],
    },
    alarm_set: {
      alarm_set_id: "alarm_1",
      tick_id: "tick_0005",
      session_id: "session_001_r1",
      scenario_id: "scn_alarm_cascade_root_cause",
      active_alarm_count: 2,
      active_alarm_cluster_count: 1,
      active_alarm_ids: ["ALM_FEEDWATER_FLOW_LOW"],
      active_alarms: [],
      newly_raised_alarm_ids: [],
      newly_cleared_alarm_ids: [],
    },
    alarm_intelligence: {
      visible_alarm_card_count: 1,
      grouped_alarm_count: 1,
      compression_ratio: 2,
      clusters: [],
    },
    reasoning_snapshot: {
      dominant_hypothesis_id: "hyp_feedwater_degradation",
      dominant_summary: "Feedwater degradation is dominant.",
      ranked_hypotheses: [
        {
          hypothesis_id: "hyp_feedwater_degradation",
          label: "Feedwater degradation",
          summary: "summary",
          score: 2.8,
          confidence_band: "high",
          rank: 1,
          evidence: [],
          watch_items: ["feedwater_flow_pct", "vessel_water_level_m"],
        },
      ],
      changed_since_last_tick: false,
      stable_for_ticks: 4,
      expected_root_cause_aligned: true,
    },
    operator_state: {
      workload_index: 61,
      attention_stability_index: 54,
      signal_confidence: 72,
      degraded_mode_active: false,
      degraded_mode_reason: "Nominal confidence.",
      observation_window_ticks: 6,
    },
    human_monitoring: {
      snapshot_id: "hm_0005",
      mode: "placeholder_compatibility",
      freshness_status: "current",
      aggregate_confidence: 72,
      degraded_state_active: false,
      degraded_state_reason: "Monitoring posture is current.",
      status_summary: "Bounded placeholder monitoring is available for this test snapshot.",
      latest_observation_sim_time_sec: 25,
      oldest_observation_sim_time_sec: 10,
      window_tick_span: 4,
      window_duration_sec: 15,
      connected_source_count: 1,
      active_source_count: 1,
      current_source_count: 1,
      degraded_source_count: 0,
      stale_source_count: 0,
      contributing_source_count: 1,
      sources: [],
    },
    combined_risk: {
      risk_model_id: "hpsn_lite_v1",
      combined_risk_score: 58,
      combined_risk_band: "guarded",
      plant_urgency_index: 52,
      human_pressure_index: 41,
      fusion_confidence: 73,
      human_influence_scale: 0.42,
      recommended_assistance_mode: "guided_support",
      recommended_assistance_reason: "Elevated alarm burden and moderate operator pressure justify guided support.",
      factor_breakdown: [],
      top_contributing_factors: [],
      confidence_caveat: "Nominal confidence.",
      why_risk_is_current: "Risk is elevated by alarm burden.",
      what_changed: "Pressure is flattening.",
    },
    first_response_lane: {
      lane_id: "lane_1",
      dominant_hypothesis_id: "hyp_feedwater_degradation",
      updated_at_sec: 25,
      prototype_notice: "notice",
      items: [],
    },
    support_refinement: {
      current_support_focus: "bounded recovery",
      emphasized_lane_item_ids: [],
      summary_explanation: "summary",
      operator_context_note: "note",
      degraded_confidence_caution: "",
      watch_now_summary: "Watch vessel level",
      wording_style: "explicit",
    },
    support_policy: {
      current_mode_reason: "reason",
      transition_reason: "reason",
      mode_change_summary: "summary",
      support_behavior_changes: [],
      degraded_confidence_effect: "none",
      critical_visibility: {
        critical_variable_ids: [],
        always_visible_alarm_ids: [],
        pinned_alarm_ids: [],
        summary: "summary",
      },
    },
    alarm_history: [],
    events: [],
    executed_actions: [],
    validation_demo_state: {
      soft_warning_demonstrated: { marker_kind: "soft_warning_demonstrated", demonstrated: false },
      hard_prevent_demonstrated: { marker_kind: "hard_prevent_demonstrated", demonstrated: false },
      supervisor_override_demonstrated: { marker_kind: "supervisor_override_demonstrated", demonstrated: false },
    },
    logging_active: true,
    validation_status_available: true,
  };
}

function makeBranch(overrides: Partial<CounterfactualBranchResult>): CounterfactualBranchResult {
  return {
    branch_id: "guided",
    label: "Guided recovery path",
    description: "desc",
    projected_risk_trend: "improving",
    final_combined_risk_score: 32,
    final_combined_risk_band: "low",
    expected_alarm_ids_added: [],
    expected_alarm_ids_cleared: ["ALM_FEEDWATER_FLOW_LOW"],
    stabilization_likelihood: "high",
    validator_risk_exposure: "pass",
    watch_signals: ["feedwater_flow_pct"],
    decision_score: 90,
    one_line_summary: "Outcome success; risk improving; validator pass; no near-term bad threshold reached.",
    ...overrides,
  };
}

describe("counterfactual advisor", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("prefers the highest-scoring deterministic branch", () => {
    const branches = [
      makeBranch({ branch_id: "hold", label: "Hold", decision_score: 12 }),
      makeBranch({ branch_id: "guided", label: "Guided", decision_score: 81 }),
      makeBranch({ branch_id: "operator_requested", label: "Manual", decision_score: 37 }),
    ];

    expect(recommendedBranchFromDeterministicScore(branches)?.branch_id).toBe("guided");
  });

  it("builds a deterministic fallback narrative from branch metrics", () => {
    const snapshot = makeSnapshot();
    const branches = [
      makeBranch({ branch_id: "guided", label: "Guided", decision_score: 75 }),
      makeBranch({
        branch_id: "operator_requested",
        label: "Manual",
        decision_score: 18,
        projected_risk_trend: "worsening",
        validator_risk_exposure: "soft_warning",
      }),
      makeBranch({
        branch_id: "hold",
        label: "Hold",
        decision_score: -5,
        projected_risk_trend: "worsening",
        final_combined_risk_band: "elevated",
      }),
    ];

    const narrative = buildDeterministicCounterfactualNarrative({ snapshot, branches });

    expect(narrative.provider).toBe("deterministic_fallback");
    expect(narrative.recommended_branch_id).toBe("guided");
    expect(narrative.why_not).toHaveLength(2);
  });

  it("falls back to the deterministic narrative when structured API output is malformed", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          provider: "llm",
          recommended_branch_id: "guided",
          rationale: 42,
        }),
      }),
    );

    const narrative = await summarizeCounterfactualAdvisor({
      snapshot: makeSnapshot(),
      branches: [
        makeBranch({ branch_id: "guided", label: "Guided", decision_score: 70 }),
        makeBranch({ branch_id: "operator_requested", label: "Manual", decision_score: 15 }),
        makeBranch({ branch_id: "hold", label: "Hold", decision_score: 5 }),
      ],
    });

    expect(narrative.provider).toBe("deterministic_fallback");
    expect(narrative.confidence_caveat).toMatch(/fallback brief/i);
  });

  it("falls back to the deterministic narrative when the local advisor API is rate-limited", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: false,
        status: 429,
        json: async () => ({
          error: "Rate limit exceeded",
        }),
      }),
    );

    const narrative = await summarizeCounterfactualAdvisor({
      snapshot: makeSnapshot(),
      branches: [
        makeBranch({ branch_id: "guided", label: "Guided", decision_score: 70 }),
        makeBranch({ branch_id: "operator_requested", label: "Manual", decision_score: 15 }),
        makeBranch({ branch_id: "hold", label: "Hold", decision_score: 5 }),
      ],
    });

    expect(narrative.provider).toBe("deterministic_fallback");
    expect(narrative.confidence_caveat).toMatch(/rate-limited/i);
  });
});

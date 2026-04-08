import { describe, expect, it } from "vitest";
import type { CombinedRiskSnapshot, FirstResponseLane, OperatorStateSnapshot, ReasoningSnapshot } from "../contracts/aura";
import { buildSupportRefinement } from "./supportRefinement";

function buildLane(): FirstResponseLane {
  return {
    lane_id: "lane_test",
    dominant_hypothesis_id: "hyp_feedwater_degradation",
    updated_at_sec: 20,
    prototype_notice: "Prototype guidance only.",
    items: [
      {
        item_id: "fw_check_mismatch",
        label: "Confirm feedwater is lagging steam demand",
        item_kind: "check",
        why: "Verify the mismatch first.",
        completion_hint: "Compare level, steam, and feedwater.",
        source_alarm_ids: ["ALM_FEEDWATER_FLOW_LOW"],
        source_variable_ids: ["feedwater_flow_pct", "main_steam_flow_pct"],
      },
      {
        item_id: "fw_action_recover",
        label: "Recover feedwater demand toward 82% rated",
        item_kind: "action",
        why: "Use the bounded recovery path.",
        recommended_action_id: "act_adjust_feedwater",
        recommended_value: 82,
        completion_hint: "Use the bounded correction first.",
        source_alarm_ids: ["ALM_FEEDWATER_FLOW_LOW"],
        source_variable_ids: ["feedwater_flow_pct", "vessel_water_level_m"],
      },
      {
        item_id: "fw_watch_recovery",
        label: "Watch vessel level and pressure after correction",
        item_kind: "watch",
        why: "Confirm whether the response is working.",
        completion_hint: "Track level and pressure together.",
        source_alarm_ids: ["ALM_RPV_LEVEL_LOW"],
        source_variable_ids: ["vessel_water_level_m", "vessel_pressure_mpa"],
      },
    ],
  };
}

function buildCombinedRisk(overrides: Partial<CombinedRiskSnapshot> = {}): CombinedRiskSnapshot {
  return {
    risk_model_id: "hpsn_lite_v1",
    combined_risk_score: 54,
    combined_risk_band: "elevated",
    plant_urgency_index: 60,
    human_pressure_index: 58,
    fusion_confidence: 82,
    human_influence_scale: 1,
    recommended_assistance_mode: "guided_support",
    recommended_assistance_reason:
      "Recommend Guided Support because elevated risk is being driven mainly by plant urgency and human workload pressure.",
    factor_breakdown: [
      {
        factor_id: "plant_urgency",
        label: "Plant urgency",
        raw_index: 60,
        contribution: 20.4,
        detail: "Plant urgency is elevated.",
      },
      {
        factor_id: "human_workload_pressure",
        label: "Human workload pressure",
        raw_index: 72,
        contribution: 10.1,
        detail: "Workload is elevated.",
      },
      {
        factor_id: "storyline_procedure_pressure",
        label: "Storyline/procedure pressure",
        raw_index: 48,
        contribution: 7.7,
        detail: "Reasoning is still settling.",
      },
    ],
    top_contributing_factors: ["Plant urgency", "Human workload pressure", "Storyline/procedure pressure"],
    confidence_caveat: "Signal confidence 82/100 from current runtime and session cues.",
    why_risk_is_current: "Elevated risk is being driven mainly by plant urgency and human workload pressure; the raw assistance recommendation is Guided Support.",
    what_changed: "Risk is steady; plant urgency remains the main driver.",
    ...overrides,
  };
}

describe("buildSupportRefinement", () => {
  it("keeps verification cues ahead when reasoning is unstable and confidence is degraded", () => {
    const reasoning_snapshot: ReasoningSnapshot = {
      dominant_hypothesis_id: "hyp_feedwater_degradation",
      dominant_summary: "Feedwater is the likely driver.",
      changed_since_last_tick: true,
      stable_for_ticks: 1,
      expected_root_cause_aligned: true,
      ranked_hypotheses: [
        {
          hypothesis_id: "hyp_feedwater_degradation",
          label: "Feedwater Degradation",
          summary: "Feedwater-side flow loss is driving the event.",
          score: 1.05,
          confidence_band: "low",
          rank: 1,
          evidence: [],
          watch_items: ["feedwater_flow_pct", "vessel_water_level_m"],
        },
        {
          hypothesis_id: "hyp_heat_sink_stress",
          label: "Heat Sink / Steam Path Stress",
          summary: "Steam-path stress is contributing.",
          score: 0.9,
          confidence_band: "low",
          rank: 2,
          evidence: [],
          watch_items: ["condenser_backpressure_kpa"],
        },
      ],
    };
    const operator_state: OperatorStateSnapshot = {
      workload_index: 64,
      attention_stability_index: 52,
      signal_confidence: 56,
      degraded_mode_active: true,
      degraded_mode_reason: "Confidence reduced: short observation window; first-response picture changed this tick.",
      observation_window_ticks: 2,
    };

    const result = buildSupportRefinement({
      first_response_lane: buildLane(),
      reasoning_snapshot,
      operator_state,
      combined_risk: buildCombinedRisk(),
      support_mode: "guided_support",
    });

    expect(result.support_refinement.wording_style).toBe("explicit");
    expect(result.support_refinement.current_support_focus).toMatch(/Verify|Stabilize/i);
    expect(result.support_refinement.degraded_confidence_caution).toMatch(/Proxy confidence/i);
    expect(result.support_refinement.emphasized_lane_item_ids[0]).toBe("fw_check_mismatch");
    expect(result.first_response_lane.items[0].presentation_cue?.emphasized).toBe(true);
    expect(result.first_response_lane.items[0].presentation_cue?.why_this_matters_now).toMatch(/Reasoning|Proxy confidence/i);
  });

  it("keeps the bounded recovery action prominent when risk is high and the storyline is stable", () => {
    const reasoning_snapshot: ReasoningSnapshot = {
      dominant_hypothesis_id: "hyp_feedwater_degradation",
      dominant_summary: "Feedwater is the likely driver.",
      changed_since_last_tick: false,
      stable_for_ticks: 4,
      expected_root_cause_aligned: true,
      ranked_hypotheses: [
        {
          hypothesis_id: "hyp_feedwater_degradation",
          label: "Feedwater Degradation",
          summary: "Feedwater-side flow loss is driving the event.",
          score: 2.8,
          confidence_band: "high",
          rank: 1,
          evidence: [],
          watch_items: ["vessel_water_level_m", "vessel_pressure_mpa"],
        },
        {
          hypothesis_id: "hyp_heat_sink_stress",
          label: "Heat Sink / Steam Path Stress",
          summary: "Steam-path stress is contributing.",
          score: 0.8,
          confidence_band: "low",
          rank: 2,
          evidence: [],
          watch_items: ["condenser_backpressure_kpa"],
        },
      ],
    };
    const operator_state: OperatorStateSnapshot = {
      workload_index: 76,
      attention_stability_index: 63,
      signal_confidence: 86,
      degraded_mode_active: false,
      degraded_mode_reason: "Nominal confidence from current runtime and session signals.",
      observation_window_ticks: 7,
    };

    const result = buildSupportRefinement({
      first_response_lane: buildLane(),
      reasoning_snapshot,
      operator_state,
      combined_risk: buildCombinedRisk({
        combined_risk_score: 67,
        combined_risk_band: "elevated",
        confidence_caveat: "Signal confidence 86/100 from current runtime and session cues.",
      }),
      support_mode: "protected_response",
    });

    expect(result.support_refinement.wording_style).toBe("explicit");
    expect(result.support_refinement.current_support_focus).toMatch(/bounded recovery/i);
    expect(result.support_refinement.emphasized_lane_item_ids).toContain("fw_action_recover");
    expect(result.support_refinement.emphasized_lane_item_ids).toHaveLength(1);
    expect(
      result.first_response_lane.items.find((item) => item.item_id === "fw_action_recover")?.presentation_cue?.urgency_level,
    ).toMatch(/priority|urgent/);
    expect(result.support_refinement.watch_now_summary.length).toBeGreaterThan(0);
  });
});

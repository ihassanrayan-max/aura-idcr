import type {
  CombinedRiskSnapshot,
  FirstResponseItem,
  FirstResponseLane,
  OperatorStateSnapshot,
  ReasoningSnapshot,
  SupportMode,
  SupportRefinementSnapshot,
  SupportUrgencyLevel,
  SupportWordingStyle,
} from "../contracts/aura";
import { calculateDiagnosisAmbiguityIndex } from "./operatorState";

type BuildSupportRefinementParams = {
  first_response_lane: FirstResponseLane;
  reasoning_snapshot: ReasoningSnapshot;
  operator_state: OperatorStateSnapshot;
  combined_risk: CombinedRiskSnapshot;
  support_mode: SupportMode;
};

type ScoredLaneItem = {
  item: FirstResponseItem;
  score: number;
};

function clampEmphasisCount(
  support_mode: SupportMode,
  wording_style: SupportWordingStyle,
  item_count: number,
): number {
  const target =
    support_mode === "protected_response"
      ? 1
      : support_mode === "guided_support"
        ? 2
        : wording_style === "concise"
          ? 2
          : 3;
  return Math.max(1, Math.min(target, item_count));
}

function formatSignalLabel(signal_id: string): string {
  return signal_id
    .replace(/_/g, " ")
    .replace(/\b\w/g, (char) => char.toUpperCase());
}

function chooseFocus(params: {
  ambiguity_index: number;
  attention_instability_index: number;
  combined_risk: CombinedRiskSnapshot;
  first_response_lane: FirstResponseLane;
  operator_state: OperatorStateSnapshot;
  reasoning_snapshot: ReasoningSnapshot;
}): string {
  const has_action = params.first_response_lane.items.some((item) => item.item_kind === "action");

  if (
    params.operator_state.degraded_mode_active &&
    (params.ambiguity_index >= 45 || params.reasoning_snapshot.changed_since_last_tick)
  ) {
    return "Verify the diagnosis picture before over-committing.";
  }

  if (params.ambiguity_index >= 52 || params.reasoning_snapshot.changed_since_last_tick || params.reasoning_snapshot.stable_for_ticks < 2) {
    return "Stabilize the current storyline before narrowing harder.";
  }

  if (params.combined_risk.combined_risk_score >= 55 && has_action) {
    return "Push the bounded recovery step while the storyline remains stable.";
  }

  if (params.attention_instability_index >= 40 || params.operator_state.workload_index >= 70) {
    return "Keep the next response picture tight and protect attention.";
  }

  return "Track bounded recovery and watch for consequence drift.";
}

function chooseWordingStyle(params: {
  ambiguity_index: number;
  attention_instability_index: number;
  operator_state: OperatorStateSnapshot;
  reasoning_snapshot: ReasoningSnapshot;
  support_mode: SupportMode;
}): SupportWordingStyle {
  if (params.support_mode === "protected_response") {
    return "explicit";
  }

  if (params.support_mode === "guided_support" && params.operator_state.workload_index < 78) {
    return "explicit";
  }

  if (
    params.operator_state.degraded_mode_active ||
    params.ambiguity_index >= 45 ||
    params.reasoning_snapshot.changed_since_last_tick
  ) {
    return "explicit";
  }

  if (params.operator_state.workload_index >= 70 || params.attention_instability_index >= 40) {
    return "concise";
  }

  return "explicit";
}

function scoreLaneItem(params: {
  ambiguity_index: number;
  attention_instability_index: number;
  combined_risk: CombinedRiskSnapshot;
  index: number;
  item: FirstResponseItem;
  operator_state: OperatorStateSnapshot;
  reasoning_snapshot: ReasoningSnapshot;
  support_mode: SupportMode;
}): number {
  let score = 26 - params.index * 2;

  switch (params.item.item_kind) {
    case "check":
      score += params.ambiguity_index >= 45 || params.reasoning_snapshot.changed_since_last_tick || params.reasoning_snapshot.stable_for_ticks < 2 ? 28 : 8;
      score += params.operator_state.degraded_mode_active ? 8 : 0;
      score += params.support_mode === "protected_response" ? 10 : params.support_mode === "guided_support" ? 4 : 0;
      break;
    case "action":
      score += params.ambiguity_index < 45 && !params.reasoning_snapshot.changed_since_last_tick && params.reasoning_snapshot.stable_for_ticks >= 2 ? 24 : 8;
      score += params.combined_risk.combined_risk_score >= 55 ? 10 : 0;
      score += params.operator_state.workload_index >= 70 ? 4 : 0;
      score += params.support_mode === "protected_response" ? 8 : params.support_mode === "guided_support" ? 4 : 0;
      break;
    case "watch":
      score += params.combined_risk.combined_risk_score >= 55 ? 18 : 10;
      score += params.attention_instability_index >= 40 ? 8 : 0;
      score += params.operator_state.degraded_mode_active ? 4 : 0;
      score += params.support_mode === "protected_response" ? 12 : params.support_mode === "guided_support" ? 5 : 0;
      break;
  }

  if (params.item.recommended_action_id) {
    score += 4;
  }

  return score;
}

function urgencyLevel(score: number, support_mode: SupportMode): SupportUrgencyLevel {
  const urgent_threshold = support_mode === "protected_response" ? 52 : support_mode === "guided_support" ? 56 : 60;
  const priority_threshold = support_mode === "protected_response" ? 38 : support_mode === "guided_support" ? 40 : 42;

  if (score >= urgent_threshold) {
    return "urgent";
  }

  if (score >= priority_threshold) {
    return "priority";
  }

  return "standard";
}

function itemWhyNow(params: {
  ambiguity_index: number;
  attention_instability_index: number;
  combined_risk: CombinedRiskSnapshot;
  item: FirstResponseItem;
  operator_state: OperatorStateSnapshot;
  reasoning_snapshot: ReasoningSnapshot;
}): string {
  switch (params.item.item_kind) {
    case "check":
      if (params.reasoning_snapshot.changed_since_last_tick || params.ambiguity_index >= 45) {
        return "Reasoning is still settling, so this verification step stays ahead of stronger narrowing.";
      }
      if (params.operator_state.degraded_mode_active) {
        return "Proxy confidence is reduced, so this check anchors the next move.";
      }
      return "This check keeps the current storyline bounded before acting.";
    case "action":
      if (params.combined_risk.combined_risk_score >= 55 && params.ambiguity_index < 45) {
        return "Combined risk is up and the storyline is stable enough for a bounded correction.";
      }
      if (params.operator_state.workload_index >= 70) {
        return "Workload is elevated, so the lane keeps the next correction direct.";
      }
      return "The current storyline supports this bounded correction path.";
    case "watch":
      if (params.attention_instability_index >= 40) {
        return "Attention stability is softer, so this watch item needs to stay in view now.";
      }
      if (params.combined_risk.combined_risk_score >= 55) {
        return "Combined risk is elevated, so consequence cues need tighter watch.";
      }
      return "This watch item confirms whether the bounded response is working.";
  }
}

function buildAttentionCaution(attention_instability_index: number, wording_style: SupportWordingStyle): string | undefined {
  if (attention_instability_index < 40) {
    return undefined;
  }

  return wording_style === "concise"
    ? "Finish one bounded step before chasing secondary cues."
    : "Attention stability is reduced, so finish one bounded step before scanning secondary cues.";
}

function buildDegradedCaution(
  operator_state: OperatorStateSnapshot,
  wording_style: SupportWordingStyle,
  support_mode: SupportMode,
): string | undefined {
  if (!operator_state.degraded_mode_active) {
    return undefined;
  }

  if (support_mode === "protected_response") {
    return `Proxy confidence is reduced, so keep the response bounded around explicit verification before committing. ${operator_state.degraded_mode_reason}`;
  }

  return wording_style === "concise"
    ? "Proxy confidence reduced: verify key cues before committing."
    : `Proxy confidence is reduced, so verify feedwater, level, and pressure together before committing. ${operator_state.degraded_mode_reason}`;
}

function buildWatchNowSummary(
  emphasized_items: FirstResponseItem[],
  reasoning_snapshot: ReasoningSnapshot,
  support_mode: SupportMode,
): string {
  const emphasized_watch = emphasized_items.find((item) => item.item_kind === "watch");
  if (emphasized_watch) {
    return support_mode === "protected_response" ? `Keep ${emphasized_watch.label.toLowerCase()} in view.` : emphasized_watch.label;
  }

  const watch_signals = reasoning_snapshot.ranked_hypotheses[0]?.watch_items ?? [];
  if (watch_signals.length === 0) {
    return "Continue watching the bounded primary cues.";
  }

  const watch_phrase = watch_signals.slice(0, support_mode === "protected_response" ? 1 : 2).map(formatSignalLabel).join(" and ");
  return support_mode === "protected_response" ? `Keep ${watch_phrase} in view now.` : `Watch ${watch_phrase} next.`;
}

export function buildSupportRefinement(params: BuildSupportRefinementParams): {
  first_response_lane: FirstResponseLane;
  support_refinement: SupportRefinementSnapshot;
} {
  const ambiguity_index = calculateDiagnosisAmbiguityIndex(params.reasoning_snapshot);
  const attention_instability_index = Math.max(0, 100 - params.operator_state.attention_stability_index);
  const wording_style = chooseWordingStyle({
    ambiguity_index,
    attention_instability_index,
    operator_state: params.operator_state,
    reasoning_snapshot: params.reasoning_snapshot,
    support_mode: params.support_mode,
  });
  const current_support_focus = chooseFocus({
    ambiguity_index,
    attention_instability_index,
    combined_risk: params.combined_risk,
    first_response_lane: params.first_response_lane,
    operator_state: params.operator_state,
    reasoning_snapshot: params.reasoning_snapshot,
  });

  const scored_items: ScoredLaneItem[] = params.first_response_lane.items.map((item, index) => ({
    item,
    score: scoreLaneItem({
      ambiguity_index,
      attention_instability_index,
      combined_risk: params.combined_risk,
      index,
      item,
      operator_state: params.operator_state,
      reasoning_snapshot: params.reasoning_snapshot,
      support_mode: params.support_mode,
    }),
  }));

  const emphasized_count = clampEmphasisCount(params.support_mode, wording_style, scored_items.length);
  const emphasized_lane_item_ids = scored_items
    .slice()
    .sort((left, right) => right.score - left.score)
    .slice(0, emphasized_count)
    .map((entry) => entry.item.item_id);
  const emphasized_id_set = new Set(emphasized_lane_item_ids);

  const degraded_confidence_caution = buildDegradedCaution(
    params.operator_state,
    wording_style,
    params.support_mode,
  ) ?? "";
  const attention_sensitive_caution = buildAttentionCaution(attention_instability_index, wording_style);

  const first_response_lane: FirstResponseLane = {
    ...params.first_response_lane,
    items: params.first_response_lane.items.map((item, index) => {
      const score = scored_items[index]?.score ?? 0;
      return {
        ...item,
        presentation_cue: {
          emphasized: emphasized_id_set.has(item.item_id),
          urgency_level: urgencyLevel(score, params.support_mode),
          why_this_matters_now: itemWhyNow({
            ambiguity_index,
            attention_instability_index,
            combined_risk: params.combined_risk,
            item,
            operator_state: params.operator_state,
            reasoning_snapshot: params.reasoning_snapshot,
          }),
          attention_sensitive_caution: emphasized_id_set.has(item.item_id) ? attention_sensitive_caution : undefined,
          degraded_confidence_caveat: emphasized_id_set.has(item.item_id) ? degraded_confidence_caution || undefined : undefined,
          wording_style,
        },
      };
    }),
  };

  const emphasized_items = first_response_lane.items.filter((item) => emphasized_id_set.has(item.item_id));
  const operator_context_note =
    params.operator_state.workload_index >= 70 || attention_instability_index >= 40
      ? `Workload is ${params.operator_state.workload_index}/100 and attention stability is ${params.operator_state.attention_stability_index}/100, so the next response picture stays tighter.`
      : `Workload is ${params.operator_state.workload_index}/100 and attention stability remains ${params.operator_state.attention_stability_index}/100.`;
  const summary_explanation =
    wording_style === "concise"
      ? `${current_support_focus} Combined risk is ${params.combined_risk.combined_risk_band}, and support mode is ${params.support_mode}.`
      : `${current_support_focus} Combined risk is ${params.combined_risk.combined_risk_band}, reasoning ambiguity is ${ambiguity_index}/100, workload is ${params.operator_state.workload_index}/100, and support mode is ${params.support_mode}.`;

  return {
    first_response_lane,
    support_refinement: {
      current_support_focus,
      emphasized_lane_item_ids,
      summary_explanation,
      operator_context_note,
      degraded_confidence_caution,
      watch_now_summary: buildWatchNowSummary(emphasized_items, params.reasoning_snapshot, params.support_mode),
      wording_style,
    },
  };
}

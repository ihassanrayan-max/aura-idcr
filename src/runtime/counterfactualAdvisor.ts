import type {
  CounterfactualAdvisorNarrative,
  CounterfactualBranchAction,
  CounterfactualBranchId,
  CounterfactualBranchResult,
  FirstResponseItem,
  SessionSnapshot,
} from "../contracts/aura";
import { formatSupportModeLabel } from "./supportModePolicy";

type CounterfactualBranchTemplate = {
  branch_id: CounterfactualBranchId;
  label: string;
  description: string;
  simulated_action?: CounterfactualBranchAction;
};

type BuildBranchTemplatesParams = {
  snapshot: SessionSnapshot;
  requested_control_id?: string;
  requested_value?: number;
};

type SummarizeCounterfactualAdvisorParams = {
  snapshot: SessionSnapshot;
  branches: CounterfactualBranchResult[];
};

type ParsedNarrative = {
  recommended_branch_id: CounterfactualBranchId;
  rationale: string;
  why_not: string[];
  top_watch_signals: string[];
  confidence_caveat: string;
  provider?: string;
  model?: string;
};

function labelForRequestedValue(action: CounterfactualBranchAction | undefined): string | undefined {
  if (!action || typeof action.requested_value !== "number") {
    return undefined;
  }

  return `${action.requested_value}${action.requested_value_label ? ` ${action.requested_value_label}` : ""}`.trim();
}

function firstRecommendedLaneItem(items: FirstResponseItem[]): FirstResponseItem | undefined {
  return items.find((item) => item.recommended_action_id);
}

function buildGuidedAction(snapshot: SessionSnapshot): CounterfactualBranchAction | undefined {
  const laneItem = firstRecommendedLaneItem(snapshot.first_response_lane.items);
  if (!laneItem?.recommended_action_id) {
    return undefined;
  }

  const actionLabel =
    snapshot.scenario.allowed_operator_actions.find((action) => action.action_id === laneItem.recommended_action_id)?.label ??
    laneItem.recommended_action_id;

  return {
    action_id: laneItem.recommended_action_id,
    action_label: actionLabel,
    requested_value: typeof laneItem.recommended_value === "number" ? laneItem.recommended_value : undefined,
    requested_value_label: typeof laneItem.recommended_value === "number" ? "% rated" : undefined,
  };
}

function buildOperatorRequestedAction(params: BuildBranchTemplatesParams): CounterfactualBranchAction | undefined {
  const control =
    params.snapshot.manual_control_schema.controls.find((entry) => entry.control_id === params.requested_control_id) ??
    params.snapshot.manual_control_schema.controls[0];
  if (!control) {
    return undefined;
  }

  return {
    action_id: control.action_id,
    action_label: control.label,
    requested_value: params.requested_value ?? control.default_value,
    requested_value_label: control.unit_label || undefined,
  };
}

export function buildCounterfactualBranchTemplates(
  params: BuildBranchTemplatesParams,
): CounterfactualBranchTemplate[] {
  const guidedAction = buildGuidedAction(params.snapshot);
  const operatorRequestedAction = buildOperatorRequestedAction(params);

  return [
    {
      branch_id: "guided",
      label: "Guided recovery path",
      description: guidedAction
        ? "Preview the current first-response recommendation from the live support lane."
        : "No explicit lane action is available, so this branch continues the current guided posture.",
      ...(guidedAction ? { simulated_action: guidedAction } : {}),
    },
    {
      branch_id: "operator_requested",
      label: "Manual operator request",
      description: operatorRequestedAction
        ? "Preview the manual control request the operator is currently considering."
        : "No manual control request is currently configured for projection.",
      ...(operatorRequestedAction ? { simulated_action: operatorRequestedAction } : {}),
    },
    {
      branch_id: "hold",
      label: "Hold and monitor",
      description: "Advance the twin without a new corrective action and watch the next short-horizon trajectory.",
    },
  ];
}

export function recommendedBranchFromDeterministicScore(
  branches: CounterfactualBranchResult[],
): CounterfactualBranchResult | undefined {
  return [...branches].sort((left, right) => {
    if (right.decision_score !== left.decision_score) {
      return right.decision_score - left.decision_score;
    }

    const order = ["guided", "operator_requested", "hold"] as const;
    return order.indexOf(left.branch_id) - order.indexOf(right.branch_id);
  })[0];
}

export function riskTrendLabel(currentRisk: number, finalRisk: number): CounterfactualBranchResult["projected_risk_trend"] {
  const delta = Number((finalRisk - currentRisk).toFixed(1));
  if (delta >= 5) {
    return "worsening";
  }
  if (delta <= -5) {
    return "improving";
  }
  return "flat";
}

export function stabilizationLikelihoodFromBranch(
  branch: Pick<
    CounterfactualBranchResult,
    "final_outcome" | "projected_risk_trend" | "final_combined_risk_band" | "time_to_bad_threshold_sec"
  >,
): CounterfactualBranchResult["stabilization_likelihood"] {
  if (branch.final_outcome === "success") {
    return "high";
  }
  if (
    branch.final_outcome === "failure" ||
    branch.final_combined_risk_band === "high" ||
    (typeof branch.time_to_bad_threshold_sec === "number" && branch.time_to_bad_threshold_sec <= 30)
  ) {
    return "low";
  }
  if (branch.projected_risk_trend === "improving" && branch.final_combined_risk_band !== "elevated") {
    return "high";
  }
  if (branch.projected_risk_trend === "worsening") {
    return "low";
  }
  return "medium";
}

export function decisionScoreForBranch(branch: CounterfactualBranchResult): number {
  let score = 0;

  switch (branch.final_outcome) {
    case "success":
      score += 80;
      break;
    case "timeout":
      score += 15;
      break;
    case "failure":
      score -= 80;
      break;
    default:
      break;
  }

  switch (branch.final_combined_risk_band) {
    case "low":
      score += 40;
      break;
    case "guarded":
      score += 20;
      break;
    case "elevated":
      score += 0;
      break;
    case "high":
      score -= 20;
      break;
  }

  switch (branch.projected_risk_trend) {
    case "improving":
      score += 20;
      break;
    case "flat":
      break;
    case "worsening":
      score -= 20;
      break;
  }

  switch (branch.validator_risk_exposure) {
    case "pass":
      score += 10;
      break;
    case "soft_warning":
      score -= 10;
      break;
    case "hard_prevent":
      score -= 25;
      break;
    default:
      break;
  }

  if (typeof branch.time_to_bad_threshold_sec === "number") {
    if (branch.time_to_bad_threshold_sec <= 30) {
      score -= 25;
    } else if (branch.time_to_bad_threshold_sec <= 60) {
      score -= 15;
    }
  }

  score += Math.min(branch.expected_alarm_ids_cleared.length * 4, 12);
  score -= Math.min(branch.expected_alarm_ids_added.length * 5, 15);

  if (branch.branch_id === "guided") {
    score += 3;
  }

  return score;
}

export function buildBranchOneLineSummary(branch: CounterfactualBranchResult): string {
  const outcomeLabel = branch.final_outcome ? `Outcome ${branch.final_outcome}` : `Risk ${branch.final_combined_risk_band}`;
  const threshold =
    typeof branch.time_to_bad_threshold_sec === "number"
      ? ` bad threshold in ~${branch.time_to_bad_threshold_sec}s`
      : " no near-term bad threshold reached";
  return `${outcomeLabel}; risk ${branch.projected_risk_trend}; validator ${branch.validator_risk_exposure};${threshold}.`;
}

export function buildDeterministicCounterfactualNarrative(
  params: SummarizeCounterfactualAdvisorParams,
): CounterfactualAdvisorNarrative {
  const recommended = recommendedBranchFromDeterministicScore(params.branches);
  const fallbackRecommended = params.branches[0];
  const chosen = recommended ?? fallbackRecommended;
  const rejected = params.branches.filter((branch) => branch.branch_id !== chosen.branch_id);
  const commonWatchSignals = Array.from(
    new Set(
      params.branches
        .flatMap((branch) => branch.watch_signals)
        .filter((signal) => signal.length > 0),
    ),
  ).slice(0, 3);

  return {
    provider: "deterministic_fallback",
    recommended_branch_id: chosen.branch_id,
    rationale: `${chosen.label} is the safest short-horizon branch because it scores best on projected risk, validator exposure, and recovery likelihood. ${chosen.one_line_summary}`,
    why_not: rejected.map((branch) => `${branch.label}: ${branch.one_line_summary}`),
    top_watch_signals: commonWatchSignals,
    confidence_caveat: params.snapshot.operator_state.degraded_mode_active
      ? `Signal confidence is reduced (${params.snapshot.operator_state.signal_confidence}/100), so treat the advisor as a bounded projection rather than a guaranteed outcome.`
      : "Projection is grounded in the current deterministic twin and short-horizon scenario logic; it remains advisory rather than authoritative.",
  };
}

function parseNarrativePayload(payload: Record<string, unknown>): ParsedNarrative | undefined {
  if (
    (payload.recommended_branch_id === "guided" ||
      payload.recommended_branch_id === "operator_requested" ||
      payload.recommended_branch_id === "hold") &&
    typeof payload.rationale === "string" &&
    Array.isArray(payload.why_not) &&
    Array.isArray(payload.top_watch_signals) &&
    typeof payload.confidence_caveat === "string"
  ) {
    return {
      recommended_branch_id: payload.recommended_branch_id,
      rationale: payload.rationale.trim(),
      why_not: payload.why_not.filter((value): value is string => typeof value === "string").slice(0, 2),
      top_watch_signals: payload.top_watch_signals
        .filter((value): value is string => typeof value === "string")
        .slice(0, 3),
      confidence_caveat: payload.confidence_caveat.trim(),
      provider: typeof payload.provider === "string" ? payload.provider : undefined,
      model: typeof payload.model === "string" ? payload.model : undefined,
    };
  }

  return undefined;
}

function advisorApiPayload(params: SummarizeCounterfactualAdvisorParams) {
  return {
    snapshot_context: {
      scenario_id: params.snapshot.scenario.scenario_id,
      phase: params.snapshot.current_phase.label,
      support_mode: formatSupportModeLabel(params.snapshot.support_mode),
      dominant_hypothesis_id: params.snapshot.reasoning_snapshot.dominant_hypothesis_id ?? "monitoring_only",
      dominant_summary: params.snapshot.reasoning_snapshot.dominant_summary,
      combined_risk_band: params.snapshot.combined_risk.combined_risk_band,
      combined_risk_score: Number(params.snapshot.combined_risk.combined_risk_score.toFixed(1)),
      workload_index: params.snapshot.operator_state.workload_index,
      attention_stability_index: params.snapshot.operator_state.attention_stability_index,
      signal_confidence: params.snapshot.operator_state.signal_confidence,
    },
    branches: params.branches.map((branch) => ({
      branch_id: branch.branch_id,
      label: branch.label,
      description: branch.description,
      simulated_action: branch.simulated_action
        ? {
            action_id: branch.simulated_action.action_id,
            action_label: branch.simulated_action.action_label,
            requested_value: branch.simulated_action.requested_value,
            requested_value_label: labelForRequestedValue(branch.simulated_action),
          }
        : null,
      final_outcome: branch.final_outcome ?? null,
      projected_risk_trend: branch.projected_risk_trend,
      final_combined_risk_band: branch.final_combined_risk_band,
      final_combined_risk_score: Number(branch.final_combined_risk_score.toFixed(1)),
      validator_risk_exposure: branch.validator_risk_exposure,
      stabilization_likelihood: branch.stabilization_likelihood,
      time_to_bad_threshold_sec: branch.time_to_bad_threshold_sec ?? null,
      expected_alarm_ids_added: branch.expected_alarm_ids_added,
      expected_alarm_ids_cleared: branch.expected_alarm_ids_cleared,
      watch_signals: branch.watch_signals,
      one_line_summary: branch.one_line_summary,
      decision_score: branch.decision_score,
    })),
  };
}

export async function summarizeCounterfactualAdvisor(
  params: SummarizeCounterfactualAdvisorParams,
): Promise<CounterfactualAdvisorNarrative> {
  const deterministicNarrative = buildDeterministicCounterfactualNarrative(params);
  if (typeof fetch !== "function") {
    return deterministicNarrative;
  }

  try {
    const response = await fetch("/api/counterfactual-advisor", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(advisorApiPayload(params)),
    });

    if (!response.ok) {
      const reason =
        response.status === 429
          ? "LLM summarization was rate-limited"
          : response.status === 503
            ? "LLM summarization is not configured on the server"
            : "LLM summarization was unavailable";
      return {
        ...deterministicNarrative,
        confidence_caveat: `${deterministicNarrative.confidence_caveat} ${reason}, so the deterministic fallback brief is shown instead.`,
      };
    }

    const payload = (await response.json()) as Record<string, unknown>;
    const parsed = parseNarrativePayload(payload);
    if (!parsed) {
      return {
        ...deterministicNarrative,
        confidence_caveat: `${deterministicNarrative.confidence_caveat} Structured output parsing failed, so the deterministic fallback brief is shown instead.`,
      };
    }

    return {
      provider: "llm",
      ...(parsed.model ? { model: parsed.model } : {}),
      recommended_branch_id: parsed.recommended_branch_id,
      rationale: parsed.rationale,
      why_not: parsed.why_not,
      top_watch_signals: parsed.top_watch_signals,
      confidence_caveat: parsed.confidence_caveat,
    };
  } catch {
    return {
      ...deterministicNarrative,
      confidence_caveat: `${deterministicNarrative.confidence_caveat} LLM summarization failed at runtime, so the deterministic fallback brief is shown instead.`,
    };
  }
}

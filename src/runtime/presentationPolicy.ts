import type {
  ActionValidationResult,
  FirstResponseItem,
  PendingActionConfirmation,
  SessionMode,
  SupportMode,
  SupportPolicySnapshot,
  SupportRefinementSnapshot,
} from "../contracts/aura";
import { formatSupportModeLabel } from "./supportModePolicy";

export type PresentationTone = "ok" | "neutral" | "alert";
export type PresentationPriority = "standard" | "priority" | "critical";
export type SupportSectionId =
  | "mode"
  | "watch"
  | "effect"
  | "focus"
  | "guardrails"
  | "confidence"
  | "operator"
  | "transition"
  | "risk";

export type PresentationPolicy = {
  shell_slice_label: string;
  shell_mode_summary: string;
  status_tone: PresentationTone;
  validation_status_label: string;
  validation_status_summary: string;
  watch_badge_tone: PresentationTone;
  caution_priority: PresentationPriority;
  validator_priority: PresentationPriority;
  validator_should_surface: boolean;
  validator_mode_summary: string;
  pending_confirmation_intro: string;
  support_section_order: SupportSectionId[];
  procedure_item_order: "original" | "emphasized_first";
  support_panel_mode_class: string;
  validation_mode_class: string;
};

type BuildPresentationPolicyParams = {
  session_mode: SessionMode;
  support_mode: SupportMode;
  support_policy: SupportPolicySnapshot;
  support_refinement: SupportRefinementSnapshot;
  last_validation_result?: ActionValidationResult;
  pending_action_confirmation?: PendingActionConfirmation;
};

function toneForMode(mode: SupportMode): PresentationTone {
  switch (mode) {
    case "monitoring_support":
      return "ok";
    case "guided_support":
      return "neutral";
    case "protected_response":
      return "alert";
  }
}

function supportSectionOrder(mode: SupportMode): SupportSectionId[] {
  switch (mode) {
    case "monitoring_support":
      return ["mode", "effect", "focus", "watch", "operator", "transition", "confidence", "guardrails", "risk"];
    case "guided_support":
      return ["mode", "watch", "effect", "focus", "operator", "confidence", "guardrails", "transition", "risk"];
    case "protected_response":
      return ["mode", "guardrails", "watch", "confidence", "effect", "focus", "transition", "operator", "risk"];
  }
}

function validationStatus(params: BuildPresentationPolicyParams): {
  label: string;
  summary: string;
  tone: PresentationTone;
} {
  if (params.pending_action_confirmation) {
    if (params.support_mode === "protected_response") {
      return {
        label: "Protected confirmation active",
        summary: `${formatSupportModeLabel(params.support_mode)} is elevating a soft warning without hiding the rest of the shell.`,
        tone: "alert",
      };
    }

    return {
      label: "Validation pending confirmation",
      summary: `${formatSupportModeLabel(params.support_mode)} is asking for explicit confirmation before the action proceeds.`,
      tone: "neutral",
    };
  }

  if (params.last_validation_result?.outcome === "hard_prevent") {
    return {
      label: params.support_mode === "protected_response" ? "Protected validation active" : "Validation block active",
      summary: "The current action result is blocked and surfaced for immediate operator review.",
      tone: "alert",
    };
  }

  if (params.last_validation_result?.outcome === "soft_warning") {
    return {
      label: params.support_mode === "protected_response" ? "Protected warning active" : "Validation warning active",
      summary: "The current action result remains visible because it needs explicit operator attention.",
      tone: params.support_mode === "protected_response" ? "alert" : "neutral",
    };
  }

  switch (params.support_mode) {
    case "monitoring_support":
      return {
        label: "Validation ready",
        summary: "Pass results stay quiet while broader context remains visible.",
        tone: "ok",
      };
    case "guided_support":
      return {
        label: "Guided validation ready",
        summary: "Warnings can be elevated without collapsing the current shell.",
        tone: "neutral",
      };
    case "protected_response":
      return {
        label: "Protected validation ready",
        summary: "Protected response can raise validator prominence while keeping all major regions visible.",
        tone: "alert",
      };
  }
}

function validatorPriority(params: BuildPresentationPolicyParams): PresentationPriority {
  if (params.pending_action_confirmation) {
    return params.support_mode === "protected_response" ? "critical" : "priority";
  }

  switch (params.last_validation_result?.outcome) {
    case "hard_prevent":
      return params.support_mode === "protected_response" ? "critical" : "priority";
    case "soft_warning":
      return params.support_mode === "monitoring_support" ? "standard" : "priority";
    case "pass":
    default:
      return "standard";
  }
}

function cautionPriority(params: BuildPresentationPolicyParams): PresentationPriority {
  if (params.pending_action_confirmation || params.last_validation_result?.outcome === "hard_prevent") {
    return params.support_mode === "protected_response" ? "critical" : "priority";
  }

  switch (params.support_mode) {
    case "monitoring_support":
      return "standard";
    case "guided_support":
      return "priority";
    case "protected_response":
      return "critical";
  }
}

function watchTone(mode: SupportMode): PresentationTone {
  switch (mode) {
    case "monitoring_support":
      return "ok";
    case "guided_support":
      return "neutral";
    case "protected_response":
      return "alert";
  }
}

function validatorModeSummary(params: BuildPresentationPolicyParams): string {
  if (params.pending_action_confirmation) {
    return `${formatSupportModeLabel(params.support_mode)} is keeping this confirmation visible while preserving access to the storyline, alarms, and procedure lane.`;
  }

  if (!params.last_validation_result || params.last_validation_result.outcome === "pass") {
    switch (params.support_mode) {
      case "monitoring_support":
        return "Monitoring Support keeps validation quiet unless the action leaves the clean pass band.";
      case "guided_support":
        return "Guided Support keeps pass results quiet but surfaces warnings with controlled prominence.";
      case "protected_response":
        return "Protected Response reserves stronger validator prominence for warnings and prevents while keeping pass quiet.";
    }
  }

  switch (params.support_mode) {
    case "monitoring_support":
      return "Monitoring Support is surfacing this validation result without changing the shell layout.";
    case "guided_support":
      return "Guided Support is making this validation result more noticeable while keeping broader context available.";
    case "protected_response":
      return "Protected Response is elevating this validation result because the current risk picture is tighter.";
  }
}

export function buildPresentationPolicy(params: BuildPresentationPolicyParams): PresentationPolicy {
  const status = validationStatus(params);
  const validator_should_surface =
    Boolean(params.pending_action_confirmation) ||
    Boolean(params.last_validation_result && params.last_validation_result.outcome !== "pass");

  const session_mode_label =
    params.session_mode === "baseline" ? "Baseline session (no adaptive assistance)" : "Adaptive session (full assistance)";

  return {
    shell_slice_label: `AURA-IDCR Phase 5 Slice A · ${session_mode_label}`,
    shell_mode_summary: `${formatSupportModeLabel(params.support_mode)} is shaping emphasis strength, watch-now prominence, and caution density while ${params.support_policy.critical_visibility.summary.toLowerCase()}`,
    status_tone: status.tone,
    validation_status_label: status.label,
    validation_status_summary: status.summary,
    watch_badge_tone: watchTone(params.support_mode),
    caution_priority: cautionPriority(params),
    validator_priority: validatorPriority(params),
    validator_should_surface,
    validator_mode_summary: validatorModeSummary(params),
    pending_confirmation_intro: `${formatSupportModeLabel(params.support_mode)} is asking for explicit confirmation before this action proceeds.`,
    support_section_order: supportSectionOrder(params.support_mode),
    procedure_item_order: params.support_mode === "monitoring_support" ? "original" : "emphasized_first",
    support_panel_mode_class: `support-mode-${params.support_mode}`,
    validation_mode_class: `validator-${validatorPriority(params)}`,
  };
}

export function orderPresentedLaneItems(
  items: FirstResponseItem[],
  strategy: PresentationPolicy["procedure_item_order"],
): FirstResponseItem[] {
  if (strategy === "original") {
    return items;
  }

  const urgency_rank: Record<NonNullable<FirstResponseItem["presentation_cue"]>["urgency_level"], number> = {
    standard: 0,
    priority: 1,
    urgent: 2,
  };

  return items
    .map((item, index) => ({ item, index }))
    .sort((left, right) => {
      const emphasized_delta =
        Number(Boolean(right.item.presentation_cue?.emphasized)) - Number(Boolean(left.item.presentation_cue?.emphasized));
      if (emphasized_delta !== 0) {
        return emphasized_delta;
      }

      const urgency_delta =
        (urgency_rank[right.item.presentation_cue?.urgency_level ?? "standard"] ?? 0) -
        (urgency_rank[left.item.presentation_cue?.urgency_level ?? "standard"] ?? 0);
      if (urgency_delta !== 0) {
        return urgency_delta;
      }

      return left.index - right.index;
    })
    .map((entry) => entry.item);
}

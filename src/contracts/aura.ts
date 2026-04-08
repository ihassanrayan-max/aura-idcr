export type SessionMode = "baseline" | "adaptive";
export type AlarmPriority = "P1" | "P2" | "P3";
export type ActorRole = "operator" | "shift_supervisor" | "trainer_evaluator" | "system";
export type ValidationOutcome = "pass" | "soft_warning" | "hard_prevent";
export type SourceModule =
  | "scenario_engine"
  | "plant_twin"
  | "alarm_intelligence"
  | "human_monitoring"
  | "reasoning_layer"
  | "adaptive_orchestrator"
  | "action_validator"
  | "hmi"
  | "evaluation";
export type SupportMode =
  | "monitoring_support"
  | "guided_support"
  | "protected_response";
export type ScalarValue = number | boolean | string;
export type PlantStateSnapshot = Record<string, ScalarValue>;

export type AlarmRecord = {
  alarm_id: string;
  title: string;
  priority: AlarmPriority;
  subsystem_tag: string;
  active: boolean;
  visibility_rule: "always_visible" | "standard_visible";
  group_hint: string;
};

export type TraceRef = {
  ref_type: "tick_id" | "action_id" | "alarm_id" | "phase_id";
  ref_value: string;
};

export type PlantTick = {
  tick_id: string;
  session_id: string;
  scenario_id: string;
  session_mode: SessionMode;
  sim_time_sec: number;
  phase_id: string;
  plant_state: PlantStateSnapshot;
  derived_state: {
    alarm_load_count: number;
    active_alarm_cluster_count: number;
  };
  last_action_request_id?: string;
  source_event_ids: string[];
};

export type AlarmSet = {
  alarm_set_id: string;
  tick_id: string;
  session_id: string;
  scenario_id: string;
  active_alarm_count: number;
  active_alarm_cluster_count: number;
  highest_priority_active?: AlarmPriority;
  active_alarm_ids: string[];
  active_alarms: AlarmRecord[];
  newly_raised_alarm_ids: string[];
  newly_cleared_alarm_ids: string[];
};

export type AlarmCluster = {
  cluster_id: string;
  title: string;
  summary: string;
  priority: AlarmPriority;
  visibility_rule: "always_visible" | "standard_visible";
  alarm_ids: string[];
  alarms: AlarmRecord[];
  critical_alarm_ids: string[];
  primary_alarm_ids: string[];
  grouped_alarm_count: number;
};

export type AlarmIntelligenceSnapshot = {
  visible_alarm_card_count: number;
  grouped_alarm_count: number;
  compression_ratio: number;
  dominant_cluster_id?: string;
  clusters: AlarmCluster[];
};

export type ScenarioDefinition = {
  scenario_id: string;
  version: string;
  title: string;
  summary: string;
  training_goal: string;
  initiating_event: string;
  difficulty: "intro" | "moderate" | "high";
  tags: string[];
  expected_duration_sec: number;
  deterministic_seed: string;
  initial_plant_state: PlantStateSnapshot;
  phases: ScenarioPhase[];
  event_injections: ScenarioEventInjection[];
  alarm_hooks: AlarmTriggerHook[];
  allowed_operator_actions: AllowedOperatorAction[];
  expected_root_cause_hypothesis_id?: string;
  success_condition: ScenarioCondition;
  failure_condition: ScenarioCondition;
  timeout_condition: ScenarioCondition;
};

export type ScenarioRuntimeProfileId =
  | "feedwater_degradation"
  | "loss_of_offsite_power_sbo"
  | "main_steam_isolation_upset";

export type ScenarioControlRangeSchema = {
  control_id: string;
  label: string;
  action_id: string;
  min: number;
  max: number;
  step: number;
  default_value: number;
  unit_label: string;
  apply_button_label: string;
  reason_note: string;
};

export type ScenarioUiControlSchema = {
  title: string;
  helper_text: string;
  controls: ScenarioControlRangeSchema[];
};

export type ScenarioCatalogSummary = {
  scenario_id: string;
  version: string;
  title: string;
  summary: string;
  runtime_profile_id: ScenarioRuntimeProfileId;
};

export type ScenarioPhase = {
  phase_id: string;
  label: string;
  description: string;
  completion_condition: ScenarioCondition;
  nominal_duration_sec: number;
  allowed_action_ids?: string[];
};

export type ScenarioEventInjection = {
  injection_id: string;
  phase_id: string;
  trigger: ScenarioTrigger;
  effects: ScenarioStateEffect[];
  note: string;
};

export type AlarmTriggerHook = {
  hook_id: string;
  phase_id?: string;
  alarm_id: string;
  trigger: ScenarioTrigger;
  action: "assert" | "clear" | "latch";
  note: string;
};

export type AllowedOperatorAction = {
  action_id: string;
  label: string;
  category: "control_input" | "system_alignment" | "recovery_step" | "acknowledgement";
  target_variable_ids: string[];
  allowed_phase_ids: string[];
  can_change_progression: boolean;
  unsafe_if_misused: boolean;
  requires_validation: boolean;
  effect_note: string;
};

export type ScenarioTrigger =
  | { trigger_kind: "time_offset_sec"; phase_time_sec: number }
  | { trigger_kind: "condition"; condition: ScenarioCondition };

export type ScenarioStateEffect = {
  variable_id: string;
  effect_operation: "set" | "delta" | "ramp_to";
  value: ScalarValue;
  duration_sec?: number;
};

export type ScenarioCondition =
  | { all: ScenarioCondition[] }
  | { any: ScenarioCondition[] }
  | {
      variable: {
        variable_id: string;
        operator: "eq" | "ne" | "gt" | "gte" | "lt" | "lte";
        value: ScalarValue;
      };
    }
  | {
      action: {
        action_id: string;
        performed: boolean;
      };
    }
  | {
      elapsed_time_sec_gte: number;
    };

export type ActionRequest = {
  action_request_id: string;
  session_id: string;
  scenario_id: string;
  sim_time_sec: number;
  actor_role: ActorRole;
  action_id: string;
  target_subsystem: string;
  requested_value?: ScalarValue;
  ui_region: "plant_mimic" | "alarm_area" | "procedure_lane" | "supervisor_panel";
  reason_note?: string;
};

export type ActionValidationResult = {
  validation_result_id: string;
  action_request_id: string;
  sim_time_sec: number;
  outcome: ValidationOutcome;
  requires_confirmation: boolean;
  override_allowed: boolean;
  reason_code: string;
  explanation: string;
  risk_context: string;
  confidence_note: string;
  affected_variable_ids: string[];
  prevented_harm?: boolean;
  nuisance_flag?: boolean;
  recommended_safe_alternative?: string;
};

export type PendingActionConfirmation = {
  action_request: ActionRequest;
  validation_result: ActionValidationResult;
};

export type PendingSupervisorOverrideStatus = "available" | "requested";

export type PendingSupervisorOverride = {
  action_request: ActionRequest;
  validation_result: ActionValidationResult;
  request_status: PendingSupervisorOverrideStatus;
  blocked_at_sim_time_sec: number;
  requested_at_sim_time_sec?: number;
  request_note?: string;
  demo_research_only: true;
};

export type ValidationDemoMarkerKind =
  | "soft_warning_demonstrated"
  | "hard_prevent_demonstrated"
  | "supervisor_override_demonstrated";

export type ValidationDemoMarkerState = {
  marker_kind: ValidationDemoMarkerKind;
  demonstrated: boolean;
  first_demonstrated_at_sim_time_sec?: number;
};

export type ValidationDemoState = Record<ValidationDemoMarkerKind, ValidationDemoMarkerState>;

export type HypothesisEvidence = {
  evidence_id: string;
  label: string;
  detail: string;
  strength: "strong" | "moderate" | "watch";
  source_alarm_ids: string[];
  source_variable_ids: string[];
};

export type EventHypothesis = {
  hypothesis_id: string;
  label: string;
  summary: string;
  score: number;
  confidence_band: "low" | "medium" | "high";
  rank: number;
  evidence: HypothesisEvidence[];
  watch_items: string[];
};

export type ReasoningSnapshot = {
  dominant_hypothesis_id?: string;
  dominant_summary: string;
  ranked_hypotheses: EventHypothesis[];
  changed_since_last_tick: boolean;
  stable_for_ticks: number;
  expected_root_cause_aligned: boolean;
};

export type HumanMonitoringMode =
  | "placeholder_compatibility"
  | "live_sources"
  | "degraded"
  | "unavailable";

export type HumanMonitoringSourceKind =
  | "legacy_runtime_placeholder"
  | "interaction_telemetry"
  | "camera_cv"
  | "manual_annotation";

export type HumanMonitoringSourceAvailability =
  | "active"
  | "degraded"
  | "unavailable"
  | "not_connected";

export type HumanMonitoringFreshnessStatus = "current" | "aging" | "stale" | "no_observations";

export type HumanMonitoringInterpretationInput = {
  workload_index: number;
  attention_stability_index: number;
  signal_confidence: number;
  degraded_mode_active: boolean;
  degraded_mode_reason: string;
  observation_window_ticks: number;
  contributing_source_ids: string[];
  provenance: "legacy_runtime_placeholder" | "canonical_source_pipeline";
  interpretation_note: string;
};

export type HumanMonitoringSourceSnapshot = {
  source_id: string;
  source_kind: HumanMonitoringSourceKind;
  availability: HumanMonitoringSourceAvailability;
  freshness_status: HumanMonitoringFreshnessStatus;
  confidence: number;
  status_note: string;
  latest_observation_age_sec?: number;
  last_observation_sim_time_sec?: number;
  oldest_observation_sim_time_sec?: number;
  expected_update_interval_sec: number;
  stale_after_sec: number;
  window_tick_span: number;
  window_duration_sec: number;
  sample_count_in_window: number;
  contributes_to_aggregate: boolean;
};

export type HumanMonitoringSnapshot = {
  snapshot_id: string;
  mode: HumanMonitoringMode;
  freshness_status: HumanMonitoringFreshnessStatus;
  aggregate_confidence: number;
  degraded_state_active: boolean;
  degraded_state_reason: string;
  status_summary: string;
  latest_observation_sim_time_sec?: number;
  oldest_observation_sim_time_sec?: number;
  window_tick_span: number;
  window_duration_sec: number;
  connected_source_count: number;
  active_source_count: number;
  current_source_count: number;
  degraded_source_count: number;
  stale_source_count: number;
  contributing_source_count: number;
  sources: HumanMonitoringSourceSnapshot[];
  interpretation_input?: HumanMonitoringInterpretationInput;
};

export type OperatorStateSnapshot = {
  workload_index: number;
  attention_stability_index: number;
  signal_confidence: number;
  degraded_mode_active: boolean;
  degraded_mode_reason: string;
  observation_window_ticks: number;
};

export type CombinedRiskBand = "low" | "guarded" | "elevated" | "high";

export type CombinedRiskFactor = {
  factor_id:
    | "plant_severity"
    | "alarm_burden"
    | "diagnosis_uncertainty"
    | "operator_workload"
    | "attention_instability"
    | "signal_confidence_penalty";
  label: string;
  raw_index: number;
  contribution: number;
  detail: string;
};

export type CombinedRiskSnapshot = {
  combined_risk_score: number;
  combined_risk_band: CombinedRiskBand;
  factor_breakdown: CombinedRiskFactor[];
  top_contributing_factors: string[];
  confidence_caveat: string;
  why_risk_is_current: string;
  what_changed: string;
};

export type SupportUrgencyLevel = "standard" | "priority" | "urgent";
export type SupportWordingStyle = "concise" | "explicit";

export type FirstResponsePresentationCue = {
  emphasized: boolean;
  urgency_level: SupportUrgencyLevel;
  why_this_matters_now: string;
  attention_sensitive_caution?: string;
  degraded_confidence_caveat?: string;
  wording_style: SupportWordingStyle;
};

export type SupportRefinementSnapshot = {
  current_support_focus: string;
  emphasized_lane_item_ids: string[];
  summary_explanation: string;
  operator_context_note: string;
  degraded_confidence_caution: string;
  watch_now_summary: string;
  wording_style: SupportWordingStyle;
};

export type CriticalVisibilityGuardrailState = {
  critical_variable_ids: string[];
  always_visible_alarm_ids: string[];
  pinned_alarm_ids: string[];
  summary: string;
};

export type SupportPolicySnapshot = {
  current_mode_reason: string;
  transition_reason: string;
  mode_change_summary: string;
  support_behavior_changes: string[];
  degraded_confidence_effect: string;
  critical_visibility: CriticalVisibilityGuardrailState;
};

export type FirstResponseItem = {
  item_id: string;
  label: string;
  item_kind: "check" | "action" | "watch";
  why: string;
  recommended_action_id?: string;
  recommended_value?: ScalarValue;
  completion_hint: string;
  source_alarm_ids: string[];
  source_variable_ids: string[];
  presentation_cue?: FirstResponsePresentationCue;
};

export type FirstResponseLane = {
  lane_id: string;
  dominant_hypothesis_id?: string;
  updated_at_sec: number;
  prototype_notice: string;
  items: FirstResponseItem[];
};

export type SessionLogEventType =
  | "session_started"
  | "phase_changed"
  | "plant_tick_recorded"
  | "alarm_set_updated"
  | "human_monitoring_snapshot_recorded"
  | "reasoning_snapshot_published"
  | "support_mode_changed"
  | "operator_state_snapshot_recorded"
  | "action_requested"
  | "action_validated"
  | "action_confirmation_recorded"
  | "supervisor_override_requested"
  | "supervisor_override_decided"
  | "supervisor_override_action_applied"
  | "validation_demo_marker_recorded"
  | "operator_action_applied"
  | "diagnosis_committed"
  | "scenario_outcome_recorded"
  | "kpi_summary_generated"
  | "session_ended";

export type SessionLogEvent = {
  event_id: string;
  session_id: string;
  scenario_id: string;
  sim_time_sec: number;
  event_type: SessionLogEventType;
  source_module: SourceModule;
  phase_id?: string;
  payload: Record<string, unknown>;
  trace_refs: TraceRef[];
};

export type LoggedAlarmState = AlarmRecord & {
  activated_at_sec: number;
  activation_order: number;
  cleared_at_sec?: number;
};

export type OutcomeKind = "success" | "failure" | "timeout";

export type ScenarioOutcome = {
  outcome: OutcomeKind;
  stabilized: boolean;
  message: string;
  sim_time_sec: number;
};

export type ExecutedAction = ActionRequest & {
  applied: boolean;
};

export type KpiMetric = {
  kpi_id: string;
  label: string;
  value: number;
  value_status: "measured" | "unavailable";
  unavailable_reason?: string;
  unit: string;
  audience: "internal_only" | "demo_facing";
  dependency_event_types: SessionLogEventType[];
};

export type KpiSummary = {
  kpi_summary_id: string;
  session_id: string;
  scenario_id: string;
  session_mode: SessionMode;
  /** Legacy display string preserved for existing UI paths; value must reflect sim-clock semantics. */
  generated_at_iso: string;
  generated_at_sim_time_sec: number;
  completeness: "partial" | "complete";
  metrics: KpiMetric[];
};

/** Single-session completed-run review artifact (Phase 5 Slice B). Slice C can compare two of these. */
export type CompletedSessionReviewSchemaVersion = 1;

export type CompletedSessionReviewEvent = {
  sequence: number;
  source_event_id: string;
  sim_time_sec: number;
  event_type: SessionLogEventType;
  title: string;
  summary: string;
  tick_id?: string;
};

export type CompletedSessionReviewMilestoneKind =
  | "session_start"
  | "phase_entry"
  | "diagnosis"
  | "support_escalation"
  | "validator_intervention"
  | "supervisor_override"
  | "operator_action"
  | "terminal_outcome";

export type CompletedSessionReviewMilestone = {
  milestone_id: string;
  kind: CompletedSessionReviewMilestoneKind;
  sim_time_sec: number;
  label: string;
  detail: string;
  source_event_id: string;
};

export type CompletedSessionReviewHighlightKind =
  | "storyline"
  | "human_monitoring"
  | "assistance"
  | "intervention"
  | "workload"
  | "outcome";

export type CompletedSessionReviewHighlight = {
  highlight_id: string;
  kind: CompletedSessionReviewHighlightKind;
  label: string;
  detail: string;
};

export type CompletedSessionReview = {
  schema_version: CompletedSessionReviewSchemaVersion;
  session_id: string;
  session_mode: SessionMode;
  scenario_id: string;
  scenario_version: string;
  scenario_title: string;
  terminal_outcome: ScenarioOutcome;
  completion_sim_time_sec: number;
  kpi_summary: KpiSummary;
  key_events: CompletedSessionReviewEvent[];
  milestones: CompletedSessionReviewMilestone[];
  highlights: CompletedSessionReviewHighlight[];
};

/** Phase 5 Slice C: deterministic comparison of one baseline and one adaptive completed review. */
export type SessionRunComparisonSchemaVersion = 1;

export type SessionRunComparisonKpiFavors = "baseline" | "adaptive" | "tie" | "not_comparable";

export type SessionRunComparisonKpiDelta = {
  kpi_id: string;
  label: string;
  unit: string;
  baseline_value: number;
  adaptive_value: number;
  baseline_value_status: KpiMetric["value_status"];
  adaptive_value_status: KpiMetric["value_status"];
  baseline_unavailable_reason?: string;
  adaptive_unavailable_reason?: string;
  /** adaptive_value minus baseline_value */
  delta: number;
  lower_is_better: boolean;
  favors: SessionRunComparisonKpiFavors;
};

export type SessionRunComparisonMilestoneKindCount = {
  kind: CompletedSessionReviewMilestoneKind;
  baseline_count: number;
  adaptive_count: number;
};

export type SessionRunComparisonJudgeOverall =
  | "adaptive"
  | "baseline"
  | "tie"
  | "mixed"
  | "inconclusive";

export type SessionRunComparisonJudgeSummary = {
  overall_favors: SessionRunComparisonJudgeOverall;
  headline: string;
  metric_bullets: string[];
  why_it_matters: string;
};

export type SessionRunComparison = {
  schema_version: SessionRunComparisonSchemaVersion;
  comparison_id: string;
  scenario_id: string;
  scenario_version: string;
  scenario_title: string;
  valid: boolean;
  mismatch_reason?: string;
  baseline_session_id: string;
  adaptive_session_id: string;
  baseline_outcome: OutcomeKind;
  adaptive_outcome: OutcomeKind;
  baseline_stabilized: boolean;
  adaptive_stabilized: boolean;
  completion_sim_time_sec_delta: number;
  kpi_deltas: SessionRunComparisonKpiDelta[];
  milestone_kind_counts: SessionRunComparisonMilestoneKindCount[];
  key_event_count_baseline: number;
  key_event_count_adaptive: number;
  interpretation_lines: string[];
  judge_summary: SessionRunComparisonJudgeSummary;
};

export type ReportProvenance = {
  derived_from: "CompletedSessionReview" | "SessionRunComparison";
  valid?: boolean;
  mismatch_reason?: string;
  comparison_compatible?: boolean;
};

export type ReportSummaryBlock = {
  headline: string;
  outcome_line: string;
  notable_points: string[];
};

export type SessionAfterActionReport = {
  artifact_kind: "session_after_action_report";
  schema_version: 1;
  report_id: string;
  scenario: {
    scenario_id: string;
    scenario_version: string;
    scenario_title: string;
  };
  run: {
    session_id: string;
    session_mode: SessionMode;
    terminal_outcome: ScenarioOutcome;
    completion_sim_time_sec: number;
  };
  summary_block: ReportSummaryBlock;
  kpi_summary: KpiSummary;
  milestones: CompletedSessionReviewMilestone[];
  highlights: CompletedSessionReviewHighlight[];
  timeline: CompletedSessionReviewEvent[];
  provenance: ReportProvenance;
};

export type ComparisonReportArtifact = {
  artifact_kind: "session_comparison_report";
  schema_version: 1;
  comparison_id: string;
  scenario: {
    scenario_id: string;
    scenario_version: string;
    scenario_title: string;
  };
  baseline_run: {
    session_id: string;
    outcome: OutcomeKind;
    stabilized: boolean;
    completion_sim_time_sec: number;
  };
  adaptive_run: {
    session_id: string;
    outcome: OutcomeKind;
    stabilized: boolean;
    completion_sim_time_sec: number;
  };
  judge_summary: SessionRunComparisonJudgeSummary;
  kpi_rows: SessionRunComparisonKpiDelta[];
  milestone_kind_counts: SessionRunComparisonMilestoneKindCount[];
  interpretation_lines: string[];
  source_run_summaries: {
    baseline_summary_block: ReportSummaryBlock;
    adaptive_summary_block: ReportSummaryBlock;
  };
  provenance: ReportProvenance;
};

/** Latest captured completed reviews per mode for in-browser baseline vs adaptive comparison (Phase 5 Slice C). */
export type SessionEvaluationCaptureBucket = {
  baseline_completed?: CompletedSessionReview;
  adaptive_completed?: CompletedSessionReview;
};

/** Captured terminal reviews grouped by scenario_id@version so mixed-scenario runs never compare against each other. */
export type SessionEvaluationCapture = Record<string, SessionEvaluationCaptureBucket>;

export type SessionSnapshot = {
  session_id: string;
  session_mode: SessionMode;
  support_mode: SupportMode;
  scenario: ScenarioDefinition;
  scenario_catalog: ScenarioCatalogSummary[];
  runtime_profile_id: ScenarioRuntimeProfileId;
  manual_control_schema: ScenarioUiControlSchema;
  current_phase: ScenarioPhase;
  sim_time_sec: number;
  tick_index: number;
  plant_tick: PlantTick;
  alarm_set: AlarmSet;
  alarm_intelligence: AlarmIntelligenceSnapshot;
  reasoning_snapshot: ReasoningSnapshot;
  human_monitoring: HumanMonitoringSnapshot;
  operator_state: OperatorStateSnapshot;
  combined_risk: CombinedRiskSnapshot;
  first_response_lane: FirstResponseLane;
  support_refinement: SupportRefinementSnapshot;
  support_policy: SupportPolicySnapshot;
  alarm_history: LoggedAlarmState[];
  events: SessionLogEvent[];
  executed_actions: ExecutedAction[];
  last_validation_result?: ActionValidationResult;
  pending_action_confirmation?: PendingActionConfirmation;
  pending_supervisor_override?: PendingSupervisorOverride;
  validation_demo_state: ValidationDemoState;
  outcome?: ScenarioOutcome;
  kpi_summary?: KpiSummary;
  /** Present only after a terminal outcome; derived deterministically from canonical logs + KPI. */
  completed_review?: CompletedSessionReview;
  /** Latest terminal review per session mode; survives reset for comparison (Phase 5 Slice C). */
  evaluation_capture?: SessionEvaluationCapture;
  logging_active: boolean;
  validation_status_available: boolean;
};

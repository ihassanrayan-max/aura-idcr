import { useSyncExternalStore } from "react";
import type {
  ActionRequest,
  ActionValidationResult,
  AlarmIntelligenceSnapshot,
  CombinedRiskSnapshot,
  CompletedSessionReview,
  InteractionTelemetryEventKind,
  InteractionTelemetryUiRegion,
  InteractionTelemetryWorkspace,
  PendingActionConfirmation,
  PendingSupervisorOverride,
  ExecutedAction,
  FirstResponseLane,
  HumanMonitoringSnapshot,
  LoggedAlarmState,
  OperatorStateSnapshot,
  PlantTick,
  ReasoningSnapshot,
  ScenarioDefinition,
  ScenarioRuntimeProfileId,
  ScenarioUiControlSchema,
  KpiSummary,
  ScenarioOutcome,
  SessionEvaluationCaptureBucket,
  SessionMode,
  SessionEvaluationCapture,
  SessionSnapshot,
  SupportMode,
  SupportPolicySnapshot,
  SupportRefinementSnapshot,
  ValidationDemoMarkerKind,
  ValidationDemoState,
} from "../contracts/aura";
import {
  getDefaultScenarioCatalogEntry,
  listScenarioCatalogEntries,
  resolveScenarioCatalogEntry,
  type ScenarioCatalogEntry,
} from "../scenarios/registry";
import { alarmDictionaryById } from "../data/alarmDictionary";
import { evaluateAlarmSet, createAlarmRuntimeState, type AlarmRuntimeState } from "../runtime/alarmEngine";
import { buildAlarmIntelligence } from "../runtime/alarmIntelligence";
import {
  advancePhaseIfNeeded,
  consumeTriggeredInjections,
  createScenarioRuntimeState,
  evaluateCondition,
  getActivePhase,
  getPhaseElapsedTimeSec,
  type ScenarioRuntimeState,
} from "../runtime/scenarioEngine";
import {
  applyOperatorAction,
  applyScenarioEffects,
  createPlantTwinInternalState,
  stepPlantTwin,
  type PlantTwinInternalState,
} from "../runtime/plantTwin";
import { buildCombinedRiskSnapshot } from "../runtime/combinedRisk";
import {
  type CameraCvLifecycleStatus,
  createHumanMonitoringRuntimeState,
  evaluateHumanMonitoring,
  recordCameraCvObservation,
  recordInteractionTelemetry,
  setCameraCvIntent,
  setInteractionTelemetrySuppressed,
  updateCameraCvLifecycle,
  type HumanMonitoringRuntimeState,
} from "../runtime/humanMonitoring";
import { buildOperatorStateSnapshot } from "../runtime/operatorState";
import { buildFirstResponseLane } from "../runtime/procedureLane";
import { buildReasoningSnapshot, createReasoningRuntimeState, type ReasoningRuntimeState } from "../runtime/reasoningEngine";
import { SessionLogger } from "../runtime/sessionLogger";
import { buildSupportRefinement } from "../runtime/supportRefinement";
import {
  buildBaselineMonitoringSupport,
  createSupportModeRuntimeState,
  resolveSupportModePolicy,
} from "../runtime/supportModePolicy";
import { validateAction } from "../runtime/actionValidator";
import { computeKpiSummary } from "../runtime/kpiSummary";
import { buildCompletedSessionReview } from "../runtime/sessionReview";

type SessionStoreOptions = {
  scenario?: ScenarioDefinition;
  scenario_id?: string;
  session_index?: number;
  tick_duration_sec?: number;
  session_mode?: SessionMode;
};

type ActionRequestParams = {
  action_id: string;
  requested_value?: number;
  ui_region: ActionRequest["ui_region"];
  reason_note?: string;
};

type RecordUiInteractionParams = {
  event_kind: InteractionTelemetryEventKind;
  ui_region: InteractionTelemetryUiRegion;
  workspace?: InteractionTelemetryWorkspace;
  target_id?: string;
  requested_value?: number;
  detail?: string;
};

type UpdateCameraCvLifecycleParams = {
  lifecycle_status: CameraCvLifecycleStatus;
  status_note: string;
  unavailable_reason?: string;
  clear_observations?: boolean;
};

type RecordCameraCvObservationParams = {
  observation_kind: "stable_face" | "weak_face" | "no_face" | "multiple_faces";
  face_count: number;
  strongest_face_confidence: number;
  face_center_offset: number;
  head_motion_delta: number;
  face_area_ratio: number;
  note: string;
};

function summarizeAlarmClusters(alarm_intelligence: AlarmIntelligenceSnapshot) {
  return alarm_intelligence.clusters.map((cluster) => ({
    cluster_id: cluster.cluster_id,
    title: cluster.title,
    priority: cluster.priority,
    alarm_ids: cluster.alarm_ids,
    critical_alarm_ids: cluster.critical_alarm_ids,
  }));
}

function summarizeLaneItems(first_response_lane: FirstResponseLane) {
  return first_response_lane.items.map((item) => ({
    item_id: item.item_id,
    item_kind: item.item_kind,
    recommended_action_id: item.recommended_action_id,
  }));
}

function laneSummaryKey(first_response_lane: FirstResponseLane): string {
  return JSON.stringify(summarizeLaneItems(first_response_lane));
}

function summarizeRiskFactors(combined_risk: CombinedRiskSnapshot) {
  return combined_risk.factor_breakdown.map((factor) => ({
    factor_id: factor.factor_id,
    label: factor.label,
    raw_index: factor.raw_index,
    contribution: factor.contribution,
  }));
}

function summarizeSupportRefinement(support_refinement: SupportRefinementSnapshot) {
  return {
    current_support_focus: support_refinement.current_support_focus,
    emphasized_lane_item_ids: support_refinement.emphasized_lane_item_ids,
    summary_explanation: support_refinement.summary_explanation,
    operator_context_note: support_refinement.operator_context_note,
    degraded_confidence_caution: support_refinement.degraded_confidence_caution,
    watch_now_summary: support_refinement.watch_now_summary,
    wording_style: support_refinement.wording_style,
  };
}

function summarizeSupportPolicy(support_policy: SupportPolicySnapshot) {
  return {
    current_mode_reason: support_policy.current_mode_reason,
    transition_reason: support_policy.transition_reason,
    mode_change_summary: support_policy.mode_change_summary,
    support_behavior_changes: support_policy.support_behavior_changes,
    degraded_confidence_effect: support_policy.degraded_confidence_effect,
    critical_visibility_summary: support_policy.critical_visibility.summary,
    pinned_alarm_ids: support_policy.critical_visibility.pinned_alarm_ids,
    always_visible_alarm_ids: support_policy.critical_visibility.always_visible_alarm_ids,
    critical_variable_ids: support_policy.critical_visibility.critical_variable_ids,
  };
}

function summarizeHumanMonitoring(human_monitoring: HumanMonitoringSnapshot) {
  return {
    snapshot_id: human_monitoring.snapshot_id,
    mode: human_monitoring.mode,
    freshness_status: human_monitoring.freshness_status,
    aggregate_confidence: human_monitoring.aggregate_confidence,
    degraded_state_active: human_monitoring.degraded_state_active,
    degraded_state_reason: human_monitoring.degraded_state_reason,
    status_summary: human_monitoring.status_summary,
    latest_observation_sim_time_sec: human_monitoring.latest_observation_sim_time_sec,
    oldest_observation_sim_time_sec: human_monitoring.oldest_observation_sim_time_sec,
    window_tick_span: human_monitoring.window_tick_span,
    window_duration_sec: human_monitoring.window_duration_sec,
    connected_source_count: human_monitoring.connected_source_count,
    active_source_count: human_monitoring.active_source_count,
    current_source_count: human_monitoring.current_source_count,
    degraded_source_count: human_monitoring.degraded_source_count,
    stale_source_count: human_monitoring.stale_source_count,
    contributing_source_count: human_monitoring.contributing_source_count,
    sources: human_monitoring.sources.map((source) => ({
      source_id: source.source_id,
      source_kind: source.source_kind,
      availability: source.availability,
      freshness_status: source.freshness_status,
      confidence: source.confidence,
      status_note: source.status_note,
      latest_observation_age_sec: source.latest_observation_age_sec,
      last_observation_sim_time_sec: source.last_observation_sim_time_sec,
      oldest_observation_sim_time_sec: source.oldest_observation_sim_time_sec,
      expected_update_interval_sec: source.expected_update_interval_sec,
      stale_after_sec: source.stale_after_sec,
      window_tick_span: source.window_tick_span,
      window_duration_sec: source.window_duration_sec,
      sample_count_in_window: source.sample_count_in_window,
      contributes_to_aggregate: source.contributes_to_aggregate,
    })),
    interpretation_input: human_monitoring.interpretation_input
      ? {
          workload_index: human_monitoring.interpretation_input.workload_index,
          attention_stability_index: human_monitoring.interpretation_input.attention_stability_index,
          signal_confidence: human_monitoring.interpretation_input.signal_confidence,
          risk_cues: human_monitoring.interpretation_input.risk_cues,
          degraded_mode_active: human_monitoring.interpretation_input.degraded_mode_active,
          degraded_mode_reason: human_monitoring.interpretation_input.degraded_mode_reason,
          observation_window_ticks: human_monitoring.interpretation_input.observation_window_ticks,
          contributing_source_ids: human_monitoring.interpretation_input.contributing_source_ids,
          provenance: human_monitoring.interpretation_input.provenance,
          interpretation_note: human_monitoring.interpretation_input.interpretation_note,
        }
      : undefined,
  };
}

function summarizeValidationResult(validation_result: ActionValidationResult) {
  return {
    action_request_id: validation_result.action_request_id,
    outcome: validation_result.outcome,
    reason_code: validation_result.reason_code,
    prevented_harm: validation_result.prevented_harm ?? false,
    nuisance_flag: validation_result.nuisance_flag ?? false,
    requires_confirmation: validation_result.requires_confirmation,
    override_allowed: validation_result.override_allowed,
    explanation: validation_result.explanation,
    risk_context: validation_result.risk_context,
    confidence_note: validation_result.confidence_note,
    recommended_safe_alternative: validation_result.recommended_safe_alternative,
    affected_variable_ids: validation_result.affected_variable_ids,
  };
}

function criticalEscalationActive(active_alarm_ids: string[]): boolean {
  return ["ALM_RPV_LEVEL_LOW_LOW", "ALM_RPV_PRESSURE_HIGH", "ALM_CONTAINMENT_PRESSURE_HIGH"].some((alarm_id) =>
    active_alarm_ids.includes(alarm_id),
  );
}

function createInitialValidationDemoState(): ValidationDemoState {
  return {
    soft_warning_demonstrated: {
      marker_kind: "soft_warning_demonstrated",
      demonstrated: false,
    },
    hard_prevent_demonstrated: {
      marker_kind: "hard_prevent_demonstrated",
      demonstrated: false,
    },
    supervisor_override_demonstrated: {
      marker_kind: "supervisor_override_demonstrated",
      demonstrated: false,
    },
  };
}

export class AuraSessionStore {
  private scenario_catalog_entry: ScenarioCatalogEntry;
  private readonly session_index: number;
  /** Increments on each reset(); part of deterministic per-run session_id. */
  private run_sequence = 1;
  private session_id: string;
  private readonly tick_duration_sec: number;
  private session_mode: SessionMode;
  private readonly listeners = new Set<() => void>();
  private logger: SessionLogger;
  /** Survives reset so baseline and adaptive completed reviews can be compared in one app session. */
  private evaluation_capture: SessionEvaluationCapture = {};

  private action_sequence = 0;
  private validation_sequence = 0;
  private activation_sequence = 0;
  private scenario_runtime_state: ScenarioRuntimeState;
  private alarm_runtime_state: AlarmRuntimeState;
  private reasoning_runtime_state: ReasoningRuntimeState;
  private human_monitoring_runtime_state: HumanMonitoringRuntimeState;
  private plant_internal_state: PlantTwinInternalState;
  private support_mode_runtime_state = createSupportModeRuntimeState();
  private snapshot: SessionSnapshot;

  private computeSessionId(): string {
    return `session_${String(this.session_index).padStart(3, "0")}_r${this.run_sequence}`;
  }

  private get scenario(): ScenarioDefinition {
    return this.scenario_catalog_entry.definition;
  }

  private get runtime_profile_id(): ScenarioRuntimeProfileId {
    return this.scenario_catalog_entry.runtime_profile_id;
  }

  private get manual_control_schema(): ScenarioUiControlSchema {
    return this.scenario_catalog_entry.ui_control_schema;
  }

  private currentScenarioCaptureKey(): string {
    return `${this.scenario.scenario_id}@${this.scenario.version}`;
  }

  private currentScenarioCaptureBucket(): SessionEvaluationCaptureBucket | undefined {
    return this.evaluation_capture[this.currentScenarioCaptureKey()];
  }

  constructor(options: SessionStoreOptions = {}) {
    this.scenario_catalog_entry = options.scenario
      ? resolveScenarioCatalogEntry(options.scenario.scenario_id)
      : resolveScenarioCatalogEntry(options.scenario_id ?? getDefaultScenarioCatalogEntry().definition.scenario_id);
    this.session_index = options.session_index ?? 1;
    this.session_id = this.computeSessionId();
    this.tick_duration_sec = options.tick_duration_sec ?? 5;
    this.session_mode = options.session_mode ?? "adaptive";
    this.logger = new SessionLogger(this.session_id, this.scenario.scenario_id);
    this.scenario_runtime_state = createScenarioRuntimeState();
    this.alarm_runtime_state = createAlarmRuntimeState();
    this.reasoning_runtime_state = createReasoningRuntimeState();
    this.human_monitoring_runtime_state = createHumanMonitoringRuntimeState();
    this.plant_internal_state = createPlantTwinInternalState(this.scenario.initial_plant_state);
    this.snapshot = this.createInitialSnapshot();
  }

  private buildPhase2State(params: {
    sim_time_sec: number;
    plant_state: PlantTick["plant_state"];
    alarm_set: SessionSnapshot["alarm_set"];
    allowed_action_ids: string[];
  }): {
    alarm_intelligence: AlarmIntelligenceSnapshot;
    reasoning_snapshot: ReasoningSnapshot;
    first_response_lane: FirstResponseLane;
    current_phase: SessionSnapshot["current_phase"];
  } {
    const current_phase = getActivePhase(this.scenario, this.scenario_runtime_state);
    const runtime_profile_id = this.runtime_profile_id;
    const alarm_intelligence = buildAlarmIntelligence(params.alarm_set, runtime_profile_id);
    const reasoning_result = buildReasoningSnapshot({
      plant_state: params.plant_state,
      alarm_set: params.alarm_set,
      alarm_intelligence,
      previous_state: this.reasoning_runtime_state,
      expected_root_cause_hypothesis_id: this.scenario.expected_root_cause_hypothesis_id,
      runtime_profile_id,
    });
    this.reasoning_runtime_state = reasoning_result.runtime_state;

    const first_response_lane = buildFirstResponseLane({
      sim_time_sec: params.sim_time_sec,
      plant_state: params.plant_state,
      alarm_set: params.alarm_set,
      reasoning_snapshot: reasoning_result.reasoning_snapshot,
      allowed_action_ids: params.allowed_action_ids,
      runtime_profile_id,
    });

    return {
      alarm_intelligence,
      reasoning_snapshot: reasoning_result.reasoning_snapshot,
      first_response_lane,
      current_phase,
    };
  }

  private buildPhase3State(params: {
    sim_time_sec: number;
    tick_index: number;
    plant_state: PlantTick["plant_state"];
    alarm_set: SessionSnapshot["alarm_set"];
    allowed_action_ids: string[];
    executed_actions: ExecutedAction[];
    previous_snapshot?: SessionSnapshot;
  }): {
    alarm_intelligence: AlarmIntelligenceSnapshot;
    reasoning_snapshot: ReasoningSnapshot;
    first_response_lane: FirstResponseLane;
    human_monitoring: HumanMonitoringSnapshot;
    operator_state: OperatorStateSnapshot;
    combined_risk: CombinedRiskSnapshot;
    support_mode: SupportMode;
    support_policy: SupportPolicySnapshot;
    support_refinement: SupportRefinementSnapshot;
    human_monitoring_runtime_state: HumanMonitoringRuntimeState;
    support_mode_runtime_state: ReturnType<typeof createSupportModeRuntimeState>;
    lane_changed: boolean;
  } {
    const phase2_state = this.buildPhase2State({
      sim_time_sec: params.sim_time_sec,
      plant_state: params.plant_state,
      alarm_set: params.alarm_set,
      allowed_action_ids: params.allowed_action_ids,
    });

    const lane_changed = params.previous_snapshot
      ? laneSummaryKey(params.previous_snapshot.first_response_lane) !== laneSummaryKey(phase2_state.first_response_lane) ||
        params.previous_snapshot.reasoning_snapshot.dominant_hypothesis_id !==
          phase2_state.reasoning_snapshot.dominant_hypothesis_id
      : false;

    const human_monitoring_result = evaluateHumanMonitoring({
      sim_time_sec: params.sim_time_sec,
      tick_index: params.tick_index,
      tick_duration_sec: this.tick_duration_sec,
      plant_state: params.plant_state,
      alarm_set: params.alarm_set,
      alarm_intelligence: phase2_state.alarm_intelligence,
      reasoning_snapshot: phase2_state.reasoning_snapshot,
      executed_actions: params.executed_actions,
      lane_changed,
      runtime_state: this.human_monitoring_runtime_state,
    });
    const operator_state = buildOperatorStateSnapshot({
      human_monitoring: human_monitoring_result.snapshot,
    });
    const current_phase_elapsed_time_sec = getPhaseElapsedTimeSec(
      params.sim_time_sec,
      this.scenario_runtime_state,
    );

    const combined_risk = buildCombinedRiskSnapshot({
      sim_time_sec: params.sim_time_sec,
      plant_state: params.plant_state,
      alarm_set: params.alarm_set,
      alarm_intelligence: phase2_state.alarm_intelligence,
      reasoning_snapshot: phase2_state.reasoning_snapshot,
      human_monitoring: human_monitoring_result.snapshot,
      operator_state,
      first_response_lane: phase2_state.first_response_lane,
      current_phase: phase2_state.current_phase,
      current_phase_elapsed_time_sec,
      scenario_expected_duration_sec: this.scenario.expected_duration_sec,
      previous_combined_risk: params.previous_snapshot?.combined_risk,
    });
    const support_mode_result =
      this.session_mode === "baseline"
        ? buildBaselineMonitoringSupport({
            alarm_set: params.alarm_set,
            operator_state,
          })
        : resolveSupportModePolicy({
            plant_state: params.plant_state,
            alarm_set: params.alarm_set,
            alarm_intelligence: phase2_state.alarm_intelligence,
            reasoning_snapshot: phase2_state.reasoning_snapshot,
            operator_state,
            combined_risk,
            previous_mode: params.previous_snapshot?.support_mode ?? this.support_mode_runtime_state.current_mode,
            runtime_state: this.support_mode_runtime_state,
          });
    const support_refinement_result = buildSupportRefinement({
      first_response_lane: phase2_state.first_response_lane,
      reasoning_snapshot: phase2_state.reasoning_snapshot,
      operator_state,
      combined_risk,
      support_mode: support_mode_result.support_mode,
    });

    return {
      ...phase2_state,
      first_response_lane: support_refinement_result.first_response_lane,
      human_monitoring: human_monitoring_result.snapshot,
      operator_state,
      combined_risk,
      support_mode: support_mode_result.support_mode,
      support_policy: support_mode_result.support_policy,
      support_refinement: support_refinement_result.support_refinement,
      human_monitoring_runtime_state: human_monitoring_result.runtime_state,
      support_mode_runtime_state: support_mode_result.runtime_state,
      lane_changed,
    };
  }

  private createInitialSnapshot(): SessionSnapshot {
    const initial_phase = getActivePhase(this.scenario, this.scenario_runtime_state);
    const initial_tick: PlantTick = {
      tick_id: "tick_0000",
      session_id: this.session_id,
      scenario_id: this.scenario.scenario_id,
      session_mode: this.session_mode,
      sim_time_sec: 0,
      phase_id: initial_phase.phase_id,
      plant_state: { ...this.scenario.initial_plant_state },
      derived_state: {
        alarm_load_count: Number(this.scenario.initial_plant_state.alarm_load_count),
        active_alarm_cluster_count: Number(this.scenario.initial_plant_state.active_alarm_cluster_count),
      },
      source_event_ids: [],
    };

    const initial_alarm_eval = evaluateAlarmSet({
      scenario: this.scenario,
      session_id: this.session_id,
      tick_id: initial_tick.tick_id,
      scenario_id: this.scenario.scenario_id,
      plant_state: initial_tick.plant_state,
      executed_actions: [],
      current_phase_id: initial_phase.phase_id,
      phase_elapsed_time_sec: 0,
      previous_alarm_runtime_state: this.alarm_runtime_state,
    });
    this.alarm_runtime_state = initial_alarm_eval.alarm_runtime_state;

    const tick_with_alarm_counts: PlantTick = {
      ...initial_tick,
      plant_state: {
        ...initial_tick.plant_state,
        alarm_load_count: initial_alarm_eval.alarm_set.active_alarm_count,
        active_alarm_cluster_count: initial_alarm_eval.alarm_set.active_alarm_cluster_count,
      },
      derived_state: {
        alarm_load_count: initial_alarm_eval.alarm_set.active_alarm_count,
        active_alarm_cluster_count: initial_alarm_eval.alarm_set.active_alarm_cluster_count,
      },
    };
    const initial_alarm_intelligence = buildAlarmIntelligence(initial_alarm_eval.alarm_set, this.runtime_profile_id);

    const session_started_event = this.logger.append({
      sim_time_sec: 0,
      event_type: "session_started",
      source_module: "scenario_engine",
      phase_id: initial_phase.phase_id,
      payload: {
        session_mode: this.session_mode,
        scenario_id: this.scenario.scenario_id,
        expected_outcome_window_sec: this.scenario.expected_duration_sec,
      },
      trace_refs: [{ ref_type: "phase_id", ref_value: initial_phase.phase_id }],
    });

    const phase_changed_event = this.logger.append({
      sim_time_sec: 0,
      event_type: "phase_changed",
      source_module: "scenario_engine",
      phase_id: initial_phase.phase_id,
      payload: {
        phase_id: initial_phase.phase_id,
        from_phase_id: "session_bootstrap",
        to_phase_id: initial_phase.phase_id,
      },
      trace_refs: [{ ref_type: "phase_id", ref_value: initial_phase.phase_id }],
    });

    const plant_tick_event = this.logger.append({
      sim_time_sec: 0,
      event_type: "plant_tick_recorded",
      source_module: "plant_twin",
      phase_id: initial_phase.phase_id,
      payload: {
        tick_id: tick_with_alarm_counts.tick_id,
        phase_id: initial_phase.phase_id,
        plant_state: tick_with_alarm_counts.plant_state,
        derived_state: tick_with_alarm_counts.derived_state,
      },
      trace_refs: [{ ref_type: "tick_id", ref_value: tick_with_alarm_counts.tick_id }],
    });

    const alarm_event = this.logger.append({
      sim_time_sec: 0,
      event_type: "alarm_set_updated",
      source_module: "alarm_intelligence",
      phase_id: initial_phase.phase_id,
      payload: {
        active_alarm_count: initial_alarm_eval.alarm_set.active_alarm_count,
        active_alarm_cluster_count: initial_alarm_eval.alarm_set.active_alarm_cluster_count,
        highest_priority_active: initial_alarm_eval.alarm_set.highest_priority_active,
        active_alarm_ids: initial_alarm_eval.alarm_set.active_alarm_ids,
        visible_alarm_card_count: initial_alarm_intelligence.visible_alarm_card_count,
        compression_ratio: initial_alarm_intelligence.compression_ratio,
        cluster_summaries: summarizeAlarmClusters(initial_alarm_intelligence),
      },
      trace_refs: [{ ref_type: "tick_id", ref_value: tick_with_alarm_counts.tick_id }],
    });

    const phase3_state = this.buildPhase3State({
      sim_time_sec: 0,
      tick_index: 0,
      plant_state: tick_with_alarm_counts.plant_state,
      alarm_set: initial_alarm_eval.alarm_set,
      allowed_action_ids: initial_phase.allowed_action_ids ?? [],
      executed_actions: [],
    });
    this.human_monitoring_runtime_state = phase3_state.human_monitoring_runtime_state;
    this.support_mode_runtime_state = phase3_state.support_mode_runtime_state;
    const human_monitoring_event = this.logger.append({
      sim_time_sec: 0,
      event_type: "human_monitoring_snapshot_recorded",
      source_module: "human_monitoring",
      phase_id: initial_phase.phase_id,
      payload: summarizeHumanMonitoring(phase3_state.human_monitoring),
      trace_refs: [{ ref_type: "tick_id", ref_value: tick_with_alarm_counts.tick_id }],
    });
    const operator_state_event = this.logger.append({
      sim_time_sec: 0,
      event_type: "operator_state_snapshot_recorded",
      source_module: "reasoning_layer",
      phase_id: initial_phase.phase_id,
      payload: {
        workload_index: phase3_state.operator_state.workload_index,
        attention_stability_index: phase3_state.operator_state.attention_stability_index,
        signal_confidence: phase3_state.operator_state.signal_confidence,
        degraded_mode_active: phase3_state.operator_state.degraded_mode_active,
        degraded_mode_reason: phase3_state.operator_state.degraded_mode_reason,
        observation_window_ticks: phase3_state.operator_state.observation_window_ticks,
      },
      trace_refs: [{ ref_type: "tick_id", ref_value: tick_with_alarm_counts.tick_id }],
    });
    const reasoning_event = this.logger.append({
      sim_time_sec: 0,
      event_type: "reasoning_snapshot_published",
      source_module: "reasoning_layer",
      phase_id: initial_phase.phase_id,
      payload: {
        top_hypothesis_id: phase3_state.reasoning_snapshot.dominant_hypothesis_id,
        ranked_hypothesis_ids: phase3_state.reasoning_snapshot.ranked_hypotheses.map((hypothesis) => hypothesis.hypothesis_id),
        confidence_band: phase3_state.reasoning_snapshot.ranked_hypotheses[0]?.confidence_band ?? "low",
        stable_for_ticks: phase3_state.reasoning_snapshot.stable_for_ticks,
        changed_since_last_tick: phase3_state.reasoning_snapshot.changed_since_last_tick,
        dominant_summary: phase3_state.reasoning_snapshot.dominant_summary,
        expected_root_cause_aligned: phase3_state.reasoning_snapshot.expected_root_cause_aligned,
        lane_item_ids: phase3_state.first_response_lane.items.map((item) => item.item_id),
        lane_items: summarizeLaneItems(phase3_state.first_response_lane),
        risk_model_id: phase3_state.combined_risk.risk_model_id,
        combined_risk_score: phase3_state.combined_risk.combined_risk_score,
        combined_risk_band: phase3_state.combined_risk.combined_risk_band,
        plant_urgency_index: phase3_state.combined_risk.plant_urgency_index,
        human_pressure_index: phase3_state.combined_risk.human_pressure_index,
        fusion_confidence: phase3_state.combined_risk.fusion_confidence,
        human_influence_scale: phase3_state.combined_risk.human_influence_scale,
        top_contributing_factors: phase3_state.combined_risk.top_contributing_factors,
        recommended_assistance_mode: phase3_state.combined_risk.recommended_assistance_mode,
        recommended_assistance_reason: phase3_state.combined_risk.recommended_assistance_reason,
        confidence_caveat: phase3_state.combined_risk.confidence_caveat,
        why_risk_is_current: phase3_state.combined_risk.why_risk_is_current,
        what_changed: phase3_state.combined_risk.what_changed,
        factor_breakdown: summarizeRiskFactors(phase3_state.combined_risk),
        support_mode: phase3_state.support_mode,
        ...summarizeSupportRefinement(phase3_state.support_refinement),
        ...summarizeSupportPolicy(phase3_state.support_policy),
      },
      trace_refs: [{ ref_type: "tick_id", ref_value: tick_with_alarm_counts.tick_id }],
    });

    const alarm_history = this.mergeAlarmHistory([], initial_alarm_eval.alarm_set.active_alarm_ids, [], 0);

    return {
      session_id: this.session_id,
      session_mode: this.session_mode,
      support_mode: phase3_state.support_mode,
      scenario: this.scenario,
      scenario_catalog: listScenarioCatalogEntries().map((entry) => ({
        scenario_id: entry.definition.scenario_id,
        version: entry.definition.version,
        title: entry.definition.title,
        summary: entry.definition.summary,
        runtime_profile_id: entry.runtime_profile_id,
      })),
      runtime_profile_id: this.runtime_profile_id,
      manual_control_schema: this.manual_control_schema,
      current_phase: initial_phase,
      sim_time_sec: 0,
      tick_index: 0,
      plant_tick: {
        ...tick_with_alarm_counts,
        source_event_ids: [
          session_started_event.event_id,
          phase_changed_event.event_id,
          plant_tick_event.event_id,
          alarm_event.event_id,
          human_monitoring_event.event_id,
          operator_state_event.event_id,
          reasoning_event.event_id,
        ],
      },
      alarm_set: initial_alarm_eval.alarm_set,
      alarm_intelligence: phase3_state.alarm_intelligence,
      reasoning_snapshot: phase3_state.reasoning_snapshot,
      human_monitoring: phase3_state.human_monitoring,
      operator_state: phase3_state.operator_state,
      combined_risk: phase3_state.combined_risk,
      first_response_lane: phase3_state.first_response_lane,
      support_refinement: phase3_state.support_refinement,
      support_policy: phase3_state.support_policy,
      alarm_history,
      events: this.logger.list(),
      executed_actions: [],
      last_validation_result: undefined,
      pending_action_confirmation: undefined,
      pending_supervisor_override: undefined,
      validation_demo_state: createInitialValidationDemoState(),
      kpi_summary: undefined,
      completed_review: undefined,
      evaluation_capture: { ...this.evaluation_capture },
      logging_active: true,
      validation_status_available: true,
    };
  }

  private publishMonitoringOnlySnapshot(): void {
    const human_monitoring_result = evaluateHumanMonitoring({
      sim_time_sec: this.snapshot.sim_time_sec,
      tick_index: this.snapshot.tick_index,
      tick_duration_sec: this.tick_duration_sec,
      plant_state: this.snapshot.plant_tick.plant_state,
      alarm_set: this.snapshot.alarm_set,
      alarm_intelligence: this.snapshot.alarm_intelligence,
      reasoning_snapshot: this.snapshot.reasoning_snapshot,
      executed_actions: this.snapshot.executed_actions,
      lane_changed: false,
      runtime_state: this.human_monitoring_runtime_state,
    });
    const operator_state = buildOperatorStateSnapshot({
      human_monitoring: human_monitoring_result.snapshot,
    });

    this.human_monitoring_runtime_state = human_monitoring_result.runtime_state;

    const human_monitoring_event = this.logger.append({
      sim_time_sec: this.snapshot.sim_time_sec,
      event_type: "human_monitoring_snapshot_recorded",
      source_module: "human_monitoring",
      phase_id: this.snapshot.current_phase.phase_id,
      payload: summarizeHumanMonitoring(human_monitoring_result.snapshot),
      trace_refs: [{ ref_type: "tick_id", ref_value: this.snapshot.plant_tick.tick_id }],
    });
    const operator_state_event = this.logger.append({
      sim_time_sec: this.snapshot.sim_time_sec,
      event_type: "operator_state_snapshot_recorded",
      source_module: "human_monitoring",
      phase_id: this.snapshot.current_phase.phase_id,
      payload: {
        workload_index: operator_state.workload_index,
        attention_stability_index: operator_state.attention_stability_index,
        signal_confidence: operator_state.signal_confidence,
        degraded_mode_active: operator_state.degraded_mode_active,
        degraded_mode_reason: operator_state.degraded_mode_reason,
        observation_window_ticks: operator_state.observation_window_ticks,
      },
      trace_refs: [{ ref_type: "tick_id", ref_value: this.snapshot.plant_tick.tick_id }],
    });

    this.snapshot = {
      ...this.snapshot,
      human_monitoring: human_monitoring_result.snapshot,
      operator_state,
      events: this.logger.list(),
      plant_tick: {
        ...this.snapshot.plant_tick,
        source_event_ids: [
          ...this.snapshot.plant_tick.source_event_ids,
          human_monitoring_event.event_id,
          operator_state_event.event_id,
        ],
      },
    };
    this.emit();
  }

  private evaluateScenarioOutcome(params: {
    sim_time_sec: number;
    plant_state: PlantTick["plant_state"];
    alarm_set: SessionSnapshot["alarm_set"];
    reasoning_snapshot: ReasoningSnapshot;
    executed_actions: ExecutedAction[];
  }): { outcome?: ScenarioOutcome; diagnosis_ready: boolean } {
    const outcome_context = {
      plant_state: params.plant_state,
      executed_actions: params.executed_actions,
      elapsed_time_sec: params.sim_time_sec,
    };

    if (this.runtime_profile_id === "main_steam_isolation_upset") {
      const diagnosis_ready =
        ["hyp_main_steam_isolation_upset", "hyp_alternate_heat_sink_gap"].includes(
          params.reasoning_snapshot.dominant_hypothesis_id ?? "",
        ) && params.reasoning_snapshot.stable_for_ticks >= 2;
      const stabilizedRecoveryPicture =
        Number(params.plant_state.isolation_condenser_flow_pct) >= 60 &&
        Number(params.plant_state.vessel_pressure_mpa) <= 7.24 &&
        Number(params.plant_state.containment_pressure_kpa) <= 106 &&
        Boolean(params.plant_state.offsite_power_available);

      if (evaluateCondition(this.scenario.failure_condition, outcome_context)) {
        return {
          diagnosis_ready,
          outcome: {
            outcome: "failure",
            stabilized: false,
            message:
              "The main-steam isolation upset crossed a bounded pressure or containment consequence marker before alternate heat-sink recovery stabilized.",
            sim_time_sec: params.sim_time_sec,
          },
        };
      }

      if (evaluateCondition(this.scenario.success_condition, outcome_context) && diagnosis_ready && stabilizedRecoveryPicture) {
        return {
          diagnosis_ready,
          outcome: {
            outcome: "success",
            stabilized: true,
            message:
              "The steam-isolation picture stabilized with normal electrical availability preserved, IC recovery established, and pressure consequences flattened.",
            sim_time_sec: params.sim_time_sec,
          },
        };
      }

      if (evaluateCondition(this.scenario.timeout_condition, outcome_context)) {
        return {
          diagnosis_ready,
          outcome: {
            outcome: "timeout",
            stabilized: false,
            message: diagnosis_ready
              ? "The response window expired before the bounded alternate heat-sink recovery path fully flattened pressure and containment."
              : "The response window expired before the main-steam isolation picture stabilized into a successful recovery path.",
            sim_time_sec: params.sim_time_sec,
          },
        };
      }

      return { diagnosis_ready };
    }

    if (this.runtime_profile_id === "loss_of_offsite_power_sbo") {
      const diagnosis_ready =
        ["hyp_loss_of_offsite_power", "hyp_decay_heat_removal_gap"].includes(
          params.reasoning_snapshot.dominant_hypothesis_id ?? "",
        ) && params.reasoning_snapshot.stable_for_ticks >= 2;
      const stabilizedRecoveryPicture =
        Number(params.plant_state.isolation_condenser_flow_pct) >= 60 &&
        Number(params.plant_state.vessel_pressure_mpa) <= 7.2 &&
        Number(params.plant_state.containment_pressure_kpa) <= 106 &&
        Number(params.plant_state.dc_bus_soc_pct) >= 40;

      if (evaluateCondition(this.scenario.failure_condition, outcome_context)) {
        return {
          diagnosis_ready,
          outcome: {
            outcome: "failure",
            stabilized: false,
            message:
              "The LoOP response window crossed a bounded blackout or pressure-consequence marker before decay-heat removal stabilized.",
            sim_time_sec: params.sim_time_sec,
          },
        };
      }

      if (evaluateCondition(this.scenario.success_condition, outcome_context) && diagnosis_ready && stabilizedRecoveryPicture) {
        return {
          diagnosis_ready,
          outcome: {
            outcome: "success",
            stabilized: true,
            message:
              "The LoOP picture stabilized into bounded decay-heat removal with IC flow established, pressure recovering, and DC margin preserved.",
            sim_time_sec: params.sim_time_sec,
          },
        };
      }

      if (evaluateCondition(this.scenario.timeout_condition, outcome_context)) {
        return {
          diagnosis_ready,
          outcome: {
            outcome: "timeout",
            stabilized: false,
            message: diagnosis_ready
              ? "The response window expired before the bounded IC recovery path fully stabilized pressure and battery margin."
              : "The response window expired before the LoOP and decay-heat-removal picture stabilized into a successful recovery path.",
            sim_time_sec: params.sim_time_sec,
          },
        };
      }

      return { diagnosis_ready };
    }

    const diagnosis_ready =
      params.reasoning_snapshot.expected_root_cause_aligned && params.reasoning_snapshot.stable_for_ticks >= 2;
    const stabilized_alarm_picture =
      !criticalEscalationActive(params.alarm_set.active_alarm_ids) && params.alarm_set.active_alarm_count <= 2;

    if (evaluateCondition(this.scenario.failure_condition, outcome_context)) {
      return {
        diagnosis_ready,
        outcome: {
          outcome: "failure",
          stabilized: false,
          message: "The plant crossed a hard escalation marker before the Phase 2 response path could stabilize it.",
          sim_time_sec: params.sim_time_sec,
        },
      };
    }

    if (evaluateCondition(this.scenario.success_condition, outcome_context) && diagnosis_ready && stabilized_alarm_picture) {
      return {
        diagnosis_ready,
        outcome: {
          outcome: "success",
          stabilized: true,
          message: "The feedwater-side diagnosis converged, the bounded first-response path was relevant, and the plant stabilized.",
          sim_time_sec: params.sim_time_sec,
        },
      };
    }

    if (evaluateCondition(this.scenario.timeout_condition, outcome_context)) {
      return {
        diagnosis_ready,
        outcome: {
          outcome: "timeout",
          stabilized: false,
          message: diagnosis_ready
            ? "The response window expired before alarms and plant state fully stabilized."
            : "The response window expired before the dominant hypothesis stabilized into a successful recovery path.",
          sim_time_sec: params.sim_time_sec,
        },
      };
    }

    return { diagnosis_ready };
  }

  private mergeAlarmHistory(
    previous_history: LoggedAlarmState[],
    newly_raised_alarm_ids: string[],
    newly_cleared_alarm_ids: string[],
    sim_time_sec: number,
  ): LoggedAlarmState[] {
    const next_history = previous_history.map((entry) =>
      newly_cleared_alarm_ids.includes(entry.alarm_id) && entry.cleared_at_sec === undefined
        ? { ...entry, active: false, cleared_at_sec: sim_time_sec }
        : entry,
    );

    for (const alarm_id of newly_raised_alarm_ids) {
      const existing_entry = next_history.find((entry) => entry.alarm_id === alarm_id);
      if (existing_entry) {
        existing_entry.active = true;
        existing_entry.cleared_at_sec = undefined;
        continue;
      }

      const alarm = this.snapshot?.alarm_set.active_alarms.find((entry) => entry.alarm_id === alarm_id);
      const dictionary_entry = alarmDictionaryById[alarm_id];
      const template = alarm ?? {
        alarm_id,
        title: dictionary_entry?.title ?? alarm_id,
        priority: dictionary_entry?.priority ?? ("P3" as const),
        subsystem_tag: dictionary_entry?.subsystem_tag ?? "alarm_system",
        active: true,
        visibility_rule: dictionary_entry?.visibility_rule ?? ("standard_visible" as const),
        group_hint: dictionary_entry?.group_hint ?? "runtime",
      };
      this.activation_sequence += 1;
      next_history.push({
        ...template,
        active: true,
        activated_at_sec: sim_time_sec,
        activation_order: this.activation_sequence,
      });
    }

    return [...next_history].sort((left, right) => left.activation_order - right.activation_order);
  }

  private emit(): void {
    for (const listener of this.listeners) {
      listener();
    }
  }

  subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  getSnapshot(): SessionSnapshot {
    return this.snapshot;
  }

  private recordUiInteraction(params: RecordUiInteractionParams): void {
    this.human_monitoring_runtime_state = recordInteractionTelemetry({
      runtime_state: this.human_monitoring_runtime_state,
      sim_time_sec: this.snapshot.sim_time_sec,
      tick_index: this.snapshot.tick_index,
      ...params,
    });
  }

  setInteractionTelemetrySuppressed(suppressed: boolean): void {
    this.human_monitoring_runtime_state = setInteractionTelemetrySuppressed(
      this.human_monitoring_runtime_state,
      suppressed,
    );
  }

  recordInteractionTelemetry(params: RecordUiInteractionParams): void {
    if (this.snapshot.outcome) {
      return;
    }

    this.recordUiInteraction(params);
  }

  setCameraCvIntent(enabled: boolean): void {
    if (this.snapshot.outcome) {
      return;
    }

    const result = setCameraCvIntent({
      runtime_state: this.human_monitoring_runtime_state,
      enabled,
    });
    this.human_monitoring_runtime_state = result.runtime_state;
    if (result.refresh_recommended) {
      this.publishMonitoringOnlySnapshot();
    }
  }

  updateCameraCvLifecycle(params: UpdateCameraCvLifecycleParams): void {
    if (this.snapshot.outcome) {
      return;
    }

    const result = updateCameraCvLifecycle({
      runtime_state: this.human_monitoring_runtime_state,
      ...params,
    });
    this.human_monitoring_runtime_state = result.runtime_state;
    if (result.refresh_recommended) {
      this.publishMonitoringOnlySnapshot();
    }
  }

  recordCameraCvObservation(params: RecordCameraCvObservationParams): void {
    if (this.snapshot.outcome) {
      return;
    }

    const result = recordCameraCvObservation({
      runtime_state: this.human_monitoring_runtime_state,
      sim_time_sec: this.snapshot.sim_time_sec,
      tick_index: this.snapshot.tick_index,
      ...params,
    });
    this.human_monitoring_runtime_state = result.runtime_state;
    if (result.refresh_recommended) {
      this.publishMonitoringOnlySnapshot();
    }
  }

  setSessionMode(mode: SessionMode): void {
    this.reset({ session_mode: mode });
  }

  setScenario(scenario_id: string): void {
    this.reset({ scenario_id });
  }

  reset(next_run?: { session_mode?: SessionMode; scenario_id?: string }): void {
    this.session_mode = next_run?.session_mode ?? this.session_mode;
    this.scenario_catalog_entry = resolveScenarioCatalogEntry(next_run?.scenario_id ?? this.scenario.scenario_id);
    this.run_sequence += 1;
    this.session_id = this.computeSessionId();
    this.logger = new SessionLogger(this.session_id, this.scenario.scenario_id);
    this.action_sequence = 0;
    this.validation_sequence = 0;
    this.activation_sequence = 0;
    this.scenario_runtime_state = createScenarioRuntimeState();
    this.alarm_runtime_state = createAlarmRuntimeState();
    this.reasoning_runtime_state = createReasoningRuntimeState();
    this.human_monitoring_runtime_state = createHumanMonitoringRuntimeState();
    this.plant_internal_state = createPlantTwinInternalState(this.scenario.initial_plant_state);
    this.support_mode_runtime_state = createSupportModeRuntimeState();
    this.snapshot = this.createInitialSnapshot();
    this.emit();
  }

  private markValidationDemoState(
    marker_kind: ValidationDemoMarkerKind,
    action_request_id?: string,
  ): ValidationDemoState {
    const current_marker = this.snapshot.validation_demo_state[marker_kind];
    if (current_marker.demonstrated) {
      return this.snapshot.validation_demo_state;
    }

    this.logger.append({
      sim_time_sec: this.snapshot.sim_time_sec,
      event_type: "validation_demo_marker_recorded",
      source_module: "action_validator",
      phase_id: this.snapshot.current_phase.phase_id,
      payload: {
        marker_kind,
        demonstrated: true,
        demo_research_only: true,
      },
      trace_refs: [
        ...(action_request_id ? [{ ref_type: "action_id" as const, ref_value: action_request_id }] : []),
        { ref_type: "tick_id", ref_value: this.snapshot.plant_tick.tick_id },
      ],
    });

    return {
      ...this.snapshot.validation_demo_state,
      [marker_kind]: {
        ...current_marker,
        demonstrated: true,
        first_demonstrated_at_sim_time_sec: this.snapshot.sim_time_sec,
      },
    };
  }

  private applyAcceptedAction(
    action_request: ActionRequest,
    validation_result: ActionValidationResult,
    options?: {
      pending_action_confirmation?: PendingActionConfirmation;
      override_applied?: boolean;
      validation_demo_state?: ValidationDemoState;
    },
  ): boolean {
    const action_result = applyOperatorAction(this.snapshot.plant_tick.plant_state, this.plant_internal_state, action_request);
    this.plant_internal_state = action_result.internal_state;

    this.logger.append({
      sim_time_sec: this.snapshot.sim_time_sec,
      event_type: "operator_action_applied",
      source_module: "plant_twin",
      phase_id: this.snapshot.current_phase.phase_id,
      payload: {
        action_id: action_request.action_id,
        action_class: action_result.action_class,
        correctness_label: action_result.correctness_label,
        resulting_state_change: action_result.resulting_state_change,
        ...(options?.override_applied ? { override_applied: true } : {}),
      },
      trace_refs: [{ ref_type: "action_id", ref_value: action_request.action_request_id }],
    });

    const executed_action: ExecutedAction = {
      ...action_request,
      applied: true,
    };

    this.snapshot = {
      ...this.snapshot,
      executed_actions: [...this.snapshot.executed_actions, executed_action],
      last_validation_result: validation_result,
      pending_action_confirmation: options?.pending_action_confirmation,
      pending_supervisor_override: undefined,
      validation_demo_state: options?.validation_demo_state ?? this.snapshot.validation_demo_state,
      events: this.logger.list(),
    };
    this.emit();
    return true;
  }

  private publishValidationResult(action_request: ActionRequest, validation_result: ActionValidationResult): void {
    this.logger.append({
      sim_time_sec: this.snapshot.sim_time_sec,
      event_type: "action_validated",
      source_module: "action_validator",
      phase_id: this.snapshot.current_phase.phase_id,
      payload: {
        action_id: action_request.action_id,
        ...summarizeValidationResult(validation_result),
      },
      trace_refs: [
        { ref_type: "action_id", ref_value: action_request.action_request_id },
        { ref_type: "tick_id", ref_value: this.snapshot.plant_tick.tick_id },
      ],
    });
  }

  confirmPendingAction(): boolean {
    if (this.snapshot.outcome || !this.snapshot.pending_action_confirmation) {
      return false;
    }

    const pending_confirmation = this.snapshot.pending_action_confirmation;
    this.recordUiInteraction({
      event_kind: "action_confirmation",
      ui_region: pending_confirmation.action_request.ui_region,
      target_id: pending_confirmation.action_request.action_id,
      requested_value:
        typeof pending_confirmation.action_request.requested_value === "number"
          ? pending_confirmation.action_request.requested_value
          : undefined,
      detail: "Operator confirmed a soft-warning action.",
    });
    this.logger.append({
      sim_time_sec: this.snapshot.sim_time_sec,
      event_type: "action_confirmation_recorded",
      source_module: "action_validator",
      phase_id: this.snapshot.current_phase.phase_id,
      payload: {
        action_request_id: pending_confirmation.action_request.action_request_id,
        action_id: pending_confirmation.action_request.action_id,
        original_outcome: pending_confirmation.validation_result.outcome,
        confirmation_status: "confirmed",
        reason_code: pending_confirmation.validation_result.reason_code,
      },
      trace_refs: [{ ref_type: "action_id", ref_value: pending_confirmation.action_request.action_request_id }],
    });

    return this.applyAcceptedAction(
      pending_confirmation.action_request,
      pending_confirmation.validation_result,
      {
        pending_action_confirmation: undefined,
      },
    );
  }

  dismissPendingActionConfirmation(): void {
    if (!this.snapshot.pending_action_confirmation) {
      return;
    }

    this.recordUiInteraction({
      event_kind: "action_confirmation_dismissed",
      ui_region: this.snapshot.pending_action_confirmation.action_request.ui_region,
      target_id: this.snapshot.pending_action_confirmation.action_request.action_id,
      detail: "Operator dismissed a pending soft-warning confirmation.",
    });
    this.snapshot = {
      ...this.snapshot,
      pending_action_confirmation: undefined,
    };
    this.emit();
  }

  requestSupervisorOverrideReview(request_note?: string): boolean {
    if (
      this.snapshot.outcome ||
      this.snapshot.session_mode !== "adaptive" ||
      this.snapshot.pending_action_confirmation ||
      !this.snapshot.pending_supervisor_override ||
      this.snapshot.pending_supervisor_override.request_status !== "available" ||
      !this.snapshot.pending_supervisor_override.validation_result.override_allowed
    ) {
      return false;
    }

    const trimmed_note = request_note?.trim() || undefined;
    const next_pending: PendingSupervisorOverride = {
      ...this.snapshot.pending_supervisor_override,
      request_status: "requested",
      requested_at_sim_time_sec: this.snapshot.sim_time_sec,
      request_note: trimmed_note,
    };
    this.recordUiInteraction({
      event_kind: "supervisor_override_request",
      ui_region: "review_workspace",
      workspace: "review",
      target_id: next_pending.action_request.action_id,
      detail: trimmed_note ?? "Operator requested bounded supervisor review.",
    });

    this.logger.append({
      sim_time_sec: this.snapshot.sim_time_sec,
      event_type: "supervisor_override_requested",
      source_module: "hmi",
      phase_id: this.snapshot.current_phase.phase_id,
      payload: {
        action_request_id: next_pending.action_request.action_request_id,
        action_id: next_pending.action_request.action_id,
        actor_role: "operator",
        request_status: next_pending.request_status,
        request_note: trimmed_note,
        reason_code: next_pending.validation_result.reason_code,
        demo_research_only: true,
      },
      trace_refs: [{ ref_type: "action_id", ref_value: next_pending.action_request.action_request_id }],
    });

    this.snapshot = {
      ...this.snapshot,
      pending_supervisor_override: next_pending,
      events: this.logger.list(),
    };
    this.emit();
    return true;
  }

  approvePendingSupervisorOverride(supervisor_note?: string): boolean {
    if (
      this.snapshot.outcome ||
      this.snapshot.session_mode !== "adaptive" ||
      this.snapshot.pending_action_confirmation ||
      !this.snapshot.pending_supervisor_override ||
      this.snapshot.pending_supervisor_override.request_status !== "requested"
    ) {
      return false;
    }

    const pending_override = this.snapshot.pending_supervisor_override;
    const trimmed_note = supervisor_note?.trim() || undefined;
    this.recordUiInteraction({
      event_kind: "supervisor_override_approved",
      ui_region: "review_workspace",
      workspace: "review",
      target_id: pending_override.action_request.action_id,
      detail: trimmed_note ?? "Supervisor approved one bounded override.",
    });

    this.logger.append({
      sim_time_sec: this.snapshot.sim_time_sec,
      event_type: "supervisor_override_decided",
      source_module: "action_validator",
      phase_id: this.snapshot.current_phase.phase_id,
      payload: {
        action_request_id: pending_override.action_request.action_request_id,
        action_id: pending_override.action_request.action_id,
        actor_role: "shift_supervisor",
        decision: "approved",
        supervisor_note: trimmed_note,
        reason_code: pending_override.validation_result.reason_code,
        demo_research_only: true,
      },
      trace_refs: [{ ref_type: "action_id", ref_value: pending_override.action_request.action_request_id }],
    });
    this.logger.append({
      sim_time_sec: this.snapshot.sim_time_sec,
      event_type: "supervisor_override_action_applied",
      source_module: "action_validator",
      phase_id: this.snapshot.current_phase.phase_id,
      payload: {
        action_request_id: pending_override.action_request.action_request_id,
        action_id: pending_override.action_request.action_id,
        actor_role: "shift_supervisor",
        supervisor_note: trimmed_note,
        reason_code: pending_override.validation_result.reason_code,
        demo_research_only: true,
      },
      trace_refs: [{ ref_type: "action_id", ref_value: pending_override.action_request.action_request_id }],
    });

    const validation_demo_state = this.markValidationDemoState(
      "supervisor_override_demonstrated",
      pending_override.action_request.action_request_id,
    );

    return this.applyAcceptedAction(pending_override.action_request, pending_override.validation_result, {
      override_applied: true,
      validation_demo_state,
    });
  }

  denyPendingSupervisorOverride(supervisor_note?: string): boolean {
    if (
      this.snapshot.outcome ||
      !this.snapshot.pending_supervisor_override ||
      this.snapshot.pending_supervisor_override.request_status !== "requested"
    ) {
      return false;
    }

    const pending_override = this.snapshot.pending_supervisor_override;
    const trimmed_note = supervisor_note?.trim() || undefined;
    this.recordUiInteraction({
      event_kind: "supervisor_override_denied",
      ui_region: "review_workspace",
      workspace: "review",
      target_id: pending_override.action_request.action_id,
      detail: trimmed_note ?? "Supervisor denied the bounded override request.",
    });

    this.logger.append({
      sim_time_sec: this.snapshot.sim_time_sec,
      event_type: "supervisor_override_decided",
      source_module: "action_validator",
      phase_id: this.snapshot.current_phase.phase_id,
      payload: {
        action_request_id: pending_override.action_request.action_request_id,
        action_id: pending_override.action_request.action_id,
        actor_role: "shift_supervisor",
        decision: "denied",
        supervisor_note: trimmed_note,
        reason_code: pending_override.validation_result.reason_code,
        demo_research_only: true,
      },
      trace_refs: [{ ref_type: "action_id", ref_value: pending_override.action_request.action_request_id }],
    });

    this.snapshot = {
      ...this.snapshot,
      pending_supervisor_override: undefined,
      events: this.logger.list(),
    };
    this.emit();
    return true;
  }

  requestAction(params: ActionRequestParams): boolean {
    if (
      this.snapshot.outcome ||
      this.snapshot.pending_action_confirmation ||
      this.snapshot.pending_supervisor_override?.request_status === "requested"
    ) {
      return false;
    }

    const allowed_action = this.scenario.allowed_operator_actions.find((action) => action.action_id === params.action_id);
    if (!allowed_action || !allowed_action.allowed_phase_ids.includes(this.snapshot.current_phase.phase_id)) {
      return false;
    }

    this.action_sequence += 1;
    const action_request: ActionRequest = {
      action_request_id: `actreq_${String(this.action_sequence).padStart(4, "0")}`,
      session_id: this.session_id,
      scenario_id: this.scenario.scenario_id,
      sim_time_sec: this.snapshot.sim_time_sec,
      actor_role: "operator",
      action_id: params.action_id,
      target_subsystem: allowed_action.target_variable_ids[0] ?? "alarm_system",
      requested_value: params.requested_value,
      ui_region: params.ui_region,
      reason_note: params.reason_note,
    };
    this.recordUiInteraction({
      event_kind: "action_request",
      ui_region: action_request.ui_region,
      target_id: action_request.action_id,
      requested_value:
        typeof action_request.requested_value === "number" ? action_request.requested_value : undefined,
      detail: action_request.reason_note,
    });

    this.logger.append({
      sim_time_sec: this.snapshot.sim_time_sec,
      event_type: "action_requested",
      source_module: "hmi",
      phase_id: this.snapshot.current_phase.phase_id,
      payload: {
        action_id: action_request.action_id,
        actor_role: action_request.actor_role,
        ui_region: action_request.ui_region,
        requested_value: action_request.requested_value,
      },
      trace_refs: [{ ref_type: "action_id", ref_value: action_request.action_request_id }],
    });

    this.validation_sequence += 1;
    const validation_result = validateAction({
      action_request,
      allowed_action,
      plant_state: this.snapshot.plant_tick.plant_state,
      alarm_set: this.snapshot.alarm_set,
      reasoning_snapshot: this.snapshot.reasoning_snapshot,
      combined_risk: this.snapshot.combined_risk,
      operator_state: this.snapshot.operator_state,
      session_mode: this.snapshot.session_mode,
      support_mode: this.snapshot.support_mode,
      first_response_lane: this.snapshot.first_response_lane,
      validation_sequence: this.validation_sequence,
      runtime_profile_id: this.runtime_profile_id,
    });
    this.publishValidationResult(action_request, validation_result);

    if (validation_result.outcome === "hard_prevent") {
      const validation_demo_state = this.markValidationDemoState("hard_prevent_demonstrated", action_request.action_request_id);
      this.snapshot = {
        ...this.snapshot,
        last_validation_result: validation_result,
        pending_action_confirmation: undefined,
        pending_supervisor_override: validation_result.override_allowed
          ? {
              action_request,
              validation_result,
              request_status: "available",
              blocked_at_sim_time_sec: this.snapshot.sim_time_sec,
              demo_research_only: true,
            }
          : undefined,
        validation_demo_state,
        events: this.logger.list(),
      };
      this.emit();
      return false;
    }

    if (validation_result.outcome === "soft_warning") {
      const validation_demo_state = this.markValidationDemoState("soft_warning_demonstrated", action_request.action_request_id);
      this.snapshot = {
        ...this.snapshot,
        last_validation_result: validation_result,
        pending_action_confirmation: {
          action_request,
          validation_result,
        },
        pending_supervisor_override: undefined,
        validation_demo_state,
        events: this.logger.list(),
      };
      this.emit();
      return false;
    }

    return this.applyAcceptedAction(action_request, validation_result, {
      pending_action_confirmation: undefined,
    });
  }

  advanceTick(): SessionSnapshot {
    if (this.snapshot.outcome) {
      return this.snapshot;
    }

    const sim_time_sec = this.snapshot.sim_time_sec + this.tick_duration_sec;
    const base_context = {
      plant_state: this.snapshot.plant_tick.plant_state,
      executed_actions: this.snapshot.executed_actions,
      elapsed_time_sec: sim_time_sec,
    };

    const phase_transition = advancePhaseIfNeeded(
      this.scenario,
      this.scenario_runtime_state,
      base_context,
      sim_time_sec,
    );
    this.scenario_runtime_state = phase_transition.runtime_state;
    let current_phase = getActivePhase(this.scenario, this.scenario_runtime_state);

    if (phase_transition.from_phase && phase_transition.to_phase) {
      this.logger.append({
        sim_time_sec,
        event_type: "phase_changed",
        source_module: "scenario_engine",
        phase_id: phase_transition.to_phase.phase_id,
        payload: {
          phase_id: phase_transition.to_phase.phase_id,
          from_phase_id: phase_transition.from_phase.phase_id,
          to_phase_id: phase_transition.to_phase.phase_id,
        },
        trace_refs: [{ ref_type: "phase_id", ref_value: phase_transition.to_phase.phase_id }],
      });
      current_phase = phase_transition.to_phase;
    }

    const injection_result = consumeTriggeredInjections(
      this.scenario,
      this.scenario_runtime_state,
      {
        ...base_context,
        elapsed_time_sec: getPhaseElapsedTimeSec(sim_time_sec, this.scenario_runtime_state),
      },
      sim_time_sec,
    );
    this.scenario_runtime_state = injection_result.runtime_state;

    const with_injections = applyScenarioEffects(
      this.snapshot.plant_tick.plant_state,
      this.plant_internal_state,
      injection_result.effects,
    );
    this.plant_internal_state = with_injections.internal_state;

    const stepped = stepPlantTwin(
      with_injections.plant_state,
      this.plant_internal_state,
      this.tick_duration_sec,
      this.runtime_profile_id,
    );
    this.plant_internal_state = stepped.internal_state;

    const next_tick_id = `tick_${String(this.snapshot.tick_index + 1).padStart(4, "0")}`;
    const alarm_evaluation = evaluateAlarmSet({
      scenario: this.scenario,
      session_id: this.session_id,
      tick_id: next_tick_id,
      scenario_id: this.scenario.scenario_id,
      plant_state: stepped.plant_state,
      executed_actions: this.snapshot.executed_actions,
      current_phase_id: current_phase.phase_id,
      phase_elapsed_time_sec: getPhaseElapsedTimeSec(sim_time_sec, this.scenario_runtime_state),
      previous_alarm_runtime_state: this.alarm_runtime_state,
    });
    this.alarm_runtime_state = alarm_evaluation.alarm_runtime_state;
    const phase3_state = this.buildPhase3State({
      sim_time_sec,
      tick_index: this.snapshot.tick_index + 1,
      plant_state: {
        ...stepped.plant_state,
        alarm_load_count: alarm_evaluation.alarm_set.active_alarm_count,
        active_alarm_cluster_count: alarm_evaluation.alarm_set.active_alarm_cluster_count,
      },
      alarm_set: alarm_evaluation.alarm_set,
      allowed_action_ids: current_phase.allowed_action_ids ?? [],
      executed_actions: this.snapshot.executed_actions,
      previous_snapshot: this.snapshot,
    });
    this.human_monitoring_runtime_state = phase3_state.human_monitoring_runtime_state;
    this.support_mode_runtime_state = phase3_state.support_mode_runtime_state;

    const plant_tick: PlantTick = {
      tick_id: next_tick_id,
      session_id: this.session_id,
      scenario_id: this.scenario.scenario_id,
      session_mode: this.session_mode,
      sim_time_sec,
      phase_id: current_phase.phase_id,
      plant_state: {
        ...stepped.plant_state,
        alarm_load_count: alarm_evaluation.alarm_set.active_alarm_count,
        active_alarm_cluster_count: alarm_evaluation.alarm_set.active_alarm_cluster_count,
      },
      derived_state: {
        alarm_load_count: alarm_evaluation.alarm_set.active_alarm_count,
        active_alarm_cluster_count: alarm_evaluation.alarm_set.active_alarm_cluster_count,
      },
      last_action_request_id:
        this.snapshot.executed_actions.length > 0
          ? this.snapshot.executed_actions[this.snapshot.executed_actions.length - 1].action_request_id
          : undefined,
      source_event_ids: [],
    };

    const plant_tick_event = this.logger.append({
      sim_time_sec,
      event_type: "plant_tick_recorded",
      source_module: "plant_twin",
      phase_id: current_phase.phase_id,
      payload: {
        tick_id: plant_tick.tick_id,
        phase_id: current_phase.phase_id,
        plant_state: plant_tick.plant_state,
        derived_state: plant_tick.derived_state,
      },
      trace_refs: [{ ref_type: "tick_id", ref_value: plant_tick.tick_id }],
    });

    const alarm_event = this.logger.append({
      sim_time_sec,
      event_type: "alarm_set_updated",
      source_module: "alarm_intelligence",
      phase_id: current_phase.phase_id,
      payload: {
        active_alarm_count: alarm_evaluation.alarm_set.active_alarm_count,
        active_alarm_cluster_count: alarm_evaluation.alarm_set.active_alarm_cluster_count,
        highest_priority_active: alarm_evaluation.alarm_set.highest_priority_active,
        active_alarm_ids: alarm_evaluation.alarm_set.active_alarm_ids,
        visible_alarm_card_count: phase3_state.alarm_intelligence.visible_alarm_card_count,
        compression_ratio: phase3_state.alarm_intelligence.compression_ratio,
        cluster_summaries: summarizeAlarmClusters(phase3_state.alarm_intelligence),
      },
      trace_refs: [{ ref_type: "tick_id", ref_value: plant_tick.tick_id }],
    });
    const human_monitoring_event = this.logger.append({
      sim_time_sec,
      event_type: "human_monitoring_snapshot_recorded",
      source_module: "human_monitoring",
      phase_id: current_phase.phase_id,
      payload: summarizeHumanMonitoring(phase3_state.human_monitoring),
      trace_refs: [{ ref_type: "tick_id", ref_value: plant_tick.tick_id }],
    });
    const operator_state_event = this.logger.append({
      sim_time_sec,
      event_type: "operator_state_snapshot_recorded",
      source_module: "reasoning_layer",
      phase_id: current_phase.phase_id,
      payload: {
        workload_index: phase3_state.operator_state.workload_index,
        attention_stability_index: phase3_state.operator_state.attention_stability_index,
        signal_confidence: phase3_state.operator_state.signal_confidence,
        degraded_mode_active: phase3_state.operator_state.degraded_mode_active,
        degraded_mode_reason: phase3_state.operator_state.degraded_mode_reason,
        observation_window_ticks: phase3_state.operator_state.observation_window_ticks,
      },
      trace_refs: [{ ref_type: "tick_id", ref_value: plant_tick.tick_id }],
    });
    const reasoning_event = this.logger.append({
      sim_time_sec,
      event_type: "reasoning_snapshot_published",
      source_module: "reasoning_layer",
      phase_id: current_phase.phase_id,
      payload: {
        top_hypothesis_id: phase3_state.reasoning_snapshot.dominant_hypothesis_id,
        ranked_hypothesis_ids: phase3_state.reasoning_snapshot.ranked_hypotheses.map((hypothesis) => hypothesis.hypothesis_id),
        confidence_band: phase3_state.reasoning_snapshot.ranked_hypotheses[0]?.confidence_band ?? "low",
        stable_for_ticks: phase3_state.reasoning_snapshot.stable_for_ticks,
        changed_since_last_tick: phase3_state.reasoning_snapshot.changed_since_last_tick,
        dominant_summary: phase3_state.reasoning_snapshot.dominant_summary,
        expected_root_cause_aligned: phase3_state.reasoning_snapshot.expected_root_cause_aligned,
        lane_changed: phase3_state.lane_changed,
        lane_item_ids: phase3_state.first_response_lane.items.map((item) => item.item_id),
        lane_items: summarizeLaneItems(phase3_state.first_response_lane),
        risk_model_id: phase3_state.combined_risk.risk_model_id,
        combined_risk_score: phase3_state.combined_risk.combined_risk_score,
        combined_risk_band: phase3_state.combined_risk.combined_risk_band,
        plant_urgency_index: phase3_state.combined_risk.plant_urgency_index,
        human_pressure_index: phase3_state.combined_risk.human_pressure_index,
        fusion_confidence: phase3_state.combined_risk.fusion_confidence,
        human_influence_scale: phase3_state.combined_risk.human_influence_scale,
        top_contributing_factors: phase3_state.combined_risk.top_contributing_factors,
        recommended_assistance_mode: phase3_state.combined_risk.recommended_assistance_mode,
        recommended_assistance_reason: phase3_state.combined_risk.recommended_assistance_reason,
        confidence_caveat: phase3_state.combined_risk.confidence_caveat,
        why_risk_is_current: phase3_state.combined_risk.why_risk_is_current,
        what_changed: phase3_state.combined_risk.what_changed,
        factor_breakdown: summarizeRiskFactors(phase3_state.combined_risk),
        support_mode: phase3_state.support_mode,
        ...summarizeSupportRefinement(phase3_state.support_refinement),
        ...summarizeSupportPolicy(phase3_state.support_policy),
      },
      trace_refs: [{ ref_type: "tick_id", ref_value: plant_tick.tick_id }],
    });
    let support_mode_event_id: string | undefined;
    if (this.session_mode === "adaptive" && phase3_state.support_mode !== this.snapshot.support_mode) {
      const support_mode_event = this.logger.append({
        sim_time_sec,
        event_type: "support_mode_changed",
        source_module: "adaptive_orchestrator",
        phase_id: current_phase.phase_id,
        payload: {
          from_mode: this.snapshot.support_mode,
          to_mode: phase3_state.support_mode,
          recommended_mode: phase3_state.combined_risk.recommended_assistance_mode,
          recommended_reason: phase3_state.combined_risk.recommended_assistance_reason,
          trigger_reason: phase3_state.support_policy.transition_reason,
          current_mode_reason: phase3_state.support_policy.current_mode_reason,
          support_behavior_changes: phase3_state.support_policy.support_behavior_changes,
          degraded_confidence_effect: phase3_state.support_policy.degraded_confidence_effect,
          critical_visibility_summary: phase3_state.support_policy.critical_visibility.summary,
        },
        trace_refs: [{ ref_type: "tick_id", ref_value: plant_tick.tick_id }],
      });
      support_mode_event_id = support_mode_event.event_id;
    }
    let diagnosis_event_id: string | undefined;
    if (
      phase3_state.reasoning_snapshot.dominant_hypothesis_id &&
      phase3_state.reasoning_snapshot.stable_for_ticks >= 2 &&
      this.reasoning_runtime_state.last_committed_hypothesis_id !== phase3_state.reasoning_snapshot.dominant_hypothesis_id
    ) {
      const diagnosis_event = this.logger.append({
        sim_time_sec,
        event_type: "diagnosis_committed",
        source_module: "reasoning_layer",
        phase_id: current_phase.phase_id,
        payload: {
          diagnosis_id: phase3_state.reasoning_snapshot.dominant_hypothesis_id,
          matches_expected_root_cause: phase3_state.reasoning_snapshot.expected_root_cause_aligned,
        },
        trace_refs: [{ ref_type: "tick_id", ref_value: plant_tick.tick_id }],
      });
      diagnosis_event_id = diagnosis_event.event_id;
      this.reasoning_runtime_state = {
        ...this.reasoning_runtime_state,
        diagnosis_committed: true,
        last_committed_hypothesis_id: phase3_state.reasoning_snapshot.dominant_hypothesis_id,
      };
    }

    const outcomeResult = this.evaluateScenarioOutcome({
      sim_time_sec,
      plant_state: plant_tick.plant_state,
      alarm_set: alarm_evaluation.alarm_set,
      reasoning_snapshot: phase3_state.reasoning_snapshot,
      executed_actions: this.snapshot.executed_actions,
    });
    const outcome = outcomeResult.outcome;
    const diagnosis_ready = outcomeResult.diagnosis_ready;

    let kpi_summary: KpiSummary | undefined = this.snapshot.kpi_summary;
    let completed_review: CompletedSessionReview | undefined = undefined;
    if (outcome) {
      this.logger.append({
        sim_time_sec,
        event_type: "scenario_outcome_recorded",
        source_module: "evaluation",
        phase_id: current_phase.phase_id,
        payload: {
          outcome: outcome.outcome,
          success: outcome.outcome === "success",
          failure_reason: outcome.message,
          stabilized: outcome.stabilized,
          dominant_hypothesis_id: phase3_state.reasoning_snapshot.dominant_hypothesis_id,
          diagnosis_ready,
          remaining_alarm_count: alarm_evaluation.alarm_set.active_alarm_count,
        },
        trace_refs: [{ ref_type: "tick_id", ref_value: plant_tick.tick_id }],
      });
      this.logger.append({
        sim_time_sec,
        event_type: "session_ended",
        source_module: "evaluation",
        phase_id: current_phase.phase_id,
        payload: {
          final_outcome: outcome.outcome,
        },
        trace_refs: [{ ref_type: "tick_id", ref_value: plant_tick.tick_id }],
      });
      const generated_at_sim_time_sec = outcome.sim_time_sec;
      kpi_summary = computeKpiSummary(this.logger.list(), {
        session_id: this.session_id,
        scenario_id: this.scenario.scenario_id,
        session_mode: this.session_mode,
        generated_at_sim_time_sec,
      });
      this.logger.append({
        sim_time_sec,
        event_type: "kpi_summary_generated",
        source_module: "evaluation",
        phase_id: current_phase.phase_id,
        payload: {
          kpi_summary_id: kpi_summary.kpi_summary_id,
          session_id: kpi_summary.session_id,
          scenario_id: kpi_summary.scenario_id,
          session_mode: kpi_summary.session_mode,
          generated_at_iso: kpi_summary.generated_at_iso,
          generated_at_sim_time_sec: kpi_summary.generated_at_sim_time_sec,
          completeness: kpi_summary.completeness,
          metrics: kpi_summary.metrics,
        },
        trace_refs: [{ ref_type: "tick_id", ref_value: plant_tick.tick_id }],
      });

      completed_review = buildCompletedSessionReview({
        session_id: this.session_id,
        session_mode: this.session_mode,
        scenario: {
          scenario_id: this.scenario.scenario_id,
          version: this.scenario.version,
          title: this.scenario.title,
        },
        outcome,
        kpi_summary,
        events: this.logger.list(),
      });
      const captureKey = this.currentScenarioCaptureKey();
      this.evaluation_capture = {
        ...this.evaluation_capture,
        [captureKey]: {
          ...this.evaluation_capture[captureKey],
          ...(this.session_mode === "baseline"
            ? { baseline_completed: completed_review }
            : { adaptive_completed: completed_review }),
        },
      };
    }

    const alarm_history = this.mergeAlarmHistory(
      this.snapshot.alarm_history,
      alarm_evaluation.alarm_set.newly_raised_alarm_ids,
      alarm_evaluation.alarm_set.newly_cleared_alarm_ids,
      sim_time_sec,
    );

    this.snapshot = {
      ...this.snapshot,
      current_phase: current_phase,
      sim_time_sec,
      tick_index: this.snapshot.tick_index + 1,
      plant_tick: {
        ...plant_tick,
        source_event_ids: [
          plant_tick_event.event_id,
          alarm_event.event_id,
          human_monitoring_event.event_id,
          operator_state_event.event_id,
          reasoning_event.event_id,
        ]
          .concat(support_mode_event_id ? [support_mode_event_id] : [])
          .concat(diagnosis_event_id ? [diagnosis_event_id] : []),
      },
      alarm_set: alarm_evaluation.alarm_set,
      alarm_intelligence: phase3_state.alarm_intelligence,
      reasoning_snapshot: phase3_state.reasoning_snapshot,
      human_monitoring: phase3_state.human_monitoring,
      operator_state: phase3_state.operator_state,
      combined_risk: phase3_state.combined_risk,
      support_mode: phase3_state.support_mode,
      first_response_lane: phase3_state.first_response_lane,
      support_refinement: phase3_state.support_refinement,
      support_policy: phase3_state.support_policy,
      alarm_history,
      events: this.logger.list(),
      outcome,
      kpi_summary,
      completed_review,
      evaluation_capture: { ...this.evaluation_capture },
    };
    this.emit();
    return this.snapshot;
  }

  runUntilComplete(maximum_ticks = 100): SessionSnapshot {
    let current = this.snapshot;
    let ticks = 0;

    while (!current.outcome && ticks < maximum_ticks) {
      current = this.advanceTick();
      ticks += 1;
    }

    return current;
  }
}

export function useAuraSessionSnapshot(store: AuraSessionStore): SessionSnapshot {
  return useSyncExternalStore(
    (listener) => store.subscribe(listener),
    () => store.getSnapshot(),
    () => store.getSnapshot(),
  );
}

export function createDefaultSessionStore(): AuraSessionStore {
  return new AuraSessionStore({ session_mode: "adaptive" });
}

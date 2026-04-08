import type {
  AlarmIntelligenceSnapshot,
  AlarmSet,
  ExecutedAction,
  InteractionTelemetryEventKind,
  InteractionTelemetryRecord,
  InteractionTelemetryUiRegion,
  InteractionTelemetryWorkspace,
  HumanMonitoringFreshnessStatus,
  HumanMonitoringInterpretationInput,
  HumanMonitoringSnapshot,
  HumanMonitoringSourceAvailability,
  HumanMonitoringSourceKind,
  HumanMonitoringSourceSnapshot,
  PlantStateSnapshot,
  ReasoningSnapshot,
} from "../contracts/aura";
import { clamp } from "../data/plantModel";

export type LegacyRuntimePlaceholderParams = {
  sim_time_sec: number;
  tick_index: number;
  tick_duration_sec: number;
  plant_state: PlantStateSnapshot;
  alarm_set: AlarmSet;
  alarm_intelligence: AlarmIntelligenceSnapshot;
  reasoning_snapshot: ReasoningSnapshot;
  executed_actions: ExecutedAction[];
  lane_changed: boolean;
};

export type HumanMonitoringEvaluationContext = LegacyRuntimePlaceholderParams;
export type HumanMonitoringAdapterContext = HumanMonitoringEvaluationContext & {
  interaction_telemetry: InteractionTelemetryRuntimeState;
  camera_cv: CameraCvRuntimeState;
};

export type HumanMonitoringSourceReading = {
  availability: HumanMonitoringSourceAvailability;
  confidence: number;
  status_note: string;
  observation_sim_time_sec?: number;
  interpretation_input?: Omit<HumanMonitoringInterpretationInput, "contributing_source_ids" | "provenance"> & {
    provenance?: HumanMonitoringInterpretationInput["provenance"];
  };
};

export type HumanMonitoringSourceWindowState = {
  observation_times_sec: number[];
  latest_reading?: HumanMonitoringSourceReading;
};

export type HumanMonitoringRuntimeState = {
  sources: Record<string, HumanMonitoringSourceWindowState>;
  interaction_telemetry: InteractionTelemetryRuntimeState;
  camera_cv: CameraCvRuntimeState;
};

export type InteractionTelemetryRuntimeState = {
  next_sequence: number;
  records: InteractionTelemetryRecord[];
  suppressed: boolean;
};

export type CameraCvLifecycleStatus =
  | "off"
  | "initializing"
  | "active"
  | "degraded"
  | "unavailable";

export type CameraCvObservationKind =
  | "stable_face"
  | "weak_face"
  | "no_face"
  | "multiple_faces";

export type CameraCvObservation = {
  observation_id: string;
  sim_time_sec: number;
  tick_index: number;
  observation_kind: CameraCvObservationKind;
  face_count: number;
  strongest_face_confidence: number;
  face_center_offset: number;
  head_motion_delta: number;
  face_area_ratio: number;
  note: string;
};

export type CameraCvRuntimeState = {
  intent_enabled: boolean;
  lifecycle_status: CameraCvLifecycleStatus;
  unavailable_reason?: string;
  status_note: string;
  next_sequence: number;
  observations: CameraCvObservation[];
  last_refresh_bucket?: string;
};

export type RecordInteractionTelemetryParams = {
  runtime_state: HumanMonitoringRuntimeState;
  sim_time_sec: number;
  tick_index: number;
  event_kind: InteractionTelemetryEventKind;
  ui_region: InteractionTelemetryUiRegion;
  workspace?: InteractionTelemetryWorkspace;
  target_id?: string;
  requested_value?: number;
  detail?: string;
};

export type SetCameraCvIntentParams = {
  runtime_state: HumanMonitoringRuntimeState;
  enabled: boolean;
};

export type UpdateCameraCvLifecycleParams = {
  runtime_state: HumanMonitoringRuntimeState;
  lifecycle_status: CameraCvLifecycleStatus;
  status_note: string;
  unavailable_reason?: string;
  clear_observations?: boolean;
};

export type RecordCameraCvObservationParams = {
  runtime_state: HumanMonitoringRuntimeState;
  sim_time_sec: number;
  tick_index: number;
  observation_kind: CameraCvObservationKind;
  face_count: number;
  strongest_face_confidence: number;
  face_center_offset: number;
  head_motion_delta: number;
  face_area_ratio: number;
  note: string;
};

export type CameraCvTransitionResult = {
  runtime_state: HumanMonitoringRuntimeState;
  refresh_recommended: boolean;
};

export type HumanMonitoringSourceAdapter = {
  source_id: string;
  source_kind: HumanMonitoringSourceKind;
  expected_update_interval_sec: number;
  stale_after_sec: number;
  window_duration_sec: number;
  evaluate: (
    context: HumanMonitoringAdapterContext,
    runtime_state: HumanMonitoringSourceWindowState | undefined,
  ) => HumanMonitoringSourceReading;
};

export type EvaluateHumanMonitoringParams = HumanMonitoringEvaluationContext & {
  runtime_state: HumanMonitoringRuntimeState;
  adapters?: HumanMonitoringSourceAdapter[];
};

export type EvaluateHumanMonitoringResult = {
  snapshot: HumanMonitoringSnapshot;
  runtime_state: HumanMonitoringRuntimeState;
};

const INTERACTION_TELEMETRY_WINDOW_SEC = 240;
const INTERACTION_TELEMETRY_MAX_RECORDS = 96;
const CAMERA_CV_WINDOW_SEC = 120;
const CAMERA_CV_MAX_OBSERVATIONS = 24;
const ACTIONABLE_INTERACTION_KINDS = new Set<InteractionTelemetryEventKind>([
  "action_request",
  "action_confirmation",
  "runtime_control",
  "supervisor_override_request",
  "supervisor_override_approved",
  "supervisor_override_denied",
]);

function clampWindowedInteractionRecords(
  sim_time_sec: number,
  records: InteractionTelemetryRecord[],
): InteractionTelemetryRecord[] {
  return records
    .filter((record) => sim_time_sec - record.sim_time_sec <= INTERACTION_TELEMETRY_WINDOW_SEC)
    .slice(-INTERACTION_TELEMETRY_MAX_RECORDS);
}

function clampWindowedCameraCvObservations(
  sim_time_sec: number,
  observations: CameraCvObservation[],
): CameraCvObservation[] {
  return observations
    .filter((observation) => sim_time_sec - observation.sim_time_sec <= CAMERA_CV_WINDOW_SEC)
    .slice(-CAMERA_CV_MAX_OBSERVATIONS);
}

function formatCameraCvObservationLabel(observation_kind: CameraCvObservationKind): string {
  switch (observation_kind) {
    case "stable_face":
      return "stable face signal";
    case "weak_face":
      return "weak face confidence";
    case "no_face":
      return "no face in frame";
    case "multiple_faces":
      return "multiple faces detected";
  }
}

function formatLiveSourceKind(source_kind: HumanMonitoringSourceKind): string {
  switch (source_kind) {
    case "interaction_telemetry":
      return "interaction telemetry";
    case "camera_cv":
      return "webcam monitoring";
    default:
      return source_kind;
  }
}

function cameraCvRefreshBucket(camera_cv: CameraCvRuntimeState): string {
  if (!camera_cv.intent_enabled || camera_cv.lifecycle_status === "off") {
    return "off";
  }

  if (camera_cv.lifecycle_status === "initializing") {
    return "initializing";
  }

  if (camera_cv.lifecycle_status === "unavailable") {
    return `unavailable:${camera_cv.unavailable_reason ?? "unknown"}`;
  }

  const latest_observation = camera_cv.observations[camera_cv.observations.length - 1];
  if (!latest_observation) {
    return camera_cv.lifecycle_status === "active" ? "awaiting_face" : "degraded";
  }

  return latest_observation.observation_kind;
}

function formatInteractionSourceLabel(event_kind: InteractionTelemetryEventKind): string {
  switch (event_kind) {
    case "action_request":
      return "action requests";
    case "action_confirmation":
      return "warning confirmations";
    case "action_confirmation_dismissed":
      return "warning dismissals";
    case "workspace_switch":
      return "workspace switches";
    case "runtime_control":
      return "runtime controls";
    case "alarm_cluster_toggle":
      return "alarm inspection toggles";
    case "manual_control_adjustment":
      return "manual control adjustments";
    case "supervisor_override_request":
      return "supervisor review requests";
    case "supervisor_override_approved":
      return "supervisor approvals";
    case "supervisor_override_denied":
      return "supervisor denials";
  }
}

function formatInteractionStatusList(kinds: InteractionTelemetryEventKind[]): string {
  return kinds.map((kind) => formatInteractionSourceLabel(kind)).join(", ");
}

function actionableInteraction(record: InteractionTelemetryRecord): boolean {
  return ACTIONABLE_INTERACTION_KINDS.has(record.event_kind);
}

function tickSpanFromRecords(records: InteractionTelemetryRecord[]): number {
  return new Set(records.map((record) => record.tick_index)).size;
}

function numberValue(value: PlantStateSnapshot[string]): number {
  return typeof value === "number" ? value : Number(value);
}

function roundIndex(value: number): number {
  return Math.round(clamp(value, 0, 100));
}

function topHypothesisGap(reasoning_snapshot: ReasoningSnapshot): number {
  const top_score = reasoning_snapshot.ranked_hypotheses[0]?.score ?? 0;
  const second_score = reasoning_snapshot.ranked_hypotheses[1]?.score ?? 0;
  return Math.max(top_score - second_score, 0);
}

function lastActionAgeSec(sim_time_sec: number, executed_actions: ExecutedAction[]): number | undefined {
  const last_action = executed_actions[executed_actions.length - 1];
  if (!last_action) {
    return undefined;
  }

  return Math.max(sim_time_sec - last_action.sim_time_sec, 0);
}

function roundAverage(total: number, count: number): number {
  if (count <= 0) {
    return 0;
  }

  return roundIndex(total / count);
}

function deriveFreshnessStatus(params: {
  sim_time_sec: number;
  last_observation_sim_time_sec?: number;
  expected_update_interval_sec: number;
  stale_after_sec: number;
}): {
  freshness_status: HumanMonitoringFreshnessStatus;
  latest_observation_age_sec?: number;
} {
  if (typeof params.last_observation_sim_time_sec !== "number") {
    return {
      freshness_status: "no_observations",
    };
  }

  const latest_observation_age_sec = Math.max(params.sim_time_sec - params.last_observation_sim_time_sec, 0);
  if (latest_observation_age_sec <= params.expected_update_interval_sec) {
    return {
      freshness_status: "current",
      latest_observation_age_sec,
    };
  }

  if (latest_observation_age_sec <= params.stale_after_sec) {
    return {
      freshness_status: "aging",
      latest_observation_age_sec,
    };
  }

  return {
    freshness_status: "stale",
    latest_observation_age_sec,
  };
}

function deriveWindowTickSpan(sample_count_in_window: number): number {
  return sample_count_in_window;
}

function deriveWindowDurationSec(params: {
  sample_count_in_window: number;
  tick_duration_sec: number;
}): number {
  return params.sample_count_in_window > 0
    ? Math.max(params.sample_count_in_window - 1, 0) * params.tick_duration_sec
    : 0;
}

function deriveSourceSnapshot(params: {
  sim_time_sec: number;
  tick_duration_sec: number;
  adapter: HumanMonitoringSourceAdapter;
  reading: HumanMonitoringSourceReading;
  previous_state?: HumanMonitoringSourceWindowState;
}): {
  source_snapshot: HumanMonitoringSourceSnapshot;
  runtime_state: HumanMonitoringSourceWindowState;
} {
  const previous_times = params.previous_state?.observation_times_sec ?? [];
  const should_append_observation =
    typeof params.reading.observation_sim_time_sec === "number" &&
    previous_times[previous_times.length - 1] !== params.reading.observation_sim_time_sec;
  const next_times = should_append_observation
    ? [...previous_times, params.reading.observation_sim_time_sec!]
    : [...previous_times];
  const trimmed_times = next_times.filter(
    (time_sec) => params.sim_time_sec - time_sec <= params.adapter.window_duration_sec,
  );
  const last_observation_sim_time_sec =
    trimmed_times.length > 0 ? trimmed_times[trimmed_times.length - 1] : undefined;
  const oldest_observation_sim_time_sec = trimmed_times.length > 0 ? trimmed_times[0] : undefined;
  const sample_count_in_window = trimmed_times.length;
  const freshness = deriveFreshnessStatus({
    sim_time_sec: params.sim_time_sec,
    last_observation_sim_time_sec,
    expected_update_interval_sec: params.adapter.expected_update_interval_sec,
    stale_after_sec: params.adapter.stale_after_sec,
  });
  const contributes_to_aggregate =
    params.reading.availability !== "not_connected" &&
    params.reading.availability !== "unavailable" &&
    freshness.freshness_status !== "no_observations" &&
    freshness.freshness_status !== "stale";

  return {
    source_snapshot: {
      source_id: params.adapter.source_id,
      source_kind: params.adapter.source_kind,
      availability: params.reading.availability,
      freshness_status: freshness.freshness_status,
      confidence: roundIndex(params.reading.confidence),
      status_note: params.reading.status_note,
      latest_observation_age_sec: freshness.latest_observation_age_sec,
      last_observation_sim_time_sec,
      oldest_observation_sim_time_sec,
      expected_update_interval_sec: params.adapter.expected_update_interval_sec,
      stale_after_sec: params.adapter.stale_after_sec,
      window_tick_span: deriveWindowTickSpan(sample_count_in_window),
      window_duration_sec: deriveWindowDurationSec({
        sample_count_in_window,
        tick_duration_sec: params.tick_duration_sec,
      }),
      sample_count_in_window,
      contributes_to_aggregate,
    },
    runtime_state: {
      observation_times_sec: trimmed_times,
      latest_reading: params.reading,
    },
  };
}

function buildInterpretationInput(params: {
  sources: HumanMonitoringSourceSnapshot[];
  readings: Array<{ source_id: string; reading: HumanMonitoringSourceReading }>;
}): HumanMonitoringInterpretationInput | undefined {
  const contributors = params.readings
    .map(({ source_id, reading }) => {
      const source = params.sources.find((candidate) => candidate.source_id === source_id);
      if (!source?.contributes_to_aggregate || !reading.interpretation_input) {
        return undefined;
      }

      return {
        source_id,
        source_confidence: source.confidence,
        interpretation: reading.interpretation_input,
      };
    })
    .filter(
      (
        contributor,
      ): contributor is {
        source_id: string;
        source_confidence: number;
        interpretation: NonNullable<HumanMonitoringSourceReading["interpretation_input"]>;
      } => Boolean(contributor),
    );

  if (contributors.length === 0) {
    return undefined;
  }

  const weighted_confidence = contributors.reduce((total, contributor) => total + contributor.source_confidence, 0);
  const denominator = weighted_confidence > 0 ? weighted_confidence : contributors.length;
  const weightedAverage = (selector: (contributor: (typeof contributors)[number]) => number): number =>
    roundIndex(
      contributors.reduce((total, contributor) => total + selector(contributor) * (weighted_confidence > 0 ? contributor.source_confidence : 1), 0) /
        denominator,
    );
  const degraded_reasons = contributors
    .map((contributor) => contributor.interpretation.degraded_mode_reason)
    .filter((reason, index, collection) => reason && collection.indexOf(reason) === index);
  const note = contributors
    .map((contributor) => contributor.interpretation.interpretation_note)
    .filter((value, index, collection) => value && collection.indexOf(value) === index)
    .join(" ");
  const provenance =
    contributors.length === 1 && contributors[0]?.interpretation.provenance === "legacy_runtime_placeholder"
      ? "legacy_runtime_placeholder"
      : "canonical_source_pipeline";

  return {
    workload_index: weightedAverage((contributor) => contributor.interpretation.workload_index),
    attention_stability_index: weightedAverage(
      (contributor) => contributor.interpretation.attention_stability_index,
    ),
    signal_confidence: weightedAverage((contributor) => contributor.interpretation.signal_confidence),
    degraded_mode_active: contributors.some((contributor) => contributor.interpretation.degraded_mode_active),
    degraded_mode_reason:
      degraded_reasons.join(" ") ||
      "Monitoring inputs remain degraded until contributing sources provide a stable interpretation window.",
    observation_window_ticks: Math.max(
      ...contributors.map((contributor) => contributor.interpretation.observation_window_ticks),
    ),
    contributing_source_ids: contributors.map((contributor) => contributor.source_id),
    provenance,
    interpretation_note: note || "Canonical human-monitoring interpretation built from contributing source adapters.",
  };
}

function buildHumanMonitoringSnapshot(params: {
  sim_time_sec: number;
  tick_index: number;
  tick_duration_sec: number;
  sources: HumanMonitoringSourceSnapshot[];
  interpretation_input?: HumanMonitoringInterpretationInput;
}): HumanMonitoringSnapshot {
  const connected_sources = params.sources.filter((source) => source.availability !== "not_connected");
  const contributing_sources = params.sources.filter((source) => source.contributes_to_aggregate);
  const active_sources = contributing_sources.filter((source) => source.availability === "active");
  const current_sources = contributing_sources.filter((source) => source.freshness_status === "current");
  const degraded_sources = params.sources.filter(
    (source) => source.availability === "degraded" || source.freshness_status === "aging",
  );
  const stale_sources = params.sources.filter((source) => source.freshness_status === "stale");
  const latest_observation_sim_time_sec = params.sources
    .map((source) => source.last_observation_sim_time_sec)
    .filter((value): value is number => typeof value === "number")
    .reduce<number | undefined>((latest, value) => (latest === undefined ? value : Math.max(latest, value)), undefined);
  const oldest_observation_sim_time_sec = params.sources
    .map((source) => source.oldest_observation_sim_time_sec)
    .filter((value): value is number => typeof value === "number")
    .reduce<number | undefined>((oldest, value) => (oldest === undefined ? value : Math.min(oldest, value)), undefined);
  const window_tick_span = params.sources.reduce((maximum, source) => Math.max(maximum, source.window_tick_span), 0);
  const window_duration_sec = params.sources.reduce(
    (maximum, source) => Math.max(maximum, source.window_duration_sec),
    0,
  );
  const aggregate_confidence = roundAverage(
    contributing_sources.reduce((total, source) => total + source.confidence, 0),
    contributing_sources.length,
  );
  const freshness_status: HumanMonitoringFreshnessStatus =
    contributing_sources.length === 0
      ? connected_sources.length === 0
        ? "no_observations"
        : stale_sources.length > 0
          ? "stale"
          : "no_observations"
      : stale_sources.length > 0
        ? "stale"
        : degraded_sources.length > 0
          ? "aging"
          : "current";
  const has_live_contributor = contributing_sources.some(
    (source) => source.source_kind !== "legacy_runtime_placeholder",
  );
  const has_placeholder_contributor = contributing_sources.some(
    (source) => source.source_kind === "legacy_runtime_placeholder",
  );
  const connected_live_sources = connected_sources.filter(
    (source) => source.source_kind !== "legacy_runtime_placeholder",
  );
  const live_source_labels = connected_live_sources.map((source) => formatLiveSourceKind(source.source_kind));
  const mode: HumanMonitoringSnapshot["mode"] =
    connected_sources.length === 0
      ? "unavailable"
      : contributing_sources.length === 0
        ? "degraded"
        : has_live_contributor
          ? "live_sources"
          : has_placeholder_contributor
            ? "placeholder_compatibility"
            : "degraded";
  const degraded_state_active =
    mode === "unavailable" ||
    params.interpretation_input?.degraded_mode_active === true ||
    degraded_sources.length > 0 ||
    stale_sources.length > 0 ||
    aggregate_confidence < 70;
  const degraded_state_reason =
    mode === "unavailable"
      ? "Human monitoring is unavailable because no source adapters are currently connected."
      : stale_sources.length > 0
        ? stale_sources.map((source) => `${source.source_id} is stale: ${source.status_note}`).join(" ")
        : degraded_sources.length > 0
          ? degraded_sources.map((source) => `${source.source_id}: ${source.status_note}`).join(" ")
          : params.interpretation_input?.degraded_mode_active
            ? params.interpretation_input.degraded_mode_reason
            : aggregate_confidence < 70
              ? `Aggregate monitoring confidence is ${aggregate_confidence}/100, so the monitoring picture remains degraded.`
              : "No degraded human-monitoring conditions are active.";
  const status_summary =
    mode === "unavailable"
      ? "Human-monitoring foundation is online, but no source adapters are connected yet."
      : mode === "placeholder_compatibility"
        ? connected_live_sources.length > 0
          ? `Human-monitoring remains anchored by the compatibility placeholder while ${live_source_labels.join(", ")} are present but not yet contributing current evidence.`
          : "Human-monitoring foundation is running through the canonical placeholder adapter so current operator-state behavior stays stable until live sources are added."
        : mode === "live_sources"
          ? `Human-monitoring inputs are flowing through the canonical source pipeline with ${live_source_labels.join(", ")} contributing live interaction evidence.`
          : "Human-monitoring adapters are present, but freshness or confidence is currently degraded.";

  return {
    snapshot_id: `hm_t${String(params.tick_index).padStart(4, "0")}`,
    mode,
    freshness_status,
    aggregate_confidence,
    degraded_state_active,
    degraded_state_reason,
    status_summary,
    latest_observation_sim_time_sec,
    oldest_observation_sim_time_sec,
    window_tick_span,
    window_duration_sec,
    connected_source_count: connected_sources.length,
    active_source_count: active_sources.length,
    current_source_count: current_sources.length,
    degraded_source_count: degraded_sources.length,
    stale_source_count: stale_sources.length,
    contributing_source_count: contributing_sources.length,
    sources: params.sources,
    interpretation_input: params.interpretation_input,
  };
}

export function createHumanMonitoringRuntimeState(): HumanMonitoringRuntimeState {
  return {
    sources: {},
    interaction_telemetry: {
      next_sequence: 0,
      records: [],
      suppressed: false,
    },
    camera_cv: {
      intent_enabled: false,
      lifecycle_status: "off",
      status_note: "Webcam monitoring is off until manually enabled.",
      next_sequence: 0,
      observations: [],
      last_refresh_bucket: "off",
    },
  };
}

export function setInteractionTelemetrySuppressed(
  runtime_state: HumanMonitoringRuntimeState,
  suppressed: boolean,
): HumanMonitoringRuntimeState {
  if (runtime_state.interaction_telemetry.suppressed === suppressed) {
    return runtime_state;
  }

  return {
    ...runtime_state,
    interaction_telemetry: {
      ...runtime_state.interaction_telemetry,
      suppressed,
    },
  };
}

export function setCameraCvIntent(params: SetCameraCvIntentParams): CameraCvTransitionResult {
  const current_bucket = cameraCvRefreshBucket(params.runtime_state.camera_cv);
  const next_camera_cv: CameraCvRuntimeState = params.enabled
    ? {
        ...params.runtime_state.camera_cv,
        intent_enabled: true,
        lifecycle_status: "initializing",
        unavailable_reason: undefined,
        status_note: "Webcam monitoring is requesting local camera access for bounded advisory monitoring.",
        observations: [],
      }
    : {
        intent_enabled: false,
        lifecycle_status: "off",
        unavailable_reason: undefined,
        status_note: "Webcam monitoring is off until manually enabled.",
        next_sequence: params.runtime_state.camera_cv.next_sequence,
        observations: [],
        last_refresh_bucket: "off",
      };
  const next_bucket = cameraCvRefreshBucket(next_camera_cv);

  return {
    runtime_state: {
      ...params.runtime_state,
      camera_cv: {
        ...next_camera_cv,
        last_refresh_bucket: next_bucket,
      },
    },
    refresh_recommended: current_bucket !== next_bucket,
  };
}

export function updateCameraCvLifecycle(
  params: UpdateCameraCvLifecycleParams,
): CameraCvTransitionResult {
  const current_bucket = cameraCvRefreshBucket(params.runtime_state.camera_cv);
  const next_camera_cv: CameraCvRuntimeState = {
    ...params.runtime_state.camera_cv,
    intent_enabled: params.runtime_state.camera_cv.intent_enabled,
    lifecycle_status: params.lifecycle_status,
    unavailable_reason: params.lifecycle_status === "unavailable" ? params.unavailable_reason : undefined,
    status_note: params.status_note,
    observations: params.clear_observations ? [] : [...params.runtime_state.camera_cv.observations],
  };
  const next_bucket = cameraCvRefreshBucket(next_camera_cv);

  return {
    runtime_state: {
      ...params.runtime_state,
      camera_cv: {
        ...next_camera_cv,
        last_refresh_bucket: next_bucket,
      },
    },
    refresh_recommended:
      current_bucket !== next_bucket ||
      params.runtime_state.camera_cv.status_note !== params.status_note ||
      params.runtime_state.camera_cv.unavailable_reason !== params.unavailable_reason,
  };
}

export function recordInteractionTelemetry(
  params: RecordInteractionTelemetryParams,
): HumanMonitoringRuntimeState {
  const telemetry_state = params.runtime_state.interaction_telemetry;
  if (telemetry_state.suppressed) {
    return params.runtime_state;
  }

  const next_sequence = telemetry_state.next_sequence + 1;
  const next_record: InteractionTelemetryRecord = {
    interaction_id: `ix_${String(next_sequence).padStart(4, "0")}`,
    sim_time_sec: params.sim_time_sec,
    tick_index: params.tick_index,
    event_kind: params.event_kind,
    ui_region: params.ui_region,
    workspace: params.workspace,
    target_id: params.target_id,
    requested_value: params.requested_value,
    detail: params.detail,
  };

  const previous_records = clampWindowedInteractionRecords(params.sim_time_sec, telemetry_state.records);
  const previous_last_record = previous_records[previous_records.length - 1];
  const should_coalesce =
    params.event_kind === "manual_control_adjustment" &&
    previous_last_record?.event_kind === "manual_control_adjustment" &&
    previous_last_record.sim_time_sec === params.sim_time_sec &&
    previous_last_record.target_id === params.target_id;
  const next_records = should_coalesce
    ? [...previous_records.slice(0, -1), next_record]
    : [...previous_records, next_record];

  return {
    ...params.runtime_state,
    interaction_telemetry: {
      next_sequence,
      suppressed: telemetry_state.suppressed,
      records: clampWindowedInteractionRecords(params.sim_time_sec, next_records),
    },
  };
}

export function recordCameraCvObservation(
  params: RecordCameraCvObservationParams,
): CameraCvTransitionResult {
  if (!params.runtime_state.camera_cv.intent_enabled) {
    return {
      runtime_state: params.runtime_state,
      refresh_recommended: false,
    };
  }

  const previous_bucket = params.runtime_state.camera_cv.last_refresh_bucket ?? cameraCvRefreshBucket(params.runtime_state.camera_cv);
  const next_sequence = params.runtime_state.camera_cv.next_sequence + 1;
  const next_observation: CameraCvObservation = {
    observation_id: `cam_${String(next_sequence).padStart(4, "0")}`,
    sim_time_sec: params.sim_time_sec,
    tick_index: params.tick_index,
    observation_kind: params.observation_kind,
    face_count: params.face_count,
    strongest_face_confidence: roundIndex(params.strongest_face_confidence),
    face_center_offset: clamp(params.face_center_offset, 0, 1),
    head_motion_delta: clamp(params.head_motion_delta, 0, 1),
    face_area_ratio: clamp(params.face_area_ratio, 0, 1),
    note: params.note,
  };
  const next_observations = clampWindowedCameraCvObservations(
    params.sim_time_sec,
    [...params.runtime_state.camera_cv.observations, next_observation],
  );
  const next_lifecycle_status: CameraCvLifecycleStatus =
    params.observation_kind === "stable_face" ? "active" : "degraded";
  const next_status_note =
    params.observation_kind === "stable_face"
      ? "Webcam monitoring is active with a stable bounded face-presence signal."
      : `Webcam monitoring remains advisory because ${params.note}`;
  const next_camera_cv: CameraCvRuntimeState = {
    ...params.runtime_state.camera_cv,
    lifecycle_status: next_lifecycle_status,
    unavailable_reason: undefined,
    status_note: next_status_note,
    next_sequence,
    observations: next_observations,
  };
  const next_bucket = cameraCvRefreshBucket(next_camera_cv);

  return {
    runtime_state: {
      ...params.runtime_state,
      camera_cv: {
        ...next_camera_cv,
        last_refresh_bucket: previous_bucket === next_bucket ? previous_bucket : next_bucket,
      },
    },
    refresh_recommended: previous_bucket !== next_bucket,
  };
}

function averageIntervalSec(records: InteractionTelemetryRecord[]): number | undefined {
  if (records.length < 2) {
    return undefined;
  }

  const intervals: number[] = [];
  for (let index = 1; index < records.length; index += 1) {
    intervals.push(Math.max(records[index]!.sim_time_sec - records[index - 1]!.sim_time_sec, 0));
  }

  return intervals.length > 0 ? intervals.reduce((total, value) => total + value, 0) / intervals.length : undefined;
}

function reversalCount(records: InteractionTelemetryRecord[]): number {
  let count = 0;

  for (let index = 1; index < records.length; index += 1) {
    const previous = records[index - 1]!;
    const current = records[index]!;
    if (
      previous.event_kind !== "action_request" ||
      current.event_kind !== "action_request" ||
      previous.target_id !== current.target_id ||
      typeof previous.requested_value !== "number" ||
      typeof current.requested_value !== "number"
    ) {
      continue;
    }

    const previous_direction = previous.requested_value - (records[index - 2]?.requested_value ?? previous.requested_value);
    const current_direction = current.requested_value - previous.requested_value;
    const magnitude_changed = Math.abs(current.requested_value - previous.requested_value) >= 8;
    if (magnitude_changed && previous_direction !== 0 && current_direction !== 0 && previous_direction * current_direction < 0) {
      count += 1;
    }
  }

  return count;
}

function repeatedRetryCount(records: InteractionTelemetryRecord[]): number {
  let count = 0;

  for (let index = 1; index < records.length; index += 1) {
    const previous = records[index - 1]!;
    const current = records[index]!;
    if (
      previous.event_kind === "action_request" &&
      current.event_kind === "action_request" &&
      previous.target_id === current.target_id &&
      previous.sim_time_sec !== current.sim_time_sec &&
      current.sim_time_sec - previous.sim_time_sec <= 15
    ) {
      count += 1;
    }
  }

  return count;
}

function recentInteractionDensity(records: InteractionTelemetryRecord[], sim_time_sec: number, window_sec: number): number {
  return records.filter((record) => sim_time_sec - record.sim_time_sec <= window_sec).length;
}

function buildInteractionTelemetrySource(
  context: HumanMonitoringAdapterContext,
): HumanMonitoringSourceReading {
  const records = clampWindowedInteractionRecords(
    context.sim_time_sec,
    context.interaction_telemetry.records,
  );
  const latest_record = records[records.length - 1];
  if (!latest_record) {
    return {
      availability: "degraded",
      confidence: 32,
      status_note:
        "Interaction telemetry is connected, but no practical operator interaction evidence has been captured yet. Outputs remain bounded interaction-performance proxies only.",
      interpretation_input: {
        workload_index: 20,
        attention_stability_index: 82,
        signal_confidence: 32,
        degraded_mode_active: true,
        degraded_mode_reason:
          "Interaction telemetry is connected but still waiting for practical operator interaction evidence.",
        observation_window_ticks: 0,
        interpretation_note:
          "Interaction telemetry remains in a sparse-evidence state; no medical or cognitive claim is being made.",
        provenance: "canonical_source_pipeline",
      },
    };
  }

  const actionable_records = records.filter(actionableInteraction);
  const unique_event_kinds = new Set(records.map((record) => record.event_kind));
  const workspace_switch_count = records.filter((record) => record.event_kind === "workspace_switch").length;
  const cluster_toggle_count = records.filter((record) => record.event_kind === "alarm_cluster_toggle").length;
  const manual_adjustment_count = records.filter((record) => record.event_kind === "manual_control_adjustment").length;
  const latest_interaction_age_sec = Math.max(context.sim_time_sec - latest_record.sim_time_sec, 0);
  const average_latency_sec = averageIntervalSec(actionable_records);
  const recent_density_15_sec = recentInteractionDensity(records, context.sim_time_sec, 15);
  const reversal_pressure = clamp(reversalCount(actionable_records) * 16, 0, 34);
  const retry_pressure = clamp(repeatedRetryCount(records) * 8, 0, 24);
  const burstiness_index = clamp(
    Math.max(recent_density_15_sec - 3, 0) * 8 +
      retry_pressure +
      Math.max(manual_adjustment_count - actionable_records.length, 0) * 2,
    0,
    38,
  );
  const navigation_instability_index = clamp(
    workspace_switch_count * 10 + Math.max(cluster_toggle_count - 1, 0) * 5,
    0,
    32,
  );
  const meaningful_moment_pressure = clamp(
    context.alarm_set.newly_raised_alarm_ids.length * 10 +
      context.alarm_set.active_alarm_count * 3 +
      (context.alarm_set.highest_priority_active === "P1" ? 12 : 0) +
      (context.lane_changed ? 12 : 0) +
      (context.reasoning_snapshot.changed_since_last_tick ? 8 : 0),
    0,
    42,
  );
  const hesitation_index =
    actionable_records.length === 0
      ? clamp(meaningful_moment_pressure * 0.8 + latest_interaction_age_sec * 0.6, 0, 36)
      : meaningful_moment_pressure > 0 && latest_interaction_age_sec > 12
        ? clamp((latest_interaction_age_sec - 12) * 1.4 + meaningful_moment_pressure * 0.55, 0, 36)
        : 0;
  const latency_trend_index =
    typeof average_latency_sec === "number"
      ? clamp(Math.max(average_latency_sec - 8, 0) * 2 + Math.max(latest_interaction_age_sec - average_latency_sec, 0), 0, 24)
      : clamp(latest_interaction_age_sec * 0.6, 0, 18);
  const stable_cadence_bonus =
    typeof average_latency_sec === "number" &&
    average_latency_sec >= 4 &&
    average_latency_sec <= 18 &&
    reversal_pressure === 0 &&
    burstiness_index < 12
      ? 8
      : 0;
  const workload_index = roundIndex(
    18 +
      hesitation_index * 0.9 +
      latency_trend_index * 0.8 +
      burstiness_index * 0.75 +
      reversal_pressure * 0.55 +
      navigation_instability_index * 0.25,
  );
  const attention_stability_index = roundIndex(
    92 -
      hesitation_index * 0.55 -
      latency_trend_index * 0.45 -
      burstiness_index * 0.45 -
      reversal_pressure * 0.8 -
      navigation_instability_index * 0.9 +
      stable_cadence_bonus,
  );

  let signal_confidence = 24;
  signal_confidence += Math.min(records.length, 8) * 6;
  signal_confidence += Math.min(unique_event_kinds.size, 4) * 7;
  signal_confidence += actionable_records.length > 0 ? 10 : 0;
  signal_confidence -= latest_interaction_age_sec > 60 ? 26 : latest_interaction_age_sec > 25 ? 12 : 0;
  signal_confidence -= records.length < 3 ? 16 : 0;
  signal_confidence -= unique_event_kinds.size < 2 ? 12 : 0;
  signal_confidence -= actionable_records.length === 0 ? 10 : 0;
  const bounded_signal_confidence = roundIndex(clamp(signal_confidence, 18, 96));
  const degraded_reasons: string[] = [];
  if (records.length < 3) {
    degraded_reasons.push("interaction evidence is sparse");
  }
  if (unique_event_kinds.size < 2) {
    degraded_reasons.push("event diversity is still narrow");
  }
  if (latest_interaction_age_sec > 25) {
    degraded_reasons.push("recent interaction evidence is aging");
  }
  if (actionable_records.length === 0) {
    degraded_reasons.push("no actionable response behavior has been observed yet");
  }

  const dominant_signals = [
    hesitation_index >= 14 ? "hesitation pressure elevated" : undefined,
    latency_trend_index >= 12 ? "response latency trend elevated" : undefined,
    reversal_pressure >= 16 ? "reversal pressure elevated" : undefined,
    burstiness_index >= 16 ? "bursty interaction pattern observed" : undefined,
    navigation_instability_index >= 12 ? "navigation instability observed" : undefined,
  ].filter((value): value is string => Boolean(value));

  const interpretation_note = [
    `Interaction telemetry captured ${records.length} recent events across ${unique_event_kinds.size} event kinds.`,
    dominant_signals.length > 0
      ? `Current bounded interaction proxies: ${dominant_signals.join("; ")}.`
      : "Current interaction pattern remains comparatively steady.",
    "These values are practical interaction-performance proxies only, not a medical or cognitive truth claim.",
  ].join(" ");

  return {
    availability: bounded_signal_confidence >= 70 ? "active" : "degraded",
    confidence: bounded_signal_confidence,
    status_note: [
      `Interaction telemetry observed ${formatInteractionStatusList([...unique_event_kinds])}.`,
      dominant_signals.length > 0 ? `Signals: ${dominant_signals.join("; ")}.` : "Signals are stable and bounded.",
      degraded_reasons.length > 0 ? `Confidence reduced because ${degraded_reasons.join("; ")}.` : "Confidence is supported by recent, diverse interaction evidence.",
      "This source estimates practical interaction behavior only.",
    ].join(" "),
    observation_sim_time_sec: latest_record.sim_time_sec,
    interpretation_input: {
      workload_index,
      attention_stability_index,
      signal_confidence: bounded_signal_confidence,
      degraded_mode_active: degraded_reasons.length > 0 || bounded_signal_confidence < 70,
      degraded_mode_reason:
        degraded_reasons.length > 0
          ? `Interaction telemetry confidence is reduced because ${degraded_reasons.join("; ")}.`
          : "Interaction telemetry window is current and diverse enough to support bounded interpretation.",
      observation_window_ticks: tickSpanFromRecords(records),
      interpretation_note,
      provenance: "canonical_source_pipeline",
    },
  };
}

function averageCameraObservationMetric(
  observations: CameraCvObservation[],
  selector: (observation: CameraCvObservation) => number,
): number {
  if (observations.length === 0) {
    return 0;
  }

  return observations.reduce((total, observation) => total + selector(observation), 0) / observations.length;
}

function buildCameraCvSource(context: HumanMonitoringAdapterContext): HumanMonitoringSourceReading {
  const camera_cv = context.camera_cv;
  if (!camera_cv.intent_enabled || camera_cv.lifecycle_status === "off") {
    return {
      availability: "not_connected",
      confidence: 0,
      status_note: "Webcam monitoring is off until manually enabled.",
    };
  }

  if (camera_cv.lifecycle_status === "unavailable") {
    return {
      availability: "unavailable",
      confidence: 0,
      status_note: camera_cv.status_note,
    };
  }

  if (camera_cv.lifecycle_status === "initializing") {
    return {
      availability: "degraded",
      confidence: 18,
      status_note: camera_cv.status_note,
      interpretation_input: {
        workload_index: 22,
        attention_stability_index: 68,
        signal_confidence: 18,
        degraded_mode_active: true,
        degraded_mode_reason:
          "Webcam monitoring is still initializing, so visual proxies are not yet stable enough to interpret.",
        observation_window_ticks: 0,
        interpretation_note:
          "Webcam monitoring is still initializing. No medical, fatigue, or emotion inference is being made.",
        provenance: "canonical_source_pipeline",
      },
    };
  }

  const observations = clampWindowedCameraCvObservations(context.sim_time_sec, camera_cv.observations);
  const latest_observation = observations[observations.length - 1];
  if (!latest_observation) {
    return {
      availability: "degraded",
      confidence: 20,
      status_note:
        "Webcam monitoring is enabled, but no usable visual observation has been captured yet. Outputs remain bounded advisory proxies only.",
      interpretation_input: {
        workload_index: 24,
        attention_stability_index: 66,
        signal_confidence: 20,
        degraded_mode_active: true,
        degraded_mode_reason:
          "Webcam monitoring is enabled but still waiting for a usable bounded visual observation window.",
        observation_window_ticks: 0,
        interpretation_note:
          "Webcam monitoring remains in an observation-wait state and is not making cognitive or medical claims.",
        provenance: "canonical_source_pipeline",
      },
    };
  }

  const stable_observations = observations.filter((observation) => observation.observation_kind === "stable_face");
  const average_center_offset = averageCameraObservationMetric(stable_observations, (observation) => observation.face_center_offset);
  const average_head_motion = averageCameraObservationMetric(stable_observations, (observation) => observation.head_motion_delta);
  const average_face_confidence = averageCameraObservationMetric(observations, (observation) => observation.strongest_face_confidence);
  const latest_kind = latest_observation.observation_kind;
  const presence_penalty =
    latest_kind === "multiple_faces"
      ? 18
      : latest_kind === "no_face"
        ? 16
        : latest_kind === "weak_face"
          ? 10
          : 0;
  const workload_index = roundIndex(
    clamp(
      20 +
        average_center_offset * 18 +
        average_head_motion * 24 +
        presence_penalty +
        Math.max(3 - stable_observations.length, 0) * 4,
      16,
      58,
    ),
  );
  const attention_stability_index = roundIndex(
    clamp(
      80 -
        average_center_offset * 22 -
        average_head_motion * 28 -
        presence_penalty * 1.4 -
        Math.max(2 - stable_observations.length, 0) * 5,
      38,
      86,
    ),
  );

  let signal_confidence =
    26 +
    Math.min(observations.length, 6) * 6 +
    Math.min(stable_observations.length, 4) * 7 +
    average_face_confidence * 0.28 -
    presence_penalty * 1.1 -
    average_center_offset * 18 -
    average_head_motion * 18;
  if (latest_kind !== "stable_face") {
    signal_confidence -= 8;
  }
  const bounded_signal_confidence = roundIndex(clamp(signal_confidence, 18, stable_observations.length >= 3 ? 82 : 72));
  const degraded_reasons: string[] = [];
  if (stable_observations.length < 2) {
    degraded_reasons.push("the stable face window is still short");
  }
  if (latest_kind !== "stable_face") {
    degraded_reasons.push(formatCameraCvObservationLabel(latest_kind));
  }
  if (average_center_offset > 0.28) {
    degraded_reasons.push("the face remains off-center");
  }
  if (average_head_motion > 0.22) {
    degraded_reasons.push("head motion remains elevated");
  }

  const availability: HumanMonitoringSourceAvailability =
    latest_kind === "stable_face" && stable_observations.length >= 2 && bounded_signal_confidence >= 68
      ? "active"
      : "degraded";
  const interpretation_note = [
    `Webcam monitoring captured ${observations.length} recent visual samples.`,
    latest_kind === "stable_face"
      ? "Current proxy suggests a face is present with bounded stability and centering information."
      : `Current proxy is limited by ${formatCameraCvObservationLabel(latest_kind)}.`,
    "These outputs are advisory visual proxies only and do not claim emotion, fatigue, or medical truth.",
  ].join(" ");

  return {
    availability,
    confidence: bounded_signal_confidence,
    status_note: [
      `Webcam monitoring reports ${formatCameraCvObservationLabel(latest_kind)}.`,
      degraded_reasons.length > 0
        ? `Confidence reduced because ${degraded_reasons.join("; ")}.`
        : "Recent bounded face observations are stable enough to contribute advisory context.",
      "This source remains advisory-only.",
    ].join(" "),
    observation_sim_time_sec: latest_observation.sim_time_sec,
    interpretation_input: {
      workload_index,
      attention_stability_index,
      signal_confidence: bounded_signal_confidence,
      degraded_mode_active: availability !== "active" || bounded_signal_confidence < 70,
      degraded_mode_reason:
        degraded_reasons.length > 0
          ? `Webcam monitoring confidence is reduced because ${degraded_reasons.join("; ")}.`
          : "Webcam monitoring currently provides a bounded, stable visual proxy window.",
      observation_window_ticks: tickSpanFromRecords(
        observations.map((observation) => ({
          interaction_id: observation.observation_id,
          sim_time_sec: observation.sim_time_sec,
          tick_index: observation.tick_index,
          event_kind: "runtime_control",
          ui_region: "runtime_controls",
        })),
      ),
      interpretation_note,
      provenance: "canonical_source_pipeline",
    },
  };
}

export function calculatePlantSeverityIndex(plant_state: PlantStateSnapshot): number {
  const level = numberValue(plant_state.vessel_water_level_m);
  const pressure = numberValue(plant_state.vessel_pressure_mpa);
  const containment = numberValue(plant_state.containment_pressure_kpa);
  const feedwater_gap = numberValue(plant_state.main_steam_flow_pct) - numberValue(plant_state.feedwater_flow_pct);

  let score = 0;

  if (level < 6.8) {
    score += clamp((6.8 - level) * 22, 0, 35);
  }

  if (pressure > 7.35) {
    score += clamp((pressure - 7.35) * 45, 0, 20);
  }

  if (containment > 106) {
    score += clamp((containment - 106) * 1.4, 0, 12);
  }

  if (feedwater_gap > 8) {
    score += clamp((feedwater_gap - 8) * 1.5, 0, 12);
  }

  if (Boolean(plant_state.reactor_trip_active)) {
    score += 12;
  }

  if (Boolean(plant_state.safety_relief_valve_open)) {
    score += 9;
  }

  return roundIndex(score);
}

export function calculateDiagnosisAmbiguityIndex(reasoning_snapshot: ReasoningSnapshot): number {
  const top_gap = topHypothesisGap(reasoning_snapshot);
  const top_band = reasoning_snapshot.ranked_hypotheses[0]?.confidence_band ?? "low";

  let score = clamp(28 - top_gap * 18, 0, 28);

  switch (top_band) {
    case "low":
      score += 26;
      break;
    case "medium":
      score += 12;
      break;
    case "high":
      break;
  }

  if (reasoning_snapshot.changed_since_last_tick) {
    score += 12;
  }

  score += clamp(10 - reasoning_snapshot.stable_for_ticks * 3, 0, 10);

  return roundIndex(score);
}

export function buildLegacyRuntimePlaceholderSource(
  params: LegacyRuntimePlaceholderParams,
): {
  source: HumanMonitoringSourceReading;
  interpretation_input: HumanMonitoringInterpretationInput;
} {
  const active_high_priority_count = params.alarm_set.active_alarms.filter((alarm) => alarm.priority !== "P3").length;
  const plant_severity_index = calculatePlantSeverityIndex(params.plant_state);
  const diagnosis_ambiguity_index = calculateDiagnosisAmbiguityIndex(params.reasoning_snapshot);
  const observation_window_ticks = params.tick_index + 1;
  const recent_action_age_sec = lastActionAgeSec(params.sim_time_sec, params.executed_actions);
  const alarm_load_pressure = clamp(
    params.alarm_set.active_alarm_count * 7 +
      params.alarm_intelligence.grouped_alarm_count * 6 +
      active_high_priority_count * 5,
    0,
    55,
  );

  let interaction_gap_penalty = 0;
  if (recent_action_age_sec === undefined) {
    interaction_gap_penalty = params.sim_time_sec >= 20 && params.alarm_set.active_alarm_count >= 2 ? 12 : 6;
  } else if (recent_action_age_sec > 45 && params.alarm_set.active_alarm_count >= 3) {
    interaction_gap_penalty = 10;
  } else if (recent_action_age_sec > 20 && params.alarm_set.active_alarm_count >= 2) {
    interaction_gap_penalty = 5;
  }

  const workload_index = roundIndex(
    12 +
      alarm_load_pressure +
      plant_severity_index * 0.32 +
      diagnosis_ambiguity_index * 0.18 +
      interaction_gap_penalty,
  );

  const attention_stability_index = roundIndex(
    88 -
      plant_severity_index * 0.16 -
      diagnosis_ambiguity_index * 0.34 -
      (params.reasoning_snapshot.changed_since_last_tick ? 10 : 0) -
      (params.lane_changed ? 8 : 0) -
      interaction_gap_penalty +
      (params.reasoning_snapshot.stable_for_ticks >= 3 ? 6 : 0),
  );

  let signal_confidence = 100;
  const degraded_reasons: string[] = [];

  if (observation_window_ticks < 3) {
    signal_confidence -= 35;
    degraded_reasons.push("short observation window");
  }

  if (params.executed_actions.length === 0) {
    signal_confidence -= 18;
    degraded_reasons.push("no operator interaction evidence yet");
  } else if (recent_action_age_sec !== undefined && recent_action_age_sec > 60) {
    signal_confidence -= 10;
    degraded_reasons.push("operator interaction evidence is stale");
  }

  if (params.reasoning_snapshot.stable_for_ticks < 2) {
    signal_confidence -= 10;
    degraded_reasons.push("storyline evidence is still settling");
  }

  if (params.lane_changed) {
    signal_confidence -= 8;
    degraded_reasons.push("first-response picture changed this tick");
  }

  if (params.alarm_set.active_alarm_count === 0) {
    signal_confidence -= 12;
    degraded_reasons.push("low-strain nominal window provides limited workload evidence");
  }

  const bounded_signal_confidence = roundIndex(clamp(signal_confidence, 15, 100));
  const degraded_mode_active = bounded_signal_confidence < 70;
  const interpretation_note =
    "Legacy runtime placeholder adapter active through the canonical human-monitoring pipeline. This preserves current deterministic operator-state behavior until real monitoring sources are connected.";

  return {
    source: {
      availability: degraded_mode_active ? "degraded" : "active",
      confidence: bounded_signal_confidence,
      status_note: degraded_mode_active
        ? `${interpretation_note} Confidence reduced: ${degraded_reasons.join("; ")}.`
        : `${interpretation_note} Placeholder signal is coherent for the current bounded runtime window.`,
      observation_sim_time_sec: params.sim_time_sec,
      interpretation_input: {
        workload_index,
        attention_stability_index,
        signal_confidence: bounded_signal_confidence,
        degraded_mode_active,
        degraded_mode_reason: degraded_mode_active
          ? `Confidence reduced: ${degraded_reasons.join("; ")}.`
          : "Nominal confidence from current runtime and session signals.",
        observation_window_ticks,
        interpretation_note,
        provenance: "legacy_runtime_placeholder",
      },
    },
    interpretation_input: {
      workload_index,
      attention_stability_index,
      signal_confidence: bounded_signal_confidence,
      degraded_mode_active,
      degraded_mode_reason: degraded_mode_active
        ? `Confidence reduced: ${degraded_reasons.join("; ")}.`
        : "Nominal confidence from current runtime and session signals.",
      observation_window_ticks,
      contributing_source_ids: ["legacy_runtime_placeholder"],
      provenance: "legacy_runtime_placeholder",
      interpretation_note,
    },
  };
}

const legacyRuntimePlaceholderAdapter: HumanMonitoringSourceAdapter = {
  source_id: "legacy_runtime_placeholder",
  source_kind: "legacy_runtime_placeholder",
  expected_update_interval_sec: 5,
  stale_after_sec: 20,
  window_duration_sec: 300,
  evaluate: (context) => buildLegacyRuntimePlaceholderSource(context).source,
};

const interactionTelemetryAdapter: HumanMonitoringSourceAdapter = {
  source_id: "interaction_telemetry",
  source_kind: "interaction_telemetry",
  expected_update_interval_sec: 20,
  stale_after_sec: 60,
  window_duration_sec: INTERACTION_TELEMETRY_WINDOW_SEC,
  evaluate: (context) => buildInteractionTelemetrySource(context),
};

const cameraCvAdapter: HumanMonitoringSourceAdapter = {
  source_id: "camera_cv",
  source_kind: "camera_cv",
  expected_update_interval_sec: 2,
  stale_after_sec: 8,
  window_duration_sec: CAMERA_CV_WINDOW_SEC,
  evaluate: (context) => buildCameraCvSource(context),
};

export const DEFAULT_HUMAN_MONITORING_SOURCE_ADAPTERS: readonly HumanMonitoringSourceAdapter[] = [
  legacyRuntimePlaceholderAdapter,
  interactionTelemetryAdapter,
  cameraCvAdapter,
];

export function evaluateHumanMonitoring(
  params: EvaluateHumanMonitoringParams,
): EvaluateHumanMonitoringResult {
  const adapters = params.adapters ?? DEFAULT_HUMAN_MONITORING_SOURCE_ADAPTERS;
  const next_runtime_state: HumanMonitoringRuntimeState = {
    sources: {},
    interaction_telemetry: {
      ...params.runtime_state.interaction_telemetry,
      records: clampWindowedInteractionRecords(
        params.sim_time_sec,
        params.runtime_state.interaction_telemetry.records,
      ),
    },
    camera_cv: {
      ...params.runtime_state.camera_cv,
      observations: clampWindowedCameraCvObservations(
        params.sim_time_sec,
        params.runtime_state.camera_cv.observations,
      ),
    },
  };
  const source_snapshots: HumanMonitoringSourceSnapshot[] = [];
  const readings: Array<{ source_id: string; reading: HumanMonitoringSourceReading }> = [];

  for (const adapter of adapters) {
    const previous_source_state = params.runtime_state.sources[adapter.source_id];
    const reading = adapter.evaluate(
      {
        ...params,
        interaction_telemetry: next_runtime_state.interaction_telemetry,
        camera_cv: next_runtime_state.camera_cv,
      },
      previous_source_state,
    );
    const { source_snapshot, runtime_state } = deriveSourceSnapshot({
      sim_time_sec: params.sim_time_sec,
      tick_duration_sec: params.tick_duration_sec,
      adapter,
      reading,
      previous_state: previous_source_state,
    });

    next_runtime_state.sources[adapter.source_id] = runtime_state;
    source_snapshots.push(source_snapshot);
    readings.push({ source_id: adapter.source_id, reading });
  }

  const interpretation_input = buildInterpretationInput({
    sources: source_snapshots,
    readings,
  });

  return {
    snapshot: buildHumanMonitoringSnapshot({
      sim_time_sec: params.sim_time_sec,
      tick_index: params.tick_index,
      tick_duration_sec: params.tick_duration_sec,
      sources: source_snapshots,
      interpretation_input,
    }),
    runtime_state: {
      ...next_runtime_state,
      camera_cv: {
        ...next_runtime_state.camera_cv,
        last_refresh_bucket:
          next_runtime_state.camera_cv.last_refresh_bucket ?? cameraCvRefreshBucket(next_runtime_state.camera_cv),
      },
    },
  };
}

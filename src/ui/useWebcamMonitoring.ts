import { useEffect, useRef, useState, type RefObject } from "react";
import type { SessionSnapshot } from "../contracts/aura";
import type { AuraSessionStore } from "../state/sessionStore";
import type { StatusTone } from "./format";

type UseWebcamMonitoringParams = {
  store: AuraSessionStore;
  snapshot: SessionSnapshot;
};

type FaceMetrics = {
  center_x: number;
  center_y: number;
  area_ratio: number;
};

type DetectorLike = {
  detectForVideo(
    video: HTMLVideoElement,
    timestampMs: number,
  ): {
    detections: Array<{
      categories: Array<{ score?: number }>;
      boundingBox?: {
        originX: number;
        originY: number;
        width: number;
        height: number;
      };
    }>;
  };
  close(): void;
};

type ControllerState = {
  stream?: MediaStream;
  video?: HTMLVideoElement;
  detector?: DetectorLike;
  timer?: number;
  last_face?: FaceMetrics;
};

export type WebcamMonitoringController = {
  desiredEnabled: boolean;
  buttonLabel: string;
  statusLabel: string;
  statusTone: StatusTone;
  statusDetail: string;
  toggle: () => void;
  disabled: boolean;
  previewRef: RefObject<HTMLVideoElement | null>;
};

const SAMPLE_INTERVAL_MS = 1000;
const MEDIAPIPE_WASM_PATH = "/mediapipe";
const FACE_MODEL_PATH = "/models/blaze_face_short_range.tflite";

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function currentCameraSource(snapshot: SessionSnapshot) {
  return snapshot.human_monitoring.sources.find((source) => source.source_kind === "camera_cv");
}

function statusToneFromSource(
  source: ReturnType<typeof currentCameraSource>,
  desiredEnabled: boolean,
): StatusTone {
  if (!source || source.availability === "not_connected") {
    return desiredEnabled ? "neutral" : "ok";
  }

  if (source.availability === "active") {
    return "ok";
  }

  if (source.availability === "unavailable" || source.freshness_status === "stale") {
    return "alert";
  }

  return "neutral";
}

function statusLabelFromSource(source: ReturnType<typeof currentCameraSource>, desiredEnabled: boolean): string {
  if (!source || source.availability === "not_connected") {
    return desiredEnabled ? "Webcam starting" : "Webcam off";
  }

  if (source.availability === "active") {
    return "Webcam advisory live";
  }

  if (source.availability === "unavailable") {
    return "Webcam unavailable";
  }

  if (source.freshness_status === "stale") {
    return "Webcam stale";
  }

  return "Webcam degraded";
}

function stopController(controller: ControllerState | null): void {
  if (!controller) {
    return;
  }

  if (typeof controller.timer === "number") {
    window.clearInterval(controller.timer);
  }

  controller.detector?.close();
  controller.stream?.getTracks().forEach((track) => track.stop());

  if (controller.video) {
    controller.video.pause();
    controller.video.srcObject = null;
  }
}

function clearPreview(video: HTMLVideoElement | null): void {
  if (!video) {
    return;
  }

  video.pause();
  video.srcObject = null;
}

function attachPreview(video: HTMLVideoElement | null, stream?: MediaStream): void {
  if (!video) {
    return;
  }

  if (!stream) {
    clearPreview(video);
    return;
  }

  video.muted = true;
  video.playsInline = true;
  video.srcObject = stream;
  void video.play().catch(() => undefined);
}

function mediaUnavailableReason(error: unknown): {
  unavailable_reason: string;
  status_note: string;
} {
  const name =
    typeof error === "object" && error && "name" in error && typeof error.name === "string"
      ? error.name
      : "";

  if (name === "NotAllowedError" || name === "SecurityError") {
    return {
      unavailable_reason: "permission_denied",
      status_note:
        "Webcam monitoring is unavailable because camera permission was denied. The canonical monitoring path remains advisory and continues without webcam input.",
    };
  }

  if (name === "NotFoundError" || name === "DevicesNotFoundError") {
    return {
      unavailable_reason: "no_camera",
      status_note:
        "Webcam monitoring is unavailable because no camera device is present. The canonical monitoring path continues without webcam input.",
    };
  }

  return {
    unavailable_reason: "camera_error",
    status_note:
      "Webcam monitoring is unavailable because the camera could not be started locally. The canonical monitoring path continues without webcam input.",
  };
}

function buildObservation(params: {
  detections: Array<{
    categories: Array<{ score?: number }>;
    boundingBox?: {
      originX: number;
      originY: number;
      width: number;
      height: number;
    };
  }>;
  video: HTMLVideoElement;
  previous_face?: FaceMetrics;
}) {
  const { detections, video, previous_face } = params;
  const video_width = Math.max(video.videoWidth || 0, 1);
  const video_height = Math.max(video.videoHeight || 0, 1);
  const frame_area = Math.max(video_width * video_height, 1);

  if (detections.length === 0) {
    return {
      observation_kind: "no_face" as const,
      face_count: 0,
      strongest_face_confidence: 0,
      face_center_offset: 1,
      head_motion_delta: 0.35,
      face_area_ratio: 0,
      note: "no single face is currently visible in the frame",
      next_face: undefined,
    };
  }

  const sorted_detections = [...detections].sort((left, right) => {
    const left_score = left.categories[0]?.score ?? 0;
    const right_score = right.categories[0]?.score ?? 0;
    return right_score - left_score;
  });
  const strongest_detection = sorted_detections[0];
  const strongest_score = clamp((strongest_detection?.categories[0]?.score ?? 0) * 100, 0, 100);

  if (detections.length > 1) {
    return {
      observation_kind: "multiple_faces" as const,
      face_count: detections.length,
      strongest_face_confidence: strongest_score,
      face_center_offset: 0.65,
      head_motion_delta: 0.32,
      face_area_ratio: 0,
      note: "multiple faces are in frame, so the signal remains ambiguous",
      next_face: undefined,
    };
  }

  const bounding_box = strongest_detection?.boundingBox;
  if (!bounding_box) {
    return {
      observation_kind: "weak_face" as const,
      face_count: 1,
      strongest_face_confidence: strongest_score,
      face_center_offset: 0.55,
      head_motion_delta: 0.24,
      face_area_ratio: 0,
      note: "a face candidate was detected, but the bounding box was too weak to interpret",
      next_face: undefined,
    };
  }

  const center_x = (bounding_box.originX + bounding_box.width / 2) / video_width;
  const center_y = (bounding_box.originY + bounding_box.height / 2) / video_height;
  const face_area_ratio = clamp((bounding_box.width * bounding_box.height) / frame_area, 0, 1);
  const center_offset = clamp(
    Math.sqrt((center_x - 0.5) ** 2 + (center_y - 0.5) ** 2) / 0.71,
    0,
    1,
  );
  const previous_area_ratio = previous_face?.area_ratio ?? face_area_ratio;
  const motion_delta = clamp(
    Math.abs(center_x - (previous_face?.center_x ?? center_x)) +
      Math.abs(center_y - (previous_face?.center_y ?? center_y)) +
      Math.abs(face_area_ratio - previous_area_ratio) * 0.6,
    0,
    1,
  );
  const weak_face = strongest_score < 58 || face_area_ratio < 0.035;

  if (weak_face) {
    return {
      observation_kind: "weak_face" as const,
      face_count: 1,
      strongest_face_confidence: strongest_score,
      face_center_offset: center_offset,
      head_motion_delta: motion_delta,
      face_area_ratio,
      note: "face confidence is weak, so the webcam signal remains bounded and cautious",
      next_face: {
        center_x,
        center_y,
        area_ratio: face_area_ratio,
      },
    };
  }

  return {
    observation_kind: "stable_face" as const,
    face_count: 1,
    strongest_face_confidence: strongest_score,
    face_center_offset: center_offset,
    head_motion_delta: motion_delta,
    face_area_ratio,
    note: "a single face is present with bounded centering and stability information",
    next_face: {
      center_x,
      center_y,
      area_ratio: face_area_ratio,
    },
  };
}

export function useWebcamMonitoring(params: UseWebcamMonitoringParams) {
  const { store, snapshot } = params;
  const [desiredEnabled, setDesiredEnabled] = useState(false);
  const controllerRef = useRef<ControllerState | null>(null);
  const previewRef = useRef<HTMLVideoElement | null>(null);
  const cameraSource = currentCameraSource(snapshot);

  useEffect(() => {
    attachPreview(previewRef.current, controllerRef.current?.stream);
    if (!desiredEnabled) {
      clearPreview(previewRef.current);
    }

    return () => {
      clearPreview(previewRef.current);
    };
  }, [desiredEnabled, snapshot.session_id, cameraSource?.availability, cameraSource?.status_note]);

  useEffect(() => {
    if (!desiredEnabled) {
      stopController(controllerRef.current);
      controllerRef.current = null;
      clearPreview(previewRef.current);
      store.setCameraCvIntent(false);
      return;
    }

    let cancelled = false;
    let detectionInFlight = false;
    const controller: ControllerState = {};
    controllerRef.current = controller;

    async function start(): Promise<void> {
      store.setCameraCvIntent(true);

      if (
        typeof window === "undefined" ||
        typeof navigator === "undefined" ||
        !navigator.mediaDevices ||
        typeof navigator.mediaDevices.getUserMedia !== "function"
      ) {
        store.updateCameraCvLifecycle({
          lifecycle_status: "unavailable",
          unavailable_reason: "unsupported_environment",
          status_note:
            "Webcam monitoring is unavailable because this environment does not support local camera capture.",
          clear_observations: true,
        });
        return;
      }

      store.updateCameraCvLifecycle({
        lifecycle_status: "initializing",
        status_note:
          "Webcam monitoring is requesting local camera access for bounded advisory monitoring.",
        clear_observations: true,
      });

      try {
        controller.stream = await navigator.mediaDevices.getUserMedia({
          audio: false,
          video: {
            facingMode: "user",
            width: { ideal: 640 },
            height: { ideal: 480 },
          },
        });
      } catch (error) {
        const unavailable = mediaUnavailableReason(error);
        store.updateCameraCvLifecycle({
          lifecycle_status: "unavailable",
          ...unavailable,
          clear_observations: true,
        });
        return;
      }

      try {
        const vision = await import("@mediapipe/tasks-vision");
        const wasm_fileset = await vision.FilesetResolver.forVisionTasks(MEDIAPIPE_WASM_PATH);
        controller.detector = (await vision.FaceDetector.createFromOptions(wasm_fileset, {
          baseOptions: {
            modelAssetPath: FACE_MODEL_PATH,
          },
          runningMode: "VIDEO",
          minDetectionConfidence: 0.55,
          minSuppressionThreshold: 0.3,
        })) as DetectorLike;
      } catch {
        stopController(controller);
        store.updateCameraCvLifecycle({
          lifecycle_status: "unavailable",
          unavailable_reason: "model_init_failed",
          status_note:
            "Webcam monitoring is unavailable because the local CV model could not be initialized.",
          clear_observations: true,
        });
        return;
      }

      if (cancelled) {
        stopController(controller);
        clearPreview(previewRef.current);
        return;
      }

      const video = document.createElement("video");
      video.autoplay = true;
      video.muted = true;
      video.playsInline = true;
      video.srcObject = controller.stream;
      controller.video = video;
      attachPreview(previewRef.current, controller.stream);

      try {
        await video.play();
      } catch {
        stopController(controller);
        store.updateCameraCvLifecycle({
          lifecycle_status: "unavailable",
          unavailable_reason: "video_start_failed",
          status_note:
            "Webcam monitoring is unavailable because the local camera stream could not be started for processing.",
          clear_observations: true,
        });
        return;
      }

      store.updateCameraCvLifecycle({
        lifecycle_status: "degraded",
        status_note:
          "Webcam monitoring is connected and waiting for a stable bounded face-presence signal.",
      });

      const sample = () => {
        if (
          cancelled ||
          detectionInFlight ||
          !controller.detector ||
          !controller.video ||
          (typeof document !== "undefined" && document.visibilityState === "hidden")
        ) {
          return;
        }

        detectionInFlight = true;
        try {
          const result = controller.detector.detectForVideo(controller.video, performance.now());
          const observation = buildObservation({
            detections: result.detections,
            video: controller.video,
            previous_face: controller.last_face,
          });
          controller.last_face = observation.next_face;
          store.recordCameraCvObservation({
            observation_kind: observation.observation_kind,
            face_count: observation.face_count,
            strongest_face_confidence: observation.strongest_face_confidence,
            face_center_offset: observation.face_center_offset,
            head_motion_delta: observation.head_motion_delta,
            face_area_ratio: observation.face_area_ratio,
            note: observation.note,
          });
        } catch {
          stopController(controller);
          store.updateCameraCvLifecycle({
            lifecycle_status: "unavailable",
            unavailable_reason: "detector_runtime_error",
            status_note:
              "Webcam monitoring became unavailable because the local detector stopped processing frames safely.",
            clear_observations: true,
          });
        } finally {
          detectionInFlight = false;
        }
      };

      sample();
      controller.timer = window.setInterval(sample, SAMPLE_INTERVAL_MS);
    }

    void start();

    return () => {
      cancelled = true;
      stopController(controller);
      clearPreview(previewRef.current);
      if (controllerRef.current === controller) {
        controllerRef.current = null;
      }
    };
  }, [desiredEnabled, snapshot.session_id, store]);

  return {
    desiredEnabled,
    buttonLabel: desiredEnabled ? "Disable webcam monitoring" : "Enable webcam monitoring",
    statusLabel: statusLabelFromSource(cameraSource, desiredEnabled),
    statusTone: statusToneFromSource(cameraSource, desiredEnabled),
    statusDetail:
      cameraSource?.status_note ??
      (desiredEnabled
        ? "Webcam monitoring is starting for bounded advisory use."
        : "Webcam monitoring is off until manually enabled."),
    toggle: () => setDesiredEnabled((value) => !value),
    disabled: Boolean(snapshot.outcome),
    previewRef,
  };
}

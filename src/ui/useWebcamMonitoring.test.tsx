import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { AuraSessionStore, useAuraSessionSnapshot } from "../state/sessionStore";
import { useWebcamMonitoring } from "./useWebcamMonitoring";

const mockForVisionTasks = vi.fn();
const mockCreateFromOptions = vi.fn();

vi.mock("@mediapipe/tasks-vision", () => ({
  FilesetResolver: {
    forVisionTasks: mockForVisionTasks,
  },
  FaceDetector: {
    createFromOptions: mockCreateFromOptions,
  },
}));

function WebcamHarness(props: { store: AuraSessionStore }) {
  const snapshot = useAuraSessionSnapshot(props.store);
  const webcam = useWebcamMonitoring({ store: props.store, snapshot });

  return (
    <div>
      <button type="button" onClick={webcam.toggle} disabled={webcam.disabled}>
        {webcam.buttonLabel}
      </button>
      <p>{webcam.statusLabel}</p>
      <p>{webcam.statusDetail}</p>
    </div>
  );
}

describe("useWebcamMonitoring", () => {
  beforeEach(() => {
    mockForVisionTasks.mockReset();
    mockCreateFromOptions.mockReset();

    Object.defineProperty(HTMLMediaElement.prototype, "play", {
      configurable: true,
      value: vi.fn().mockResolvedValue(undefined),
    });
    Object.defineProperty(HTMLMediaElement.prototype, "pause", {
      configurable: true,
      value: vi.fn(),
    });
    Object.defineProperty(HTMLVideoElement.prototype, "videoWidth", {
      configurable: true,
      get: () => 640,
    });
    Object.defineProperty(HTMLVideoElement.prototype, "videoHeight", {
      configurable: true,
      get: () => 480,
    });
  });

  it("maps camera permission denial into canonical unavailable status", async () => {
    Object.defineProperty(navigator, "mediaDevices", {
      configurable: true,
      value: {
        getUserMedia: vi.fn().mockRejectedValue({ name: "NotAllowedError" }),
      },
    });

    const store = new AuraSessionStore({ session_index: 401, tick_duration_sec: 5 });
    render(<WebcamHarness store={store} />);

    fireEvent.click(screen.getByRole("button", { name: /Enable webcam monitoring/i }));

    await waitFor(() => {
      const cameraSource = store.getSnapshot().human_monitoring.sources.find((source) => source.source_kind === "camera_cv");
      expect(cameraSource?.availability).toBe("unavailable");
      expect(cameraSource?.status_note).toMatch(/permission was denied/i);
    });
  });

  it("maps unsupported environments into canonical unavailable status", async () => {
    Object.defineProperty(navigator, "mediaDevices", {
      configurable: true,
      value: undefined,
    });

    const store = new AuraSessionStore({ session_index: 403, tick_duration_sec: 5 });
    render(<WebcamHarness store={store} />);

    fireEvent.click(screen.getByRole("button", { name: /Enable webcam monitoring/i }));

    await waitFor(() => {
      const cameraSource = store.getSnapshot().human_monitoring.sources.find((source) => source.source_kind === "camera_cv");
      expect(cameraSource?.availability).toBe("unavailable");
      expect(cameraSource?.status_note).toMatch(/does not support local camera capture/i);
    });
  });

  it("publishes stable webcam detections through the canonical source path and cleans up on disable", async () => {
    const stopTrack = vi.fn();
    Object.defineProperty(navigator, "mediaDevices", {
      configurable: true,
      value: {
        getUserMedia: vi.fn().mockResolvedValue({
          getTracks: () => [{ stop: stopTrack }],
        }),
      },
    });

    const closeDetector = vi.fn();
    mockForVisionTasks.mockResolvedValue({ wasmLoaderPath: "/mediapipe" });
    mockCreateFromOptions.mockResolvedValue({
      detectForVideo: vi.fn().mockReturnValue({
        detections: [
          {
            categories: [{ score: 0.84 }],
            boundingBox: {
              originX: 220,
              originY: 120,
              width: 160,
              height: 180,
            },
          },
        ],
      }),
      close: closeDetector,
    });

    const store = new AuraSessionStore({ session_index: 402, tick_duration_sec: 5 });
    render(<WebcamHarness store={store} />);

    fireEvent.click(screen.getByRole("button", { name: /Enable webcam monitoring/i }));

    await waitFor(() => {
      const cameraSource = store.getSnapshot().human_monitoring.sources.find((source) => source.source_kind === "camera_cv");
      expect(cameraSource?.contributes_to_aggregate).toBe(true);
      expect(store.getSnapshot().human_monitoring.mode).toBe("live_sources");
    });

    fireEvent.click(screen.getByRole("button", { name: /Disable webcam monitoring/i }));

    await waitFor(() => {
      const cameraSource = store.getSnapshot().human_monitoring.sources.find((source) => source.source_kind === "camera_cv");
      expect(cameraSource?.availability).toBe("not_connected");
    });

    expect(stopTrack).toHaveBeenCalled();
    expect(closeDetector).toHaveBeenCalled();
  });
});

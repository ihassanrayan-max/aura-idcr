import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import App from "../App";
import { AuraSessionStore } from "../state/sessionStore";

function runSuccessfulSession(): AuraSessionStore {
  const store = new AuraSessionStore({ session_index: 711, tick_duration_sec: 5 });
  store.advanceTick();
  store.advanceTick();
  store.advanceTick();
  store.requestAction({
    action_id: "act_adjust_feedwater",
    requested_value: 82,
    ui_region: "plant_mimic",
    reason_note: "AI briefing review test",
  });
  store.runUntilComplete(60);
  return store;
}

function openReviewWorkspace(): void {
  fireEvent.click(screen.getByRole("tab", { name: /Review/i }));
}

describe("AI briefing layer UI", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("renders the incident commander fallback and logs request/resolution metadata without mutating runtime state", async () => {
    const store = new AuraSessionStore({ session_index: 712, tick_duration_sec: 5 });
    for (let tick = 0; tick < 4; tick += 1) {
      store.advanceTick();
    }
    const before = store.getSnapshot();

    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: false,
        status: 503,
        json: async () => ({ error: "OpenAI server key is not configured" }),
      }),
    );

    render(<App store={store} autoRun={false} />);

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: /Generate AI briefing/i }));
    });

    await screen.findByText(/Deterministic fallback/i);

    const after = store.getSnapshot();
    const aiEvents = after.events.filter((event) => event.source_module === "ai_briefing_layer");

    expect(screen.getByTestId("incident-commander-panel")).toBeInTheDocument();
    expect(after.sim_time_sec).toBe(before.sim_time_sec);
    expect(after.support_mode).toBe(before.support_mode);
    expect(aiEvents.map((event) => event.event_type)).toEqual([
      "ai_briefing_requested",
      "ai_briefing_failed",
      "ai_briefing_resolved",
    ]);
    expect(
      aiEvents.find((event) => event.event_type === "ai_briefing_resolved")?.payload.evidence_ref_ids,
    ).toBeDefined();
  });

  it("renders narrow why affordances for support posture and validator output without adding a chat box", async () => {
    const store = new AuraSessionStore({ session_index: 713, tick_duration_sec: 5 });
    for (let tick = 0; tick < 4; tick += 1) {
      store.advanceTick();
    }
    store.requestAction({
      action_id: "act_adjust_feedwater",
      requested_value: 70,
      ui_region: "plant_mimic",
      reason_note: "AI briefing why test",
    });

    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: false,
        status: 503,
        json: async () => ({ error: "OpenAI server key is not configured" }),
      }),
    );

    render(<App store={store} autoRun={false} />);

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: /Why this posture\?/i }));
    });
    await screen.findByTestId("support-why-panel");

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: /Why this result\?/i }));
    });
    await screen.findByTestId("validator-why-panel");

    expect(screen.queryByRole("textbox")).not.toBeInTheDocument();
    expect(screen.getByTestId("support-why-panel")).toBeInTheDocument();
    expect(screen.getByTestId("validator-why-panel")).toBeInTheDocument();
  });

  it("shows the grounded after-action reviewer at the top of completed Review after terminal outcome", async () => {
    const store = runSuccessfulSession();

    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: false,
        status: 503,
        json: async () => ({ error: "OpenAI server key is not configured" }),
      }),
    );

    render(<App store={store} autoRun={false} />);
    openReviewWorkspace();

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: /Generate grounded AI summary/i }));
    });

    await waitFor(() => {
      expect(screen.getByTestId("after-action-ai-panel")).toBeInTheDocument();
      expect(screen.getByText(/Overall assessment/i)).toBeInTheDocument();
      expect(screen.getByText(/Deterministic fallback/i)).toBeInTheDocument();
    });
  });
});

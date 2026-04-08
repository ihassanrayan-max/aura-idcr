import { afterEach, describe, expect, it, vi } from "vitest";
import { AuraSessionStore } from "../state/sessionStore";
import {
  buildAfterActionReviewerFallback,
  buildIncidentCommanderFallback,
  buildIncidentCommanderRequest,
  buildWhyAssistantFallback,
  requestAiBriefing,
} from "./aiBriefing";

function runSuccessfulSession(): AuraSessionStore {
  const store = new AuraSessionStore({ session_index: 611, tick_duration_sec: 5 });
  store.advanceTick();
  store.advanceTick();
  store.advanceTick();
  store.requestAction({
    action_id: "act_adjust_feedwater",
    requested_value: 82,
    ui_region: "plant_mimic",
    reason_note: "AI briefing completed-review test",
  });
  store.runUntilComplete(60);
  return store;
}

function runValidationSession(): AuraSessionStore {
  const store = new AuraSessionStore({ session_index: 612, tick_duration_sec: 5 });
  for (let tick = 0; tick < 4; tick += 1) {
    store.advanceTick();
  }
  store.requestAction({
    action_id: "act_adjust_feedwater",
    requested_value: 70,
    ui_region: "plant_mimic",
    reason_note: "AI briefing validator why test",
  });
  return store;
}

describe("ai briefing", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("falls back to the deterministic incident commander briefing when the server is rate-limited", async () => {
    const store = new AuraSessionStore({ session_index: 613, tick_duration_sec: 5 });
    for (let tick = 0; tick < 4; tick += 1) {
      store.advanceTick();
    }
    const snapshot = store.getSnapshot();

    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: false,
        status: 429,
        json: async () => ({ error: "Rate limit exceeded" }),
      }),
    );

    const result = await requestAiBriefing({
      request: buildIncidentCommanderRequest(snapshot),
      fallback: buildIncidentCommanderFallback(snapshot),
    });

    expect(result.provider).toBe("deterministic_fallback");
    expect(result.failure_kind).toBe("rate_limited");
    expect(result.response.priority_actions.length).toBeGreaterThan(0);
    expect(result.response.watchouts.length).toBeGreaterThan(0);
    expect(result.response.evidence_refs.length).toBeGreaterThan(0);
  });

  it("builds an after-action fallback summary from the completed deterministic review", () => {
    const review = runSuccessfulSession().getSnapshot().completed_review!;
    const fallback = buildAfterActionReviewerFallback(review);

    expect(fallback.overall_assessment).toMatch(/ended in/i);
    expect(fallback.turning_points.length).toBeGreaterThan(0);
    expect(fallback.adaptation_observations.length).toBeGreaterThan(0);
    expect(fallback.training_takeaways.length).toBeGreaterThan(0);
    expect(fallback.evidence_refs.length).toBeGreaterThan(0);
  });

  it("builds a narrow validator why fallback from the existing validation result", () => {
    const snapshot = runValidationSession().getSnapshot();
    const fallback = buildWhyAssistantFallback(snapshot, "validator_last_result");

    expect(snapshot.last_validation_result).toBeDefined();
    expect(fallback.question_label).toBe("Why this result?");
    expect(fallback.short_answer).toBe(snapshot.last_validation_result?.explanation);
    expect(fallback.why_bullets.join(" ")).toMatch(/Reason code/i);
    expect(fallback.evidence_refs.length).toBeGreaterThan(0);
  });
});

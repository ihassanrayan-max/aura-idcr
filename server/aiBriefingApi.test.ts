import { afterEach, describe, expect, it, vi } from "vitest";
import { handleAiBriefingApi, resetAiBriefingRateLimitState } from "./aiBriefingApi";

declare const process: {
  env: Record<string, string | undefined>;
};

const incidentBody = JSON.stringify({
  kind: "incident_commander",
  anchor: {
    anchor_kind: "live_tick",
    anchor_id: "tick_0004",
    session_id: "session_001_r1",
    sim_time_sec: 20,
  },
  schema_version: 1,
  context: {
    evidence_catalog: [
      {
        ref_id: "tick_0004",
        ref_type: "tick_id",
        label: "Live tick tick_0004",
        detail: "Sim time t+20s.",
      },
      {
        ref_id: "hyp_feedwater_degradation",
        ref_type: "hypothesis_id",
        label: "Feedwater degradation",
        detail: "Dominant storyline.",
      },
    ],
  },
});

describe("ai briefing api", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    resetAiBriefingRateLimitState();
    delete process.env.OPENAI_API_KEY;
    delete process.env.OPENAI_MODEL;
    delete process.env.AI_BRIEFING_RATE_LIMIT_MAX_REQUESTS;
    delete process.env.AI_BRIEFING_RATE_LIMIT_WINDOW_MS;
  });

  it("rejects non-POST requests", async () => {
    const response = await handleAiBriefingApi({ method: "GET" });
    expect(response.status).toBe(405);
  });

  it("enforces the configured rate limit", async () => {
    process.env.OPENAI_API_KEY = "server-test-key";
    process.env.AI_BRIEFING_RATE_LIMIT_MAX_REQUESTS = "1";
    process.env.AI_BRIEFING_RATE_LIMIT_WINDOW_MS = "60000";
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          output_text: JSON.stringify({
            headline: "Feedwater degradation remains the lead picture.",
            situation_now: "Alarm pressure is rising.",
            command_intent: "Stay with the bounded lane.",
            priority_actions: ["Confirm the recommended correction."],
            watchouts: ["Watch vessel level."],
            confidence_note: "Grounded in the supplied tick.",
            operator_authority_note: "Operator authority is preserved.",
            review_handoff_needed: false,
            evidence_refs: [{ ref_id: "tick_0004", ref_type: "tick_id", label: "ignored by canonicalizer" }],
          }),
        }),
      }),
    );

    const first = await handleAiBriefingApi({
      method: "POST",
      bodyText: incidentBody,
      remoteAddress: "127.0.0.1",
    });
    const second = await handleAiBriefingApi({
      method: "POST",
      bodyText: incidentBody,
      remoteAddress: "127.0.0.1",
    });

    expect(first.status).toBe(200);
    expect(second.status).toBe(429);
  });

  it("returns structured incident commander output from the OpenAI response", async () => {
    process.env.OPENAI_API_KEY = "server-test-key";
    process.env.OPENAI_MODEL = "gpt-4.1-mini";
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          output_text: JSON.stringify({
            headline: "Feedwater degradation remains the lead picture.",
            situation_now: "Alarm pressure is rising and the storyline is stable.",
            command_intent: "Use the bounded recovery lane before adding another manual move.",
            priority_actions: ["Follow the current recovery correction."],
            watchouts: ["Watch vessel level.", "Watch feedwater flow."],
            confidence_note: "Grounded in the supplied deterministic tick.",
            operator_authority_note: "Operator authority is preserved.",
            review_handoff_needed: false,
            evidence_refs: [{ ref_id: "tick_0004", ref_type: "tick_id", label: "model supplied label" }],
          }),
        }),
      }),
    );

    const response = await handleAiBriefingApi({
      method: "POST",
      bodyText: incidentBody,
      remoteAddress: "127.0.0.1",
    });

    expect(response.status).toBe(200);
    expect(response.body.provider).toBe("llm");
    expect((response.body.response as { headline: string }).headline).toMatch(/lead picture/i);
    expect(
      (response.body.response as { evidence_refs: Array<{ label: string }> }).evidence_refs[0]?.label,
    ).toBe("Live tick tick_0004");
  });
});

import { afterEach, describe, expect, it, vi } from "vitest";
import {
  handleCounterfactualAdvisorApi,
  resetCounterfactualAdvisorRateLimitState,
} from "../../server/counterfactualAdvisorApi";

declare const process: {
  env: Record<string, string | undefined>;
};

const validBody = JSON.stringify({
  snapshot_context: {
    scenario_id: "scn_alarm_cascade_root_cause",
    phase: "Phase A",
    support_mode: "Guided support",
  },
  branches: [
    {
      branch_id: "guided",
      label: "Guided recovery path",
      one_line_summary: "Outcome success; risk improving.",
    },
  ],
});

describe("counterfactual advisor api", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    resetCounterfactualAdvisorRateLimitState();
    delete process.env.OPENAI_API_KEY;
    delete process.env.OPENAI_MODEL;
    delete process.env.COUNTERFACTUAL_ADVISOR_RATE_LIMIT_MAX_REQUESTS;
    delete process.env.COUNTERFACTUAL_ADVISOR_RATE_LIMIT_WINDOW_MS;
  });

  it("rejects non-POST requests", async () => {
    const response = await handleCounterfactualAdvisorApi({
      method: "GET",
    });

    expect(response.status).toBe(405);
  });

  it("enforces the configured rate limit", async () => {
    process.env.OPENAI_API_KEY = "server-test-key";
    process.env.COUNTERFACTUAL_ADVISOR_RATE_LIMIT_MAX_REQUESTS = "1";
    process.env.COUNTERFACTUAL_ADVISOR_RATE_LIMIT_WINDOW_MS = "60000";
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          output_text: JSON.stringify({
            recommended_branch_id: "guided",
            rationale: "Guided path best preserves stability.",
            why_not: ["Hold increases uncertainty."],
            top_watch_signals: ["vessel_water_level_m"],
            confidence_caveat: "Short-horizon projection only.",
          }),
        }),
      }),
    );

    const first = await handleCounterfactualAdvisorApi({
      method: "POST",
      bodyText: validBody,
      remoteAddress: "127.0.0.1",
    });
    const second = await handleCounterfactualAdvisorApi({
      method: "POST",
      bodyText: validBody,
      remoteAddress: "127.0.0.1",
    });

    expect(first.status).toBe(200);
    expect(second.status).toBe(429);
  });

  it("returns structured advisor output from the OpenAI response", async () => {
    process.env.OPENAI_API_KEY = "server-test-key";
    process.env.OPENAI_MODEL = "gpt-4.1-mini";
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          output_text: JSON.stringify({
            recommended_branch_id: "guided",
            rationale: "Guided recovery best reduces near-term risk while keeping validator exposure low.",
            why_not: ["Hold keeps the bad-threshold margin tighter."],
            top_watch_signals: ["feedwater_flow_pct", "vessel_pressure_mpa"],
            confidence_caveat: "This remains an advisory short-horizon projection.",
          }),
        }),
      }),
    );

    const response = await handleCounterfactualAdvisorApi({
      method: "POST",
      bodyText: validBody,
      remoteAddress: "127.0.0.1",
    });

    expect(response.status).toBe(200);
    expect(response.body.provider).toBe("llm");
    expect(response.body.recommended_branch_id).toBe("guided");
  });
});

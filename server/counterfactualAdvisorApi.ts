declare const process: {
  env: Record<string, string | undefined>;
};

type AdvisorApiRequest = {
  method?: string;
  headers?: Record<string, string | string[] | undefined>;
  bodyText?: string;
  remoteAddress?: string;
};

type AdvisorApiResponse = {
  status: number;
  body: Record<string, unknown>;
};

type ParsedNarrative = {
  recommended_branch_id: "guided" | "operator_requested" | "hold";
  rationale: string;
  why_not: string[];
  top_watch_signals: string[];
  confidence_caveat: string;
};

type RateLimitEntry = {
  windowStartMs: number;
  count: number;
};

const rateLimitState = new Map<string, RateLimitEntry>();

export function resetCounterfactualAdvisorRateLimitState(): void {
  rateLimitState.clear();
}

function rateLimitWindowMs(): number {
  return Number(process.env.COUNTERFACTUAL_ADVISOR_RATE_LIMIT_WINDOW_MS ?? 60_000);
}

function rateLimitMaxRequests(): number {
  return Number(process.env.COUNTERFACTUAL_ADVISOR_RATE_LIMIT_MAX_REQUESTS ?? 8);
}

function openAiModel(): string {
  return process.env.OPENAI_MODEL ?? "gpt-4.1-mini";
}

function realClientIp(headers: AdvisorApiRequest["headers"], remoteAddress?: string): string {
  const forwarded = headers?.["x-forwarded-for"];
  if (Array.isArray(forwarded) && forwarded[0]) {
    return forwarded[0].split(",")[0]!.trim();
  }
  if (typeof forwarded === "string" && forwarded.length > 0) {
    return forwarded.split(",")[0]!.trim();
  }
  return remoteAddress ?? "unknown";
}

function applyRateLimit(ip: string): { allowed: boolean; retryAfterSec?: number } {
  const now = Date.now();
  const windowMs = rateLimitWindowMs();
  const limit = rateLimitMaxRequests();
  const existing = rateLimitState.get(ip);

  if (!existing || now - existing.windowStartMs >= windowMs) {
    rateLimitState.set(ip, { windowStartMs: now, count: 1 });
    return { allowed: true };
  }

  if (existing.count >= limit) {
    const retryAfterSec = Math.max(1, Math.ceil((existing.windowStartMs + windowMs - now) / 1000));
    return { allowed: false, retryAfterSec };
  }

  existing.count += 1;
  rateLimitState.set(ip, existing);
  return { allowed: true };
}

function parseNarrativeJson(raw: string): ParsedNarrative | undefined {
  try {
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    if (
      (parsed.recommended_branch_id === "guided" ||
        parsed.recommended_branch_id === "operator_requested" ||
        parsed.recommended_branch_id === "hold") &&
      typeof parsed.rationale === "string" &&
      Array.isArray(parsed.why_not) &&
      Array.isArray(parsed.top_watch_signals) &&
      typeof parsed.confidence_caveat === "string"
    ) {
      return {
        recommended_branch_id: parsed.recommended_branch_id,
        rationale: parsed.rationale.trim(),
        why_not: parsed.why_not.filter((value): value is string => typeof value === "string").slice(0, 2),
        top_watch_signals: parsed.top_watch_signals
          .filter((value): value is string => typeof value === "string")
          .slice(0, 3),
        confidence_caveat: parsed.confidence_caveat.trim(),
      };
    }
  } catch {
    return undefined;
  }

  return undefined;
}

function extractResponseText(payload: Record<string, unknown>): string | undefined {
  const direct = payload.output_text;
  if (typeof direct === "string" && direct.trim().length > 0) {
    return direct;
  }

  const output = payload.output;
  if (!Array.isArray(output)) {
    return undefined;
  }

  for (const item of output) {
    if (!item || typeof item !== "object") {
      continue;
    }
    const content = (item as { content?: unknown }).content;
    if (!Array.isArray(content)) {
      continue;
    }
    for (const entry of content) {
      if (!entry || typeof entry !== "object") {
        continue;
      }
      const text = (entry as { text?: unknown }).text;
      if (typeof text === "string" && text.trim().length > 0) {
        return text;
      }
    }
  }

  return undefined;
}

function llmSchema() {
  return {
    type: "object",
    additionalProperties: false,
    required: ["recommended_branch_id", "rationale", "why_not", "top_watch_signals", "confidence_caveat"],
    properties: {
      recommended_branch_id: {
        type: "string",
        enum: ["guided", "operator_requested", "hold"],
      },
      rationale: { type: "string" },
      why_not: {
        type: "array",
        items: { type: "string" },
      },
      top_watch_signals: {
        type: "array",
        items: { type: "string" },
      },
      confidence_caveat: { type: "string" },
    },
  };
}

function validRequestBody(body: Record<string, unknown>): boolean {
  return Boolean(
    body &&
      typeof body === "object" &&
      Array.isArray(body.branches) &&
      body.snapshot_context &&
      typeof body.snapshot_context === "object",
  );
}

export async function handleCounterfactualAdvisorApi(
  request: AdvisorApiRequest,
): Promise<AdvisorApiResponse> {
  if (request.method !== "POST") {
    return {
      status: 405,
      body: { error: "Method not allowed" },
    };
  }

  const ip = realClientIp(request.headers, request.remoteAddress);
  const rateLimit = applyRateLimit(ip);
  if (!rateLimit.allowed) {
    return {
      status: 429,
      body: {
        error: "Rate limit exceeded",
        retry_after_sec: rateLimit.retryAfterSec,
      },
    };
  }

  if (!process.env.OPENAI_API_KEY) {
    return {
      status: 503,
      body: { error: "OpenAI server key is not configured" },
    };
  }

  let parsedBody: Record<string, unknown>;
  try {
    parsedBody = request.bodyText ? (JSON.parse(request.bodyText) as Record<string, unknown>) : {};
  } catch {
    return {
      status: 400,
      body: { error: "Invalid JSON body" },
    };
  }

  if (!validRequestBody(parsedBody)) {
    return {
      status: 400,
      body: { error: "Invalid advisor payload" },
    };
  }

  try {
    const response = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
      },
      body: JSON.stringify({
        model: openAiModel(),
        instructions:
          "Compare the provided bounded branch projections for a nuclear control-room decision-support prototype. Stay grounded in the supplied metrics and recommend exactly one branch without inventing plant behavior.",
        input: [
          {
            role: "user",
            content: [
              {
                type: "input_text",
                text: JSON.stringify(parsedBody),
              },
            ],
          },
        ],
        text: {
          format: {
            type: "json_schema",
            name: "counterfactual_advisor_brief",
            strict: true,
            schema: llmSchema(),
          },
        },
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      return {
        status: 502,
        body: {
          error: "OpenAI request failed",
          detail: errorText.slice(0, 500),
        },
      };
    }

    const payload = (await response.json()) as Record<string, unknown>;
    const responseText = extractResponseText(payload);
    const parsedNarrative = responseText ? parseNarrativeJson(responseText) : undefined;

    if (!parsedNarrative) {
      return {
        status: 502,
        body: { error: "Structured OpenAI response could not be parsed" },
      };
    }

    return {
      status: 200,
      body: {
        provider: "llm",
        model: openAiModel(),
        ...parsedNarrative,
      },
    };
  } catch (error) {
    return {
      status: 502,
      body: {
        error: "Advisor request failed",
        detail: error instanceof Error ? error.message : "Unknown error",
      },
    };
  }
}

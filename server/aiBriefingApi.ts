import type {
  AiAfterActionReviewerBriefing,
  AiBriefingEvidenceRef,
  AiBriefingKind,
  AiBriefingRequest,
  AiBriefingWhySubjectId,
  AiIncidentCommanderBriefing,
  AiWhyAssistantBriefing,
} from "../src/contracts/aura";

declare const process: {
  env: Record<string, string | undefined>;
};

type AiBriefingApiRequest = {
  method?: string;
  headers?: Record<string, string | string[] | undefined>;
  bodyText?: string;
  remoteAddress?: string;
};

type AiBriefingApiResponse = {
  status: number;
  body: Record<string, unknown>;
};

type ParsedAiBriefingRequest = AiBriefingRequest;

type RateLimitEntry = {
  windowStartMs: number;
  count: number;
};

const rateLimitState = new Map<string, RateLimitEntry>();

export function resetAiBriefingRateLimitState(): void {
  rateLimitState.clear();
}

function rateLimitWindowMs(): number {
  return Number(process.env.AI_BRIEFING_RATE_LIMIT_WINDOW_MS ?? 60_000);
}

function rateLimitMaxRequests(): number {
  return Number(process.env.AI_BRIEFING_RATE_LIMIT_MAX_REQUESTS ?? 12);
}

function openAiModel(): string {
  return process.env.OPENAI_MODEL ?? "gpt-4.1-mini";
}

function realClientIp(headers: AiBriefingApiRequest["headers"], remoteAddress?: string): string {
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

function trimText(value: unknown): string | undefined {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : undefined;
}

function trimStringList(value: unknown, maxItems: number): string[] {
  return Array.isArray(value)
    ? value
        .filter((entry): entry is string => typeof entry === "string" && entry.trim().length > 0)
        .map((entry) => entry.trim())
        .slice(0, maxItems)
    : [];
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

function isAiBriefingKind(value: unknown): value is AiBriefingKind {
  return value === "incident_commander" || value === "after_action_reviewer" || value === "why_assistant";
}

function isWhySubjectId(value: unknown): value is AiBriefingWhySubjectId {
  return value === "support_current" || value === "support_alternative" || value === "validator_last_result";
}

function parseRequest(body: Record<string, unknown>): ParsedAiBriefingRequest | undefined {
  if (
    !isAiBriefingKind(body.kind) ||
    body.schema_version !== 1 ||
    !body.anchor ||
    typeof body.anchor !== "object" ||
    !body.context ||
    typeof body.context !== "object"
  ) {
    return undefined;
  }

  const anchor = body.anchor as Record<string, unknown>;
  if (
    (anchor.anchor_kind !== "live_tick" && anchor.anchor_kind !== "completed_review") ||
    !trimText(anchor.anchor_id) ||
    !trimText(anchor.session_id) ||
    typeof anchor.sim_time_sec !== "number"
  ) {
    return undefined;
  }

  if (body.kind === "why_assistant" && !isWhySubjectId(body.subject_id)) {
    return undefined;
  }

  return {
    kind: body.kind,
    anchor: {
      anchor_kind: anchor.anchor_kind,
      anchor_id: anchor.anchor_id as string,
      session_id: anchor.session_id as string,
      sim_time_sec: anchor.sim_time_sec,
    },
    ...(body.subject_id ? { subject_id: body.subject_id as AiBriefingWhySubjectId } : {}),
    schema_version: 1,
    context: body.context as Record<string, unknown>,
  };
}

function evidenceRefSchema() {
  return {
    type: "object",
    additionalProperties: false,
    required: ["ref_id", "ref_type", "label"],
    properties: {
      ref_id: { type: "string" },
      ref_type: { type: "string" },
      label: { type: "string" },
      detail: { type: "string" },
    },
  };
}

function schemaForKind(kind: AiBriefingKind) {
  if (kind === "incident_commander") {
    return {
      type: "object",
      additionalProperties: false,
      required: [
        "headline",
        "situation_now",
        "command_intent",
        "priority_actions",
        "watchouts",
        "confidence_note",
        "operator_authority_note",
        "review_handoff_needed",
        "evidence_refs",
      ],
      properties: {
        headline: { type: "string" },
        situation_now: { type: "string" },
        command_intent: { type: "string" },
        priority_actions: { type: "array", items: { type: "string" } },
        watchouts: { type: "array", items: { type: "string" } },
        confidence_note: { type: "string" },
        operator_authority_note: { type: "string" },
        review_handoff_needed: { type: "boolean" },
        evidence_refs: { type: "array", items: evidenceRefSchema() },
      },
    };
  }

  if (kind === "after_action_reviewer") {
    return {
      type: "object",
      additionalProperties: false,
      required: [
        "overall_assessment",
        "turning_points",
        "adaptation_observations",
        "validator_observations",
        "training_takeaways",
        "confidence_note",
        "evidence_refs",
      ],
      properties: {
        overall_assessment: { type: "string" },
        turning_points: { type: "array", items: { type: "string" } },
        adaptation_observations: { type: "array", items: { type: "string" } },
        validator_observations: { type: "array", items: { type: "string" } },
        training_takeaways: { type: "array", items: { type: "string" } },
        confidence_note: { type: "string" },
        evidence_refs: { type: "array", items: evidenceRefSchema() },
      },
    };
  }

  return {
    type: "object",
    additionalProperties: false,
    required: [
      "question_label",
      "short_answer",
      "why_bullets",
      "why_not_bullets",
      "confidence_note",
      "evidence_refs",
    ],
    properties: {
      question_label: { type: "string" },
      short_answer: { type: "string" },
      why_bullets: { type: "array", items: { type: "string" } },
      why_not_bullets: { type: "array", items: { type: "string" } },
      confidence_note: { type: "string" },
      evidence_refs: { type: "array", items: evidenceRefSchema() },
    },
  };
}

function instructionForKind(kind: AiBriefingKind, subjectId?: AiBriefingWhySubjectId): string {
  const base =
    "You are generating grounded AI briefings for AURA-IDCR, a BWRX-300-inspired adaptive control-room decision-support prototype. Stay strictly inside the supplied context. Do not invent plant behavior, missing evidence, or new control actions. Keep operator authority explicit. This is not a chatbot.";

  if (kind === "incident_commander") {
    return `${base} Produce a compact live incident-command briefing that clearly states what is happening, why the system believes that, what to do next, and what to watch next. Keep the tone operational and concise.`;
  }

  if (kind === "after_action_reviewer") {
    return `${base} Produce an after-action review summary that covers scenario progression, operator burden or overload points, validation or intervention events, what the adaptive AI layer changed or added during the run, and the likely observed impact. Keep the tone review-oriented and evidence-grounded.`;
  }

  return `${base} Produce a narrow why/why-not explanation for the requested subject (${subjectId ?? "unknown"}). Do not open a chat, do not ask follow-up questions, and keep the answer tied to the supplied deterministic reasons.`;
}

function evidenceCatalog(request: ParsedAiBriefingRequest): AiBriefingEvidenceRef[] {
  const rawCatalog = request.context.evidence_catalog;
  if (!Array.isArray(rawCatalog)) {
    return [];
  }

  return rawCatalog
    .filter(
      (entry): entry is AiBriefingEvidenceRef =>
        Boolean(
          entry &&
            typeof entry === "object" &&
            trimText((entry as AiBriefingEvidenceRef).ref_id) &&
            trimText((entry as AiBriefingEvidenceRef).ref_type) &&
            trimText((entry as AiBriefingEvidenceRef).label),
        ),
    )
    .slice(0, 8);
}

function canonicalizeEvidenceRefs(
  value: unknown,
  request: ParsedAiBriefingRequest,
): AiBriefingEvidenceRef[] {
  if (!Array.isArray(value)) {
    return evidenceCatalog(request).slice(0, 3);
  }

  const catalog = evidenceCatalog(request);
  const refs: AiBriefingEvidenceRef[] = [];
  for (const entry of value) {
    if (!entry || typeof entry !== "object") {
      continue;
    }
    const ref_id = trimText((entry as AiBriefingEvidenceRef).ref_id);
    if (!ref_id) {
      continue;
    }
    const catalogRef = catalog.find((catalogEntry) => catalogEntry.ref_id === ref_id);
    if (!catalogRef || refs.some((existing) => existing.ref_id === catalogRef.ref_id)) {
      continue;
    }
    refs.push(catalogRef);
  }

  return refs.length > 0 ? refs : catalog.slice(0, 3);
}

function parseIncidentCommander(
  raw: Record<string, unknown>,
  request: ParsedAiBriefingRequest,
): AiIncidentCommanderBriefing | undefined {
  if (
    !trimText(raw.headline) ||
    !trimText(raw.situation_now) ||
    !trimText(raw.command_intent) ||
    !trimText(raw.confidence_note) ||
    !trimText(raw.operator_authority_note) ||
    typeof raw.review_handoff_needed !== "boolean"
  ) {
    return undefined;
  }

  return {
    headline: raw.headline as string,
    situation_now: raw.situation_now as string,
    command_intent: raw.command_intent as string,
    priority_actions: trimStringList(raw.priority_actions, 4),
    watchouts: trimStringList(raw.watchouts, 4),
    confidence_note: raw.confidence_note as string,
    operator_authority_note: raw.operator_authority_note as string,
    review_handoff_needed: raw.review_handoff_needed,
    evidence_refs: canonicalizeEvidenceRefs(raw.evidence_refs, request),
  };
}

function parseAfterActionReviewer(
  raw: Record<string, unknown>,
  request: ParsedAiBriefingRequest,
): AiAfterActionReviewerBriefing | undefined {
  if (!trimText(raw.overall_assessment) || !trimText(raw.confidence_note)) {
    return undefined;
  }

  return {
    overall_assessment: raw.overall_assessment as string,
    turning_points: trimStringList(raw.turning_points, 4),
    adaptation_observations: trimStringList(raw.adaptation_observations, 4),
    validator_observations: trimStringList(raw.validator_observations, 4),
    training_takeaways: trimStringList(raw.training_takeaways, 4),
    confidence_note: raw.confidence_note as string,
    evidence_refs: canonicalizeEvidenceRefs(raw.evidence_refs, request),
  };
}

function parseWhyAssistant(
  raw: Record<string, unknown>,
  request: ParsedAiBriefingRequest,
): AiWhyAssistantBriefing | undefined {
  if (!trimText(raw.question_label) || !trimText(raw.short_answer) || !trimText(raw.confidence_note)) {
    return undefined;
  }

  return {
    question_label: raw.question_label as string,
    short_answer: raw.short_answer as string,
    why_bullets: trimStringList(raw.why_bullets, 4),
    why_not_bullets: trimStringList(raw.why_not_bullets, 4),
    confidence_note: raw.confidence_note as string,
    evidence_refs: canonicalizeEvidenceRefs(raw.evidence_refs, request),
  };
}

function parseStructuredResponse(
  kind: AiBriefingKind,
  rawText: string,
  request: ParsedAiBriefingRequest,
): AiIncidentCommanderBriefing | AiAfterActionReviewerBriefing | AiWhyAssistantBriefing | undefined {
  try {
    const parsed = JSON.parse(rawText) as Record<string, unknown>;
    if (kind === "incident_commander") {
      return parseIncidentCommander(parsed, request);
    }
    if (kind === "after_action_reviewer") {
      return parseAfterActionReviewer(parsed, request);
    }
    return parseWhyAssistant(parsed, request);
  } catch {
    return undefined;
  }
}

export async function handleAiBriefingApi(
  request: AiBriefingApiRequest,
): Promise<AiBriefingApiResponse> {
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

  let rawBody: Record<string, unknown>;
  try {
    rawBody = request.bodyText ? (JSON.parse(request.bodyText) as Record<string, unknown>) : {};
  } catch {
    return {
      status: 400,
      body: { error: "Invalid JSON body" },
    };
  }

  const parsedRequest = parseRequest(rawBody);
  if (!parsedRequest) {
    return {
      status: 400,
      body: { error: "Invalid AI briefing payload" },
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
        instructions: instructionForKind(parsedRequest.kind, parsedRequest.subject_id),
        input: [
          {
            role: "user",
            content: [
              {
                type: "input_text",
                text: JSON.stringify(parsedRequest),
              },
            ],
          },
        ],
        text: {
          format: {
            type: "json_schema",
            name: "ai_briefing_response",
            strict: true,
            schema: schemaForKind(parsedRequest.kind),
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
    const structured =
      responseText && parseStructuredResponse(parsedRequest.kind, responseText, parsedRequest);

    if (!structured) {
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
        response: structured,
      },
    };
  } catch (error) {
    return {
      status: 502,
      body: {
        error: "AI briefing request failed",
        detail: error instanceof Error ? error.message : "Unknown error",
      },
    };
  }
}

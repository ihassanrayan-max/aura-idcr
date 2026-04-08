# Grounded AI Briefing Layer

## Summary
- Build one shared, on-demand AI briefing layer with three separate UX surfaces: `AI Incident Commander` in `Operate`, `AI After-Action Reviewer` in `Review`, and a narrow `Why/Why-Not Assistant` attached to existing support and validator UI.
- Keep the deterministic runtime authoritative. The AI layer only reads derived context from `SessionSnapshot` and `CompletedSessionReview`; it never changes plant state, support mode, validator outcomes, KPI math, or completed-review builders.
- Use one in-repo server-side endpoint with strict structured-output validation, per-anchor caching, and deterministic fallbacks so the product remains usable without model access or under rate limit.

## Architecture
- Add a shared AI briefing contract family in `src/contracts/aura.ts`: `AiBriefingKind`, `AiBriefingRequest`, `AiBriefingEvidenceRef`, and feature-specific response types for `incident_commander`, `after_action_reviewer`, and `why_assistant`.
- Extend the canonical log surface additively with `SourceModule = "ai_briefing_layer"` and `SessionLogEventType = "ai_briefing_requested" | "ai_briefing_resolved" | "ai_briefing_failed"`.
- Add one server-side route such as `api/ai-briefing.ts` that accepts `{ kind, anchor, subject_id?, context }`, routes to one of three prompt templates, and validates model output against local JSON schemas before returning it.
- Build pure context builders that assemble minimal, stable AI input from existing runtime data:
  - live anchor: `session_id + tick_id`
  - completed-run anchor: `session_id + completed_review.session_id`
  - why-anchor: `session_id + tick_id + subject_id`
- Keep request state out of the canonical runtime loop. Use a UI-local hook/service for fetch, cache, stale markers, and retry, plus a narrow store bridge that only records AI usage metadata into the event log.
- Do not write AI prose into `completed_review`, `SessionRunComparison`, KPI summaries, or export artifacts in v1. Deterministic report builders remain source of truth.

## Feature Design
- `AI Incident Commander`
  - Placement: `Operate` -> `Next Actions`, directly after the assistance cue and before the lane list.
  - Inputs: current phase, `plant_tick`, `alarm_set`/`alarm_intelligence`, `reasoning_snapshot` with evidence, `combined_risk`, `support_refinement`, `support_policy`, `last_validation_result`, pending supervisor override, and recent canonical events.
  - Output schema: `headline`, `situation_now`, `command_intent`, `priority_actions[]`, `watchouts[]`, `confidence_note`, `operator_authority_note`, `review_handoff_needed`, `evidence_refs[]`.
  - Behavior: explicit `Generate briefing` / `Refresh`; stale when `tick_id` changes; may reference only current lane actions or validator-safe alternatives.
- `AI After-Action Reviewer`
  - Placement: `Review` -> top of `Completed Run`, above the existing deterministic summary/evidence cards.
  - Inputs: `CompletedSessionReview`, KPI summary, milestones, highlights, proof points, terminal outcome, and key-event summaries. First slice does not consume paired comparison output.
  - Output schema: `overall_assessment`, `turning_points[]`, `adaptation_observations[]`, `validator_observations[]`, `training_takeaways[]`, `confidence_note`, `evidence_refs[]`.
  - Behavior: manual generate only after `completed_review` exists; otherwise Review keeps its current empty-state behavior.
- `Narrow AI Why/Why-Not Assistant`
  - Placement: inline buttons/drawers only, no freeform input.
  - First-pass buttons:
    - `Support Posture` lead card: `Why this posture?` and `Why not the other posture?`
    - validator banner: `Why this result?`
  - Inputs: subject-specific slice of current snapshot plus the existing canonical explanation strings from risk/support/validator logic.
  - Output schema: `question_label`, `short_answer`, `why_bullets[]`, `why_not_bullets[]`, `confidence_note`, `evidence_refs[]`.
  - First-pass subject ids: `support_current`, `support_alternative`, `validator_last_result`. Defer hypothesis and lane-item why/not until later.

## Logging, Fallback, and Tests
- Logging/evaluation changes
  - Log request metadata only, not raw model prose, into the canonical event stream.
  - `ai_briefing_requested`: `briefing_kind`, `subject_id?`, `anchor_kind`, `anchor_id`, `schema_version`
  - `ai_briefing_resolved`: `briefing_kind`, `subject_id?`, `anchor_id`, `used_fallback`, `evidence_ref_ids[]`, `schema_version`
  - `ai_briefing_failed`: `briefing_kind`, `subject_id?`, `anchor_id`, `failure_kind`, `fallback_used`
  - Let the existing `Review` recent-event traceability surface expose these events; no separate audit dashboard in v1.
- Fallback behavior
  - Incident Commander fallback composes from lane/support/risk/validator fields already in the snapshot.
  - After-Action fallback composes from deterministic highlights, proof points, milestones, and outcome.
  - Why fallback maps directly from `recommended_assistance_reason`, `why_risk_is_current`, `what_changed`, and validator explanation/risk context.
  - If context is insufficient, render an honest compact unavailable state and keep the underlying deterministic cards visible.
- Test plan
  - Contract tests for all three JSON schemas and server-side parse/reject/fallback behavior.
  - Pure unit tests for context builders and deterministic fallback builders.
  - Store tests proving AI logging does not alter plant progression, support mode, validation state, or completed-review generation.
  - UI tests proving Operate/Review separation holds, no freeform chat exists, why-buttons appear only on approved surfaces, and fallback/unavailable states do not clutter Operate.
  - Mocked end-to-end tests for one live adaptive run and one completed run covering generate, stale refresh, rate-limit fallback, and evidence-ref rendering.

## Implementation Order
1. Add shared AI briefing contracts, evidence-ref types, subject ids, and AI audit event types.
2. Build pure context builders and deterministic fallback builders from existing snapshot/review data.
3. Add the single server-side `ai-briefing` endpoint with intent routing and strict structured-output validation.
4. Add UI-local fetch/cache hook plus narrow store logging bridge.
5. Ship `AI Incident Commander` in `Operate`.
6. Ship `Why/Why-Not` on `Support Posture` and the validator banner.
7. Ship `AI After-Action Reviewer` in `Review`.
8. Finish tests and update the brain/README to reflect the new checked-in AI layer.

## Smallest High-Impact Slice
- One coding pass should implement:
  - the shared endpoint plus context/fallback infrastructure,
  - `AI Incident Commander` in `Operate`,
  - `AI After-Action Reviewer` for completed runs only,
  - `Why/Why-Not` only for support posture and last validator result.
- Defer comparison-aware AI review, hypothesis why/not, lane-item why/not, automatic refresh, and export-artifact inclusion.
- This gives AURA-IDCR one honest, demonstrable AI layer across live response and after-action review while staying bounded, operator-first, and grounded in existing deterministic data.

## Assumptions
- As of April 8, 2026, the checked-in repo truth says there is no LLM integration, so this plan assumes the first in-repo server-side briefing seam is part of the implementation.
- If a private/external endpoint is later reintroduced, keep the same request/response schemas and swap transport only.
- No webcam/human-monitoring expansion is in scope; the AI layer may read only the already-published canonical monitoring and operator-state fields.
- No autonomous control, no freeform chat, and no mutation of deterministic runtime decisions are allowed.

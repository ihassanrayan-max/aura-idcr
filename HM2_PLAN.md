# Phase 2 Plan: Human Monitoring 2.0 in Operate

## Summary
- Integrate Human Monitoring 2.0 into the live `Operate` workflow by consuming the existing canonical chain: `human_monitoring -> operator_state -> combined_risk -> support_refinement/support_policy`.
- Keep the full `Human Monitoring` workspace alive as the detailed inspection/debug/demo surface and keep `Review` as the proof/report surface.
- Do not add a new standalone Human Monitoring dashboard region to `Operate`. Phase 2 should make existing operator surfaces adapt more clearly, not make the shell noisier.
- Do not change monitoring heuristics, combined-risk math, support-mode enums, or validator outcomes in this phase.

## Operate Integration
- `Operator Orientation`: keep the 3-card layout. Use Human Monitoring 2.0 only to tighten wording in `What matters` and `Do next` when human-side strain or degraded confidence is materially affecting the current watch picture. Surface the effect, not the raw monitoring internals.
- `Situation Board`: add no human-monitoring widget here. Plant mimic, critical metric strip, and state ribbon stay always visible and visually stable.
- `Alarm Board`: add no human-monitoring card here. Keep pinned critical alarms and grouped clusters unchanged; only let existing watch-now emphasis influence which cluster summaries feel most urgent.
- `Next Actions`: make this the main visible Phase 2 effect. Reuse the existing lane emphasis and presentation-cue path so Human Monitoring 2.0 can visibly:
  - strengthen caution wording
  - explain degraded confidence when it limits certainty
  - tighten watch-item emphasis
  - slow recommendation pacing into a more bounded “verify, then commit” pattern
- Recommendation pacing rule: when monitoring is degraded or human pressure is high, present 1 lead action/check plus 1 watch item with firmer caution language; otherwise keep the current broader guided grouping. Do not add extra cards or a second lane.
- Validator surfaces: keep `pass` / `soft_warning` / `hard_prevent` logic unchanged, but make wording adaptive. If degraded confidence is active, validator copy should explicitly say verification is being kept explicit because human-side confidence is limited. If workload/attention strain is high but confidence is current, wording should stress slower bounded execution rather than uncertainty.
- `Support Posture`: make this the canonical in-Operate explanation point for Human Monitoring 2.0. Add one compact human-monitoring status treatment inside the existing section: monitoring mode, freshness/confidence state, and the current effect on adaptation strength. This is also the right place for one low-noise `Inspect Human Monitoring` affordance that opens the isolated workspace.
- `Storyline Board`: keep dominant and secondary hypotheses intact. Add one operator-context explanation line in the existing support-context area showing whether the storyline is being held broad, narrowed more aggressively, or biased toward verification because of the current human-side state.

## Always Visible Guardrails
- The Situation Board mimic, critical metric strip, and state ribbon remain continuously visible regardless of support mode or monitoring posture.
- Pinned `P1`/`P2`/always-visible alarms remain surfaced regardless of adaptation.
- Manual intervention access, Review access, and operator authority messaging remain present.
- Human Monitoring 2.0 may change emphasis, wording, and pacing, but it must not hide plant state, core alarms, or essential response context.

## Human Monitoring Workspace and Demo Story
- Keep the existing `Human Monitoring` workspace as the detailed inspection authority for source status, telemetry, webcam/CV observability, extracted features, fused interpretation, final output state, and downstream impact.
- Do not duplicate that detail into `Operate`. `Operate` should show the consequence of monitoring, while `Human Monitoring` should show the evidence behind it.
- Add one short cross-reference at the top of the Human Monitoring workspace that states which current Operate behavior it explains: posture strength, watch emphasis, validator cautioning, or pacing.
- Demo story:
  1. Run primarily in `Operate`.
  2. Let judges see bounded adaptation directly in Orientation, Next Actions, and Support Posture.
  3. Open `Human Monitoring` only when asked what the adaptation is based on.
  4. Finish in `Review` to prove the monitoring-to-adaptation chain was logged and replayable.

## Logging, Review, and Reports
- Do not create a new logging stream or parallel report path.
- Keep the canonical audit trail anchored to existing `human_monitoring_snapshot_recorded`, `operator_state_snapshot_recorded`, `reasoning_snapshot_published`, `support_mode_changed`, and `action_validated` events.
- If review/report derivation needs one more stable hook, add additive summary fields to existing reasoning/support payloads rather than introducing a new event type. The preferred logged concepts are:
  - monitoring posture: `live`, `placeholder`, `degraded`, `unavailable`
  - confidence-gating effect on adaptation strength
  - watch-now summary and wording style
  - visible consequence category such as `caution_strengthened`, `verification_bias`, `watch_emphasis_tightened`, `pacing_tightened`, or `no_extra_change`
- `Review` should add explicit language for “Operate-visible adaptation” so the completed-run story explains not just internal risk/support state, but what the operator actually saw change.
- Session and comparison reports should prefer concrete human-aware operator-facing effects in notable points and proof summaries, including explicit honesty when monitoring was degraded or confidence-gated.

## Interfaces and Implementation Shape
- Keep canonical runtime contracts stable where possible.
- Prefer UI-local derived model additions in `viewModel.ts` plus small additive policy helpers in `presentationPolicy.ts`.
- Do not add a new workspace, subsystem, risk model, or monitoring source in Phase 2.
- Do not change `HumanMonitoringSourceKind`, monitoring heuristics, combined-risk factor math, support-mode policy thresholds, or validator decision logic.

## Acceptance Criteria
- Adaptive `Operate` clearly shows human-aware changes without adding a new dashboard section.
- A first-time observer can tell from `Operate` alone when confidence is degraded, when watch emphasis tightened, and when pacing became more conservative.
- The `Human Monitoring` workspace remains available and clearly acts as the inspection authority.
- `Review` can explain the chain from monitoring posture -> operator-state output -> risk/support/validator effect -> visible Operate behavior.
- No fake emotion labels, medical claims, or webcam-first presentation appear in `Operate`.
- Baseline mode remains calm and non-adaptive; any monitoring copy there stays informational rather than posture-changing.

## Test Plan
- Extend UI/store tests to verify:
  - no standalone Human Monitoring section/widget is added to `Operate`
  - Orientation wording tightens under degraded confidence
  - Next Actions reduces emphasis breadth and strengthens caution copy under elevated workload/attention strain
  - validator wording changes correctly for degraded-confidence vs current-confidence/high-strain cases
  - Support Posture shows the compact monitoring-status explanation and inspector affordance
  - critical metrics and pinned alarms remain visible across all support modes
  - baseline sessions do not inherit adaptive narrowing or pacing behavior
  - the isolated Human Monitoring workspace still renders full inspection detail
- Extend review/report tests to verify:
  - completed-review highlights and proof text mention visible Operate adaptation honestly
  - comparison proof distinguishes adaptive human-aware behavior from baseline
  - degraded or unavailable monitoring is reported as a limitation, not as a success claim
- Re-run `npm test` and `npm run build`.

## Assumptions
- Phase 2 is additive and bounded, not a shell redesign.
- Existing Human Monitoring 2.0 outputs remain advisory proxies only.
- The preferred place to explain Human Monitoring in `Operate` is `Support Posture`, and the preferred place to show its effect is `Next Actions`.
- The isolated workspace stays in the tab bar and remains the drill-down surface after integration.

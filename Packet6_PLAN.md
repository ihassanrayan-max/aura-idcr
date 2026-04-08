# Packet 6 Plan: Demo Evidence and Reporting Proof

## Summary
- Implement Packet 6 as an additive evidence pass on top of the existing `CompletedSessionReview`, `SessionRunComparison`, report export, and Review workspace flow.
- Keep the canonical chain intact: `human_monitoring -> operator_state -> combined_risk/support/intervention logs -> completed review -> comparison -> export`.
- Do not change plant/scenario determinism, Packet 4 reasoning math, KPI formulas, or the Packet 5 shell architecture. This is a proof-story upgrade, not a subsystem rewrite.

## Implementation Changes
- Extend `src/contracts/aura.ts` with additive proof-focused fields:
  - `CompletedSessionReview.proof_points: ReviewProofPoint[]`
  - `SessionRunComparison.proof_summary: { headline: string; bullets: string[] }`
  - `SessionAfterActionReport.proof_points: ReviewProofPoint[]`
  - `ComparisonReportArtifact.proof_summary: { headline: string; bullets: string[] }`
- Define `ReviewProofPoint` as a bounded, replay-linkable artifact:
  - `proof_id`, `kind`, `label`, `detail`
  - optional `sim_time_sec`, `source_event_id`, `tick_id`
  - kinds: `monitoring_status`, `human_indicator_shift`, `support_transition`, `validator_reason`, `human_aware_adaptation`

- In `src/state/sessionStore.ts`, enrich the existing `reasoning_snapshot_published` payload additively with the already-computed canonical explanation strings:
  - `why_risk_is_current`
  - `what_changed`
- Do not create any new logging stream or parallel report path. Packet 6 must read only from canonical log events and already-computed snapshots.

- In `src/runtime/sessionReview.ts`, build deterministic proof points from canonical events:
  - `monitoring_status`: prefer the first live/degraded monitoring moment; otherwise use the latest honest posture. Include active/degraded/unavailable, freshness, contributing sources, confidence, and status summary.
  - `human_indicator_shift`: compare the earliest operator-state sample with the strongest later stress sample. Emit only if workload rises by at least 8 points, attention drops by at least 8 points, or degraded mode activates.
  - `support_transition`: use the first support change in adaptive mode, or the baseline fixed-posture reason in baseline mode. Include `recommended_reason`, `trigger_reason`, `current_mode_reason`, and `what_changed`.
  - `validator_reason`: use the first non-pass validation or override moment. Include outcome, reason code, explanation, risk context, and safe alternative when present.
  - `human_aware_adaptation`: only emit when the same tick shows a clean chain from human monitoring/operator state into risk/support/intervention. Require either a human factor in the top contributors or `human_influence_scale > 0.4`, plus a meaningful workload/attention/degraded signal. Omit this proof point if the repo cannot support it honestly.
- Rework key-event selection to stay bounded at the existing budget while guaranteeing inclusion of proof-point source events, milestones, and the terminal trio. Fill remaining slots chronologically.

- In `src/runtime/sessionComparison.ts`, build a bounded comparison proof story from the two completed reviews:
  - headline: baseline vs AURA-assisted posture difference
  - bullet 1: monitoring active/degraded/unavailable comparison
  - bullet 2: baseline fixed posture vs adaptive support/intervention difference
  - bullet 3: one visible adaptive example using the adaptive run’s `human_aware_adaptation` proof point
  - bullet 4: explicit confidence-gating/degraded note when monitoring was limited
- Keep internal mode ids as `baseline` / `adaptive`, but use judge-facing copy `Baseline run` and `AURA-assisted (adaptive) run` in comparison/report strings.

- In `src/runtime/reportArtifacts.ts`, make exported artifacts slide-friendly without changing the export mechanism:
  - copy `proof_points` into the session after-action artifact
  - copy `proof_summary` into the comparison artifact
  - change `summary_block.notable_points` to prefer proof points over generic “first 3 highlights”
- Leave `src/runtime/reportExport.ts` as JSON download only.

- In `src/ui/ReviewWorkspace.tsx`, add two compact cards and leave the rest of Review intact:
  - `Human-aware proof trail` in Completed Run, rendering `proof_points` and allowing click-through to the linked replay event when present
  - `Why the AURA-assisted run was different` in Comparison, rendering `proof_summary`
- Keep existing KPI tables, milestones, highlights, replay stepper, export buttons, and Operate workspace unchanged except for small copy updates that clarify baseline vs AURA-assisted language.

## Test Plan
- Extend `src/runtime/sessionReview.test.ts`:
  - proof-point generation is deterministic
  - proof-point source events are present in the bounded replay list
  - degraded/unavailable monitoring is represented honestly
  - `human_aware_adaptation` is omitted when unsupported
- Extend `src/runtime/sessionComparison.test.ts`:
  - `proof_summary` is produced deterministically
  - baseline vs AURA-assisted wording is correct
  - comparison stays honest when monitoring is degraded or unavailable
- Extend `src/runtime/reportArtifacts.test.ts`:
  - exported artifacts include the new proof fields
  - notable points prefer proof content
- Extend `src/state/sessionStore.test.tsx`:
  - Completed Run renders the new proof trail card
  - Comparison renders the new proof summary card
  - export controls still behave the same
  - Scenario A/B/C deterministic run tests still pass
  - a paired baseline/adaptive comparison yields at least one bounded human-aware proof moment when canonical data supports it
- Re-run `npm test` and `npm run build`
- After implementation, update `aura_idcr_master_build_brain.md` with Packet 6 status, verification, and the explicit note that webcam observability/debug polish remains deferred to the later isolated packet

## Assumptions
- Packet 6 will not change `src/runtime/humanMonitoring.ts`, webcam heuristics, combined-risk math, or KPI definitions unless an additive log-payload field is required to expose already-computed canonical explanations.
- The strongest public demo example should be selected from canonical evidence per run, not hard-coded to one scenario, though Scenario C remains the likely showcase path.
- If monitoring is degraded, stale, or unavailable, Packet 6 must show that limitation explicitly and confidence-gate the proof story rather than fabricate a cleaner AI contribution.

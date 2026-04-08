# Packet 4 Plan: HPSN-Lite Risk Fusion on the Canonical Backbone

**Summary**
- Evolve the existing combined-risk path instead of creating a parallel subsystem. The canonical flow stays `human_monitoring -> operator_state -> combined_risk -> support_mode -> support_refinement`, with the main logic centered in [src/runtime/combinedRisk.ts](C:\Users\hassan\Documents\aura-idcr\src\runtime\combinedRisk.ts), fed by additive monitoring detail from [src/runtime/humanMonitoring.ts](C:\Users\hassan\Documents\aura-idcr\src\runtime\humanMonitoring.ts), and wired through [src/state/sessionStore.ts](C:\Users\hassan\Documents\aura-idcr\src\state\sessionStore.ts).
- Preserve the deterministic plant/scenario backbone, the canonical monitoring evaluator, current logging/review plumbing, and the existing Operate/Review shell. Packet 4 does not add a new UI region, new autonomy, randomization, or LLM/CV-centric behavior.
- Keep the existing `CombinedRiskSnapshot` as the canonical repo type for compatibility; do not rename it. Treat `combined_risk_score` as the repo’s canonical RiskScore and extend the snapshot additively rather than replacing downstream consumers.
- Current repo baseline is green and must stay green: `npm test` passes with 114 tests, and `npm run build` passes.

**Implementation Changes**
- Extend the contracts in [src/contracts/aura.ts](C:\Users\hassan\Documents\aura-idcr\src\contracts\aura.ts) additively:
  - Add a bounded `risk_cues` object to `HumanMonitoringInterpretationInput` for human-side subfactors that already exist conceptually in Packet 2/3 but are currently collapsed away.
  - Expand `CombinedRiskFactor.factor_id` to the Packet 4 HPSN-Lite factor families: `plant_urgency`, `alarm_escalation_pressure`, `storyline_procedure_pressure`, `phase_time_pressure`, `human_workload_pressure`, `attention_instability`, `interaction_friction`, and `human_confidence_penalty`.
  - Extend `CombinedRiskSnapshot` with additive metadata: `risk_model_id`, `plant_urgency_index`, `human_pressure_index`, `fusion_confidence`, `human_influence_scale`, `recommended_assistance_mode`, and `recommended_assistance_reason`. Keep existing fields (`combined_risk_score`, `combined_risk_band`, `factor_breakdown`, `top_contributing_factors`, `why_risk_is_current`, `what_changed`, `confidence_caveat`) intact.
- Enrich the canonical monitoring interpretation in [src/runtime/humanMonitoring.ts](C:\Users\hassan\Documents\aura-idcr\src\runtime\humanMonitoring.ts):
  - Interaction telemetry should publish additive bounded subfactors into `risk_cues`: hesitation pressure, latency trend, reversal/oscillation pressure, inactivity pressure during meaningful moments, burstiness, and navigation instability.
  - The legacy placeholder adapter should publish conservative fallback `risk_cues` with zeroed or modest surrogate values so risk fusion still has a stable deterministic fallback when live telemetry is weak or stale.
  - Webcam/CV should only publish advisory visual attention pressure inside `risk_cues`; do not add a dedicated webcam risk factor and do not let webcam by itself produce high risk or a high assistance recommendation.
  - `buildInterpretationInput` should aggregate these cues through the same confidence-aware source weighting already used for workload/attention/confidence.
- Replace the current combined-risk math in [src/runtime/combinedRisk.ts](C:\Users\hassan\Documents\aura-idcr\src\runtime\combinedRisk.ts) with a bounded HPSN-Lite fusion model:
  - Compute `plant_urgency_index` from plant severity, critical escalation markers, and scenario-relevant plant deviation already present in plant/alarm state.
  - Compute `alarm_escalation_pressure` from active alarm load, grouped clusters, P1/P2 intensity, compression ratio, and newly raised alarms.
  - Compute `storyline_procedure_pressure` from reasoning ambiguity/change/stability plus current first-response-lane breadth and action/check/watch mix.
  - Compute `phase_time_pressure` from current phase progress versus nominal phase duration and overall scenario elapsed versus expected duration.
  - Compute `human_pressure_index` from workload, attention instability, and interaction friction cues.
  - Apply a confidence gate to human-side factors only: `1.0` for current/high-confidence live monitoring, `0.7` for aging/moderate confidence, `0.4` for placeholder-only or low-confidence but still current fallback, and `0.25` for stale/unavailable posture. Plant/context factors remain fully active.
  - Use fixed contribution caps that sum to 100 to keep the score bounded and explainable: `plant_urgency 34`, `alarm_escalation_pressure 14`, `storyline_procedure_pressure 12`, `phase_time_pressure 6`, `human_workload_pressure 10`, `attention_instability 8`, `interaction_friction 10`, `human_confidence_penalty 6`.
  - Keep the risk band thresholds unless testing shows a clear need to retune them; the main change is factorization and confidence-gated fusion, not inventing a new band system.
  - Generate one-sentence explanation text that explicitly names the band, the top 2 contributors, and the assistance recommendation.
  - Make `what_changed` compare factor deltas against the previous snapshot as today, but cap purely human-side delta movement when plant/context are unchanged so stale-source dropoff cannot create a large one-tick swing.
- Update store integration in [src/state/sessionStore.ts](C:\Users\hassan\Documents\aura-idcr\src\state\sessionStore.ts):
  - Pass `human_monitoring`, `first_response_lane`, `current_phase`, current phase elapsed time, and scenario expected duration into `buildCombinedRiskSnapshot`.
  - Keep the publication order `human_monitoring` before `operator_state` before `combined_risk`.
  - Keep monitoring-only webcam refresh behavior bounded: webcam refreshes continue to republish monitoring/operator snapshots only and do not recompute combined risk/support mode outside the normal scenario tick.
- Tighten downstream consumers without broad redesign:
  - Update support-mode policy so `recommended_assistance_mode` from the risk layer becomes the raw recommendation, while the existing dwell/downshift/guardrail logic still decides the active `support_mode`.
  - Update validator helpers that inspect risk factors so they use the new factor ids or helper accessors instead of hardcoded old ids.
  - Keep the Operate/Review UI structure intact; only refresh existing support-posture/review text so it can show the richer explanation, top contributors, recommendation, and degraded-confidence posture inside the current cards.
  - Update review/log payload summaries so the new risk metadata is inspectable in reasoning events and completed-session highlights.
- After implementation, add a Packet 4 entry to the brain file and mark the packet status/results there.

**Test Plan**
- Update unit tests for `combinedRisk` to verify deterministic output, bounded 0-100 scoring, monotonic worsening behavior, stable explanation text, and confidence-gated human influence under current/aging/stale/unavailable monitoring.
- Update `humanMonitoring` tests to verify the new additive `risk_cues` publish correctly for interaction telemetry, placeholder fallback, and advisory webcam posture.
- Update support-mode tests so the recommended mode can differ from the active mode during dwell, while escalation and guardrail behavior remain unchanged.
- Update store/review tests to verify:
  - risk snapshots still publish in the canonical log/review path,
  - fresh interaction telemetry can materially raise or sustain risk,
  - stale or missing human inputs weaken influence cleanly without crashing or large one-tick drops,
  - webcam remains advisory and cannot be the sole driver,
  - monitoring-only webcam refresh still does not recompute combined risk/support mode outside tick progression.
- Run full verification: `npm test`, `npm run build`, and the existing deterministic scenario progression coverage for all three scenarios.

**Assumptions And Defaults**
- Packet 4 will not rename `combined_risk` or add a parallel `risk_state`; it will enrich the existing canonical risk snapshot.
- Interaction telemetry is the primary trusted live human-side driver for Packet 4; webcam only nudges advisory attention posture and confidence.
- No new adaptive UI behavior beyond existing-shell text/metric updates is in scope here; stronger visible adaptation remains deferred to Packet 5.
- No plant progression, scenario timing, or action validation outcome logic becomes probabilistic or ML-driven in this packet.

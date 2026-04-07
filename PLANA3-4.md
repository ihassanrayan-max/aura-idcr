## Cluster Pack 2 Plan: Scenario C + Multi-Scenario Proof

### 1. Repo-Grounded Current-State Check
- Cluster 1 is present in repo truth: two live scenarios in [src/scenarios/registry.ts](C:/Users/hassan/Documents/aura-idcr/src/scenarios/registry.ts), Scenario A in [src/scenarios/scn_alarm_cascade_root_cause.ts](C:/Users/hassan/Documents/aura-idcr/src/scenarios/scn_alarm_cascade_root_cause.ts), Scenario B in [src/scenarios/scn_loss_of_offsite_power_sbo.ts](C:/Users/hassan/Documents/aura-idcr/src/scenarios/scn_loss_of_offsite_power_sbo.ts), selector/reset wiring in [src/App.tsx](C:/Users/hassan/Documents/aura-idcr/src/App.tsx) and [src/state/sessionStore.ts](C:/Users/hassan/Documents/aura-idcr/src/state/sessionStore.ts), and scenario-keyed comparison capture in [src/runtime/sessionComparison.ts](C:/Users/hassan/Documents/aura-idcr/src/runtime/sessionComparison.ts).
- The generalized seam is real, but not fully generic: adding Scenario C requires a third `ScenarioRuntimeProfileId` branch in [src/contracts/aura.ts](C:/Users/hassan/Documents/aura-idcr/src/contracts/aura.ts), [src/runtime/plantTwin.ts](C:/Users/hassan/Documents/aura-idcr/src/runtime/plantTwin.ts), [src/runtime/alarmIntelligence.ts](C:/Users/hassan/Documents/aura-idcr/src/runtime/alarmIntelligence.ts), [src/runtime/reasoningEngine.ts](C:/Users/hassan/Documents/aura-idcr/src/runtime/reasoningEngine.ts), [src/runtime/procedureLane.ts](C:/Users/hassan/Documents/aura-idcr/src/runtime/procedureLane.ts), [src/runtime/actionValidator.ts](C:/Users/hassan/Documents/aura-idcr/src/runtime/actionValidator.ts), and [src/state/sessionStore.ts](C:/Users/hassan/Documents/aura-idcr/src/state/sessionStore.ts).
- Current scenario-proof tests are concentrated in [src/state/sessionStore.test.tsx](C:/Users/hassan/Documents/aura-idcr/src/state/sessionStore.test.tsx) and [src/runtime/actionValidator.test.ts](C:/Users/hassan/Documents/aura-idcr/src/runtime/actionValidator.test.ts); comparison is covered in [src/runtime/sessionComparison.test.ts](C:/Users/hassan/Documents/aura-idcr/src/runtime/sessionComparison.test.ts).
- Repo realities that change the plan:
  - `ALM_ISOLATION_CONDENSER_FLOW_LOW` is currently threshold-gated to `offsite_power_available = false` in [src/runtime/alarmEngine.ts](C:/Users/hassan/Documents/aura-idcr/src/runtime/alarmEngine.ts), so Scenario C cannot rely on the LoOP threshold path if offsite power stays available.
  - Outcome success/failure messaging is profile-specific in [src/state/sessionStore.ts](C:/Users/hassan/Documents/aura-idcr/src/state/sessionStore.ts), so Scenario C needs its own bounded outcome branch.
  - The only scenario-specific plant overlay is feedwater-only in [src/App.tsx](C:/Users/hassan/Documents/aura-idcr/src/App.tsx); default plan should avoid new UI unless Scenario C is unreadable without it.
- Verification status on April 6, 2026: `npm test` passed with 55/55 tests and `npm run build` passed.

### 2. Cluster Decision
- Yes: Cluster Pack 2 is still the best next cluster.
- Why: the repo already has the prerequisite seam for multi-scenario runtime, baseline/adaptive capture, replay review, and comparison bucketing, so the shortest path to a stronger demo is to complete the third MVP scenario and prove the same evaluator path works across A/B/C.
- Why not later clusters: telemetry, supervisor polish, export/reporting, and richer realism are not blocking the three-scenario MVP proof and would dilute the strongest current dependency chain.

### 3. Scenario C Design Plan
- Objective: add a deterministic “Main Steam / Reactor Isolation Upset” that shows a non-electrical trip/isolation event, structured alarm grouping, alternate heat-sink relevance, bounded diagnosis, and ICS-based recovery.
- Default implementation assumptions: keep `offsite_power_available = true`, reuse existing plant variables, reuse existing alarm IDs where possible, and use the existing bounded `act_adjust_isolation_condenser` action instead of inventing a new control unless implementation proves that insufficient.
- Nominal phase: stable power operation with normal steam flow, turbine output, and condenser path available; no meaningful alarm burden.
- Onset phase: a main steam / reactor isolation upset abruptly collapses turbine output and steam-path behavior, forces reactor trip, and removes the normal condenser heat-sink path without any LoOP signature.
- Alarm escalation phase: the operator sees a clustered steam/isolation picture first, then heat-sink/ICS insufficiency, then pressure/SRV/containment escalation if recovery is late or weak.
- Diagnosis phase: the reasoning layer should converge on a steam/isolation upset rather than feedwater loss or LoOP; the key disambiguator is “trip + steam-path collapse + heat-sink loss while offsite power remains available.”
- Response phase: the recovery lane should shift from confirming the isolation picture to establishing bounded isolation-condenser flow and then watching pressure/containment flatten.
- Stabilization/failure phase: success is bounded ICS establishment with pressure stabilizing and containment staying below consequence thresholds; failure is pressure/consequence escalation or timeout before stabilization.
- Signals stressed: `main_steam_flow_pct`, `turbine_output_mwe`, `reactor_trip_active`, `condenser_heat_sink_available`, `isolation_condenser_flow_pct`, `vessel_pressure_mpa`, `safety_relief_valve_open`, `containment_pressure_kpa`, with `offsite_power_available` deliberately staying normal.
- Meaningful difference from A and B:
  - Versus A: the driver is not feedwater/inventory mismatch.
  - Versus B: the driver is not electrical loss or DC depletion.
  - The recovery still uses ICS, but for a different initiating story and alarm burden.
- Expected operator challenge: avoid misclassifying the event as LoOP or generic pressure control, recognize the lost normal sink despite normal electrical availability, and establish ICS without wasting time on the wrong recovery lane.
- Expected reasoning / recovery-lane behavior: top hypothesis should settle to a new Scenario C dominant cause, secondary hypotheses should cover heat-sink unavailability and pressure-consequence progression, and the lane should recommend ICS alignment plus pressure/containment watch items.
- Natural validator branch: low or sharply reduced ICS demand during active pressure escalation should trigger soft-warning or hard-prevent; this is the cleanest risky-action branch and matches the existing validator model.

### 4. Exact Implementation Slice
- Scenario definition and catalog work: required; add Scenario C definition, registry entry, `runtime_profile_id`, and bounded manual-control schema; depends on current registry seam; must not change Scenario A default selection or Scenario B catalog behavior.
- Scenario runtime / plant-twin work: required; add a third plant-twin profile that models steam-path collapse, trip/isolation progression, heat-sink loss, ICS recovery, and bounded pressure consequences; depends on Scenario C definition; must not alter existing feedwater or LoOP profile math.
- Alarm mapping / grouping work: required; add Scenario C alarm hooks and a Scenario C cluster profile; depends on Scenario C signals and existing dictionary; must not rewrite A/B cluster semantics or global alarm ordering.
- Hypothesis and recovery-lane work: required; add Scenario C hypothesis catalog, scoring rules, and first-response lane; depends on alarm and plant cues; must not disturb existing A/B dominant-hypothesis stability or feedwater/LoOP lane wording.
- Validator and terminal-outcome work: required; add Scenario C validator branch and Scenario C outcome gate in the session store; depends on final recovery target and failure markers; must not change baseline pass-through semantics or existing A/B validator thresholds.
- UI / selector wiring: optional by default; the selector and control rendering are already data-driven, so only make a minimal plant-panel visibility tweak if Scenario C cannot be followed from existing alarm/storyline/lane text; must not introduce a new layout or dashboard surface.
- Comparison / replay compatibility work: mostly check-only, with one required dependency; required code change is only that Scenario C must generate a correct terminal review through the existing outcome path; the comparison/replay builders should remain generic.
- Tests: required; add Scenario C-specific automated coverage and extend multi-scenario comparison proofs; depends on all runtime branches being in place; must not weaken current A/B assertions.

### 5. Comparison Compatibility Plan
- No planned change to [src/runtime/sessionComparison.ts](C:/Users/hassan/Documents/aura-idcr/src/runtime/sessionComparison.ts): it is already scenario-safe because it compares only matching `scenario_id` and `scenario_version`.
- No planned change to [src/runtime/sessionReview.ts](C:/Users/hassan/Documents/aura-idcr/src/runtime/sessionReview.ts): replay/review is already derived from canonical log events and terminal outcome.
- Required change in [src/state/sessionStore.ts](C:/Users/hassan/Documents/aura-idcr/src/state/sessionStore.ts): Scenario C needs a profile-specific success/failure/timeout message and stabilization gate so `completed_review` and `evaluation_capture` are generated correctly.
- Required checks, not automatic code changes:
  - Confirm `evaluation_capture` buckets remain separate for A/B/C.
  - Confirm baseline/adaptive runs of Scenario C land in the same bucket.
  - Confirm KPI generation stays scenario-agnostic and does not assume feedwater or LoOP-specific fields.
  - Confirm replay milestones still populate when Scenario C uses support escalation and validator events.
- Guardrail: do not add scenario-specific branches inside comparison or replay builders; keep all Scenario C specificity upstream in scenario definition, runtime profile logic, and terminal outcome generation.

### 6. Test And Verification Plan
- Automated: add a deterministic end-to-end Scenario C success-path test in [src/state/sessionStore.test.tsx](C:/Users/hassan/Documents/aura-idcr/src/state/sessionStore.test.tsx) mirroring the existing A and B proof.
- Automated: add a Scenario C failure or timeout path with no corrective ICS action, and assert terminal outcome, replay artifact presence, and KPI generation.
- Automated: add Scenario C assertions for alarm progression order, dominant hypothesis convergence, and first-response lane item changes after recovery action.
- Automated: extend [src/runtime/actionValidator.test.ts](C:/Users/hassan/Documents/aura-idcr/src/runtime/actionValidator.test.ts) with Scenario C pass, soft-warning, and hard-prevent cases for ICS demand.
- Automated: extend [src/state/sessionStore.test.tsx](C:/Users/hassan/Documents/aura-idcr/src/state/sessionStore.test.tsx) so comparison buckets remain separate across A/B/C and baseline/adaptive capture works for Scenario C exactly like A/B.
- Automated: add a selector/control rendering smoke for Scenario C in the HMI test surface, asserting the correct scenario title and bounded control label appear after reset.
- Manual smoke: run adaptive Scenario C successful recovery, baseline Scenario C successful or degraded recovery, and confirm the supervisor panel shows completed review and, after both modes, a valid comparison card.
- Manual smoke: verify Scenario C never presents a LoOP storyline when offsite power remains available, and never reuses the feedwater recovery lane.
- Manual smoke: verify replay stepping, key events, and KPI summary remain readable and scenario-consistent after a Scenario C run.
- High-risk edge cases:
  - IC-low alarm does not assert because the current generic threshold is LoOP-only.
  - Scenario C accidentally inherits LoOP hypothesis dominance due shared ICS/heat-sink cues.
  - Outcome success fires before diagnosis stabilizes.
  - Reset from A or B into C leaves the wrong manual-control default or stale capture interpretation.
  - A/B regress because a new profile branch leaks into default logic.

### 7. File-Level Change Map
- Likely existing files to edit:
  - [src/contracts/aura.ts](C:/Users/hassan/Documents/aura-idcr/src/contracts/aura.ts)
  - [src/scenarios/registry.ts](C:/Users/hassan/Documents/aura-idcr/src/scenarios/registry.ts)
  - [src/runtime/plantTwin.ts](C:/Users/hassan/Documents/aura-idcr/src/runtime/plantTwin.ts)
  - [src/runtime/alarmIntelligence.ts](C:/Users/hassan/Documents/aura-idcr/src/runtime/alarmIntelligence.ts)
  - [src/runtime/reasoningEngine.ts](C:/Users/hassan/Documents/aura-idcr/src/runtime/reasoningEngine.ts)
  - [src/runtime/procedureLane.ts](C:/Users/hassan/Documents/aura-idcr/src/runtime/procedureLane.ts)
  - [src/runtime/actionValidator.ts](C:/Users/hassan/Documents/aura-idcr/src/runtime/actionValidator.ts)
  - [src/state/sessionStore.ts](C:/Users/hassan/Documents/aura-idcr/src/state/sessionStore.ts)
  - [src/state/sessionStore.test.tsx](C:/Users/hassan/Documents/aura-idcr/src/state/sessionStore.test.tsx)
  - [src/runtime/actionValidator.test.ts](C:/Users/hassan/Documents/aura-idcr/src/runtime/actionValidator.test.ts)
- Likely new file to add:
  - [src/scenarios/](C:/Users/hassan/Documents/aura-idcr/src/scenarios/) new Scenario C definition file following the existing scenario-file convention, likely named for `main_steam_reactor_isolation_upset`.
- Likely surfaces to touch only if required by implementation reality:
  - [src/runtime/alarmEngine.ts](C:/Users/hassan/Documents/aura-idcr/src/runtime/alarmEngine.ts) if the team chooses to generalize IC-low alarm semantics instead of using Scenario C alarm hooks.
  - [src/App.tsx](C:/Users/hassan/Documents/aura-idcr/src/App.tsx) and [src/data/plantModel.ts](C:/Users/hassan/Documents/aura-idcr/src/data/plantModel.ts) only for a minimal visibility tweak after manual validation.
  - [src/runtime/sessionComparison.test.ts](C:/Users/hassan/Documents/aura-idcr/src/runtime/sessionComparison.test.ts) only if a new Scenario C comparison edge case proves the generic contract needs stronger coverage.
- Non-functional repo-maintenance file to update after implementation completion:
  - [aura_idcr_master_build_brain.md](C:/Users/hassan/Documents/aura-idcr/aura_idcr_master_build_brain.md)

### 8. Minimality / Anti-Overreach Guardrails
- Do not redesign the scenario engine; add one more bounded profile through the existing seams.
- Do not rewrite stable Scenario A or B logic unless a narrowly scoped bug is required to support Scenario C safely.
- Do not add telemetry, CV, audio, wearables, or human-sensing work.
- Do not add supervisor-dashboard features, export/report workflows, or broader evaluator polish.
- Do not add LLM or optional AI features.
- Do not introduce new plant-state variables unless Scenario C is impossible with the current schema; default assumption is that it is possible now.
- Do not put Scenario C-specific conditionals into generic comparison, replay, or KPI builders.
- Do not create a new UI layout or dedicated new panel for Scenario C; one tiny visibility tweak inside the existing plant panel is the maximum allowed UI expansion.
- Do not stretch into Scenario D or broader plant-model realism work.

### 9. Recommended Implementation Order
1. Add the Scenario C contract surface: profile enum, scenario file, registry entry, manual-control schema.
2. Implement the Scenario C plant-twin progression and scenario hooks so the run can tick deterministically from start to terminal outcome.
3. Add Scenario C alarm-cluster, reasoning, and first-response branches so the event story is coherent before touching validation.
4. Add Scenario C validator and session-store outcome logic so baseline/adaptive runs can complete and produce review artifacts.
5. Extend store and validator tests for Scenario C, then extend multi-scenario capture/comparison tests across A/B/C.
6. Run manual smoke for selector, adaptive/baseline Scenario C, replay, and comparison; only then decide whether the tiny optional plant-panel visibility tweak is needed.
- First implementation thread focus: steps 1 through 4 plus the minimum end-to-end tests needed to prove Scenario C runs deterministically and generates a valid completed review.
- Safe deferrals within this cluster: any optional metric-card visibility tweak, any extra test hardening beyond the required scenario-proof coverage, and any wording polish that does not affect diagnosis/recovery behavior.
- Must validate before moving on: A/B regression-free test suite, Scenario C deterministic success and failure path, Scenario C baseline/adaptive capture, and A/B/C bucket separation in evaluation capture.

### 10. Final Deliverable For The Next Coding Thread
- What Codex should implement next: add one bounded Scenario C profile, wire it through the existing scenario/runtime/reasoning/validator/store seams, and prove that baseline/adaptive comparison plus replay remain valid for all three implemented scenarios.
- Acceptance criteria checklist:
  - Scenario C exists in the selector and resets cleanly.
  - Scenario C runs deterministically to success and to failure/timeout.
  - Scenario C produces coherent alarm grouping, dominant hypothesis, and recovery-lane updates.
  - Scenario C validator behavior is bounded and scenario-appropriate.
  - Baseline and adaptive Scenario C runs both generate completed reviews.
  - Comparison capture stays separated across A/B/C and compares baseline/adaptive within Scenario C.
  - Existing A and B tests still pass unchanged in intent.
- Risk list:
  - Shared ICS cues may accidentally collapse Scenario C into LoOP reasoning.
  - LoOP-specific IC alarm gating may hide a key Scenario C cue if not handled explicitly.
  - A new profile branch could drift into copy-paste divergence if more than minimal logic is duplicated.
  - Optional UI visibility changes can easily become scope creep; keep them behind a clear readability gate.
- Recommended commit strategy:
  - Commit 1: Scenario C definition + registry + profile enum.
  - Commit 2: Scenario C runtime branches for plant, alarms, reasoning, lane, validator, and outcome.
  - Commit 3: Scenario C automated coverage + A/B/C comparison-capture proof.
  - Commit 4 only if needed: tiny plant-panel visibility adjustment and corresponding smoke test.

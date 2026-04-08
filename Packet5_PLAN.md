**Packet 5 Plan: Visible Adaptive Behavior and UX Legibility**

**Verification Result**

The repo looks healthy enough to continue. Packet 4 reads as fully integrated, not half-landed: the canonical path is still monitoring first, then operator-state, then combined risk in [sessionStore.ts](C:/Users/hassan/Documents/aura-idcr/src/state/sessionStore.ts#L418), [sessionStore.ts](C:/Users/hassan/Documents/aura-idcr/src/state/sessionStore.ts#L430), and [sessionStore.ts](C:/Users/hassan/Documents/aura-idcr/src/state/sessionStore.ts#L438). The HPSN-Lite layer is the active risk model in [combinedRisk.ts](C:/Users/hassan/Documents/aura-idcr/src/runtime/combinedRisk.ts#L34), with human-confidence gating, recommended assistance posture, and change summaries in [combinedRisk.ts](C:/Users/hassan/Documents/aura-idcr/src/runtime/combinedRisk.ts#L321), [combinedRisk.ts](C:/Users/hassan/Documents/aura-idcr/src/runtime/combinedRisk.ts#L413), and [combinedRisk.ts](C:/Users/hassan/Documents/aura-idcr/src/runtime/combinedRisk.ts#L451). Support posture still resolves through the canonical policy/refinement path in [supportModePolicy.ts](C:/Users/hassan/Documents/aura-idcr/src/runtime/supportModePolicy.ts#L347) and [supportRefinement.ts](C:/Users/hassan/Documents/aura-idcr/src/runtime/supportRefinement.ts#L248), and the current UI/review surfaces already consume those outputs in [viewModel.ts](C:/Users/hassan/Documents/aura-idcr/src/ui/viewModel.ts#L340), [OperateWorkspace.tsx](C:/Users/hassan/Documents/aura-idcr/src/ui/OperateWorkspace.tsx#L504), and [sessionReview.ts](C:/Users/hassan/Documents/aura-idcr/src/runtime/sessionReview.ts#L388).

Practical verification also passed: `npm test` is green at 116 tests, and `npm run build` passes. Existing coverage still exercises deterministic Scenario A/B/C behavior, baseline-vs-adaptive separation, canonical monitoring logging, and the Review tutorial path in [sessionStore.test.tsx](C:/Users/hassan/Documents/aura-idcr/src/state/sessionStore.test.tsx#L199), [sessionStore.test.tsx](C:/Users/hassan/Documents/aura-idcr/src/state/sessionStore.test.tsx#L305), [sessionStore.test.tsx](C:/Users/hassan/Documents/aura-idcr/src/state/sessionStore.test.tsx#L1043), [sessionStore.test.tsx](C:/Users/hassan/Documents/aura-idcr/src/state/sessionStore.test.tsx#L1051), and [sessionStore.test.tsx](C:/Users/hassan/Documents/aura-idcr/src/state/sessionStore.test.tsx#L1240).

Concrete concerns are non-blocking only. The worktree is still dirty around Packet 4 files, with one small follow-up in [sessionStore.ts](C:/Users/hassan/Documents/aura-idcr/src/state/sessionStore.ts#L342) that makes `current_phase` explicit for risk inputs, and local `.tmp-edge*` / `dist/` residue is still present. I did not find an architectural blocker, a monitoring bypass, a second risk path, or webcam logic becoming primary.

**Packet 5 Scope Recommendation**

Keep Packet 5 as a bounded presentation-layer packet. The best scope here is to make the existing Packet 4 outputs visibly legible in Operate and easier to prove in Review, without changing monitoring heuristics, risk math, validator rules, or scenario flow.

That means Packet 5 should answer, on the default operator path: what posture is active now, what changed, why it changed, what the operator should do next, and what remains under operator control. Prefer no repo-wide contract changes; if new structure is needed, keep it as UI-local derived models in [viewModel.ts](C:/Users/hassan/Documents/aura-idcr/src/ui/viewModel.ts#L24) and presentational policy in [presentationPolicy.ts](C:/Users/hassan/Documents/aura-idcr/src/runtime/presentationPolicy.ts#L27).

**Best Implementation Breakdown**

1. Add one derived “assistance legibility” model in [viewModel.ts](C:/Users/hassan/Documents/aura-idcr/src/ui/viewModel.ts#L340) built only from existing `combined_risk`, `support_policy`, and `support_refinement` fields. It should explicitly produce: active posture, recommended posture, active-vs-recommended note, what changed, why, what now, operator-control note, confidence note, and guardrail note.

2. Rework the current Support Posture region in [OperateWorkspace.tsx](C:/Users/hassan/Documents/aura-idcr/src/ui/OperateWorkspace.tsx#L504) so it reads as calm adaptive behavior rather than a compact dump of metrics. Keep the same region, but restructure it around “What changed / Why / What now / Operator still controls / Critical information stays pinned,” using the existing factor list and notes instead of inventing new logic.

3. Use the already-existing adaptive outputs in [supportRefinement.ts](C:/Users/hassan/Documents/aura-idcr/src/runtime/supportRefinement.ts#L285) and [presentationPolicy.ts](C:/Users/hassan/Documents/aura-idcr/src/runtime/presentationPolicy.ts#L50) to make the interaction flow visibly adapt. In practice: consume `emphasized_lane_item_ids`, `watch_now_summary`, `support_behavior_changes`, `validator_priority`, and `support_section_order` so tightening/narrowing is visible in the lane and support region, not just described in text.

4. Thread one short assistance/posture cue into the top operator path, not only the lower support card. The existing orientation and next-actions surfaces in [viewModel.ts](C:/Users/hassan/Documents/aura-idcr/src/ui/viewModel.ts#L165) are the right place: a first-time observer should understand that support strengthened before they have to inspect the full posture section.

5. Promote adaptive proof in Review using the current canonical artifacts, not new logging. Surface the existing assistance and human-monitoring highlights already assembled in [sessionReview.ts](C:/Users/hassan/Documents/aura-idcr/src/runtime/sessionReview.ts#L404) and [sessionReview.ts](C:/Users/hassan/Documents/aura-idcr/src/runtime/sessionReview.ts#L442) more explicitly in [ReviewWorkspace.tsx](C:/Users/hassan/Documents/aura-idcr/src/ui/ReviewWorkspace.tsx#L190) so Packet 6 demo/report work does not depend on reading raw JSON payloads.

**Main Boundaries / Cautions**

Do not change [humanMonitoring.ts](C:/Users/hassan/Documents/aura-idcr/src/runtime/humanMonitoring.ts#L1504), [combinedRisk.ts](C:/Users/hassan/Documents/aura-idcr/src/runtime/combinedRisk.ts#L479), or validator outcome logic unless a tiny additive UI need truly forces it.

Do not create a new `risk_state`, new adaptation store, or a parallel explanation path. Packet 5 should derive from the current canonical snapshots only.

Do not make webcam evidence central. Interaction telemetry and aggregate monitoring confidence remain the strongest trusted human-side signal.

Do not broadly redesign the shell, add noisy animation, or hide critical plant/alarm information. Critical visibility remains governed by [supportModePolicy.ts](C:/Users/hassan/Documents/aura-idcr/src/runtime/supportModePolicy.ts#L84).

**Repo-Specific Guidance**

Attach Packet 5 to these seams:
- [sessionStore.ts](C:/Users/hassan/Documents/aura-idcr/src/state/sessionStore.ts#L418) for canonical upstream order only; avoid new store state if possible.
- [combinedRisk.ts](C:/Users/hassan/Documents/aura-idcr/src/runtime/combinedRisk.ts#L413) for raw posture recommendation and reasoning.
- [supportModePolicy.ts](C:/Users/hassan/Documents/aura-idcr/src/runtime/supportModePolicy.ts#L215) for active-mode/dwell behavior and guardrails.
- [supportRefinement.ts](C:/Users/hassan/Documents/aura-idcr/src/runtime/supportRefinement.ts#L329) for visible emphasis, focus, and watch-now wording.
- [presentationPolicy.ts](C:/Users/hassan/Documents/aura-idcr/src/runtime/presentationPolicy.ts#L233) for mode-aware UI ordering/prominence that currently exists but is underused.
- [viewModel.ts](C:/Users/hassan/Documents/aura-idcr/src/ui/viewModel.ts#L380) and [OperateWorkspace.tsx](C:/Users/hassan/Documents/aura-idcr/src/ui/OperateWorkspace.tsx#L518) for the actual legibility work.
- [workspaces.css](C:/Users/hassan/Documents/aura-idcr/src/styles/workspaces.css#L181) for restrained visual differentiation by mode, using existing tokens/palette only.

**Verification Expectations For Later Implementation**

Once Packet 5 is implemented, verify that Operate clearly shows the active posture, the reason for the posture, the immediate operator task, and preserved operator authority without hiding critical variables or pinned alarms. Verify the “recommended vs active” case is understandable when dwell logic holds a lower mode change.

Update UI/render coverage, centered on [sessionStore.test.tsx](C:/Users/hassan/Documents/aura-idcr/src/state/sessionStore.test.tsx#L241) and [presentationPolicy.test.ts](C:/Users/hassan/Documents/aura-idcr/src/runtime/presentationPolicy.test.ts#L99), so tests prove: adaptive posture is visibly legible, baseline remains calm/non-adaptive, protected response does not hide core regions, Review surfaces adaptive evidence cleanly, and the existing tutorial/review flow still works.

Run `npm test` and `npm run build` again, and re-check deterministic Scenario A/B/C paths plus the Review tutorial regression path.

**Assumptions / Defaults**

No new canonical contracts or event types are required for Packet 5. Existing Packet 4 fields are sufficient. Packet 5 should ship as one bounded UI packet focused on legibility and proof, not as a redesign, new monitoring slice, or LLM-style explanation feature.

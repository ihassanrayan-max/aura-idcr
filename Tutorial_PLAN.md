# AURA-IDCR Guided Onboarding Hardening

## Summary
- Comprehension gaps found:
  - The operator-first shell is much clearer than before, but first-open still assumes the user already understands how Operate, Review, storyline, procedure guidance, validator behavior, and competition evidence fit together.
  - A detailed tutorial system already exists in `src/ui/tutorial.ts` and `src/ui/TutorialOverlay.tsx`, but it is only partially production-ready: the overlay/menu/spotlight classes currently have no matching CSS, there is no tutorial-specific test coverage, and `npm run build` currently fails on tutorial typing in `src/App.tsx`.
  - The content is strong, but it still needs a slightly sharper teaching arc around scenario selection, baseline vs adaptive runs, and the cause/effect chain after user actions and validator outcomes.
- Pacing/control gaps found:
  - Paused-on-load, guided/live pace, one-tick stepping, and checkpoint pauses are already present and are the right direction.
  - The controls still read more like raw simulator controls than a learning-oriented teaching surface; guided pace needs stronger “safe learning/demo mode” framing, checkpoint pauses need clearer status messaging, and the command bar should treat guided/live as resume modes after a pause.
  - No store/runtime rewrite is needed; the pacing model is already in the right place and just needs hardening and clearer UX.

## Public Interfaces / Types
- Keep all runtime/store/scenario/report contracts unchanged; do not alter `SessionSnapshot`, validator behavior, scenario progression, completed review, or comparison artifacts.
- Keep the tutorial architecture frontend-local and strengthen the existing types:
  - `TutorialPathId = "full" | "operate" | "review"`
  - `RunPace = "guided" | "live"`
  - `TutorialState` and its refs/guards should be made TS 6-safe in `src/App.tsx`.
- Bump the dismissal storage key from `aura-idcr.tutorial.v1.dismissed` to `aura-idcr.tutorial.v2.dismissed` so the improved walkthrough appears once for existing users.
- Do not move tutorial state into the session store.

## Implementation Changes
- Tutorial controller and build hardening:
  - Fix the current `src/App.tsx` TypeScript errors first and keep `npm run build` green before any polish.
  - Keep orchestration in `src/App.tsx`, step content in `src/ui/tutorial.ts`, and rendering in `src/ui/TutorialOverlay.tsx`; extend this architecture rather than replacing it.
  - Add robust guards for missing tutorial targets, safe workspace auto-switching, stable auto-advance bookkeeping, and scroll/focus behavior while the overlay is active.
- Tutorial content and flow:
  - Keep the three-path structure: full walkthrough, Operate-only, Review-only.
  - Refine the full flow order to explicitly cover: system identity, Operate vs Review, scenario/mode selection, pacing controls, orientation band, situation board, alarm grouping, storyline/root cause, procedure lane, support posture, validator behavior, Review handoff, completed-run evidence, paired baseline/adaptive comparison, and competition takeaway.
  - Preserve the current per-step teaching structure: “What this area shows”, “Why it exists”, “When to care”, and “Decision support value”.
  - Keep learn-by-doing gates for one-tick advance, guided pace start, cluster expansion, lane action, validator demo, and workspace switch; after each required action, automatically spotlight the changed banner/region that shows the result.
- Tutorial visuals and affordances:
  - Add real tutorial styling through the existing CSS split: tutorial tokens in `src/styles/tokens.css`, and overlay/panel/spotlight/responsive styles in `src/styles/layout.css` and `src/styles/workspaces.css`.
  - Ship a proper dimmed scrim, spotlight frame, anchored panel, progress bar, task-status treatment, and mobile-safe stacking; every `tutorial-*` class already in JSX should have concrete styling.
  - Keep skip, back, next, restart, and reopen-from-command-bar behavior without adding permanent UI clutter outside tutorial mode.
- Simulation pacing/control polish:
  - Keep paused-by-default first load and tutorial reset behavior.
  - Keep `Run guided pace`, `Run live pace`, `Pause`, `Advance one tick`, and `Reset session`, but update copy/status messaging so guided pace clearly reads as the learning/demo mode, live pace as the faster continuous mode, and checkpoint pauses as deliberate teaching moments.
  - When paused after a checkpoint, let the guided/live buttons function as resume controls with clearer labels or helper text; do not add a new runtime engine or store command set.
  - Keep checkpoint pauses enabled by default for tutorial use, while preserving the existing toggle for normal usage.
- Verification coverage:
  - Extend `src/state/sessionStore.test.tsx` with app-level tutorial and pacing coverage.
  - Add a focused test file for `src/ui/TutorialOverlay.tsx` to cover the launcher, spotlight, progress, and locked-action states.
  - Update `aura_idcr_master_build_brain.md` when the slice is complete, partial, or blocked.

## Test Plan
- Automated:
  - `npm test`
  - `npm run build`
  - App-level assertions for paused first load, tutorial auto-open on fresh default-store load, intro-scenario reset when starting full/Operate tours, locked-step gating, guided checkpoint pauses, cause/effect spotlight progression, Review-tour state preservation, and `v2` localStorage dismissal behavior.
- Manual:
  - Fresh-load the app and confirm the tutorial launcher appears, the runtime is paused, and the command bar explains how to begin.
  - Run the full tutorial once and verify each gated step works: one-tick advance, guided checkpoint pause, alarm cluster expansion, lane action, validator hard prevent, and Review handoff.
  - Complete one adaptive and one baseline run on the same scenario and confirm Review comparison/export messaging matches the actual evidence state.
  - Check mobile width and confirm the panel, spotlight, and scroll-to-target behavior remain usable.
  - Skip the tutorial, reopen it from the command bar, and restart both the Operate-only and Review-only paths.

## Assumptions / Defaults
- The existing tutorial and pacing implementation is the base to finish, not something to discard and rebuild.
- No scenario logic, validator rules, review generation, or export formats should change unless a tutorial-hardening bug forces a minimal fix.
- `scn_alarm_cascade_root_cause` remains the introductory tutorial scenario.
- Existing users should see the improved tutorial once via the `v2` dismissal key, and it should remain reopenable from the command bar afterward.

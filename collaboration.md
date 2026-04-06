# AURA-IDCR Collaboration Plan

This file is the collaboration source of truth for parallel implementation work in this repo.

Future implementation agents must read this file first, then `README.md`, then `aura_idcr_master_build_brain.md`, before touching code.

This document does not replace the build brain for product scope. It defines how Hassan, Pranav, and future AI IDE agents should divide work so the repo can move forward without constant merge conflicts, broken integrations, or accidental overwrites.

## 1. Current Repo Snapshot

As inspected on 2026-04-06:

- The repo is a runnable Vite + React + TypeScript prototype with a clean working tree on `main`.
- `npm test` passes: 10 test files, 49 tests.
- `npm run build` passes.
- The core closed loop already exists and is real, not placeholder-only:
  `plantTwin -> alarmEngine / alarmIntelligence -> reasoningEngine -> operatorState / combinedRisk -> supportModePolicy / supportRefinement -> actionValidator -> sessionLogger / kpiSummary / sessionReview / sessionComparison`
- The main orchestration is centralized in [src/state/sessionStore.ts](/C:/Users/hassan/Documents/aura-idcr/src/state/sessionStore.ts).
- The main UI shell is centralized in [src/App.tsx](/C:/Users/hassan/Documents/aura-idcr/src/App.tsx) with global styling in [src/styles.css](/C:/Users/hassan/Documents/aura-idcr/src/styles.css).
- Shared contracts are centralized in [src/contracts/aura.ts](/C:/Users/hassan/Documents/aura-idcr/src/contracts/aura.ts).
- Current hotspot sizes are large enough to matter for collaboration: `sessionStore.ts` ~1084 lines, `App.tsx` ~1128 lines, `aura.ts` ~504 lines, `styles.css` ~675 lines.
- Only one scenario currently exists: [src/scenarios/scn_alarm_cascade_root_cause.ts](/C:/Users/hassan/Documents/aura-idcr/src/scenarios/scn_alarm_cascade_root_cause.ts).
- The current operator shell already includes plant mimic, alarm intelligence, storyline, first-response lane, support/risk state, completed-session review, and baseline-vs-adaptive comparison.

The main repo risk is no longer "can we build the core?" The main risk is "how do we extend the working core without overlapping in the highest-conflict files?"

## 2. Ranked Unfinished Backlog

This ranked backlog is the collaboration planning overlay for future work.

### Tier 1

| Priority | Item | Dependency note |
| --- | --- | --- |
| Must | A1 Multi-scenario runtime generalization + scenario selector | Blocks A2, A3, A4, A5 |
| Must | A2 Scenario B: Loss of Offsite Power / SBO progression | Best built after A1 foundations |
| Must | A3 Scenario C: Main Steam / Reactor Isolation upset | Best built after A1 foundations |
| Must | A4 Scenario-specific tests, comparison compatibility, success/failure verification | Depends on A2/A3 runtime additions |

### Tier 2

| Priority | Item | Dependency note |
| --- | --- | --- |
| Should | B1 Exportable after-action / comparison report artifact | Safest additive Tier 2 item |
| Should | B4 Broader validator coverage beyond narrow feedwater action focus | Cross-cutting; touches validator/runtime/store |
| Should | B3 Supervisor override workflow | Cross-cutting; touches validator/store/UI |
| Should | B2 Supervisor dashboard polish | Safer after B1 or after runtime hooks stabilize |

### Tier 3

| Priority | Item |
| --- | --- |
| Should | C1 Real interaction telemetry ingestion |
| Should | C2 Real webcam-based visual proxy ingestion |
| Should | C3 Real sensor confidence / degraded mode pipeline |
| Should | C4 UI/risk integration update for real telemetry sources |

### Tier 4

| Priority | Item |
| --- | --- |
| Could | D1 True mode-depth improvement for Baseline / Declutter / Guided Recovery behavior |
| Could | D2 Richer alarm-context embedding |
| Could | D3 Broader projected outcome / what-if support |
| Could | D4 Richer ecological overlays |

### Tier 5

| Priority | Item |
| --- | --- |
| Could | E1 Richer causal graph / Bayesian smoothing |
| Could | E2 Optional LLM transparent summaries |

### Tier 6

| Priority | Item |
| --- | --- |
| Could | F1 Environment props |
| Could | F2 Haptics |
| Could | F3 3D plant representation |
| Could | F4 Multi-operator mode |

### Cluster packs

- Pack 1: A1 + A2
- Pack 2: A3 + A4
- Pack 3: B1 + B2 + B3 + B4
- Pack 4: C1 + C2 + C3 + C4
- Pack 5: D1 + D2 + D3 + D4
- Pack 6: E/F stretch items

Important repo-grounded note: Pack 3 is not equally safe internally. In this repo, B1 and most of B2 are additive. B3 and B4 are cross-cutting runtime work.

## 3. Recommended Two-Person Split

Do not split this repo into vague "frontend vs backend" ownership.

That is unsafe here because the UI shell in [src/App.tsx](/C:/Users/hassan/Documents/aura-idcr/src/App.tsx) is tightly coupled to `SessionSnapshot`, reset flow, scenario identity, validator state, support mode, and evaluation state. A person "polishing the whole frontend" while another person changes scenario architecture will create integration pain quickly.

### Recommended primary split

| Workstream | Recommended owner | Best-fit backlog |
| --- | --- | --- |
| Core runtime / scenario / shared-state work | Hassan | A1, A2, A3, A4, later C1-C4, D1-D4, E1, and any B3/B4 work that changes runtime behavior |
| Additive evaluation / report / supervisor presentation work | Pranav | B1 first, then B2, then optional E2 or later presentation-only polish once runtime APIs are stable |

### Practical interpretation

- Hassan should own any task that changes scenario identity, plant progression, session reset flow, validator behavior, support mode behavior, or shared contracts.
- Pranav should own additive reporting and supervisor-facing surfaces that sit on top of already-published logs, KPI summaries, `CompletedSessionReview`, and `SessionRunComparison`.
- B3 and B4 should not be treated as "just supervisor/presentation work." In the current repo they touch the same central files as scenario/runtime work. Default them to Hassan unless explicitly restaged after stable hooks land.

### Safe alternative split

If assignments change later, keep the same ownership logic and swap the people, not the boundaries:

- One person must still own the runtime/state/scenario files.
- One person must still own additive report/export/supervisor surfaces.
- If both people need Pack 3, split it as `B1+B2` versus `B3+B4`, not as "UI vs logic."

## 4. Ownership Model

Use these terms consistently:

- Exclusive ownership zone: one workstream owns this area for the current sprint and can edit it freely.
- Shared-touch zone: allowed only by explicit coordination and only after checking current owner activity.
- Forbidden simultaneous edit: do not let two branches edit this at the same time.

The "Likely files" below are grounded in the current repo structure. For future backlog items, some file impact is inferred from the current architecture and should be treated as the default impact zone.

| Area | Likely files | Default owner | Parallel-safe? | Notes |
| --- | --- | --- | --- | --- |
| Scenario catalog, runtime selection, reset flow | [src/scenarios](/C:/Users/hassan/Documents/aura-idcr/src/scenarios), [src/state/sessionStore.ts](/C:/Users/hassan/Documents/aura-idcr/src/state/sessionStore.ts), [src/App.tsx](/C:/Users/hassan/Documents/aura-idcr/src/App.tsx), [src/contracts/aura.ts](/C:/Users/hassan/Documents/aura-idcr/src/contracts/aura.ts) | Runtime owner, recommended Hassan | No | A1 and A5 live here. Today the default scenario is hard-wired in `AuraSessionStore` constructor. |
| Plant and phase progression | [src/runtime/scenarioEngine.ts](/C:/Users/hassan/Documents/aura-idcr/src/runtime/scenarioEngine.ts), [src/runtime/plantTwin.ts](/C:/Users/hassan/Documents/aura-idcr/src/runtime/plantTwin.ts), [src/data/plantModel.ts](/C:/Users/hassan/Documents/aura-idcr/src/data/plantModel.ts), [src/data/alarmDictionary.ts](/C:/Users/hassan/Documents/aura-idcr/src/data/alarmDictionary.ts) | Runtime owner | Usually yes if isolated, otherwise no | A2 and A3 will hit this area directly. |
| Reasoning, procedure, support, validation behavior | [src/runtime/reasoningEngine.ts](/C:/Users/hassan/Documents/aura-idcr/src/runtime/reasoningEngine.ts), [src/runtime/procedureLane.ts](/C:/Users/hassan/Documents/aura-idcr/src/runtime/procedureLane.ts), [src/runtime/combinedRisk.ts](/C:/Users/hassan/Documents/aura-idcr/src/runtime/combinedRisk.ts), [src/runtime/supportModePolicy.ts](/C:/Users/hassan/Documents/aura-idcr/src/runtime/supportModePolicy.ts), [src/runtime/supportRefinement.ts](/C:/Users/hassan/Documents/aura-idcr/src/runtime/supportRefinement.ts), [src/runtime/actionValidator.ts](/C:/Users/hassan/Documents/aura-idcr/src/runtime/actionValidator.ts), [src/runtime/presentationPolicy.ts](/C:/Users/hassan/Documents/aura-idcr/src/runtime/presentationPolicy.ts) | Runtime owner | Mostly no | B3, B4, C, D, and E1 all collide here. |
| Shared contracts and canonical log schema | [src/contracts/aura.ts](/C:/Users/hassan/Documents/aura-idcr/src/contracts/aura.ts), [docs/aura_module_contracts.md](/C:/Users/hassan/Documents/aura-idcr/docs/aura_module_contracts.md), [docs/aura_scenario_schema.md](/C:/Users/hassan/Documents/aura-idcr/docs/aura_scenario_schema.md), [docs/aura_kpi_definitions.md](/C:/Users/hassan/Documents/aura-idcr/docs/aura_kpi_definitions.md) | Runtime owner by default | No | One editor at a time. This file set is the contract surface for almost every subsystem. |
| Session orchestration and canonical snapshot publishing | [src/state/sessionStore.ts](/C:/Users/hassan/Documents/aura-idcr/src/state/sessionStore.ts), [src/state/sessionStore.test.tsx](/C:/Users/hassan/Documents/aura-idcr/src/state/sessionStore.test.tsx) | Runtime owner | No | Highest-conflict zone in the repo. |
| Evaluation and report builders | [src/runtime/kpiSummary.ts](/C:/Users/hassan/Documents/aura-idcr/src/runtime/kpiSummary.ts), [src/runtime/sessionReview.ts](/C:/Users/hassan/Documents/aura-idcr/src/runtime/sessionReview.ts), [src/runtime/sessionComparison.ts](/C:/Users/hassan/Documents/aura-idcr/src/runtime/sessionComparison.ts) and related tests | Report owner, recommended Pranav | Yes | Safest additive zone for immediate parallel work. |
| Supervisor/report UI integration | [src/App.tsx](/C:/Users/hassan/Documents/aura-idcr/src/App.tsx), [src/styles.css](/C:/Users/hassan/Documents/aura-idcr/src/styles.css), any future extracted report components | Report owner only during agreed UI window | Limited | Keep to completed-review, comparison, export, and supervisor panel areas. |
| Global shell, top status bar, layout, selector/reset controls | [src/App.tsx](/C:/Users/hassan/Documents/aura-idcr/src/App.tsx), [src/styles.css](/C:/Users/hassan/Documents/aura-idcr/src/styles.css) | Whoever owns the current integration window | No | Never parallel-edit with scenario/reset changes. |
| Verification and docs by module | Matching `*.test.ts`, `*.test.tsx`, docs, build brain | Same owner as changed module | Usually yes | Update tests/docs in the same branch as the behavior change. |

## 5. Do-Not-Touch and Coordination Rules

- No simultaneous edits to [src/state/sessionStore.ts](/C:/Users/hassan/Documents/aura-idcr/src/state/sessionStore.ts), [src/contracts/aura.ts](/C:/Users/hassan/Documents/aura-idcr/src/contracts/aura.ts), [src/App.tsx](/C:/Users/hassan/Documents/aura-idcr/src/App.tsx), [src/styles.css](/C:/Users/hassan/Documents/aura-idcr/src/styles.css), [src/state/sessionStore.test.tsx](/C:/Users/hassan/Documents/aura-idcr/src/state/sessionStore.test.tsx), or [docs/aura_module_contracts.md](/C:/Users/hassan/Documents/aura-idcr/docs/aura_module_contracts.md).
- If Hassan is doing A1/A2/A3/A4 work, Pranav must not edit scenario/reset/runtime plumbing in `sessionStore.ts`, `aura.ts`, `scenarios/*`, `scenarioEngine.ts`, or `plantTwin.ts`.
- If Pranav is doing additive report/supervisor work, that work must avoid "polish the whole frontend" edits. Keep it scoped to the supervisor/log/review/comparison/export surface.
- Do not reorder, redesign, or broadly restyle the whole shell in parallel with scenario architecture work. In this repo, that is not presentation-only work.
- If a task can be implemented as a new helper module, do that first. Wire it into `sessionStore.ts` or `App.tsx` once, late, and in one controlled pass.
- B3 supervisor override and B4 broader validator coverage are not safe side work while Pack 1 or Pack 2 is active. They should wait or be explicitly assigned to the runtime owner.
- If a branch touches another workstream's zone, the prompt or human assignment must explicitly say so. Otherwise, treat that area as locked.

## 6. Safe Branch Strategy

Keep the Git model simple and beginner-safe.

- Never commit directly to `main`.
- Each person works on their own short-lived branch.
- Use one branch per task or pack, not one branch for "everything this week."
- Open a PR early once the scope is clear, even if still draft.
- Prefer squash merge to keep history readable unless there is a strong reason not to.

### Branch naming

Use:

- `hassan/<task-slug>`
- `pranav/<task-slug>`

Examples:

- `hassan/a1-scenario-registry`
- `hassan/a2-sbo-scenario`
- `hassan/a3-main-steam-upset`
- `pranav/b1-export-report`
- `pranav/b2-supervisor-panel`

If an AI agent creates the branch automatically, `codex/hassan-a1-scenario-registry` or similar is also acceptable.

### Start-of-branch flow

1. Update local `main`.
2. Create a new branch from updated `main`.
3. Keep the branch scoped to one task or one tightly-related pack.

### Update / rebase guidance

- Before opening or merging a PR, pull in the latest `main`.
- If the branch is only yours, rebasing onto `main` is preferred.
- If rebase feels risky, merging `main` into your branch is acceptable.
- Do not force-push shared branches.
- Do not have both people working on the same feature branch.

### Merge order guidance

Merge by dependency, not by who finishes first:

- Pack 1 branches should merge before Pack 2 branches that depend on the new scenario architecture.
- Runtime/scenario branches should merge before additive UI/report branches if both touch `App.tsx`, `styles.css`, `aura.ts`, or `sessionStore.ts`.
- B1 can merge independently if it stays on top of existing evaluation artifacts.
- B3 and B4 should merge only after the current runtime owner branch has landed or paused.

## 7. Implementation Sequencing Plan

### Collaboration-safe order

1. Hassan: A1 first. Multi-scenario generalization and selector/reset plumbing are the dependency foundation.
2. Hassan: A2 next. Add Scenario B on top of the A1 foundation.
3. Pranav in parallel with A1/A2: B1 only. Build exportable after-action/comparison output from the existing review/comparison pipeline without changing core runtime flow.
4. Hassan: A3 and A4 after A1 is stable. Add Scenario C, then scenario-specific verification and compatibility checks.
5. Pranav after B1 or after Hassan lands A1: B2 supervisor dashboard polish limited to the supervisor/report surface.
6. Hassan later: B4 then B3 if explicitly prioritized, because both change validator/store/shared state.
7. Only after scenario breadth is stable: C pack, then D pack.
8. E/F stay last.

### Recommended next 2-day sprint

- Hassan: A1 scenario registry + scenario selector/reset architecture, then begin A2 Scenario B runtime.
- Pranav: B1 exportable after-action/comparison artifact, using the existing `CompletedSessionReview` and `SessionRunComparison` pipeline.
- Optional second task for Pranav only if Hassan is not editing `App.tsx`: bounded B2 polish in the supervisor/log/report panel.
- Explicitly hold B3, B4, and any broad "UI polish" until A1 is merged.

## 8. Agent Operating Instructions

This section is for future AI coding agents in Codex, Claude, Cursor, Anti-Gravity, or similar tools.

1. Read `collaboration.md` first.
2. Then read `README.md` and `aura_idcr_master_build_brain.md`.
3. Inspect the current branch name, `git status`, and changed files before proposing edits.
4. Identify which workstream the branch belongs to: runtime/scenario or additive report/supervisor.
5. Do not touch files owned by the other workstream unless the human explicitly reassigns that area.
6. Treat [src/state/sessionStore.ts](/C:/Users/hassan/Documents/aura-idcr/src/state/sessionStore.ts), [src/contracts/aura.ts](/C:/Users/hassan/Documents/aura-idcr/src/contracts/aura.ts), [src/App.tsx](/C:/Users/hassan/Documents/aura-idcr/src/App.tsx), and [src/styles.css](/C:/Users/hassan/Documents/aura-idcr/src/styles.css) as high-risk files. Avoid them unless the branch clearly owns them.
7. Do not perform broad rewrites. Prefer additive implementation and new helper modules.
8. If assigned report/presentation work, do not "polish the whole frontend." Stay inside the supervisor/review/comparison/export surface.
9. If assigned scenario/runtime work, preserve the existing evaluation harness and do not casually rewrite the review/comparison pipeline.
10. Run `npm test` and `npm run build` before handoff when possible.
11. If the task changes shared contracts, scenario schema, or completed status, update the relevant docs and the build brain in the same branch.

## 9. Pre-Merge Checklist

- `git diff --name-only` still matches the assigned ownership zone.
- No accidental edits to `sessionStore.ts`, `aura.ts`, `App.tsx`, `styles.css`, or `sessionStore.test.tsx` unless the branch explicitly owned them.
- `npm test` passes.
- `npm run build` passes.
- If scenario/runtime files changed: the existing feedwater scenario still starts, resets, and reaches a terminal outcome in both baseline/adaptive flow as applicable.
- If report/supervisor files changed: completed review still renders after one terminal run, and comparison still renders after baseline + adaptive runs.
- If `App.tsx` or `styles.css` changed: the main panels still render and the layout still behaves on the current shell.
- If scenario identity or reset flow changed: scenario selection, reset, replay, and comparison capture still make sense together.
- Shared contract or log-schema changes were reviewed against ownership boundaries and corresponding tests/docs were updated.
- The branch has been updated from current `main` after the latest core merge.

## 10. Conflict Handling Protocol

If both branches need the same file:

1. Stop immediately and identify the file as a conflict hotspot.
2. Apply the default ownership rule for that file.
3. The file owner makes the shared-file change first.
4. The non-owner rebases or merges the owner's latest branch or merged `main`, then adapts to that result.
5. Do not let both people independently resolve the same conflict in parallel.

Default tiebreakers:

- Runtime owner wins for `sessionStore.ts`, `aura.ts`, `scenarios/*`, `scenarioEngine.ts`, `plantTwin.ts`, `actionValidator.ts`, `supportModePolicy.ts`, `supportRefinement.ts`, and shared scenario/reset flow in `App.tsx`.
- Report owner wins for `sessionReview.ts`, `sessionComparison.ts`, export/report helper modules, and supervisor/report presentation once the runtime branch is merged.

If both branches truly need a shared file the same day:

- Do a short sync first.
- Agree the contract or API shape before either branch continues.
- Assign one person to edit the shared file.
- Have the other branch consume that edit rather than making a second competing version.

For `App.tsx` and `styles.css`, prefer a single integration pass after the higher-dependency branch lands. Those files are too centralized for casual parallel editing.

## 11. Recommended Immediate Split

### Hassan

Own the core scenario/system expansion:

- A1 multi-scenario runtime generalization + scenario selector/reset plumbing
- A2 Scenario B
- then A3 and A4

Default file zone:

- [src/state/sessionStore.ts](/C:/Users/hassan/Documents/aura-idcr/src/state/sessionStore.ts)
- [src/contracts/aura.ts](/C:/Users/hassan/Documents/aura-idcr/src/contracts/aura.ts)
- [src/scenarios](/C:/Users/hassan/Documents/aura-idcr/src/scenarios)
- [src/runtime/scenarioEngine.ts](/C:/Users/hassan/Documents/aura-idcr/src/runtime/scenarioEngine.ts)
- [src/runtime/plantTwin.ts](/C:/Users/hassan/Documents/aura-idcr/src/runtime/plantTwin.ts)
- [src/runtime/reasoningEngine.ts](/C:/Users/hassan/Documents/aura-idcr/src/runtime/reasoningEngine.ts)
- [src/runtime/procedureLane.ts](/C:/Users/hassan/Documents/aura-idcr/src/runtime/procedureLane.ts)
- [src/runtime/actionValidator.ts](/C:/Users/hassan/Documents/aura-idcr/src/runtime/actionValidator.ts)
- scenario/reset wiring in [src/App.tsx](/C:/Users/hassan/Documents/aura-idcr/src/App.tsx) only as needed

### Pranav

Own the safer additive surfaces:

- B1 exportable after-action / comparison report artifact
- then B2 supervisor dashboard polish, limited to the existing supervisor/report area

Default file zone:

- [src/runtime/kpiSummary.ts](/C:/Users/hassan/Documents/aura-idcr/src/runtime/kpiSummary.ts)
- [src/runtime/sessionReview.ts](/C:/Users/hassan/Documents/aura-idcr/src/runtime/sessionReview.ts)
- [src/runtime/sessionComparison.ts](/C:/Users/hassan/Documents/aura-idcr/src/runtime/sessionComparison.ts)
- related tests in [src/runtime](/C:/Users/hassan/Documents/aura-idcr/src/runtime)
- bounded supervisor/report integration in [src/App.tsx](/C:/Users/hassan/Documents/aura-idcr/src/App.tsx) and [src/styles.css](/C:/Users/hassan/Documents/aura-idcr/src/styles.css) only during an agreed UI window

### Hold for later or explicit reassignment

- B3 supervisor override workflow
- B4 broader validator coverage
- C1-C4
- D1-D4
- E/F stretch work

Reason: those items collide with the same shared runtime/state files that A1-A4 need first.

If future prompts simply say "Read `collaboration.md` first and stay inside your assigned workstream," this file should be enough to keep the next implementation pass safe.

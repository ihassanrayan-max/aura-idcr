# AURA-IDCR Operator-First Frontend Overhaul

## Summary
- Main UX problems found:
  - The first-open screen is overloaded: nearly every region has equal visual weight, so the user does not get a clear “what is happening / what matters / what do I do next” path.
  - Operator runtime, support reasoning, manual controls, evaluator tools, exports, and replay all compete inside one surface, which tangles operator and judge workflows.
  - The current UI is too card-heavy and badge-heavy, with repeated labels and dense prose; primary vs secondary information is not visually separated enough.
  - The most important decision-support content is too low in the page flow, and mobile collapses into a very long undifferentiated stack.
- Chosen direction:
  - Keep a serious control-room shell, but make it operator-first by default.
  - Separate evaluator/review/comparison into a dedicated Review workspace.
  - Rebuild the frontend around a calmer visual system, clearer hierarchy, and fewer simultaneously competing surfaces.
- Baseline was verified before planning: live dev build inspected, `npm test` passed, and `npm run build` passed.

## Public Interfaces / Types
- Preserve existing runtime/store contracts as-is: `SessionSnapshot`, `CompletedSessionReview`, `SessionRunComparison`, validator behavior, scenario flow, and reporting artifacts stay authoritative.
- Do not plan backend or reasoning changes for the overhaul.
- Add only frontend-local UI types/selectors, such as:
  - `WorkspaceId = "operate" | "review"`
  - operator/review view-model mappers derived from `SessionSnapshot`
  - small presentation-only status/severity helpers
- After implementation, update [`aura_idcr_master_build_brain.md`](C:\Users\hassan\Documents\aura-idcr\aura_idcr_master_build_brain.md) and the checked-in HMI/design guidance to reflect the new shell.

## Implementation Changes
- App architecture:
  - Replace the monolithic [`src/App.tsx`](C:\Users\hassan\Documents\aura-idcr\src\App.tsx) with a shell component plus extracted workspace/section components.
  - Introduce a top-level workspace switch with `Operate` as the default and `Review` as the secondary workspace.
  - Add a selector layer that maps raw session state into focused UI models so formatting and ordering logic leave the JSX.
- Operate workspace:
  - Use a sticky command bar with three roles: scenario identity, run/session controls, and live status.
  - Keep the primary grid operator-first:
    - main situation board: plant mimic, critical variable strip, state ribbon, EID overlay
    - alarm board: pinned critical alarms first, grouped clusters second, raw alarm details behind expansion
    - storyline board: one dominant hypothesis card, secondary hypotheses compressed below
    - next-actions board: first-response lane as the primary action surface, with validation messages inline
    - support posture board: combined risk, workload, confidence, top factors, and current mode effect in one compact region
  - Move manual controls into a smaller “Manual intervention” utility section below the action lane instead of giving them equal weight with diagnosis content.
  - Remove full replay/export/log/report surfaces from the default operator screen; keep only minimal live review affordances such as pending supervisor review and a link into Review.
- Review workspace:
  - Build a dedicated secondary workspace with three ordered sections:
    - `Live Oversight`: validator checklist, pending supervisor override, recent milestone/event stream
    - `Completed Run`: completed session review and KPI summary
    - `Comparison & Export`: baseline-vs-adaptive comparison and report download actions
  - Keep review empty states explicit so judges understand what appears before and after a completed run.
- Visual system:
  - Replace the current one-style-fits-all panel/card treatment in [`src/styles.css`](C:\Users\hassan\Documents\aura-idcr\src\styles.css) with tokenized surfaces, spacing, typography, and semantic status colors.
  - Use a restrained engineering palette: dark charcoal/slate base, cool steel/cyan info accents, amber caution, red alarm only where severity matters.
  - Use a cleaner Windows-native premium stack centered on `Segoe UI Variable`/`Aptos`-style typography plus monospace for telemetry.
  - Default to section layout and dividers, not nested cards. Cards stay only for alarm clusters, procedure items, validation banners, and review artifacts.
  - Add light motion only for workspace switching, alarm expansion, and validation/review state reveals.
- Component/design-system cleanup:
  - Create a small internal UI system for section headers, status chips, metric strips, alarm cluster cards, procedure items, factor summaries, and review tables.
  - Split styling into token/layout/workspace files rather than one monolithic stylesheet.
  - Generate project-specific design-system rules after the overhaul so future Figma-to-code work follows the same conventions.

## Test Plan
- Automated:
  - Keep all current runtime/store tests green.
  - Add app-level render tests for workspace switching, critical-visibility persistence, inline validator states, supervisor override access, completed review visibility, and comparison/export visibility in Review.
  - Add responsive smoke coverage for the operator-first stacked order on narrow viewports.
- Manual:
  - Open each scenario in adaptive mode and confirm first-open comprehension: situation, alarms, next action, support posture.
  - Trigger a soft warning and a hard prevent and confirm both surface inline in Operate and in Review.
  - Run a supervisor-override-eligible case and confirm the review workflow remains intact.
  - Complete one adaptive and one baseline run on the same scenario and confirm Review shows session review, comparison, and export actions.
  - Confirm critical variables and pinned P1/P2 alarms remain continuously visible in Operate across support-mode changes.

## Assumptions
- Confirmed: evaluator/comparison surfaces should be separated into dedicated workspaces rather than kept as a persistent default-side rail.
- No new backend complexity is allowed unless implementation reveals a true frontend blocker; default assumption is frontend-only refactor.
- Explainability must remain visible, but secondary detail can move behind expansion or the Review workspace as long as it stays easy to reach.
- The overhaul should preserve all existing scenario logic, validator behavior, replay/comparison/report generation, and deterministic session behavior.

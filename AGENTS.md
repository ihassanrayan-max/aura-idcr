# Agent entrypoint (AURA-IDCR)

This file routes IDE agents (Cursor, Antigravity, Codex, and similar) to the right sources. It is **not** a second source of truth and does not replace detailed planning elsewhere.

## Project

**AURA-IDCR** — Adaptive User-state Risk-aware Integrated Digital Control Room: a **BWRX-300-inspired adaptive digital control room prototype** for abnormal-event decision support.

This work is **not** a real reactor control system, **not** licensing-grade, and **not** a generic dashboard or chatbot overlay.

## Read first (in order)

1. [`README.md`](./README.md) — setup, scripts, and repo orientation.
2. [`aura_idcr_master_build_brain.md`](./aura_idcr_master_build_brain.md) — **main implementation authority** (scope, phases, status, handoff).

If anything in chat conflicts with the repository, **repo truth wins** over stale assumptions.

## Working rules

- **Plan-first** for non-trivial work: confirm scope from the brain file, then implement only that scope.
- **Minimal diffs**; avoid unrelated refactors and scope drift.
- **Update the brain file** when work is **completed**, **partial**, or **blocked** (status, notes, blockers, next steps) so future sessions do not depend on chat history.

For full norms and detailed tracking, follow [`aura_idcr_master_build_brain.md`](./aura_idcr_master_build_brain.md).

## Figma / Frontend Rules

These rules apply to future Figma-to-code and frontend implementation work in this repo.

### UI Structure

- Keep [`src/App.tsx`](./src/App.tsx) focused on store wiring, workspace selection, and top-level shell state.
- Put presentation logic in extracted UI files under [`src/ui/`](./src/ui/), not back into one monolithic app component.
- Use [`src/ui/viewModel.ts`](./src/ui/viewModel.ts) for presentation-only selectors and formatting decisions before JSX.
- The default runtime surface is `Operate`; evaluator/report/comparison work belongs in `Review`.
- Do not move completed review, comparison, export, or raw event-stream surfaces back into the default operator workspace.

### Component Conventions

- Reuse the internal UI primitives in [`src/ui/primitives.tsx`](./src/ui/primitives.tsx) first:
  - `SectionShell`
  - `StatusPill`
  - `MetricStrip`
  - `EmptyState`
- Keep operator-facing sections short, scan-friendly, and utility-first. Headings should help someone operate, monitor, or decide immediately.
- Preserve the operator-first orientation layer on Operate: the screen should quickly answer what is happening, what matters, and what to do next.
- Keep critical variables and pinned alarms continuously visible in Operate across adaptive mode changes.

### Styling Rules

- Styling is plain CSS, split across:
  - [`src/styles/tokens.css`](./src/styles/tokens.css)
  - [`src/styles/base.css`](./src/styles/base.css)
  - [`src/styles/layout.css`](./src/styles/layout.css)
  - [`src/styles/workspaces.css`](./src/styles/workspaces.css)
- Never hardcode new colors into components when an existing token can express the intent. Add or reuse CSS variables in `tokens.css`.
- Prefer section layout, dividers, strips, and restrained utility cards over dashboard-card mosaics.
- Use the existing engineering palette: charcoal/slate base, cyan info, amber caution, red only for true alarm/stop states.
- Respect the existing typography system centered on `Segoe UI Variable` / `Aptos` plus monospace telemetry.

### Figma Translation Flow

1. Get design context for the exact node.
2. Get a screenshot for the same node/state.
3. Translate the design into the existing `Operate` / `Review` shell conventions instead of inventing a new layout system.
4. Map spacing, color, and surface choices to `tokens.css`.
5. Reuse `src/ui/` primitives and workspace patterns before adding new component types.
6. Validate the result against both the Figma screenshot and the operator-first comprehension goal.

### Asset / Dependency Rules

- Do not add a new icon package or visual dependency for routine UI polish unless the human explicitly asks for it.
- Favor CSS, existing HTML semantics, and the current primitives over decorative library churn.

### Verification

- For UI changes, keep [`src/state/sessionStore.test.tsx`](./src/state/sessionStore.test.tsx) or focused app render tests updated for workspace separation, validator flows, review visibility, and critical visibility persistence.
- Run `npm test` and `npm run build` before closing frontend work.

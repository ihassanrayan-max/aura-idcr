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

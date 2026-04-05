# AURA-IDCR

**Adaptive User-state Risk-aware Integrated Digital Control Room**

AURA-IDCR is a BWRX-300-inspired adaptive digital control room prototype for abnormal-event decision support: plant twin, alarm intelligence, operator-state monitoring, transparent combined risk reasoning, adaptive assistance, bounded high-risk action validation, and evaluation/reporting. It is **not** a generic dashboard or chatbot overlay.

## Prototype honesty

This repository is a **student-feasible, competition-oriented prototype**. It is **not** a real reactor control system, not licensing-grade, and not a medically valid cognitive-monitoring platform. Represent the project accordingly.

## Source of truth

**[aura_idcr_master_build_brain.md](./aura_idcr_master_build_brain.md)** is the single implementation authority: scope, phases, subsystems, and status tracking. If anything else conflicts with that file, the brain file wins unless you explicitly change it.

## How to work in this repo

1. Read `aura_idcr_master_build_brain.md` before significant work.
2. Follow the plan-first rule and stay within the assigned scope (see the brain file).
3. When work completes or stalls, update task status and notes in the brain file.

## Repository status

Phase 1 includes a runnable **Vite + React + TypeScript** operator shell and deterministic scenario runtime aligned with the Phase 0 contracts in `docs/`.

```bash
npm install
npm run dev      # local development
npm run build    # production build
npm test         # verification tests
```

For supplementary pointers, see [docs/README.md](./docs/README.md).

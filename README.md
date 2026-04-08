# AURA-IDCR

**Adaptive User-state Risk-aware Integrated Digital Control Room**

AURA-IDCR is a **BWRX-300-inspired adaptive digital control room prototype** for abnormal-event decision support. It is built as a **competition/demo system**, not as a real reactor control product. The current implementation combines a deterministic plant twin, alarm interpretation, scenario-specific reasoning, human-monitoring proxies, adaptive support posture, bounded action validation, and after-action review/reporting.

## Prototype Honesty

This repository is a **student-feasible, competition-oriented prototype**.

It is **not**:

- a real nuclear plant control system
- a licensing-grade digital twin
- an autonomous reactor controller
- a medically validated cognitive-monitoring platform
- a general chatbot overlay

Any presentation, README text, demo narration, or report should keep that framing.

## What Is Actually Implemented

The current codebase delivers a runnable React + TypeScript prototype with these working subsystems:

- **Deterministic plant twin and scenario runtime**
  - Simulates simplified plant variables such as reactor power, vessel level, vessel pressure, steam flow, feedwater flow, condenser status, containment pressure, offsite/DC power, and isolation-condenser behavior.
  - Runs repeatable abnormal-event scenarios with phased progression and operator-action-sensitive outcomes.

- **Alarm engine and alarm intelligence**
  - Generates alarms from plant state.
  - Groups related alarms into clusters.
  - Surfaces pinned critical alarms and compressed alarm views for operator legibility.

- **Scenario-specific reasoning layer**
  - Maintains ranked event hypotheses for each scenario runtime profile.
  - Publishes dominant hypothesis summaries, leading evidence, and watch items.
  - Uses explicit scoring/smoothing logic, not a trained model.

- **Human-monitoring proxy pipeline**
  - Supports a legacy placeholder source, live interaction telemetry, and an optional webcam/CV source.
  - Converts those sources into bounded workload, attention-stability, and confidence-style proxies.
  - Explicitly treats these outputs as advisory, non-medical signals.

- **Combined risk fusion**
  - Computes a bounded combined-risk snapshot using the `hpsn_lite_v1` risk model.
  - Blends plant urgency, alarm escalation pressure, storyline/procedure pressure, phase/time pressure, workload pressure, attention instability, interaction friction, and monitoring-confidence penalties.
  - Produces a recommended assistance mode plus explanation text.

- **Adaptive support posture**
  - Supports `monitoring_support`, `guided_support`, and `protected_response`.
  - Keeps critical variables and pinned alarms visible while changing emphasis, next-action guidance, and support wording.

- **Action validator / interceptor**
  - Evaluates operator actions as `pass`, `soft_warning`, or `hard_prevent`.
  - Supports confirmation flow and a bounded demo/research supervisor override path.

- **Operator and review workspaces**
  - `Operate` is the default runtime surface for plant state, alarms, storyline, next actions, and support posture.
  - `Review` is the evaluator surface for oversight, replay, completed-run evidence, baseline-vs-adaptive comparison, and export.

- **Evidence, replay, and reporting**
  - Logs canonical runtime events.
  - Builds completed-run reviews, proof points, replayable key events, KPI summaries, and paired comparison artifacts.
  - Exports session and comparison reports as downloadable artifacts.

- **Tutorial/demo support**
  - Includes a guided tutorial overlay and runtime checkpoint pauses for demos and onboarding.

## What The Project Is Good For

In its current form, AURA-IDCR is well suited for:

- demonstrating how an adaptive control-room concept could respond to abnormal simulated events
- comparing a calmer baseline run against an adaptive assistance run on the same scenario
- showing how alarm compression, reasoning transparency, and bounded validation can reduce operator search burden
- generating demo-ready evidence for after-action review and judge-facing comparison
- exploring human-aware decision-support concepts in a simulated nuclear-operations context

It is **not** suited for real operational deployment, plant-grade safety claims, or medical claims about operator cognition.

## Current Scenario Set

The repo currently includes three deterministic scenarios:

1. **Alarm Cascade / Root Cause**
   - Feedwater-degradation runtime profile
   - Focuses on alarm clustering, storyline formation, and diagnosis support

2. **Loss of Offsite Power / SBO**
   - Loss-of-offsite-power / station-blackout-style runtime profile
   - Focuses on alternate heat-sink recovery and constrained response

3. **Main Steam Isolation Upset**
   - Main-steam-isolation runtime profile
   - Focuses on escalating pressure/consequence management and harmful-action prevention

## AI / ML Status

This is the part that matters most for honest presentation:

### What the repo currently has

- **Rule-based adaptive intelligence**
  - The reasoning engine, combined-risk fusion, support-mode policy, procedure narrowing, and action validator are all implemented with explicit logic and heuristics.
  - That makes the system adaptive and computational, but it is **not** the same thing as integrating a learned AI model.

- **Optional pretrained computer-vision component**
  - The webcam path uses local MediaPipe Tasks Vision assets and a BlazeFace short-range model.
  - In other words, the webcam feature is the main place where the current app touches **actual ML/CV inference**.
  - Even there, the code intentionally limits claims to bounded advisory proxies such as face presence, centering, and motion stability.

### What the repo does **not** currently have

- no custom-trained machine-learning model
- no LLM API integration
- no retrieval-augmented assistant
- no generative explanation model
- no learned forecasting model for plant progression
- no autonomous AI decision-maker

### Bottom line

If you present the repo **as it exists today**, the honest claim is:

> AURA-IDCR is primarily a deterministic, rule-based adaptive decision-support prototype with an optional pretrained webcam/CV component, not a full AI-native control-room system.

## Technology Stack

- **Frontend:** React, TypeScript, Vite
- **Testing:** Vitest, Testing Library, JSDOM
- **Vision dependency:** `@mediapipe/tasks-vision`

## Repository Structure

```text
src/
  App.tsx                    Top-level shell, workspace switching, runtime controls
  contracts/                 Shared data contracts
  data/                      Alarm dictionary and plant-model helpers
  runtime/                   Plant twin, reasoning, monitoring, risk, validation, review, reporting
  scenarios/                 Scenario definitions and registry
  state/                     Session store and canonical runtime orchestration
  ui/                        Operate / Review workspaces, tutorial, view models, primitives
  styles/                    Tokens, layout, base, and workspace CSS
```

## Run Locally

```bash
npm install
npm run dev
```

Then open the local Vite URL shown in the terminal.

## Verification

```bash
npm test
npm run build
```

The repo includes runtime, store, reporting, and UI tests for scenario determinism, workspace separation, validator flows, review visibility, and adaptive evidence paths.

## How To Use The Prototype

1. Start in `Operate`.
2. Select a scenario and run mode (`baseline` or `adaptive`).
3. Run guided pace, live pace, or step one tick at a time.
4. Inspect the alarm board, storyline board, next actions, and support posture.
5. Trigger manual controls or validation demo presets as needed.
6. Switch to `Review` for oversight, replay, KPI summaries, proof points, comparison, and export.

## Source Of Truth

The main implementation authority is:

- [aura_idcr_master_build_brain.md](./aura_idcr_master_build_brain.md)

If README wording and the build brain ever diverge, the build brain should be treated as the stronger implementation source.

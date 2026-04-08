# AURA-IDCR — Adaptive User-state Risk-aware Integrated Digital Control Room

> A BWRX-300-inspired adaptive digital control room prototype for abnormal-event decision support.

[![TypeScript](https://img.shields.io/badge/TypeScript-6.0-blue)](https://www.typescriptlang.org/)
[![React](https://img.shields.io/badge/React-19-blue)](https://react.dev/)
[![Vite](https://img.shields.io/badge/Vite-8-purple)](https://vite.dev/)
[![Tests](https://img.shields.io/badge/Tests-147%20passing-brightgreen)](#testing)

---

## Table of Contents

1. [What is AURA-IDCR?](#what-is-aura-idcr)
2. [Core Design Claim](#core-design-claim)
3. [Key Capabilities Summary](#key-capabilities-summary)
4. [Technology Stack](#technology-stack)
5. [Project Structure](#project-structure)
6. [Getting Started](#getting-started)
7. [Architecture Overview](#architecture-overview)
8. [Subsystems in Detail](#subsystems-in-detail)
   - [Plant Digital Twin & Scenario Engine](#1-plant-digital-twin--scenario-engine)
   - [Alarm Intelligence Layer](#2-alarm-intelligence-layer)
   - [Human Monitoring System](#3-human-monitoring-system)
   - [Human Performance Interpretation](#4-human-performance-interpretation)
   - [Combined Risk & Context Reasoning (HPSN-Lite Fusion)](#5-combined-risk--context-reasoning-hpsn-lite-fusion)
   - [Dynamic Procedure & Recovery Engine](#6-dynamic-procedure--recovery-engine)
   - [Adaptive Assistance Orchestrator](#7-adaptive-assistance-orchestrator)
   - [Action Validator / Interceptor](#8-action-validator--interceptor)
   - [Adaptive HMI Layer](#9-adaptive-hmi-layer)
   - [Evaluation, Replay & Reporting](#10-evaluation-replay--reporting)
   - [AI Counterfactual Twin Advisor](#11-ai-counterfactual-twin-advisor)
   - [AI Briefing Layer](#12-ai-briefing-layer)
9. [Implemented Scenarios](#implemented-scenarios)
10. [User Roles](#user-roles)
11. [Workspaces](#workspaces)
    - [Operate Workspace](#operate-workspace)
    - [Review Workspace](#review-workspace)
    - [Human Monitoring Workspace](#human-monitoring-workspace)
12. [Assistance Modes](#assistance-modes)
13. [Action Interception Model](#action-interception-model)
14. [Evaluation & KPI Framework](#evaluation--kpi-framework)
15. [Guided Tutorial & Onboarding](#guided-tutorial--onboarding)
16. [AI / ML Status](#ai--ml-status)
17. [Server-Side API Routes](#server-side-api-routes)
18. [Environment Variables](#environment-variables)
19. [Testing](#testing)
20. [Deployment](#deployment)
21. [Design Principles](#design-principles)
22. [What This Project Is NOT](#what-this-project-is-not)
23. [Documentation Index](#documentation-index)
24. [License](#license)

---

## What is AURA-IDCR?

AURA-IDCR (**Adaptive User-state Risk-aware Integrated Digital Control Room**) is a closed-loop adaptive digital control room system that combines:

- A **believable BWRX-300-inspired plant digital twin** with deterministic scenario progression
- **Alarm intelligence** that converts alarm floods into clustered, prioritized, understandable event storylines
- **Operator-state monitoring** using real interaction telemetry and optional webcam/computer-vision inputs
- **Transparent combined risk reasoning** (HPSN-Lite fusion model) that jointly interprets plant, alarm, procedure, and human context
- **Adaptive interface behavior** with three graded assistance modes that adjust support intensity without removing operator authority
- **Dynamic first-response guidance** that narrows procedure clutter during the critical first minutes of abnormal response
- **Bounded high-risk action validation** using a three-state pass/soft-warning/hard-prevent interception model with supervisor override
- **AI-powered advisory layers** including a counterfactual twin advisor and grounded AI briefing system
- **Comprehensive evaluation and reporting** with baseline vs. adaptive comparison, session replay, KPI aggregation, exportable reports, and judge-facing proof summaries

**This is not** a generic dashboard, a chatbot, or a simulator. It is an **integrated socio-technical control-room support system** designed for competition demonstration and evaluation.

**Project type:** Competition prototype / implementation-ready system  
**Context:** Darlington BWRX-300 New Nuclear Project student innovation competition  
**Framing:** Student-feasible, high-credibility, competition-ready, simulated, human-centered

---

## Core Design Claim

> When plant state, alarm context, procedure context, and operator state are interpreted **together**, the control room can adapt in a transparent and safety-bounded way that improves diagnosis, reduces overload, guides first response, and lowers the probability of harmful operator error.

The system proves this claim by providing measurable evidence that the adaptive, transparent, human-aware control room materially improves operator support compared with a baseline condition.

---

## Key Capabilities Summary

| Capability | Status | Description |
|---|---|---|
| Deterministic plant digital twin | ✅ Done | BWRX-300-inspired simplified plant state with scenario-driven transitions |
| 3 polished abnormal-event scenarios | ✅ Done | Feedwater degradation, Loss of Offsite Power, Main Steam Isolation Upset |
| Alarm clustering & prioritization | ✅ Done | Related alarms grouped, prioritized, with event storyline formation |
| Root-cause / event-class ranking | ✅ Done | Transparent ranked hypothesis with confidence and evidence changes |
| Dynamic first-response procedure lane | ✅ Done | Context-sensitive step guidance that reduces irrelevant procedure clutter |
| Operator-state monitoring (interaction telemetry) | ✅ Done | Non-invasive behavioral heuristics from real UI interactions |
| Operator-state monitoring (webcam/CV) | ✅ Done | Optional local MediaPipe/BlazeFace face detection with bounded advisory signals |
| HPSN-Lite combined risk fusion | ✅ Done | Plant + human factor fusion with 8 risk factor families |
| 3 adaptive assistance modes | ✅ Done | Monitoring Support → Guided Support → Protected Response |
| 3-state action interception | ✅ Done | Pass / Soft Warning / Hard Prevent with explanations |
| Supervisor override workflow | ✅ Done | Bounded one-shot override for eligible hard-prevent actions |
| EID-style ecological overlays | ✅ Done | Mass inventory balance and reactor trip margin visualization |
| Baseline vs. adaptive evaluation | ✅ Done | Side-by-side session comparison with KPI deltas |
| Session replay & review | ✅ Done | Post-terminal completed-run review with milestones, highlights, key events |
| Exportable after-action reports | ✅ Done | JSON export of single-run and paired-comparison artifacts |
| AI Counterfactual Twin Advisor | ✅ Done | "What Happens Next?" branch preview with optional LLM summarization |
| AI Briefing Layer | ✅ Done | Incident Commander, After-Action Reviewer, Why Assistant with LLM/fallback |
| Human-aware proof trail | ✅ Done | Deterministic proof points for judge-facing evidence |
| Guided onboarding tutorial | ✅ Done | Three-path interactive walkthrough with movable sidecar window |
| 3 workspaces (Operate / Review / Human Monitoring) | ✅ Done | Separated operator, evaluator, and monitoring inspection surfaces |
| Full session logging | ✅ Done | Canonical event log with deterministic timestamps |
| 147+ automated tests | ✅ Done | Vitest suite covering runtime, store, UI, and integration |

---

## Technology Stack

| Layer | Technology |
|---|---|
| Language | TypeScript 6.0 (strict mode) |
| UI Framework | React 19 (functional components, hooks) |
| Build Tool | Vite 8 |
| Test Framework | Vitest 4 + Testing Library + jsdom |
| Styling | Vanilla CSS with design tokens (`tokens.css`, `base.css`, `layout.css`, `workspaces.css`) |
| Computer Vision | MediaPipe Tasks Vision (BlazeFace short-range, local assets, lazy-loaded) |
| AI / LLM (optional) | OpenAI Responses API via server-side proxy (deterministic fallback when unavailable) |
| Deployment | Vite static build + Vercel serverless functions |

---

## Project Structure

```
aura-idcr/
├── index.html                        # Vite entry point
├── package.json                      # Dependencies and scripts
├── tsconfig.json                     # TypeScript configuration (strict, ES2020)
├── vite.config.ts                    # Vite + dev-server API proxy + Vitest config
├── .env.example                      # Environment variable template
├── .vercelignore                     # Vercel deploy exclusions
├── AGENTS.md                         # AI agent routing and project rules
├── aura_idcr_master_build_brain.md   # Master build brain (implementation authority)
│
├── src/
│   ├── main.tsx                      # React root mount
│   ├── App.tsx                       # Top-level shell: store wiring, workspace tabs, tutorial
│   ├── styles.css                    # CSS import aggregator
│   │
│   ├── contracts/
│   │   └── aura.ts                   # All TypeScript type contracts for the entire system
│   │
│   ├── scenarios/
│   │   ├── registry.ts               # Scenario catalog, resolution, and UI control schemas
│   │   ├── scn_alarm_cascade_root_cause.ts       # Scenario A: Feedwater Degradation
│   │   ├── scn_loss_of_offsite_power_sbo.ts      # Scenario B: Loss of Offsite Power / SBO
│   │   └── scn_main_steam_isolation_upset.ts     # Scenario C: Main Steam Isolation Upset
│   │
│   ├── runtime/                      # Pure deterministic runtime modules (no React)
│   │   ├── plantTwin.ts              # Plant state progression per scenario profile
│   │   ├── scenarioEngine.ts         # Scenario phase/transition engine
│   │   ├── alarmEngine.ts            # Alarm generation from plant state
│   │   ├── alarmIntelligence.ts      # Alarm clustering, grouping, prioritization
│   │   ├── reasoningEngine.ts        # Hypothesis ranking, storyline, evidence tracking
│   │   ├── procedureLane.ts          # Dynamic first-response procedure lane generation
│   │   ├── humanMonitoring.ts        # Multi-source human monitoring pipeline
│   │   ├── operatorState.ts          # Operator-state interpretation from monitoring
│   │   ├── combinedRisk.ts           # HPSN-Lite plant+human fusion risk model
│   │   ├── supportModePolicy.ts      # Assistance mode arbitration with anti-chatter logic
│   │   ├── supportRefinement.ts      # Support emphasis and presentation cue refinement
│   │   ├── actionValidator.ts        # 3-state action validation (pass/soft/hard)
│   │   ├── presentationPolicy.ts     # Mode-aware UI presentation derivation
│   │   ├── counterfactualAdvisor.ts  # AI counterfactual branch simulation & advisor
│   │   ├── aiBriefing.ts             # AI briefing builders (Incident Commander, etc.)
│   │   ├── kpiSummary.ts             # KPI computation from canonical session logs
│   │   ├── sessionLogger.ts          # Canonical session event logger
│   │   ├── sessionReview.ts          # Completed-run review artifact builder
│   │   ├── sessionComparison.ts      # Baseline vs. adaptive comparison builder
│   │   ├── reportArtifacts.ts        # Exportable report artifact constructors
│   │   ├── reportExport.ts           # Browser-side JSON download helpers
│   │   └── *.test.ts                 # Runtime-level unit tests (15 test files)
│   │
│   ├── state/
│   │   ├── sessionStore.ts           # Central session store (React context + reducer)
│   │   └── sessionStore.test.tsx     # Comprehensive store + integration tests
│   │
│   ├── ui/
│   │   ├── OperateWorkspace.tsx      # Operator-facing Operate workspace
│   │   ├── ReviewWorkspace.tsx       # Evaluator-facing Review workspace
│   │   ├── HumanMonitoringWorkspace.tsx  # Human Monitoring inspection workspace
│   │   ├── TutorialOverlay.tsx       # Guided tutorial sidecar window
│   │   ├── tutorial.ts              # Tutorial step definitions and flow logic
│   │   ├── viewModel.ts            # Presentation-only selectors and formatting
│   │   ├── format.ts               # Formatting utilities (time, numbers, tones)
│   │   ├── primitives.tsx           # Shared UI primitives (SectionShell, StatusPill, etc.)
│   │   ├── useAiBriefing.ts         # AI briefing fetch/cache hook
│   │   ├── useWebcamMonitoring.ts   # Webcam lifecycle and preview hook
│   │   └── *.test.tsx               # UI-level tests
│   │
│   ├── styles/
│   │   ├── tokens.css               # Design tokens (colors, spacing, typography)
│   │   ├── base.css                 # Base element styles and resets
│   │   ├── layout.css               # Shell layout, tutorial overlay, sidecar styles
│   │   └── workspaces.css           # Workspace-specific component styles
│   │
│   ├── data/                        # Static data files (if any)
│   └── test/
│       └── setup.ts                 # Vitest global setup
│
├── server/
│   ├── counterfactualAdvisorApi.ts  # Server-side counterfactual advisor handler
│   ├── aiBriefingApi.ts             # Server-side AI briefing handler
│   └── aiBriefingApi.test.ts        # Server API tests
│
├── api/                             # Vercel serverless function entry points
│   ├── counterfactual-advisor.ts    # /api/counterfactual-advisor route
│   └── ai-briefing.ts              # /api/ai-briefing route
│
├── public/
│   ├── mediapipe/                   # MediaPipe WASM runtime assets (local)
│   └── models/                      # BlazeFace short-range face detection model (local)
│
└── docs/
    ├── README.md                    # Docs index
    ├── aura_variable_schema.md      # Canonical plant variable list
    ├── aura_scenario_schema.md      # Scenario definition contract
    ├── aura_alarm_dictionary.md     # Alarm metadata and seed set
    ├── aura_module_contracts.md     # Module data contracts and log event taxonomy
    ├── aura_hmi_wireframe.md        # HMI region and layout agreement
    └── aura_kpi_definitions.md      # KPI sheet and logging dependencies
```

---

## Getting Started

### Prerequisites

- **Node.js** ≥ 18
- **npm** ≥ 9

### Installation

```bash
git clone https://github.com/ihassanrayan-max/aura-idcr.git
cd aura-idcr
npm install
```

### Development

```bash
npm run dev
```

Opens the app at `http://localhost:5173` with hot module replacement and the dev-server API proxy for AI features.

### Production Build

```bash
npm run build
npm run preview
```

Builds with TypeScript type-checking (`tsc --noEmit`) then Vite production bundle. Preview serves the built output locally.

### Run Tests

```bash
npm test
```

Runs the full Vitest suite (147+ tests) covering runtime logic, store behavior, UI rendering, and integration scenarios.

---

## Architecture Overview

AURA-IDCR follows a **closed-loop adaptive architecture** where every tick of the simulation recalculates the complete system state:

```
┌─────────────────────────────────────────────────────────────────────┐
│                        CORE OPERATING LOOP                         │
│                                                                    │
│  1. Plant state evolves (deterministic per scenario profile)       │
│  2. Alarm state updates (generated from plant thresholds)          │
│  3. Human monitoring updates (interaction telemetry + webcam)      │
│  4. Operator-state interpreted (workload, attention, stability)    │
│  5. Combined risk reasoning updates (HPSN-Lite plant+human fusion) │
│  6. Support mode arbitrated (monitoring → guided → protected)      │
│  7. Procedure and transparency outputs update                      │
│  8. Operator acts through bounded manual controls                  │
│  9. Safety-relevant action validated (pass / soft / hard)          │
│ 10. Plant state continues evolving based on operator action        │
│ 11. Everything is logged canonically                               │
│ 12. Session is replayed and evaluated at terminal outcome          │
└─────────────────────────────────────────────────────────────────────┘
```

### Data Flow

```
ScenarioDefinition → PlantTwin → AlarmEngine → AlarmIntelligence
                                                      ↓
HumanMonitoring ←── Interaction Telemetry ←── Operator UI Actions
       ↓                                              ↑
OperatorState → CombinedRisk (HPSN-Lite) → SupportModePolicy
       ↓                                        ↓
ReasoningEngine → ProcedureLane → SupportRefinement → PresentationPolicy
                                                           ↓
                                          ActionValidator ← Operator Action
                                                ↓
                                     SessionLogger → KPI → Review → Comparison
```

### Key Architecture Principles

- **Deterministic by default**: All plant progression, alarm logic, reasoning, and support-mode transitions are rule-based and fully deterministic. Given the same inputs and operator actions, the system produces identical outputs.
- **Pure runtime modules**: All `src/runtime/` modules are pure functions with no React dependencies, making them independently testable and inspectable.
- **Single session store**: `src/state/sessionStore.ts` is the central state authority. It orchestrates the tick loop, publishes snapshots, and manages canonical logging.
- **Canonical logging**: Every meaningful event is logged with deterministic timestamps via `SessionLogger`, enabling faithful replay and KPI computation.
- **Additive contracts**: `src/contracts/aura.ts` defines all TypeScript types. New features extend existing types additively rather than replacing them.

---

## Subsystems in Detail

### 1. Plant Digital Twin & Scenario Engine

**Files:** `src/runtime/plantTwin.ts`, `src/runtime/scenarioEngine.ts`, `src/scenarios/*.ts`

The plant digital twin provides a simplified but believable BWRX-300-inspired operational environment. It models the following plant-state variables:

| Variable | Description |
|---|---|
| `reactor_power_pct` | Core/reactor power proxy (% rated) |
| `vessel_water_level_m` | Reactor vessel water level (meters) |
| `vessel_pressure_mpa` | Reactor vessel pressure (MPa) |
| `main_steam_flow_pct` | Main steam flow proxy (% rated) |
| `feedwater_flow_pct` | Feedwater flow (% rated) |
| `turbine_generator_output_pct` | Turbine/generator output proxy (% rated) |
| `condenser_heat_sink_pct` | Condenser / normal heat sink status (%) |
| `isolation_condenser_status_pct` | Isolation condenser system status (%) |
| `containment_pressure_kpa` | Containment pressure proxy (kPa) |
| `offsite_power_available` | Grid/offsite power availability (boolean) |
| `dc_power_available` | DC battery/bus availability (boolean) |
| `suppression_pool_temp_c` | Suppression pool temperature (°C) |

Each scenario has a **runtime profile** that defines deterministic phase transitions, plant variable trajectories, success/failure conditions, and operator-action-sensitive recovery paths.

**Capabilities:**
- Deterministic, repeatable scenario playback
- Operator-action-sensitive state progression (correct actions lead to stabilization, wrong actions lead to degradation)
- Multi-phase progression with timed transitions
- Terminal success and failure conditions with outcome messaging
- Scenario-specific manual control schemas

---

### 2. Alarm Intelligence Layer

**Files:** `src/runtime/alarmEngine.ts`, `src/runtime/alarmIntelligence.ts`

Converts raw alarm floods into structured operational understanding:

- **Alarm generation**: Alarms are generated from plant-state thresholds (each alarm has a unique ID, priority, subsystem tag, setpoint, and description from the alarm dictionary)
- **Alarm clustering**: Related alarms are grouped by subsystem, causal chain, and temporal correlation into meaningful clusters
- **Alarm prioritization**: Clusters and individual alarms are ranked by severity and operational relevance
- **Event storyline formation**: Clustered alarms form a coherent narrative of what is happening in the plant
- **Alarm compression metric**: KPI tracks the reduction from raw alarm count to meaningful cluster count, demonstrating reduced cognitive load
- **Next-watch signals**: The system surfaces what the operator should watch for next based on current alarm patterns

---

### 3. Human Monitoring System

**Files:** `src/runtime/humanMonitoring.ts`

A multi-source, canonical human monitoring pipeline that observes practical, non-invasive operator signals:

#### Source 1: Interaction Telemetry (always active)
Captures real operator interactions with the UI and derives behavioral heuristics:
- **Hesitation pressure**: Detects delayed action execution
- **Interaction latency trend**: Tracks response time patterns
- **Reversal / oscillation pressure**: Detects operator indecision through repeated action changes
- **Inactivity during meaningful moments**: Detects operator disengagement when plant state demands attention
- **Burst / confusion pressure**: Detects rapid unfocused interaction clusters
- **Navigation instability**: Detects excessive workspace switching

All interactions are captured from: action requests, confirmations, dismissals, supervisor review requests/decisions, workspace switches, runtime controls, alarm inspections, and manual slider adjustments. Tutorial-only interactions are suppressed so onboarding does not pollute monitoring evidence.

#### Source 2: Webcam / Computer Vision (opt-in, manual enable)
When the operator explicitly enables the webcam:
- **Face presence/absence**: Stable face detection via MediaPipe BlazeFace (local assets, no cloud)
- **Multiple-face ambiguity**: Detects when more than one face is in frame
- **Face centering**: Coarse face position relative to frame center
- **Head-motion stability**: Detects excessive head movement as a weak attention proxy

Webcam evidence is bounded in confidence and cannot dominate the monitoring picture. It remains advisory — no medical or emotion claims are made.

#### Source 3: Legacy Placeholder (fallback)
When real interaction data is sparse or stale, the system degrades gracefully to a compatibility placeholder that produces stable baseline monitoring outputs.

**Pipeline properties:**
- Source-adapter architecture with per-source confidence, freshness, and availability tracking
- Bounded rolling-window metadata
- Explicit freshness/staleness semantics
- Graceful degradation when sources age or become unavailable
- `risk_cues` publication for downstream HPSN-Lite fusion

---

### 4. Human Performance Interpretation

**Files:** `src/runtime/operatorState.ts`

Converts raw human monitoring observations into interpretable performance-state outputs:

- **Workload level estimate** (low / moderate / high / elevated)
- **Attention stability indicator** (stable / mild drift / significant instability)
- **Situation-awareness risk proxy**
- **Interaction anomaly tracking**
- Downstream input for combined risk reasoning

---

### 5. Combined Risk & Context Reasoning (HPSN-Lite Fusion)

**Files:** `src/runtime/combinedRisk.ts`

The HPSN-Lite fusion model jointly reasons over plant, alarm, procedure, and human context to compute a combined operational risk assessment:

#### Risk Factor Families (8 total)

| Factor | Source | Description |
|---|---|---|
| Plant urgency | Plant twin | Severity of plant parameter deviations |
| Alarm escalation pressure | Alarm intelligence | Rate and severity of alarm accumulation |
| Storyline / procedure pressure | Reasoning + procedure | Diagnosis ambiguity and procedure demand |
| Phase / time pressure | Scenario engine | Escalation pressure from scenario phase timing |
| Human workload pressure | Human monitoring | Operator workload from behavioral signals |
| Attention instability | Human monitoring | Attention drift from behavioral + optional webcam |
| Interaction friction | Human monitoring | Hesitation, reversal, burst patterns |
| Human confidence penalty | Human monitoring | Monitoring source confidence gating |

**Key properties:**
- Fixed contribution caps prevent any single factor from dominating
- Human-side confidence gating reduces human factor influence when monitoring data is uncertain
- Damped human-only dropoff behavior when plant/context stay steady
- One-sentence natural-language explanation per risk assessment
- Risk-layer assistance recommendation (monitoring / guided / protected) separate from the active support mode, allowing the operator to see what the system recommends vs. what is active
- Fusion confidence score for transparency

---

### 6. Dynamic Procedure & Recovery Engine

**Files:** `src/runtime/procedureLane.ts`

Supports first-response decision making during the critical first 10 minutes of abnormal response:

- **Current-priority step identification**: Surfaces the most relevant procedure steps for the current plant state
- **Irrelevant clutter reduction**: Hides or de-emphasizes steps not relevant to the current event progression
- **Step importance explanation**: Each step includes a reason why it matters now
- **Dynamic updates**: Recommendations change as the event understanding evolves
- **Prerequisite and completion validation**: Steps indicate prerequisite conditions and completion state
- **Watch-now guidance**: Highlights what to monitor while procedure steps are being executed
- **Urgency/emphasis cues**: Mode-aware emphasis that intensifies in higher assistance modes

---

### 7. Adaptive Assistance Orchestrator

**Files:** `src/runtime/supportModePolicy.ts`, `src/runtime/supportRefinement.ts`

Enforces graded assistance-level behavior with safety-bounded constraints:

**Three assistance modes** (see [Assistance Modes](#assistance-modes) section below) are arbitrated based on combined risk, operator state, reasoning stability, and escalation signals.

**Key properties:**
- Anti-chatter downshift dwell logic prevents chaotic mode oscillations
- Explicit transition explanations for every mode change
- Critical visibility guarantees — adaptive behavior never removes access to critical plant state, core alarms, or essential procedure context
- No silent takeover — the operator always remains the primary actor
- Every significant support shift is explainable and logged

---

### 8. Action Validator / Interceptor

**Files:** `src/runtime/actionValidator.ts`

Reduces high-impact human error without becoming a nuisance:

- **Three-state validation**: Pass / Soft Warning / Hard Prevent (see [Action Interception Model](#action-interception-model))
- **Scenario/action rule-table pattern**: Each scenario defines bounded risky control rules
- **Context-aware classification**: Uses current support mode, combined risk, plant severity, escalation markers, reasoning state, procedure lane relevance, and degraded confidence
- **Explanation for every intervention**: Natural-language reason why the action was flagged
- **Supervisor override support**: Eligible hard-prevent actions can be unlocked by a bounded one-shot supervisor override workflow
- **Absolute-floor hard prevents**: Some actions are never overrideable (e.g., extremely dangerous values)
- **Validator demo presets**: Built-in demo scenarios for demonstrating each validation tier
- **Quiet by default**: Designed to be noticeable only when truly needed

---

### 9. Adaptive HMI Layer

**Files:** `src/App.tsx`, `src/ui/OperateWorkspace.tsx`, `src/ui/ReviewWorkspace.tsx`, `src/ui/HumanMonitoringWorkspace.tsx`, `src/ui/viewModel.ts`, `src/ui/primitives.tsx`

The operator-facing interface is organized into three workspaces (see [Workspaces](#workspaces)):

**Operate workspace regions:**
- **Command bar**: Scenario selection, session mode (baseline/adaptive), runtime controls, webcam toggle
- **Orientation band**: "What's happening / What matters / Do next" at-a-glance summary
- **Situation board**: Plant mimic with real-time telemetry, EID mass-balance and trip-margin overlays
- **Alarm board**: Grouped alarms, alarm clusters, pinned critical alarms, event storyline
- **Next Actions lane**: Dynamic procedure steps with mode-aware urgency cues
- **Support Posture board**: Assistance mode status, risk factors, recommendation, human-monitoring effects
- **Manual controls**: Scenario-specific bounded operator actions with validation feedback
- **AI Advisor panel**: "What Happens Next?" counterfactual branch previews
- **AI Briefing**: Incident Commander / Why Assistant on-demand AI advisory

**Shared UI primitives:** `SectionShell`, `StatusPill`, `MetricStrip`, `EmptyState`

**Styling system:**
- Tokenized CSS design system (`tokens.css`) with engineering palette: charcoal/slate base, cyan info, amber caution, red for true alarm/stop states
- Typography: `Segoe UI Variable` / `Aptos` for UI, monospace for telemetry values
- Tabular numbers for aligned numeric displays
- Accessibility: skip-link, focus-visible states, ARIA live regions, reduced-motion handling

---

### 10. Evaluation, Replay & Reporting

**Files:** `src/runtime/kpiSummary.ts`, `src/runtime/sessionReview.ts`, `src/runtime/sessionComparison.ts`, `src/runtime/reportArtifacts.ts`, `src/runtime/reportExport.ts`

Converts system behavior into measurable evidence:

- **Session mode selection**: Choose between `baseline` (no adaptive assistance) and `adaptive` (full AURA-IDCR) before starting a run
- **KPI aggregation**: Computed from canonical `SessionLogEvent[]` at terminal outcome using `computeKpiSummary`
- **Completed-run review** (`CompletedSessionReview`): Milestones, highlights, stepped key events, KPI summary extracted from a single completed session
- **Baseline vs. adaptive comparison** (`SessionRunComparison`): Paired KPI deltas, outcome comparison, judge-facing summary, proof summary
- **Exportable reports**: JSON download of after-action reports and comparison artifacts via browser-side export helpers
- **Human-aware proof trail**: Deterministic proof points for monitoring posture, operator-state shifts, support posture, validator rationale, and human-aware adaptation moments — extracted directly from canonical events
- **Per-run log isolation**: Each session reset creates a fresh `SessionLogger` with unique `session_{index}_r{run}` identifiers
- **Scenario-keyed evaluation capture**: Mixed-scenario runs are bucketed by scenario ID so different scenarios are never incorrectly compared

---

### 11. AI Counterfactual Twin Advisor

**Files:** `src/runtime/counterfactualAdvisor.ts`, `server/counterfactualAdvisorApi.ts`, `api/counterfactual-advisor.ts`

The "What Happens Next?" advisor that provides operator-visible branch previews:

- **Branch simulation**: Clones current deterministic session state and projects three fixed branches:
  1. **Guided recovery** — What happens if the operator follows the system's recommendation
  2. **Current manual request** — What happens if the operator proceeds with their requested action
  3. **Hold / no-action** — What happens if the operator does nothing
- **Deterministic scoring**: Each branch receives a deterministic safety score based on projected plant state
- **Optional LLM summarization**: When an OpenAI API key is configured, the server-side proxy generates a structured natural-language summary of the branch comparison. Without a key, a deterministic fallback summary is used.
- **Manual trigger only**: The advisor is requested by the operator, not auto-triggered
- **Server-side proxy**: API key never reaches the browser bundle
- **Rate limiting**: Per-IP in-memory throttling with configurable limits
- **Review evidence**: Branch previews and follow-through evidence appear in completed-run review artifacts

---

### 12. AI Briefing Layer

**Files:** `src/runtime/aiBriefing.ts`, `server/aiBriefingApi.ts`, `api/ai-briefing.ts`, `src/ui/useAiBriefing.ts`

Three on-demand, grounded AI advisory briefings:

| Briefing Type | Surface | Description |
|---|---|---|
| **Incident Commander** | Operate | Concise situational assessment and recommended priorities based on current plant/alarm/risk snapshot |
| **After-Action Reviewer** | Review | Post-run analysis of decision quality, missed opportunities, and adaptation effectiveness |
| **Why Assistant** | Operate | Explains why the system is recommending its current support posture or action |

**Key properties:**
- Grounded in canonical snapshot and review data (not hallucinated)
- Deterministic fallback when LLM is unavailable or returns malformed output
- Structured-output parsing via OpenAI Responses API
- Server-side only API key handling
- Metadata logging to canonical session events (`ai_briefing_requested`, `ai_briefing_resolved`, `ai_briefing_failed`)
- AI prose is never written into canonical exports, completed-review truth, KPI formulas, or plant-control state — AI remains advisory and UI-layer bounded

---

## Implemented Scenarios

### Scenario A: Feedwater Degradation (Correlated Alarm Cascade)

**ID:** `scn_alarm_cascade_root_cause`  
**Runtime profile:** `feedwater_degradation`

**Narrative:** A feedwater system malfunction causes gradual flow degradation, triggering a cascade of correlated alarms across multiple subsystems. The operator must correctly diagnose the root cause and apply feedwater correction within the recovery window.

**Demonstrates:**
- Alarm clustering and overload reduction
- Event storyline formation
- Root-cause ranking (feedwater system failure as dominant cause)
- Dynamic procedure narrowing for feedwater recovery
- Action validation on feedwater demand target

**Manual control:** Feedwater Demand Target (35–95% rated)  
**Success condition:** Correct feedwater restoration within tolerance window  
**Failure condition:** Inadequate response leading to sustained degradation

---

### Scenario B: Loss of Offsite Power → Station Blackout

**ID:** `scn_loss_of_offsite_power_sbo`  
**Runtime profile:** `loss_of_offsite_power_sbo`

**Narrative:** Grid power is lost, triggering automatic reactor trip and reliance on passive safety systems. The operator must manage isolation condenser alignment while monitoring DC power availability and suppression pool conditions.

**Demonstrates:**
- Rapid escalation with multiple simultaneous system changes
- Procedure-overload first-response guidance value
- Assistance escalation as plant severity increases
- Isolation condenser alignment as critical operator action
- Action interception on risky IC demand values

**Manual control:** Isolation Condenser Demand Target (0–100% rated)  
**Success condition:** Successful IC alignment and plant stabilization  
**Failure condition:** IC misalignment or delayed response leading to SBO consequences

---

### Scenario C: Main Steam Isolation Upset

**ID:** `scn_main_steam_isolation_upset`  
**Runtime profile:** `main_steam_isolation_upset`

**Narrative:** An unexpected main steam isolation valve closure causes loss of the normal heat sink. The reactor trips, and the operator must establish an alternate cooling path through isolation condenser alignment before pressure escalation.

**Demonstrates:**
- Tempting harmful action scenario (high workload + risky IC values)
- Interceptor preventing or warning on a harmful action
- Measurable benefit of action validation
- Non-electrical scenario (offsite power remains available) requiring different diagnosis reasoning
- IC recovery as the critical recovery action

**Manual control:** Isolation Condenser Demand Target (0–100% rated)  
**Success condition:** IC-based alternate heat sink established within the recovery window  
**Failure condition:** Pressure escalation with inadequate IC alignment

---

## User Roles

| Role | Description |
|---|---|
| **Operator** | Primary runtime user. Responds to plant conditions, alarms, procedures, and AI advisory outputs through bounded manual controls. |
| **Shift Supervisor** | Oversight role. Can authorize bounded supervisor override for eligible hard-prevent actions. Monitors intervention events. |
| **Trainer / Evaluator** | Runs scenarios in baseline and adaptive modes. Compares runs, reviews replay, inspects KPIs, exports reports. |
| **System Administrator** | Maintains scenario definitions, alarm logic, thresholds, and configuration in `src/scenarios/` and `docs/`. |
| **Judges / Sponsors** | View the judge-facing summary, proof trail, and comparison reports to assess measurable impact. |

---

## Workspaces

### Operate Workspace

The default operator-facing surface optimized for **first-open comprehension**. Organized around three questions:
1. **What is happening?** — Plant mimic, alarm state, EID overlays
2. **What matters?** — Prioritized alarms, ranked hypotheses, risk assessment
3. **What to do next?** — Dynamic procedure steps, recommended actions, AI advisory

Contains: Command bar, orientation band, situation board (plant mimic + EID overlays), alarm board, next-actions lane, support posture board, manual controls, AI advisor panel, validation feedback.

### Review Workspace

The evaluator-facing surface for post-run analysis. Contains:
- Completed-run review with milestones, highlights, and stepped key events
- KPI summary with value-availability metadata
- Baseline vs. adaptive comparison panel with KPI deltas and judge-facing summary
- Human-aware proof trail with deterministic proof points
- Session and comparison JSON export controls
- Supervisor override approval (accessible from Review when an eligible hard-prevent is pending)

### Human Monitoring Workspace

An isolated inspection workspace for observing the real-time human monitoring pipeline:
- **Source status**: Per-source availability, freshness, contribution, and staleness
- **Webcam/CV observability**: Live preview (when enabled), face detection status, motion stability
- **Interaction telemetry observability**: Recent interaction events, heuristic pressures
- **Extracted features**: Per-source raw feature windows
- **Fused interpretation input**: Combined monitoring inputs fed to operator-state interpretation
- **Final output state**: Current operator-state assessment
- **Advisory/system impact**: Cross-reference showing what the monitoring state is currently changing in Operate

---

## Assistance Modes

The system uses three graded assistance modes, arbitrated deterministically from combined risk:

### Mode 1 — Monitoring Support
**When:** Plant and human risk are manageable.  
**Behavior:** Mild alarm prioritization, minimal intrusion, summary-style guidance, standard procedure emphasis. The system is present but not pushing.

### Mode 2 — Guided Support
**When:** Diagnosis burden or workload rises above normal thresholds.  
**Behavior:** Stronger alarm grouping/prioritization, tighter procedure guidance, clearer transparency outputs, emphasized watch-now signals, increased support card prominence.

### Mode 3 — Protected Response
**When:** Combined risk is elevated (significant plant + human risk factors).  
**Behavior:** Narrowed first-response guidance to critical steps, strong warnings, tighter action validation thresholds, stronger focus on critical state, validator prominently featured, emergency-level urgency cues.

### Mode Transition Constraints
- No silent takeover — every mode transition is explained
- No disappearance of critical state — all modes maintain critical variable and pinned alarm visibility
- Anti-chatter dwell logic prevents chaotic rapid switching
- Explicit `support_mode_changed` log events for replay/evaluation

---

## Action Interception Model

A three-state intervention model for safety-relevant operator actions:

### Pass
Action is allowed immediately. No unnecessary friction. Used when the action is safe or the risk context does not warrant intervention.

### Soft Warning
Action is allowed **only after explicit operator confirmation**. A warning explanation is shown. Used when risk is meaningful but not extreme. The operator sees:
- What they requested
- Why the system flagged it
- A confirm/dismiss choice

### Hard Prevent
Action is **blocked** unless a supervisor override is provided. Used for clearly high-risk cases. Two sub-categories:
- **Override-eligible**: A supervisor can authorize a one-shot override after reviewing the context
- **Absolute-floor**: Never overrideable (e.g., feedwater demand far outside safe range)

The supervisor override workflow:
1. Operator requests action → Hard prevent → Operator requests supervisor review
2. Supervisor sees the action details, risk context, and explanation
3. Supervisor approves or denies
4. If approved, the action is applied once and logged as a supervised override

---

## Evaluation & KPI Framework

### Session Modes

| Mode | Description |
|---|---|
| **Baseline** | Alarm intelligence, procedure lane, and transparency are visible, but assistance stays locked at `monitoring_support`, the validator uses pass-through for all actions, and no mode escalation occurs |
| **Adaptive** | Full AURA-IDCR with adaptive assistance modes, action validation, human-monitoring integration, and AI advisory features |

### Core Performance KPIs

| KPI | Description |
|---|---|
| Time to correct diagnosis | Duration from scenario start to correct root-cause identification |
| Time to stable recovery | Duration from scenario start to successful plant stabilization |
| Critical-action error rate | Fraction of operator actions that were harmful or incorrect |
| Delayed/missed confirmations | Count of soft-warning confirmations that were slow or not completed |
| Harmful actions prevented | Count of hard-prevent interventions that blocked unsafe actions |

### Alarm Intelligence KPIs

| KPI | Description |
|---|---|
| Alarm compression ratio | Raw alarm count → meaningful cluster count |
| Top-ranked cause stability | How quickly the dominant hypothesis stabilizes |
| Search burden reduction | Reduction in operator diagnostic search effort |

### Interceptor KPIs

| KPI | Description |
|---|---|
| Pass count | Actions allowed without intervention |
| Soft warning count | Actions requiring operator confirmation |
| Hard prevent count | Actions blocked |
| Meaningful-intervention fraction | Fraction of interventions that were correct |
| Nuisance-intervention fraction | Fraction that were unnecessary |

### Competition-Facing KPI Shortlist

For stage presentation: **diagnosis time, stabilization time, critical-action error rate, workload score, intervention effectiveness**.

---

## Guided Tutorial & Onboarding

**Files:** `src/ui/tutorial.ts`, `src/ui/TutorialOverlay.tsx`

Three-path interactive walkthrough:

1. **Operate Tour**: Guided walk through all Operate workspace regions with spotlight highlights
2. **Full Tour**: Complete walkthrough covering Operate + Review handoff
3. **Review Tour**: Focused tour of the Review workspace features

**Features:**
- **Movable sidecar window**: The tutorial panel floats as a draggable assistant window (not a modal blocker)
- **Smart auto-placement**: Avoids overlapping with the spotlighted element
- **Minimize/expand**: Tutorial can be minimized to a dock and restored
- **Drag and reset-position**: Desktop drag support with position memory per step
- **Progress bar**: Visual progress indicator through the tour
- **Locked-step gating**: Certain steps require specific actions before advancing
- **Checkpoint resume labeling**: Clear indication of guided vs. live-pace state
- **v2 dismissal key**: `aura-idcr.tutorial.v2.dismissed` ensures the refreshed walkthrough appears once for existing users

---

## AI / ML Status

The current repository is primarily a **deterministic, rule-based adaptive decision-support prototype**.

### What AI/ML is actually implemented:

| Component | Type | Details |
|---|---|---|
| **Webcam/CV monitoring** | Local ML inference | MediaPipe BlazeFace face detection running entirely locally via browser WASM. No cloud dependency. Provides bounded advisory attention and presence signals. |
| **Counterfactual Twin Advisor** | Deterministic simulation + optional LLM | Branch simulation is deterministic. LLM summarization (OpenAI) is optional and falls back to deterministic output. |
| **AI Briefing Layer** | Optional LLM | Three briefing types using structured-output OpenAI API. Falls back to grounded deterministic text when unavailable. |
| **HPSN-Lite Fusion Model** | Rule-based signal fusion | Transparent weighted factor model, not a trained ML model. Uses bounded arithmetic with fixed contribution caps. |
| **Alarm intelligence** | Rule-based clustering | Deterministic grouping/ranking, not ML-based NLP. |
| **Support mode policy** | Rule-based arbitration | Threshold-driven mode transitions with anti-chatter logic. |

### What is NOT present:

- No custom-trained neural network or ML model
- No generative AI writing canonical system state or making control decisions
- No real-time ML-based plant physics prediction
- No EEG, emotion detection, or medical-grade cognitive monitoring
- No reinforcement learning or online adaptation

**Honesty principle:** The project is always represented as a BWRX-300-inspired student prototype. No overclaiming of plant realism or regulatory validity.

---

## Server-Side API Routes

| Route | Handler | Purpose |
|---|---|---|
| `POST /api/counterfactual-advisor` | `server/counterfactualAdvisorApi.ts` | Counterfactual branch comparison LLM summary |
| `POST /api/ai-briefing` | `server/aiBriefingApi.ts` | AI briefing generation (Incident Commander, After-Action, Why) |

Both routes:
- Use server-side `OPENAI_API_KEY` (never exposed to browser)
- Include per-IP in-memory rate limiting
- Return structured JSON responses
- Fall back gracefully when the API key is missing or the LLM returns malformed output
- Work identically in Vite dev server (middleware) and Vercel serverless (edge functions)

---

## Environment Variables

Copy `.env.example` to `.env` for local development:

```bash
cp .env.example .env
```

| Variable | Required | Description |
|---|---|---|
| `OPENAI_API_KEY` | No | OpenAI API key for AI briefing and counterfactual advisor LLM summaries. Without it, deterministic fallbacks are used. |
| `OPENAI_MODEL` | No | OpenAI model to use (default: `gpt-4.1-mini`) |
| `COUNTERFACTUAL_ADVISOR_RATE_LIMIT_MAX_REQUESTS` | No | Rate limit: max requests per window (default: 8) |
| `COUNTERFACTUAL_ADVISOR_RATE_LIMIT_WINDOW_MS` | No | Rate limit: window duration in ms (default: 60000) |

**All environment variables are server-side only.** No `VITE_*` browser-exposed variables are used.

---

## Testing

```bash
npm test
```

**147+ passing tests** covering:

| Test Area | Files | Coverage |
|---|---|---|
| Plant progression & scenario engine | `actionValidator.test.ts`, `sessionStore.test.tsx` | Deterministic scenario playback, terminal outcomes |
| Alarm intelligence | `sessionStore.test.tsx` | Overload reduction, cluster stability |
| Human monitoring | `humanMonitoring.test.ts` | Source lifecycle, staleness, multi-source contribution |
| Operator state | `operatorState.test.ts` | Workload/attention derivation |
| Combined risk (HPSN-Lite) | `combinedRisk.test.ts` | Factor composition, human confidence gating |
| Support mode policy | `supportModePolicy.test.ts` | Escalation, anti-chatter dwell |
| Support refinement | `supportRefinement.test.ts` | Emphasis cues, mode-aware outputs |
| Action validator | `actionValidator.test.ts` | Pass/soft/hard classification, override eligibility |
| Presentation policy | `presentationPolicy.test.ts` | Mode-aware UI derivation |
| KPI summary | `kpiSummary.test.ts` | KPI computation, unavailable-metric handling |
| Session review | `sessionReview.test.ts` | Review artifact generation, proof points |
| Session comparison | `sessionComparison.test.ts` | Paired comparison, judge summary, proof summary |
| Report artifacts | `reportArtifacts.test.ts` | Export artifact structure |
| Counterfactual advisor | `counterfactualAdvisor.test.ts` | Branch scoring, LLM fallback |
| AI briefing | `aiBriefing.test.ts`, `aiBriefingLayer.test.tsx` | Briefing construction, structured output |
| Server API | `counterfactualAdvisorApi.test.ts`, `aiBriefingApi.test.ts` | Rate limiting, request validation |
| Tutorial | `TutorialOverlay.test.tsx` | Sidecar rendering, step progression |
| Webcam monitoring | `useWebcamMonitoring.test.tsx` | Lifecycle, cleanup, unavailable handling |
| Full integration | `sessionStore.test.tsx` | All 3 scenarios end-to-end, workspace rendering, baseline/adaptive |

---

## Deployment

### Vercel (recommended)

The app is structured for Vercel deployment:
- **Frontend**: Vite static build
- **API routes**: `api/counterfactual-advisor.ts` and `api/ai-briefing.ts` as Vercel serverless functions
- **Environment**: Set `OPENAI_API_KEY` in Vercel project settings for AI features

```bash
# Install Vercel CLI
npm i -g vercel

# Deploy
vercel
```

### Static deployment (no AI features)

Without server-side API routes, the app works as a fully static site with all AI features falling back to deterministic outputs:

```bash
npm run build
# Serve the `dist/` folder with any static file server
```

---

## Design Principles

### Non-Negotiable Principles

| Principle | Description |
|---|---|
| **Advisory, not autonomous** | The system supports, warns, narrows, and validates. It never silently makes safety-relevant plant decisions autonomously. |
| **Human authority preserved** | The operator is always the primary actor. Supervisor override is bounded to specific eligible cases. |
| **Critical info always visible** | Adaptive behavior never removes access to critical plant state, core alarms, or essential procedure context. |
| **Transparency is mandatory** | High-stakes recommendations, mode shifts, and action interceptions are always explainable. |
| **Quiet-by-default intervention** | The action interceptor is noticeable only when truly needed. No nuisance interruptions. |
| **Prototype honesty** | Always represented as a BWRX-300-inspired student prototype. No overclaiming. |

### Implementation Principles

- Plant logic is deterministic and repeatable
- Reasoning is explainable and inspectable
- Safety logic is rule-based first
- Critical behavior is auditable through canonical logging
- Reporting is built into the core loop, not bolted on
- Modular but integrated architecture with pure runtime modules

---

## What This Project Is NOT

- **Not** a real reactor control system
- **Not** a licensing-grade digital twin
- **Not** a plant-autonomous AI system
- **Not** a medically valid cognitive-monitoring platform
- **Not** a generic chatbot overlay
- **Not** a pure visualization gimmick
- **Not** a mandatory 3D/immersive experience

This is and must always remain a **decision-support and evaluation prototype**.

---

## Documentation Index

| Document | Location | Purpose |
|---|---|---|
| Master Build Brain | `aura_idcr_master_build_brain.md` | Implementation authority, phase tracking, task board |
| Agent Rules | `AGENTS.md` | AI agent routing and project conventions |
| Variable Schema | `docs/aura_variable_schema.md` | Canonical plant variable list |
| Scenario Schema | `docs/aura_scenario_schema.md` | Scenario definition contract |
| Alarm Dictionary | `docs/aura_alarm_dictionary.md` | Alarm metadata and seed set |
| Module Contracts | `docs/aura_module_contracts.md` | Data contracts and log event taxonomy |
| HMI Wireframe | `docs/aura_hmi_wireframe.md` | UI region and layout agreement |
| KPI Definitions | `docs/aura_kpi_definitions.md` | KPI sheet and logging dependencies |
| Verification Report | `verification_report.md` | Browser-driven AI test protocol |
| AI Briefing Test Criteria | `COMET_AI_BRIEFING_TEST_CRITERIA.md` | Browser validation criteria for AI surfaces |

---

## License

ISC

---

> **AURA-IDCR** — Built for the Darlington BWRX-300 New Nuclear Project student innovation competition.  
> Adaptive. Transparent. Human-centered. Safety-bounded.

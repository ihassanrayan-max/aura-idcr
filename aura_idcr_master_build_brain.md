# AURA-IDCR Master Build Brain

## 1) Purpose of this file
This file is the single source of truth for building AURA-IDCR.

Every implementation agent working on this project must read this file first at the start of a new session.
Do not rely on scattered chat history as the main authority.
Do not invent scope beyond what is written here.
Do not change project direction unless explicitly requested by the human.

This file exists to do four things:
1. Define exactly what AURA-IDCR is.
2. Freeze the MVP scope and implementation priorities.
3. Track build status across separate agent sessions.
4. Keep planning, implementation, testing, and handoff consistent.

---

## 2) Project identity
**Project name:** AURA-IDCR  
**Full name:** Adaptive User-state Risk-aware Integrated Digital Control Room  
**Project type:** Competition prototype / implementation-ready system  
**Context:** Darlington BWRX-300-inspired adaptive digital control room for abnormal-event decision support  
**Core framing:** Student-feasible, high-credibility, competition-ready, simulated, human-centered control-room prototype  

### Core concept
AURA-IDCR is a closed-loop adaptive digital control room system that combines:
- a believable plant digital twin,
- alarm intelligence,
- operator-state monitoring,
- transparent combined risk reasoning,
- adaptive interface behavior,
- dynamic first-response guidance,
- bounded high-risk action validation,
- and evaluation/reporting.

The system is not a generic dashboard and not a chatbot. It is an integrated socio-technical control-room support system.

### Main design claim
When plant state, alarm context, procedure context, and operator state are interpreted together, the control room can adapt in a transparent and safety-bounded way that improves diagnosis, reduces overload, guides first response, and lowers the probability of harmful operator error.

---

## 3) Source-of-truth rules
These rules are hard constraints unless the human explicitly changes them.

### Use this file as the source of truth
- This file is the primary build authority for implementation sessions.
- The SRD behind this file is the conceptual source.
- If code behavior conflicts with this file, this file wins unless the human says otherwise.
- If an agent finishes or partially finishes a task, this file must be updated.

### Do not drift
- Do not add major features because they seem cool.
- Do not swap the core concept for a simpler unrelated project.
- Do not turn this into a generic analytics app.
- Do not let cosmetic work displace core control-room intelligence.

### Plan-first rule
Before implementing any significant task:
1. Read this file.
2. Identify the exact scope for the task.
3. Confirm dependencies and affected modules.
4. Produce a short implementation plan.
5. Then implement only that scope.

### Do-only-what’s-asked rule
- Stay within the assigned task.
- Do not refactor unrelated areas unless required for correctness.
- Prefer minimal necessary change over broad rewrite.

### Status update rule
If work is completed, blocked, or partial, update:
- task status,
- notes,
- blockers,
- next step.

### Git commits and attribution (all sessions)
- Write commit messages that describe **what changed** in neutral, professional language.
- Do **not** attribute commits to a specific editor, assistant product, or automated tool in the message body, trailers, or footers (for example avoid co-author lines or tags that name those tools).
- This keeps the repository history clean for judges, collaborators, and future agents reading `git log`.

---

## 4) What the system must do
AURA-IDCR must do these things well:

1. Simulate a believable BWRX-300-inspired plant and abnormal-event progression.
2. Turn alarm floods into understandable event storylines rather than raw lists.
3. Provide transparent decision support that explains current belief, projected progression, and evidence changes.
4. Adapt operator support intensity without removing operator authority.
5. Intercept high-risk actions in a bounded and explainable way.
6. Produce measurable evidence that the adaptive system outperforms a baseline.

---

## 5) What the system is not
AURA-IDCR is **not**:
- a real reactor control system,
- a licensing-grade digital twin,
- a plant-autonomous AI system,
- a medically valid cognitive-monitoring platform,
- a generic chatbot overlay,
- a pure visualization gimmick,
- or a mandatory 3D/immersive experience.

This must always remain a **decision-support and evaluation prototype**.

---

## 6) Non-negotiable principles

### Advisory, not autonomous
The system supports, warns, narrows, and validates.
It does not silently make safety-relevant plant decisions autonomously.

### Human authority preserved
The operator remains the primary actor.
Supervisor override is allowed only in bounded high-risk prevent cases or demo/evaluation contexts.

### Critical information must remain visible
Adaptive behavior must never remove access to critical plant state, core alarms, or essential procedure context.

### Transparency is mandatory
High-stakes recommendations, mode shifts, and action interceptions must always be explainable.

### Quiet-by-default intervention
The action interceptor should not become a nuisance.
It should be noticeable only when truly needed.

### Prototype honesty
The project must always be represented honestly as a BWRX-300-inspired student prototype.
No overclaiming plant realism or regulatory validity.

---

## 7) Core user roles
### Operator
Primary runtime user. Responds to plant conditions, alarms, procedures, and decision-support outputs.

### Shift Supervisor
Oversight user. Monitors support level and intervention events. May authorize override where designed.

### Trainer / Evaluator
Runs scenarios, compares baseline vs adaptive runs, reviews replay and KPIs.

### System Administrator / Configuration Owner
Maintains scenario definitions, alarm logic, rules, thresholds, mappings, and experiment settings.

### Judges / Sponsors
Need clarity, coherence, credibility, and measurable impact.

---

## 8) MVP scope freeze
This is the frozen MVP unless the human explicitly expands it.

### MVP includes
- single-unit BWRX-300-inspired plant digital twin,
- three polished scenarios,
- alarm clustering,
- event storyline generation,
- ranked root-cause / event-class support,
- transparency outputs,
- dynamic first-response guidance,
- graded assistance logic,
- three-state action interception,
- HMI with mimic + EID-informed support layer,
- baseline vs adaptive comparison,
- full session logging,
- replay / after-action reporting.

### MVP does not require
- photorealistic 3D visualization,
- real plant data integration,
- full crew coordination,
- production-grade control logic,
- proprietary BWRX details,
- licensing-grade reactor physics,
- complex multi-operator coordination,
- advanced wearables,
- environment hardware.

---

## 9) Must / Should / Could / Won’t

### Must Have
- bounded plant digital twin,
- repeatable scenario engine,
- alarm clustering and prioritization,
- event storyline / root-cause support,
- dynamic first-response procedure lane,
- combined transparent risk reasoning,
- adaptive assistance modes,
- action validator/interceptor,
- full session logging,
- replay / report generation,
- baseline vs assisted evaluation mode.

### Should Have
- stronger EID-style ecological cues,
- projected outcome / near-future support,
- supervisor/evaluator dashboard,
- richer alarm context embedding,
- degraded sensing mode,
- optional operator-state confidence handling.

### Could Have
- optional LLM-generated summaries/explanations,
- optional environmental adaptation props,
- optional richer probabilistic forecasting,
- optional 3D plant representation,
- optional multi-operator mode.

### Won’t Have for now
- real plant integration,
- autonomous control,
- licensing-grade procedure automation,
- industrial protocol dependency,
- full thermal-hydraulic fidelity,
- mandatory 3D control room,
- mandatory EEG or medical sensing.

---

## 10) Core operating loop
This loop is the identity of the system.

1. Plant state evolves.
2. Alarm state updates.
3. Human-state observations update.
4. Combined reasoning updates belief and support state.
5. Procedure and transparency outputs update.
6. Operator acts.
7. Safety-relevant action is validated if necessary.
8. Plant state continues evolving.
9. Everything is logged.
10. Session is replayed and evaluated.

Every major implementation decision should strengthen this loop, not weaken it.

---

## 11) Subsystems

### 11.1 Plant Digital Twin and Scenario Engine
**Purpose:** Provide a believable, repeatable, BWRX-300-inspired operational environment for operator support and evaluation.

**Must do:**
- represent simplified plant state,
- generate scenario-driven transitions,
- expose variables and subsystem states,
- support repeatable scenario playback,
- support operator-action-sensitive progression,
- support success/failure conditions,
- support limited near-future projection if feasible.

**Plant-state domains to model at minimum:**
- core/reactor power proxy,
- vessel water level,
- vessel pressure,
- main steam proxy,
- feedwater flow,
- turbine/generator output proxy,
- condenser/heat sink status,
- isolation condenser-related status,
- containment proxy state,
- offsite/DC power availability,
- alarm state.

### 11.2 Alarm Intelligence Layer
**Purpose:** Convert alarm flood into structured operational understanding.

**Must do:**
- generate alarms from plant state and events,
- identify correlated alarms,
- cluster related alarms,
- form an event storyline,
- rank root causes/event classes,
- surface next-watch signals,
- show context-rich high-priority alarms.

### 11.3 Human Monitoring System
**Purpose:** Observe practical, prototype-feasible operator signals.

**Must do:**
- capture non-invasive indicators,
- support continuous scenario-time updates,
- estimate workload/attention/interaction strain proxies,
- produce confidence-aware outputs,
- degrade gracefully if sensing becomes unreliable.

### 11.4 Human Performance Interpretation Layer
**Purpose:** Convert raw operator observations into interpretable performance-state outputs.

**Must do:**
- estimate workload level,
- estimate attention stability,
- indicate situation-awareness risk,
- track interaction anomalies,
- supply downstream reasoning inputs.

### 11.5 Combined Risk and Context Reasoning Layer
**Purpose:** Reason over plant, alarm, procedure, and human context jointly.

**Must do:**
- compute combined operational risk,
- maintain ranked event interpretation,
- explain current interpretation,
- explain projected next state if conditions continue,
- explain evidence changes,
- communicate uncertainty.

**Recommended factor families:**
- plant severity,
- alarm load/complexity,
- diagnosis ambiguity,
- procedure demand,
- operator workload proxy,
- attention instability,
- response latency,
- action hazard,
- sensor confidence.

### 11.6 Dynamic Procedure and Recovery Engine
**Purpose:** Support first-response decision making, especially the first 10 minutes of abnormal response.

**Must do:**
- identify the current relevant procedure branch,
- reduce irrelevant procedural clutter,
- surface current-priority steps,
- explain why steps matter,
- update recommendations as event understanding changes,
- support prerequisite and completion validation.

### 11.7 Control Room Controller / Adaptive Orchestrator
**Purpose:** Enforce assistance-level behavior and critical visibility rules.

**Must do:**
- arbitrate assistance-level changes,
- enforce critical visibility,
- coordinate procedure/transparency/alarm presentation changes,
- support bounded, understandable adaptation.

### 11.8 Action Interceptor / Validator
**Purpose:** Reduce high-impact human error without becoming annoying.

**Must do:**
- evaluate safety-relevant actions,
- classify intervention severity,
- return pass / soft warning / hard prevent,
- explain why intervention happened,
- allow override only in explicitly defined modes/roles.

### 11.9 Adaptive HMI Layer
**Purpose:** Present plant, alarm, procedure, transparency, and support state coherently.

**Must do:**
- provide mimic display,
- provide EID-informed support layer,
- show alarms in multiple semantic views,
- show transparency outputs,
- show procedure guidance,
- indicate support level clearly but non-punitively.

### 11.10 Evaluation, Replay, and Reporting Layer
**Purpose:** Convert system behavior into evidence.

**Must do:**
- log all meaningful events,
- reconstruct scenario runs,
- compare baseline vs adaptive conditions,
- generate concise KPI summaries.

---

## 12) Assistance modes
The exact labels can vary slightly, but the logic must remain graded rather than binary.

### Mode 1 — Monitoring Support
Use when plant and human risk are manageable.
Behavior:
- mild prioritization,
- minimal intrusion,
- summaries rather than aggressive narrowing.

### Mode 2 — Guided Support
Use when diagnosis burden or workload rises.
Behavior:
- stronger alarm grouping,
- stronger prioritization,
- tighter procedure guidance,
- clearer transparency outputs.

### Mode 3 — High Assistance / Protected Response
Use when risk is elevated.
Behavior:
- narrow first-response guidance,
- strong warnings,
- tighter action validation,
- stronger focus on critical state.

### Assistance mode constraints
- no silent takeover,
- no disappearance of critical state,
- avoid chaotic mode switching,
- every significant support shift must be explainable.

---

## 13) Action interception model
The system must support a three-state intervention model.

### Pass
Action is allowed.
No unnecessary friction.

### Soft Warning
Action is allowed only after explicit confirmation.
Used when risk is meaningful but not extreme.

### Hard Prevent / Supervisory Override Required
Action is blocked unless explicit higher-authority override is provided where supported.
Used only for clearly high-risk cases.

### Action-interceptor design rules
- quiet by default,
- bounded usage,
- explanation required,
- nuisance intervention should remain low,
- do not let this become a constant blocker.

---

## 14) Required UI regions
The final HMI must support these regions in some coherent layout.

### A. Plant mimic area
Primary operational representation.

### B. EID / physics-and-constraints area
Higher-level process relationships, balances, limits, margins, flow logic, or constraint cues.

### C. Alarm intelligence area
Alarm clusters, prioritized alarms, event storyline.

### D. Root-cause and transparency area
Current belief, projected progression, evidence changes, uncertainties.

### E. Procedure / first-response area
Dynamic steps, validation context, next actions.

### F. Support-state / operator-state area
Support level + compact non-stigmatizing human-state summary.

### G. Supervisor / evaluator panel
Mode transitions, intervention events, performance markers, replay controls.

---

## 15) MVP scenarios
Three polished scenarios are required.
The names can be adjusted, but the functions must remain.

### Scenario 1 — Correlated alarm cascade with dominant root cause
Goal:
- show alarm clustering,
- show event storyline formation,
- show root-cause ranking.

### Scenario 2 — Procedure-overload first-response situation
Goal:
- show value of dynamic first-response narrowing,
- show reduced search burden vs static guidance,
- show transparency and support adaptation.

### Scenario 3 — High-workload case with tempting harmful action
Goal:
- show assistance escalation,
- show interceptor preventing or warning on a harmful action,
- show measurable benefit over baseline.

### Scenario design rules
Each scenario must include:
- a clear initiating event,
- evolving indicators,
- multiple related alarms,
- meaningful diagnosis or overload burden,
- a real decision window,
- measurable success/failure outcomes.

---

## 16) Evaluation model
The project must prove impact, not just features.

### Required comparison
At minimum:
- **Condition A: Baseline**
- **Condition B: Full AURA-IDCR**

A partial middle condition is optional, but the main story must stay simple and judge-friendly.

### Evaluation objective
Show that the adaptive, transparent, human-aware control room materially improves support compared with baseline.

### Measurement categories
- task performance,
- workload,
- situation awareness,
- decision quality,
- intervention quality,
- usability/acceptance.

### Narrative rule
Results must tell a coherent control-room improvement story, not just isolated model metrics.

---

## 17) Core KPIs
The system must support these KPI families.

### Core performance KPIs
- time to correct diagnosis,
- time to stable recovery/response completion,
- critical-action error rate,
- delayed or missed confirmations,
- number of harmful actions prevented.

### Alarm-intelligence KPIs
- alarm compression into meaningful clusters,
- stability of top-ranked cause,
- quality of next-watch outputs,
- reduced operator search burden.

### Human-performance KPIs
- perceived workload,
- workload spikes,
- attention instability,
- situation-awareness retention.

### Transparency KPIs
- recommendation comprehensibility,
- operator ability to explain why the system recommended something,
- trust without over-reliance.

### Interceptor KPIs
- number of passes,
- number of soft warnings,
- number of hard prevents,
- meaningful-intervention fraction,
- nuisance-intervention fraction.

### Competition-facing KPI shortlist
Prefer showing only a compact set on stage:
- diagnosis time,
- stabilization time,
- critical-action error rate,
- workload score,
- intervention effectiveness.

---

## 18) Architecture and implementation principles
These are implementation principles, not hardcoded tool mandates.

### Required implementation qualities
- rapid iteration,
- stable real-time demonstration behavior,
- clear data flow,
- strong logging,
- replay support,
- configurable scenarios and thresholds.

### Strong implementation guidance
- keep plant logic deterministic,
- keep reasoning explainable,
- keep safety logic rule-based first,
- keep critical behavior inspectable,
- build reporting early,
- prefer modular but integrated architecture.

### Tooling freedom rule
Engineering choices may vary, but the following must be preserved:
- architecture,
- support logic,
- transparency model,
- intervention model,
- BWRX-300-inspired framing,
- evaluation model.

---

## 19) Recommended build order
This section is the execution backbone.

### Phase 0 — Scope Freeze and Contracts
**Build now:**
- final variable list,
- scenario schema,
- alarm dictionary,
- module/data contracts,
- UI wireframes,
- KPI definitions.

**Exit criteria:**
- shared variable schema exists,
- shared scenario schema exists,
- reporting schema exists,
- no major ambiguity about MVP contents.

### Phase 1 — First End-to-End Slice
**Build now:**
- plant twin skeleton,
- baseline HMI shell,
- alarm list,
- basic control inputs,
- session logging,
- single scenario runnable end to end.

**Exit criteria:**
- one scenario runs deterministically,
- UI and state stay in sync,
- logs are trustworthy.

### Phase 2 — Alarm Intelligence + Procedure Support
**Build now:**
- alarm clustering,
- event storyline engine,
- ranked root-cause support,
- first-response procedure lane,
- scenario success/failure logic.

**Exit criteria:**
- grouped alarms reduce overload,
- storyline is stable enough to demo,
- procedure lane updates correctly.

### Phase 3 — Human Monitoring + Combined Risk Reasoning
**Build now:**
- practical operator-state feature extraction,
- workload/attention proxy outputs,
- confidence handling,
- combined risk logic,
- explanation outputs.

**Exit criteria:**
- signals are numerically stable enough,
- degraded mode exists,
- reasoning outputs are understandable.

### Phase 4 — Adaptive Assistance + Action Interceptor
**Build now:**
- assistance modes,
- adaptation policy,
- pass/soft/hard action validation,
- explanation layer for shifts and interceptions,
- critical-visibility guarantees.

**Exit criteria:**
- no critical state disappears,
- validator is predictable,
- assistance shifts are explainable and non-chaotic.

### Phase 5 — Evaluation Harness
**Build now:**
- baseline vs adaptive run selection,
- replay,
- KPI aggregation,
- comparison reporting,
- judge-friendly summary view.

**Exit criteria:**
- matched runs are reproducible,
- metrics export cleanly,
- one comparison output is presentation-ready.

### Phase 6 — Demo Polish / Stretch Only After Stability
**Build only if time remains:**
- richer EID cues,
- supervisor dashboard polish,
- optional projected outcomes,
- optional LLM explanation layer,
- optional hardware/environment extras,
- optional visual embellishments.

**Rule:**
No stretch work before MVP reliability is proven.

---

## 20) Agent workflow rules for implementation chats
Every future implementation chat should follow this pattern.

### Step 1 — Read this file first
The agent must internalize current project status before doing anything.

### Step 2 — Identify exact task scope
The agent should state:
- what task is being worked on,
- which phase it belongs to,
- dependencies,
- affected modules,
- what is out of scope for this task.

### Step 3 — Plan before coding
The agent should first produce a focused implementation plan.
No giant unfocused refactors.

### Step 4 — Implement only that task
Respect boundaries.
Do not opportunistically rebuild unrelated systems.

### Step 5 — Validate
The agent should verify behavior for the task, not just write code.

### Step 6 — Update this file
Mark task status and notes.
This file must stay current.

---

## 21) Task board
Use these statuses exactly:
- Not Started
- In Progress
- Blocked
- Partial
- Done

### Phase 0 — Scope Freeze and Contracts
- [x] Final variable schema — **Done**
- [x] Scenario schema — **Done**
- [x] Alarm dictionary — **Done**
- [x] Module/data contracts — **Done**
- [x] UI wireframes / layout agreement — **Done**
- [x] KPI definitions — **Done**

### Phase 1 — First End-to-End Slice
- [ ] Plant twin skeleton — **Not Started**
- [ ] Baseline HMI shell — **Not Started**
- [ ] Basic alarm list — **Not Started**
- [ ] Control input path — **Not Started**
- [ ] Session logging backbone — **Not Started**
- [ ] One deterministic scenario end to end — **Not Started**

### Phase 2 — Alarm Intelligence + Procedure Support
- [ ] Alarm clustering — **Not Started**
- [ ] Event storyline engine — **Not Started**
- [ ] Ranked root-cause support — **Not Started**
- [ ] Dynamic first-response lane — **Not Started**
- [ ] Scenario success/failure logic — **Not Started**

### Phase 3 — Human Monitoring + Reasoning
- [ ] Operator-state feature extraction — **Not Started**
- [ ] Workload/attention proxy outputs — **Not Started**
- [ ] Sensor confidence / degraded mode — **Not Started**
- [ ] Combined risk reasoning — **Not Started**
- [ ] Explanation outputs — **Not Started**

### Phase 4 — Adaptive Assistance + Interceptor
- [ ] Assistance mode logic — **Not Started**
- [ ] Adaptive UI behavior — **Not Started**
- [ ] Action validator / interceptor — **Not Started**
- [ ] Critical-visibility guarantees — **Not Started**
- [ ] Override logic — **Not Started**

### Phase 5 — Evaluation Harness
- [ ] Baseline vs adaptive run selector — **Not Started**
- [ ] Replay view — **Not Started**
- [ ] KPI aggregation — **Not Started**
- [ ] Comparison reporting — **Not Started**
- [ ] Judge-friendly results summary — **Not Started**

### Phase 6 — Stretch / Polish
- [ ] Richer ecological overlays — **Not Started**
- [ ] Supervisor dashboard polish — **Not Started**
- [ ] Projected outcome support — **Not Started**
- [ ] Optional LLM explanation layer — **Not Started**
- [ ] Optional hardware/environment extras — **Not Started**
- [ ] Optional visual polish extras — **Not Started**

---

## 22) Current recommended next step
Phase 0 is now frozen through the contract package in `docs/`.

The immediate next deliverables should move to **Phase 1 — First End-to-End Slice**:
1. build the plant twin skeleton against the canonical variable schema,
2. build the baseline HMI shell against the HMI layout agreement,
3. build the basic alarm list from the alarm dictionary,
4. build the control input path against the scenario action contract,
5. build the session logging backbone against the shared event taxonomy,
6. run one deterministic scenario end to end using the shared scenario schema.

Do not skip these interfaces or invent alternate schemas during Phase 1.

---

## 23) Definition of done for the MVP
The MVP is done only when all of the following are true:
- one polished end-to-end scenario works reliably,
- at least one additional scenario is credible enough for comparison,
- alarm intelligence is visible and meaningful,
- procedure support clearly narrows response burden,
- adaptive assistance visibly changes support behavior,
- the interceptor can demonstrate one meaningful pass/soft/hard style case,
- baseline vs adaptive comparison exists,
- replay/reporting exists,
- the demo can tell a clear before/after story in minutes.

---

## 24) Demo truth
For judging, the product must visibly feel like:
- more than a dashboard,
- more than a simulator,
- more than a chatbot,
- an actual adaptive control-room support system.

That means the demo must clearly show:
- abnormal event onset,
- alarm flood turned into structure,
- system belief formation,
- procedure narrowing,
- assistance adaptation,
- high-risk action interception,
- measured improvement.

---

## 25) Update log
Use this section to track meaningful progress across sessions.

### Entry format
- Date:
- Agent/session:
- Task worked on:
- Status:
- What changed:
- What remains:
- Blockers:
- Next recommended step:

### Entries
- Date: 2026-04-04
- Agent/session: GPT-5.4 Phase 0 contracts session
- Task worked on: Phase 0 scope freeze and implementation-ready contract package
- Status: Done
- What changed:
  - Added `docs/aura_variable_schema.md`
  - Added `docs/aura_scenario_schema.md`
  - Added `docs/aura_alarm_dictionary.md`
  - Added `docs/aura_module_contracts.md`
  - Added `docs/aura_hmi_wireframe.md`
  - Added `docs/aura_kpi_definitions.md`
  - Updated `docs/README.md` to index the Phase 0 package
  - Marked all Phase 0 task-board items done
- What remains:
  - Phase 1 runtime implementation against the frozen Phase 0 docs
- Blockers:
  - None in repo; future sessions should keep the docs authoritative unless the human explicitly changes scope
- Next recommended step:
  - Begin Phase 1 with one deterministic end-to-end slice built directly from the Phase 0 contracts

---

## 26) Final reminder to all future agents
Do not treat this as a casual brainstorming project.
This is an implementation-driven build.
Preserve the architecture, preserve the adaptive control-room identity, preserve the MVP discipline, and update this file as work progresses.

Build the system in clean, verified slices.
No scope chaos.
No random reinvention.
No replacing the core idea with something easier.


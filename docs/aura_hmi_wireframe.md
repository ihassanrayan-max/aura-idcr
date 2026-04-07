# AURA-IDCR MVP HMI Wireframe And Layout Agreement

This document defines the required MVP operator HMI shell for AURA-IDCR.
It is a layout and region-responsibility contract, not a final visual design.

## Identity Guardrails

- The shell must read as a credible digital control-room HMI, not a generic analytics dashboard.
- The primary screen is for real-time plant supervision and abnormal-event response.
- Critical plant variables and critical alarms must remain visible during adaptive support changes.
- No chat-first layout, floating KPI card grid, or dashboard-style homepage should replace the operator shell.

## Required Regions

### 1. Workspace Shell

Required contents:

- default `Operate` workspace for live abnormal-event response
- secondary `Review` workspace for oversight, completed-run evidence, comparison, and export
- a clear workspace switch that does not hide the operator shell identity

Layout rule:

- `Operate` is the default first-open view.
- `Review` is secondary and may hold evaluator-heavy content that should not compete with first-response work.

### 2. Top Status Bar

Required contents:

- session mode: `baseline` or `adaptive`
- scenario title and phase label
- simulation clock / elapsed time
- current support mode
- session health badges: logging active, validation status available
- next-run scenario / mode controls

Layout rule:

- Full-width fixed band across the top of the shell.
- It should support quick orientation without overwhelming the first scan.

### 3. Operator Orientation Band

Required contents:

- one compact "what is happening" summary
- one compact "what matters" summary
- one compact "do next" summary

Layout rule:

- Must appear near the top of `Operate`.
- This band exists to help a first-time viewer understand the screen before reading deeper sections.

### 4. Plant Mimic Area

Required contents:

- simplified process path for reactor vessel, steam path, feedwater path, turbine-generator path, condenser / heat sink path
- continuously visible critical values from the canonical variable list
- key state indicators such as reactor trip, offsite power, and isolation condenser availability

Layout rule:

- This is the dominant region and must occupy the largest continuous area on the screen.

### 5. Alarm Area

Required contents:

- prioritized active alarm list
- alarm count and cluster count
- pinned critical alarms first
- grouped clusters second
- raw alarm details behind expansion rather than always fully expanded

Layout rule:

- Persistent vertical region adjacent to the plant mimic, not hidden behind tabs by default.

### 6. Storyline / Root-Cause Area

Required contents:

- dominant event interpretation
- evidence changes and uncertainty wording
- compressed secondary hypotheses
- next-watch signal suggestions

Layout rule:

- Separate region below or beside the plant mimic.
- The dominant explanation should lead; secondary detail can stay compressed until needed.

### 7. Procedure / First-Response Area

Required contents:

- dynamic first-response steps
- room for validation messages tied to actions
- room for prerequisite/completion checks
- a smaller manual-intervention utility area below the primary lane

Layout rule:

- Separate region adjacent to the storyline area, sized for short action-oriented steps rather than long documents.
- This is the primary action surface in `Operate`.

### 8. Support-State Area

Required contents:

- current assistance mode label
- short non-stigmatizing operator-support summary
- human-state confidence or degraded-sensing status
- compact combined-risk score / band with a short explanation and confidence caveat
- top contributing factors
- current mode effect on presentation

Layout rule:

- Compact persistent strip or panel. It must never overpower the plant mimic or alarm area.

### 9. Review Workspace

Required contents:

- live oversight: validator markers, pending supervisor review, recent events
- completed run: after-action review and KPI summary
- comparison and export: paired-mode comparison plus report download actions

Layout rule:

- Separate workspace, not a persistent default-side rail.
- It must not displace operator-critical content from the default operator view.

## Baseline Layout Agreement

```text
Operate
+--------------------------------------------------------------------------------------------------+
| Top Status Bar / Workspace Switch                                                                 |
+--------------------------------------------------------------------------------------------------+
| Operator Orientation Band                                                                        |
+--------------------------------------------------------------------------------------------------+
| Plant Mimic Area                                                                                |
+------------------------------------------------------+---------------------------+
| Procedure / First-Response Area                      | Alarm Area                |
+------------------------------------------------------+---------------------------+
| Storyline / Root-Cause Area                          | Support-State Area        |
+--------------------------------------------------------------------------------------------------+

Review
+--------------------------------------------------------------------------------------------------+
| Live Oversight                                                                                    |
+--------------------------------------------------------------------------------------------------+
| Completed Run                                                                                    |
+--------------------------------------------------------------------------------------------------+
| Comparison & Export                                                                              |
+--------------------------------------------------------------------------------------------------+
```

## Region Behavior Rules

- The plant mimic area, top status bar, and alarm area are mandatory at all times.
- Adaptive behavior may reprioritize, highlight, or narrow content, but it may not remove access to critical plant state or `P1` / `P2` alarm visibility.
- The storyline and procedure regions must remain distinct and action-oriented.
- The support-state area must stay compact and descriptive, never punitive or medicalized.
- Human-state confidence or degraded-sensing cues should be visible there when the bounded proxy pipeline is active.
- Evaluator/reporting content should live in `Review`, not on the default operator surface.

## Critical Visibility Baseline

The following must remain continuously visible somewhere in the operator shell:

- `reactor_power_pct`
- `vessel_water_level_m`
- `vessel_pressure_mpa`
- `feedwater_flow_pct`
- `main_steam_flow_pct`
- `turbine_output_mwe`
- `condenser_heat_sink_available`
- `containment_pressure_kpa`
- `offsite_power_available`
- all active alarms whose `visibility_rule = always_visible`

## Phase 1 Usage Rules

- Phase 1 should implement this layout as a stable shell even if transparency, procedure, and support areas contain placeholder content.
- Avoid introducing alternate operator layouts before this shell exists.
- Any future visual polish should preserve these region responsibilities and the control-room identity they enforce.

# AURA-IDCR MVP HMI Wireframe And Layout Agreement

This document defines the required MVP operator HMI shell for AURA-IDCR.
It is a layout and region-responsibility contract, not a final visual design.

## Identity Guardrails

- The shell must read as a credible digital control-room HMI, not a generic analytics dashboard.
- The primary screen is for real-time plant supervision and abnormal-event response.
- Critical plant variables and critical alarms must remain visible during adaptive support changes.
- No chat-first layout, floating KPI card grid, or dashboard-style homepage should replace the operator shell.

## Required Regions

### 1. Top Status Bar

Required contents:

- session mode: `baseline` or `adaptive`
- scenario title and phase label
- simulation clock / elapsed time
- current support mode
- session health badges: logging active, validation status available

Layout rule:

- Full-width fixed band across the top of the shell.

### 2. Plant Mimic Area

Required contents:

- simplified process path for reactor vessel, steam path, feedwater path, turbine-generator path, condenser / heat sink path
- continuously visible critical values from the canonical variable list
- key state indicators such as reactor trip, offsite power, and isolation condenser availability

Layout rule:

- This is the dominant region and must occupy the largest continuous area on the screen.

### 3. Alarm Area

Required contents:

- prioritized active alarm list
- alarm count and cluster count
- room for later cluster/storyline views without changing the region identity

Layout rule:

- Persistent vertical region adjacent to the plant mimic, not hidden behind tabs by default.

### 4. Transparency / Root-Cause Area Placeholder

Required contents:

- placeholder for ranked event interpretation
- placeholder for evidence changes and uncertainty wording
- placeholder for next-watch signal suggestions

Layout rule:

- Separate region below or beside the plant mimic, visible in the baseline shell even if initially populated with static placeholders.

### 5. Procedure / First-Response Area Placeholder

Required contents:

- placeholder for dynamic first-response steps
- room for validation messages tied to actions
- room for prerequisite/completion checks later

Layout rule:

- Separate region adjacent to the transparency area, sized for short action-oriented steps rather than long documents.

### 6. Support-State Area Placeholder

Required contents:

- current assistance mode label
- short non-stigmatizing operator-support summary
- space for later human-state confidence or degraded-sensing status

Layout rule:

- Compact persistent strip or panel. It must never overpower the plant mimic or alarm area.

### 7. Optional Supervisor / Evaluator Panel Placeholder

Required contents:

- mode transition markers
- validator intervention markers
- future replay/evaluation affordances

Layout rule:

- Optional, collapsible, or secondary. It must not displace operator-critical content from the default operator view.

## Baseline Layout Agreement

```text
+--------------------------------------------------------------------------------------------------+
| Top Status Bar                                                                                   |
+------------------------------------------------------+---------------------------+---------------+
| Plant Mimic Area                                     | Alarm Area                | Optional      |
| - reactor / vessel / steam / feedwater path          | - prioritized alarms      | Supervisor /  |
| - turbine-generator / condenser path                 | - alarm count             | Evaluator     |
| - critical values always visible                     | - cluster placeholder     | Panel         |
+------------------------------------------------------+---------------------------+---------------+
| Transparency / Root-Cause Placeholder                | Procedure / First-Response Placeholder         |
+-----------------------------------------------------------------------------------+--------------+
| Support-State Placeholder                                                           | spare footer |
+--------------------------------------------------------------------------------------------------+
```

## Region Behavior Rules

- The plant mimic area, top status bar, and alarm area are mandatory at all times.
- Adaptive behavior may reprioritize, highlight, or narrow content, but it may not remove access to critical plant state or `P1` / `P2` alarm visibility.
- The transparency and procedure regions must exist in the baseline shell even if they begin as static placeholders in Phase 1.
- The support-state area must stay compact and descriptive, never punitive or medicalized.
- Optional supervisor content should be easy to hide during operator-focused demos.

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

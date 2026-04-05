# AURA-IDCR MVP Scenario Schema

This document defines the single shared schema that all MVP scenarios must use.
It is implementation-ready, serializable, deterministic, and designed to support the three frozen MVP scenario families without adding extra runtime concepts.

## Scope Rules

- Every scenario is a static definition file or object that can be loaded without code generation.
- Scenarios must only reference canonical variable IDs from [aura_variable_schema.md](./aura_variable_schema.md) and alarm IDs from [aura_alarm_dictionary.md](./aura_alarm_dictionary.md).
- Phases, event injections, and operator actions must be explicit. Hidden behavior is not allowed.

## Canonical Enums

- `difficulty`: `intro` | `moderate` | `high`
- `trigger_kind`: `time_offset_sec` | `condition`
- `effect_operation`: `set` | `delta` | `ramp_to`
- `alarm_hook_action`: `assert` | `clear` | `latch`
- `action_category`: `control_input` | `system_alignment` | `recovery_step` | `acknowledgement`
- `condition_operator`: `eq` | `ne` | `gt` | `gte` | `lt` | `lte`

## Top-Level Contract

```ts
type ScenarioDefinition = {
  scenario_id: string
  version: string
  title: string
  summary: string
  training_goal: string
  initiating_event: string
  difficulty: "intro" | "moderate" | "high"
  tags: string[]
  expected_duration_sec: number
  deterministic_seed: string
  initial_plant_state: PlantStateSnapshot
  phases: ScenarioPhase[]
  event_injections: ScenarioEventInjection[]
  alarm_hooks: AlarmTriggerHook[]
  allowed_operator_actions: AllowedOperatorAction[]
  success_condition: ScenarioCondition
  failure_condition: ScenarioCondition
  timeout_condition: ScenarioCondition
}
```

## Field Requirements

| Field | Required | Contract |
| --- | --- | --- |
| `scenario_id` | yes | Stable lower snake case ID, for example `scn_alarm_cascade_root_cause`. |
| `version` | yes | Manual semantic version string for scenario data, for example `1.0.0`. |
| `title` | yes | Short operator-facing scenario title. |
| `summary` | yes | One-paragraph scenario purpose and abnormal-event setup. |
| `training_goal` | yes | Single explicit competency goal for evaluation. |
| `initiating_event` | yes | Short text naming the first disturbance or loss event. |
| `difficulty` | yes | One of the canonical difficulty enum values. |
| `tags` | yes | Short labels for filtering, for example `alarm-flood`, `procedure-overload`, `high-risk-action`. |
| `expected_duration_sec` | yes | Planned runtime window for the scenario. |
| `deterministic_seed` | yes | Fixed seed or static token that keeps the run repeatable. |
| `initial_plant_state` | yes | Full canonical variable map at scenario start. All Phase 0 variable keys must be present. |
| `phases` | yes | Ordered array. The first phase is active at `t = 0`. Later phases activate in listed order once the prior phase completion condition is met. |
| `event_injections` | yes | Explicit timed or conditional plant-state disturbances or recoveries. |
| `alarm_hooks` | yes | Explicit alarm assertions, clears, or latching hooks tied to conditions or timed triggers. |
| `allowed_operator_actions` | yes | Full list of action contracts that the scenario runtime may accept. |
| `success_condition` | yes | Scenario completion condition representing correct recovery or stabilization. |
| `failure_condition` | yes | Scenario completion condition representing unsafe or missed response. |
| `timeout_condition` | yes | Scenario completion condition representing elapsed-time failure. |

## Nested Contracts

```ts
type PlantStateSnapshot = Record<string, number | boolean | string>

type ScenarioPhase = {
  phase_id: string
  label: string
  description: string
  completion_condition: ScenarioCondition
  nominal_duration_sec: number
  allowed_action_ids?: string[]
}

type ScenarioEventInjection = {
  injection_id: string
  phase_id: string
  trigger: ScenarioTrigger
  effects: ScenarioStateEffect[]
  note: string
}

type AlarmTriggerHook = {
  hook_id: string
  phase_id?: string
  alarm_id: string
  trigger: ScenarioTrigger
  action: "assert" | "clear" | "latch"
  note: string
}

type AllowedOperatorAction = {
  action_id: string
  label: string
  category: "control_input" | "system_alignment" | "recovery_step" | "acknowledgement"
  target_variable_ids: string[]
  allowed_phase_ids: string[]
  can_change_progression: boolean
  unsafe_if_misused: boolean
  requires_validation: boolean
  effect_note: string
}

type ScenarioTrigger =
  | { trigger_kind: "time_offset_sec"; phase_time_sec: number }
  | { trigger_kind: "condition"; condition: ScenarioCondition }

type ScenarioStateEffect = {
  variable_id: string
  effect_operation: "set" | "delta" | "ramp_to"
  value: number | boolean | string
  duration_sec?: number
}
```

## Condition DSL

`ScenarioCondition` is the one allowed condition shape across progression, injections, and scenario outcomes.

```ts
type ScenarioCondition =
  | { all: ScenarioCondition[] }
  | { any: ScenarioCondition[] }
  | {
      variable: {
        variable_id: string
        operator: "eq" | "ne" | "gt" | "gte" | "lt" | "lte"
        value: number | boolean | string
      }
    }
  | {
      action: {
        action_id: string
        performed: boolean
      }
    }
  | {
      elapsed_time_sec_gte: number
    }
```

## Authoring Rules

- Every `phase_id`, `injection_id`, `hook_id`, and `action_id` must be stable and unique within the scenario.
- `event_injections` may only change canonical plant variables.
- `alarm_hooks` must reference existing alarm IDs and should not encode hidden alarm logic outside the declared `trigger`.
- `allowed_operator_actions` must be the only path by which operator commands change scenario progression.
- `success_condition`, `failure_condition`, and `timeout_condition` must be mutually understandable and collectively exhaustive for the intended run.

## Minimal Example Skeleton

The example below is intentionally abbreviated to show shape only.
Real scenario files must provide the full canonical `initial_plant_state` map and keep referenced action IDs consistent.

```json
{
  "scenario_id": "scn_alarm_cascade_root_cause",
  "version": "1.0.0",
  "title": "Correlated Alarm Cascade With Dominant Root Cause",
  "summary": "A feedwater-side disturbance drives a rising alarm load and tests alarm-storyline support.",
  "training_goal": "Identify the dominant cause early and stabilize the plant without unnecessary actions.",
  "initiating_event": "Feedwater flow degradation begins.",
  "difficulty": "moderate",
  "tags": ["alarm-flood", "root-cause"],
  "expected_duration_sec": 600,
  "deterministic_seed": "phase0-fixed-seed-01",
  "initial_plant_state": {
    "reactor_power_pct": 70,
    "vessel_water_level_m": 7.6,
    "vessel_pressure_mpa": 7.1
  },
  "phases": [
    {
      "phase_id": "phase_onset",
      "label": "Onset",
      "description": "Initial disturbance enters the system.",
      "completion_condition": { "elapsed_time_sec_gte": 90 },
      "nominal_duration_sec": 90,
      "allowed_action_ids": ["act_ack_alarm", "act_adjust_feedwater"]
    }
  ],
  "event_injections": [],
  "alarm_hooks": [],
  "allowed_operator_actions": [
    {
      "action_id": "act_ack_alarm",
      "label": "Acknowledge alarm",
      "category": "acknowledgement",
      "target_variable_ids": ["alarm_load_count"],
      "allowed_phase_ids": ["phase_onset"],
      "can_change_progression": false,
      "unsafe_if_misused": false,
      "requires_validation": false,
      "effect_note": "Captures operator alarm acknowledgement without changing plant state."
    },
    {
      "action_id": "act_adjust_feedwater",
      "label": "Adjust feedwater flow",
      "category": "control_input",
      "target_variable_ids": ["feedwater_flow_pct"],
      "allowed_phase_ids": ["phase_onset"],
      "can_change_progression": true,
      "unsafe_if_misused": true,
      "requires_validation": true,
      "effect_note": "Correct adjustment can stabilize level; poor adjustment can worsen the event."
    }
  ],
  "success_condition": { "variable": { "variable_id": "vessel_water_level_m", "operator": "gte", "value": 7.0 } },
  "failure_condition": { "variable": { "variable_id": "vessel_water_level_m", "operator": "lt", "value": 6.2 } },
  "timeout_condition": { "elapsed_time_sec_gte": 600 }
}
```

## Phase 1 Usage Rules

- Phase 1 should parse this contract directly and run one deterministic scenario from it without inventing a second scenario format.
- If a later phase needs richer logic, it should extend the payload shape without breaking the existing required fields.
- Scenario runtime state should record the current `phase_id`, satisfied conditions, and consumed injections for replay and KPI logging.

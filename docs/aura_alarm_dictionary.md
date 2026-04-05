# AURA-IDCR MVP Alarm Dictionary

This document defines the initial alarm dictionary structure and seed content for the MVP.
It establishes the authoritative alarm record format for Phase 1 alarm generation, later clustering, UI presentation, and replay logging.

## Scope Rules

- This file defines alarm metadata and seed trigger descriptions only.
- It does not implement alarm logic or clustering logic.
- Grouping fields are hints for later correlation and display work, not a runtime algorithm.

## Canonical Enums

- `priority`: `P1` | `P2` | `P3`
- `visibility_rule`: `always_visible` | `standard_visible`

Priority meaning:

- `P1`: immediate operator attention, never hidden
- `P2`: important abnormal condition, persistently available
- `P3`: context alarm, visible but lower emphasis

## Alarm Record Contract

```ts
type AlarmDictionaryEntry = {
  alarm_id: string
  title: string
  priority: "P1" | "P2" | "P3"
  subsystem_tag: string
  trigger_condition_description: string
  group_hint: string
  visibility_rule: "always_visible" | "standard_visible"
  recommended_next_check_hint: string
}
```

## Seed Alarm Dictionary

| Alarm ID | Title | Priority | Subsystem Tag | Triggering Condition Description | Group / Cluster Hint | Visibility Rule | Recommended Next-Check Hint Placeholder |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `ALM_RPV_LEVEL_LOW` | Reactor Vessel Level Low | `P2` | `reactor_vessel` | Raise when `vessel_water_level_m < 6.8` for a short persistence window. | `inventory_loss` | `always_visible` | Check `feedwater_flow_pct` and level trend. |
| `ALM_RPV_LEVEL_LOW_LOW` | Reactor Vessel Level Low-Low | `P1` | `reactor_vessel` | Raise when `vessel_water_level_m < 6.2`. | `inventory_loss` | `always_visible` | Confirm immediate inventory recovery path. |
| `ALM_RPV_PRESSURE_HIGH` | Reactor Vessel Pressure High | `P1` | `reactor_vessel` | Raise when `vessel_pressure_mpa > 7.6`. | `pressure_transient` | `always_visible` | Check `safety_relief_valve_open` and condenser status. |
| `ALM_MAIN_STEAM_FLOW_MISMATCH` | Main Steam Flow Mismatch | `P3` | `steam_path` | Raise when `main_steam_flow_pct` diverges materially from expected flow for current power. | `steam_path_anomaly` | `standard_visible` | Compare steam flow to `reactor_power_pct`. |
| `ALM_FEEDWATER_FLOW_LOW` | Feedwater Flow Low | `P2` | `feedwater` | Raise when `feedwater_flow_pct` drops below the expected operating band at power. | `feedwater_loss` | `always_visible` | Check pump response and vessel level trend. |
| `ALM_TURBINE_OUTPUT_LOW` | Turbine Output Low For Power | `P3` | `turbine_generator` | Raise when `turbine_output_mwe` is low relative to `reactor_power_pct`. | `generation_mismatch` | `standard_visible` | Compare turbine output, steam flow, and trip state. |
| `ALM_CONDENSER_HEAT_SINK_LOST` | Condenser Heat Sink Lost | `P1` | `heat_sink` | Raise when `condenser_heat_sink_available = false`. | `heat_sink_loss` | `always_visible` | Check condenser availability and backpressure. |
| `ALM_CONDENSER_BACKPRESSURE_HIGH` | Condenser Backpressure High | `P2` | `heat_sink` | Raise when `condenser_backpressure_kpa > 18`. | `heat_sink_loss` | `always_visible` | Confirm heat sink degradation and steam path impact. |
| `ALM_ISOLATION_CONDENSER_UNAVAILABLE` | Isolation Condenser Unavailable When Demanded | `P2` | `decay_heat_removal` | Raise when isolation condenser demand exists and `isolation_condenser_available = false`. | `decay_heat_removal_unavailable` | `always_visible` | Check isolation condenser availability and alternate recovery path. |
| `ALM_ISOLATION_CONDENSER_FLOW_LOW` | Isolation Condenser Flow Low | `P2` | `decay_heat_removal` | Raise when the system is demanded but `isolation_condenser_flow_pct` remains below expected recovery flow. | `decay_heat_removal_unavailable` | `always_visible` | Check valve alignment and vessel pressure response. |
| `ALM_OFFSITE_POWER_LOSS` | Offsite Power Lost | `P1` | `electrical` | Raise when `offsite_power_available = false`. | `electrical_disturbance` | `always_visible` | Confirm DC status and essential loads. |
| `ALM_DC_BUS_LOW` | DC Bus Charge Low | `P2` | `electrical` | Raise when `dc_bus_soc_pct < 40`. | `electrical_disturbance` | `always_visible` | Check remaining margin and load-shed need. |
| `ALM_CONTAINMENT_PRESSURE_HIGH` | Containment Pressure High | `P1` | `containment` | Raise when `containment_pressure_kpa > 112`. | `containment_challenge` | `always_visible` | Check containment trend and related pressure causes. |
| `ALM_REACTOR_TRIP_ACTIVE` | Reactor Trip Active | `P2` | `reactor_core` | Raise when `reactor_trip_active = true`. | `post_trip_recovery` | `always_visible` | Confirm post-trip stabilization path. |
| `ALM_SRV_STUCK_OPEN` | Safety Relief Valve Open Extended | `P2` | `reactor_vessel` | Raise when `safety_relief_valve_open = true` beyond the short transient allowance. | `pressure_transient` | `always_visible` | Check pressure trend and valve recovery. |

## Dictionary Authoring Rules

- Alarm IDs are stable uppercase snake case with the `ALM_` prefix.
- `subsystem_tag` values must match the canonical tags in [aura_variable_schema.md](./aura_variable_schema.md).
- `trigger_condition_description` should remain human-readable and implementation-agnostic. Detailed logic belongs in runtime alarm evaluators later.
- `group_hint` is a semantic seed for clustering and storyline views. It must not be treated as a definitive root cause.
- `recommended_next_check_hint` is allowed to remain a short placeholder in Phase 0, but it must point the operator toward a concrete next variable or subsystem to inspect.

## Phase 1 Usage Rules

- Phase 1 should use this dictionary as the single source for alarm metadata labels and display priorities.
- Alarm runtime should publish active alarm IDs from this file rather than ad hoc text titles.
- Later clustering and storyline modules should consume `group_hint` as seed metadata, not as proof of causality.

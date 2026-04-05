# AURA-IDCR MVP Variable Schema

This document defines the canonical Phase 0 plant variable list for the AURA-IDCR MVP.
It is intentionally bounded, student-feasible, deterministic, and sufficient for Phase 1 and the three frozen MVP scenario families.

## Scope Rules

- This is a BWRX-300-inspired prototype schema, not a licensing-grade plant model.
- Variable IDs in this file are authoritative for scenario definitions, alarm seeds, logging, and later shared contracts.
- Keep the set small and stable. New variables should only be added if a later phase cannot be implemented without them.

## Naming And Value Conventions

- Variable IDs use lower snake case.
- Numeric types are `number` unless explicitly marked `integer`.
- Boolean variables use `true` / `false`.
- Enum variables must document their allowed values inline when introduced in a later phase.
- `critical_visibility = true` means the value must remain continuously visible somewhere in the operator shell during adaptive presentation changes.
- `alarm_driver = true` means the variable may directly participate in alarm trigger logic.
- `operator_affectable = true` means an operator command may change or materially influence the variable in the MVP simulation.

## Canonical Subsystem Tags

- `reactor_core`
- `reactor_vessel`
- `steam_path`
- `feedwater`
- `turbine_generator`
- `heat_sink`
- `decay_heat_removal`
- `containment`
- `electrical`
- `alarm_system`

## Canonical Variable List

| Variable ID / Key | Label | Subsystem / Domain | Type | Unit | Normal Range | Critical Visibility | Alarm Driver | Operator Affectable |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `reactor_power_pct` | Reactor Power | `reactor_core` | `number` | `% rated` | `25-100` | `true` | `true` | `true` |
| `vessel_water_level_m` | Reactor Vessel Water Level | `reactor_vessel` | `number` | `m` | `7.0-8.0` | `true` | `true` | `true` |
| `vessel_pressure_mpa` | Reactor Vessel Pressure | `reactor_vessel` | `number` | `MPa` | `6.8-7.4` | `true` | `true` | `true` |
| `main_steam_flow_pct` | Main Steam Flow | `steam_path` | `number` | `% rated` | `25-100` | `true` | `true` | `true` |
| `feedwater_flow_pct` | Feedwater Flow | `feedwater` | `number` | `% rated` | `25-100` | `true` | `true` | `true` |
| `turbine_output_mwe` | Turbine-Generator Output | `turbine_generator` | `number` | `MW_e` | `75-300` | `true` | `true` | `true` |
| `condenser_heat_sink_available` | Condenser Heat Sink Available | `heat_sink` | `boolean` | `state` | `N/A` | `true` | `true` | `false` |
| `condenser_backpressure_kpa` | Condenser Backpressure | `heat_sink` | `number` | `kPa` | `8-15` | `true` | `true` | `true` |
| `isolation_condenser_available` | Isolation Condenser Available | `decay_heat_removal` | `boolean` | `state` | `N/A` | `true` | `true` | `false` |
| `isolation_condenser_flow_pct` | Isolation Condenser Flow | `decay_heat_removal` | `number` | `% rated` | `0` during standby | `true` | `true` | `true` |
| `containment_pressure_kpa` | Containment Pressure | `containment` | `number` | `kPa` | `95-105` | `true` | `true` | `true` |
| `offsite_power_available` | Offsite Power Available | `electrical` | `boolean` | `state` | `N/A` | `true` | `true` | `false` |
| `dc_bus_soc_pct` | DC Bus State Of Charge | `electrical` | `number` | `%` | `70-100` | `true` | `true` | `true` |
| `reactor_trip_active` | Reactor Trip Active | `reactor_core` | `boolean` | `state` | `false` | `true` | `true` | `true` |
| `safety_relief_valve_open` | Safety Relief Valve Open | `reactor_vessel` | `boolean` | `state` | `false` | `true` | `true` | `true` |
| `alarm_load_count` | Active Alarm Count | `alarm_system` | `integer` | `count` | `0-5` | `false` | `false` | `false` |
| `active_alarm_cluster_count` | Active Alarm Cluster Count | `alarm_system` | `integer` | `count` | `0-2` | `false` | `false` | `false` |

## Variable Notes

- `reactor_power_pct`, `main_steam_flow_pct`, and `turbine_output_mwe` are proxies, not full thermodynamic truth variables.
- `condenser_heat_sink_available`, `isolation_condenser_available`, and `offsite_power_available` are scenario-driven availability states. Operator actions may respond to these states, but the availability flags themselves are not direct operator commands in the MVP.
- `isolation_condenser_flow_pct` allows later phases to represent both availability and actual use without introducing a richer component model.
- `alarm_load_count` and `active_alarm_cluster_count` are derived display-facing variables to keep alarm burden explicit in logs and UI summaries.

## Phase 1 Usage Rules

- Phase 1 should use these exact variable IDs as the initial keys in the plant state object.
- Scenario definitions must not invent additional plant-state keys unless the master build brain is intentionally updated first.
- Alarm trigger definitions should reference these keys directly.
- If a future phase needs a richer internal model, it should still publish this canonical surface state for UI, alarms, logging, and replay.

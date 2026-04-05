# AURA-IDCR MVP KPI Definitions

This document defines the minimum KPI sheet for the MVP and the log dependencies required to compute it later.
The KPI set is intentionally compact and competition-facing first, with a smaller internal-only layer for engineering validation.

## KPI Design Rules

- Every KPI must be computable from canonical `SessionLogEvent` records defined in [aura_module_contracts.md](./aura_module_contracts.md).
- Demo-facing KPIs should tell a clear before/after story for `baseline` versus `adaptive` sessions.
- Internal-only KPIs may support tuning, diagnosis, and regression checks, but they should not clutter the main demo narrative.

## Minimum Logging Dependencies

Later phases must emit the following event types with stable payload fields if the KPI sheet is to be computable without backfilling structure:

| Event Type | Minimum Payload Fields |
| --- | --- |
| `session_started` | `session_mode`, `scenario_id`, `expected_outcome_window_sec` |
| `phase_changed` | `phase_id`, `from_phase_id`, `to_phase_id` |
| `alarm_set_updated` | `active_alarm_count`, `active_alarm_cluster_count`, `highest_priority_active`, `active_alarm_ids` |
| `reasoning_snapshot_published` | `top_hypothesis_id`, `ranked_hypothesis_ids`, `confidence_band` |
| `support_mode_changed` | `from_mode`, `to_mode`, `trigger_reason` |
| `operator_state_snapshot_recorded` | `workload_index`, `attention_stability_index`, `signal_confidence` |
| `action_requested` | `action_id`, `actor_role`, `ui_region` |
| `action_validated` | `action_request_id`, `outcome`, `reason_code`, `prevented_harm`, `nuisance_flag` |
| `operator_action_applied` | `action_id`, `action_class`, `correctness_label`, `resulting_state_change` |
| `diagnosis_committed` | `diagnosis_id`, `matches_expected_root_cause` |
| `scenario_outcome_recorded` | `outcome`, `success`, `failure_reason`, `stabilized` |

Phase 3 additive note:

- `operator_state_snapshot_recorded` may add `degraded_mode_active`, `degraded_mode_reason`, and `observation_window_ticks` without changing the KPI minimums above.
- `reasoning_snapshot_published` may add `combined_risk_score`, `combined_risk_band`, `top_contributing_factors`, and `confidence_caveat` so the additive risk layer remains replay-inspectable.
- `support_mode_changed` may add `current_mode_reason`, `support_behavior_changes`, `degraded_confidence_effect`, and compact critical-visibility summaries without changing the KPI minimums above.

## KPI Sheet

| KPI Name | Description | Why It Matters | Exact Log / Event Dependency | Audience |
| --- | --- | --- | --- | --- |
| `diagnosis_time_sec` | Seconds from `session_started` to the first `diagnosis_committed` event where `matches_expected_root_cause = true`. | Measures whether AURA reduces early diagnostic burden. | `session_started.sim_time_sec` and first qualifying `diagnosis_committed.sim_time_sec`. | `demo_facing` |
| `response_stabilization_time_sec` | Seconds from `session_started` to `scenario_outcome_recorded` with `success = true` and `stabilized = true`. | Captures whether support leads to faster stable recovery, not just faster clicks. | `session_started.sim_time_sec` and qualifying `scenario_outcome_recorded.sim_time_sec`. | `demo_facing` |
| `critical_action_error_rate` | Fraction of `operator_action_applied` events with `action_class = critical` and `correctness_label = harmful_or_incorrect`. | Shows whether the system reduces high-impact operator mistakes. | Count of qualifying harmful critical actions divided by total qualifying critical actions from `operator_action_applied`. | `demo_facing` |
| `harmful_actions_prevented_count` | Number of validated actions blocked before application where `prevented_harm = true`. | Makes the bounded value of the interceptor easy to explain on stage. | Count of `action_validated` events with `outcome = hard_prevent` and `prevented_harm = true`. | `demo_facing` |
| `workload_peak_index` | Maximum recorded workload index during the session. | Supports the claim that adaptive support reduces overload. | Max `workload_index` from `operator_state_snapshot_recorded`. | `demo_facing` |
| `alarm_compression_ratio` | Average `active_alarm_count / max(active_alarm_cluster_count, 1)` across alarm updates. | Quantifies whether alarm-intelligence views turn floods into manageable structure. | `alarm_set_updated.active_alarm_count` and `alarm_set_updated.active_alarm_cluster_count`. | `internal_only` |
| `top_cause_stability_pct` | Percentage of `reasoning_snapshot_published` events where `top_hypothesis_id` matches the previous snapshot after initial convergence. | Measures whether the root-cause story remains stable enough to trust. | Ordered stream of `reasoning_snapshot_published.top_hypothesis_id`. | `internal_only` |
| `nuisance_intervention_fraction` | Fraction of validator interventions flagged as unnecessary noise. | Keeps the action validator aligned with the quiet-by-default requirement. | Count of `action_validated` where `outcome != pass` and `nuisance_flag = true` divided by all non-pass `action_validated`. | `internal_only` |

## Demo Shortlist

If stage space is limited, present these five first:

- `diagnosis_time_sec`
- `response_stabilization_time_sec`
- `critical_action_error_rate`
- `workload_peak_index`
- `harmful_actions_prevented_count`

## Phase 1 And Phase 2 Usage Rules

- Phase 1 should emit the logging scaffolding needed by `diagnosis_time_sec`, `response_stabilization_time_sec`, and `critical_action_error_rate`, even if some later KPIs remain unpopulated at first.
- Phase 2 should make `alarm_compression_ratio` and `top_cause_stability_pct` computable without redefining event shapes.
- Later evaluation code should export these KPI IDs unchanged so comparison reports remain stable across sessions.

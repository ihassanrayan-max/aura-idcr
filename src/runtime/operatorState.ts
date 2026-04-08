import type { HumanMonitoringSnapshot, OperatorStateSnapshot } from "../contracts/aura";
export { calculateDiagnosisAmbiguityIndex, calculatePlantSeverityIndex } from "./humanMonitoring";

type BuildOperatorStateParams = {
  human_monitoring: HumanMonitoringSnapshot;
};

export function buildOperatorStateSnapshot(params: BuildOperatorStateParams): OperatorStateSnapshot {
  const interpretation_input = params.human_monitoring.interpretation_input;

  if (!interpretation_input) {
    return {
      workload_index: 0,
      attention_stability_index: 100,
      signal_confidence: 0,
      degraded_mode_active: true,
      degraded_mode_reason:
        "Human monitoring is unavailable and no compatibility observation has been published yet.",
      observation_window_ticks: params.human_monitoring.window_tick_span,
    };
  }

  return {
    workload_index: interpretation_input.workload_index,
    attention_stability_index: interpretation_input.attention_stability_index,
    signal_confidence: interpretation_input.signal_confidence,
    degraded_mode_active: interpretation_input.degraded_mode_active,
    degraded_mode_reason: interpretation_input.degraded_mode_reason,
    observation_window_ticks: interpretation_input.observation_window_ticks,
  };
}

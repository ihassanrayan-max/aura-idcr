import type { HumanMonitoringSnapshot, OperatorStateSnapshot } from "../contracts/aura";
export { calculateDiagnosisAmbiguityIndex, calculatePlantSeverityIndex } from "./humanMonitoring";

type BuildOperatorStateParams = {
  human_monitoring: HumanMonitoringSnapshot;
};

export function buildOperatorStateSnapshot(params: BuildOperatorStateParams): OperatorStateSnapshot {
  const compatibility_observation = params.human_monitoring.compatibility_observation;

  if (!compatibility_observation) {
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
    workload_index: compatibility_observation.workload_index,
    attention_stability_index: compatibility_observation.attention_stability_index,
    signal_confidence: compatibility_observation.signal_confidence,
    degraded_mode_active: compatibility_observation.degraded_mode_active,
    degraded_mode_reason: compatibility_observation.degraded_mode_reason,
    observation_window_ticks: compatibility_observation.observation_window_ticks,
  };
}

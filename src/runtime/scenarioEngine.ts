import type {
  ExecutedAction,
  PlantStateSnapshot,
  ScenarioCondition,
  ScenarioDefinition,
  ScenarioEventInjection,
  ScenarioPhase,
  ScenarioStateEffect,
  ScenarioTrigger,
} from "../contracts/aura";

export type ScenarioRuntimeState = {
  phase_index: number;
  phase_start_time_sec: number;
  consumed_injection_ids: string[];
};

export type ScenarioConditionContext = {
  plant_state: PlantStateSnapshot;
  executed_actions: ExecutedAction[];
  elapsed_time_sec: number;
};

export function createScenarioRuntimeState(): ScenarioRuntimeState {
  return {
    phase_index: 0,
    phase_start_time_sec: 0,
    consumed_injection_ids: [],
  };
}

export function getActivePhase(
  scenario: ScenarioDefinition,
  runtime_state: ScenarioRuntimeState,
): ScenarioPhase {
  return scenario.phases[runtime_state.phase_index];
}

export function getPhaseElapsedTimeSec(sim_time_sec: number, runtime_state: ScenarioRuntimeState): number {
  return sim_time_sec - runtime_state.phase_start_time_sec;
}

export function evaluateCondition(
  condition: ScenarioCondition,
  context: ScenarioConditionContext,
): boolean {
  if ("all" in condition) {
    return condition.all.every((entry) => evaluateCondition(entry, context));
  }

  if ("any" in condition) {
    return condition.any.some((entry) => evaluateCondition(entry, context));
  }

  if ("variable" in condition) {
    const current_value = context.plant_state[condition.variable.variable_id];
    const target_value = condition.variable.value;

    switch (condition.variable.operator) {
      case "eq":
        return current_value === target_value;
      case "ne":
        return current_value !== target_value;
      case "gt":
        return Number(current_value) > Number(target_value);
      case "gte":
        return Number(current_value) >= Number(target_value);
      case "lt":
        return Number(current_value) < Number(target_value);
      case "lte":
        return Number(current_value) <= Number(target_value);
      default:
        return false;
    }
  }

  if ("action" in condition) {
    const was_performed = context.executed_actions.some(
      (action) => action.action_id === condition.action.action_id && action.applied,
    );
    return was_performed === condition.action.performed;
  }

  return context.elapsed_time_sec >= condition.elapsed_time_sec_gte;
}

function triggerIsSatisfied(
  trigger: ScenarioTrigger,
  context: ScenarioConditionContext,
  phase_elapsed_time_sec: number,
): boolean {
  if (trigger.trigger_kind === "time_offset_sec") {
    return phase_elapsed_time_sec >= trigger.phase_time_sec;
  }

  return evaluateCondition(trigger.condition, context);
}

export function consumeTriggeredInjections(
  scenario: ScenarioDefinition,
  runtime_state: ScenarioRuntimeState,
  context: ScenarioConditionContext,
  sim_time_sec: number,
): { runtime_state: ScenarioRuntimeState; effects: ScenarioStateEffect[] } {
  const current_phase = getActivePhase(scenario, runtime_state);
  const phase_elapsed_time_sec = getPhaseElapsedTimeSec(sim_time_sec, runtime_state);
  const newly_triggered: ScenarioEventInjection[] = [];

  for (const injection of scenario.event_injections) {
    if (injection.phase_id !== current_phase.phase_id) {
      continue;
    }

    if (runtime_state.consumed_injection_ids.includes(injection.injection_id)) {
      continue;
    }

    if (triggerIsSatisfied(injection.trigger, context, phase_elapsed_time_sec)) {
      newly_triggered.push(injection);
    }
  }

  if (newly_triggered.length === 0) {
    return { runtime_state, effects: [] };
  }

  return {
    runtime_state: {
      ...runtime_state,
      consumed_injection_ids: [
        ...runtime_state.consumed_injection_ids,
        ...newly_triggered.map((injection) => injection.injection_id),
      ],
    },
    effects: newly_triggered.flatMap((injection) => injection.effects),
  };
}

export function advancePhaseIfNeeded(
  scenario: ScenarioDefinition,
  runtime_state: ScenarioRuntimeState,
  context: ScenarioConditionContext,
  sim_time_sec: number,
): { runtime_state: ScenarioRuntimeState; from_phase?: ScenarioPhase; to_phase?: ScenarioPhase } {
  const current_phase = getActivePhase(scenario, runtime_state);
  const phase_elapsed_time_sec = getPhaseElapsedTimeSec(sim_time_sec, runtime_state);

  if (
    !evaluateCondition(current_phase.completion_condition, {
      ...context,
      elapsed_time_sec: phase_elapsed_time_sec,
    })
  ) {
    return { runtime_state };
  }

  const next_phase = scenario.phases[runtime_state.phase_index + 1];
  if (!next_phase) {
    return { runtime_state };
  }

  return {
    runtime_state: {
      ...runtime_state,
      phase_index: runtime_state.phase_index + 1,
      phase_start_time_sec: sim_time_sec,
    },
    from_phase: current_phase,
    to_phase: next_phase,
  };
}

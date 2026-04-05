import type {
  AlarmPriority,
  AlarmRecord,
  AlarmSet,
  ExecutedAction,
  PlantStateSnapshot,
  ScenarioDefinition,
  ScenarioTrigger,
} from "../contracts/aura";
import { alarmDictionaryById } from "../data/alarmDictionary";
import { evaluateCondition } from "./scenarioEngine";

export type AlarmRuntimeState = {
  active_alarm_ids: string[];
  latched_alarm_ids: string[];
};

export function createAlarmRuntimeState(): AlarmRuntimeState {
  return {
    active_alarm_ids: [],
    latched_alarm_ids: [],
  };
}

function triggerIsSatisfied(
  trigger: ScenarioTrigger,
  plant_state: PlantStateSnapshot,
  executed_actions: ExecutedAction[],
  phase_elapsed_time_sec: number,
): boolean {
  if (trigger.trigger_kind === "time_offset_sec") {
    return phase_elapsed_time_sec >= trigger.phase_time_sec;
  }

  return evaluateCondition(trigger.condition, {
    plant_state,
    executed_actions,
    elapsed_time_sec: phase_elapsed_time_sec,
  });
}

function thresholdAlarmStates(plant_state: PlantStateSnapshot): string[] {
  const active_ids: string[] = [];

  if (Number(plant_state.condenser_backpressure_kpa) > 18) {
    active_ids.push("ALM_CONDENSER_BACKPRESSURE_HIGH");
  }

  if (Boolean(plant_state.reactor_trip_active)) {
    active_ids.push("ALM_REACTOR_TRIP_ACTIVE");
  }

  if (Boolean(plant_state.safety_relief_valve_open)) {
    active_ids.push("ALM_SRV_STUCK_OPEN");
  }

  if (Number(plant_state.main_steam_flow_pct) < Number(plant_state.reactor_power_pct) - 10) {
    active_ids.push("ALM_MAIN_STEAM_FLOW_MISMATCH");
  }

  if (Number(plant_state.containment_pressure_kpa) > 112) {
    active_ids.push("ALM_CONTAINMENT_PRESSURE_HIGH");
  }

  return active_ids;
}

function priorityRank(priority: AlarmPriority): number {
  switch (priority) {
    case "P1":
      return 0;
    case "P2":
      return 1;
    case "P3":
      return 2;
  }
}

function toAlarmRecord(alarm_id: string): AlarmRecord | undefined {
  const entry = alarmDictionaryById[alarm_id];
  if (!entry) {
    return undefined;
  }

  return {
    alarm_id: entry.alarm_id,
    title: entry.title,
    priority: entry.priority,
    subsystem_tag: entry.subsystem_tag,
    active: true,
    visibility_rule: entry.visibility_rule,
    group_hint: entry.group_hint,
  };
}

export function evaluateAlarmSet(params: {
  scenario: ScenarioDefinition;
  session_id: string;
  tick_id: string;
  scenario_id: string;
  plant_state: PlantStateSnapshot;
  executed_actions: ExecutedAction[];
  current_phase_id: string;
  phase_elapsed_time_sec: number;
  previous_alarm_runtime_state: AlarmRuntimeState;
}): { alarm_set: AlarmSet; alarm_runtime_state: AlarmRuntimeState } {
  const runtime_state: AlarmRuntimeState = {
    active_alarm_ids: [],
    latched_alarm_ids: [...params.previous_alarm_runtime_state.latched_alarm_ids],
  };

  const explicit_alarm_ids = new Set<string>();
  const cleared_alarm_ids = new Set<string>();

  for (const hook of params.scenario.alarm_hooks) {
    if (hook.phase_id && hook.phase_id !== params.current_phase_id) {
      continue;
    }

    const triggered = triggerIsSatisfied(
      hook.trigger,
      params.plant_state,
      params.executed_actions,
      params.phase_elapsed_time_sec,
    );

    if (!triggered) {
      continue;
    }

    if (hook.action === "clear") {
      cleared_alarm_ids.add(hook.alarm_id);
      runtime_state.latched_alarm_ids = runtime_state.latched_alarm_ids.filter((alarm_id) => alarm_id !== hook.alarm_id);
      continue;
    }

    explicit_alarm_ids.add(hook.alarm_id);
    if (hook.action === "latch" && !runtime_state.latched_alarm_ids.includes(hook.alarm_id)) {
      runtime_state.latched_alarm_ids.push(hook.alarm_id);
    }
  }

  const active_alarm_ids = new Set<string>([
    ...thresholdAlarmStates(params.plant_state),
    ...Array.from(explicit_alarm_ids),
    ...runtime_state.latched_alarm_ids,
  ]);

  for (const cleared_alarm_id of cleared_alarm_ids) {
    active_alarm_ids.delete(cleared_alarm_id);
  }

  runtime_state.active_alarm_ids = Array.from(active_alarm_ids).sort((left, right) => {
    const left_entry = alarmDictionaryById[left];
    const right_entry = alarmDictionaryById[right];

    if (left_entry && right_entry) {
      const priority_delta = priorityRank(left_entry.priority) - priorityRank(right_entry.priority);
      if (priority_delta !== 0) {
        return priority_delta;
      }
    }

    return left.localeCompare(right);
  });

  const active_alarms = runtime_state.active_alarm_ids
    .map(toAlarmRecord)
    .filter((alarm): alarm is AlarmRecord => Boolean(alarm));

  const previous_alarm_ids = params.previous_alarm_runtime_state.active_alarm_ids;
  const newly_raised_alarm_ids = runtime_state.active_alarm_ids.filter((alarm_id) => !previous_alarm_ids.includes(alarm_id));
  const newly_cleared_alarm_ids = previous_alarm_ids.filter(
    (alarm_id) => !runtime_state.active_alarm_ids.includes(alarm_id),
  );
  const active_alarm_cluster_count = new Set(active_alarms.map((alarm) => alarm.group_hint)).size;
  const highest_priority_active = active_alarms[0]?.priority;

  return {
    alarm_set: {
      alarm_set_id: `${params.tick_id}_alarms`,
      tick_id: params.tick_id,
      session_id: params.session_id,
      scenario_id: params.scenario_id,
      active_alarm_count: active_alarms.length,
      active_alarm_cluster_count,
      highest_priority_active,
      active_alarm_ids: runtime_state.active_alarm_ids,
      active_alarms,
      newly_raised_alarm_ids,
      newly_cleared_alarm_ids,
    },
    alarm_runtime_state: runtime_state,
  };
}

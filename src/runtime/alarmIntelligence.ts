import type {
  AlarmCluster,
  AlarmIntelligenceSnapshot,
  AlarmPriority,
  AlarmRecord,
  AlarmSet,
  ScenarioRuntimeProfileId,
} from "../contracts/aura";

type ClusterRule = {
  cluster_id: string;
  title: string;
  summary: string;
  group_hints: string[];
};

const feedwaterClusterRules: ClusterRule[] = [
  {
    cluster_id: "cluster_feedwater_inventory",
    title: "Feedwater / Inventory Challenge",
    summary: "Feedwater-side degradation is pulling vessel inventory away from the normal band.",
    group_hints: ["feedwater_loss", "inventory_loss"],
  },
  {
    cluster_id: "cluster_pressure_heat_sink",
    title: "Pressure / Heat Sink Response",
    summary: "Steam-path and heat-sink side alarms suggest the upset is propagating into pressure response.",
    group_hints: ["heat_sink_loss", "pressure_transient", "steam_path_anomaly", "generation_mismatch"],
  },
  {
    cluster_id: "cluster_protection_consequence",
    title: "Protection / Consequence Escalation",
    summary: "Protective or containment-facing alarms indicate the event is no longer staying bounded.",
    group_hints: ["containment_challenge", "post_trip_recovery"],
  },
];

const lossOfOffsitePowerClusterRules: ClusterRule[] = [
  {
    cluster_id: "cluster_electrical_disturbance",
    title: "Electrical Disturbance",
    summary: "Loss of offsite power and battery-margin alarms define the dominant electrical upset picture.",
    group_hints: ["electrical_disturbance"],
  },
  {
    cluster_id: "cluster_decay_heat_removal_unavailable",
    title: "Decay-Heat Removal Gap",
    summary: "Normal heat-sink loss and weak isolation-condenser recovery leave decay heat insufficiently managed.",
    group_hints: ["decay_heat_removal_unavailable"],
  },
  {
    cluster_id: "cluster_pressure_consequence_escalation",
    title: "Pressure / Consequence Escalation",
    summary: "Pressure-side and containment alarms indicate the missed-recovery path is now escalating consequences.",
    group_hints: ["pressure_transient", "containment_challenge", "post_trip_recovery"],
  },
];

function clusterRulesForProfile(runtime_profile_id: ScenarioRuntimeProfileId): ClusterRule[] {
  switch (runtime_profile_id) {
    case "loss_of_offsite_power_sbo":
      return lossOfOffsitePowerClusterRules;
    case "feedwater_degradation":
    default:
      return feedwaterClusterRules;
  }
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

function summarizeCluster(rule: ClusterRule, alarms: AlarmRecord[]): string {
  const critical_titles = alarms
    .filter((alarm) => alarm.visibility_rule === "always_visible" || alarm.priority === "P1")
    .slice(0, 2)
    .map((alarm) => alarm.title);

  if (critical_titles.length === 0) {
    return `${rule.summary} ${alarms.length} related alarms are currently active.`;
  }

  return `${rule.summary} Critical signals: ${critical_titles.join(", ")}.`;
}

function buildCluster(rule: ClusterRule, alarms: AlarmRecord[]): AlarmCluster {
  const sorted_alarms = [...alarms].sort((left, right) => {
    const priority_delta = priorityRank(left.priority) - priorityRank(right.priority);
    if (priority_delta !== 0) {
      return priority_delta;
    }

    return left.alarm_id.localeCompare(right.alarm_id);
  });
  const critical_alarm_ids = sorted_alarms
    .filter((alarm) => alarm.visibility_rule === "always_visible" || alarm.priority === "P1")
    .map((alarm) => alarm.alarm_id);
  const primary_alarm_ids = sorted_alarms.slice(0, 2).map((alarm) => alarm.alarm_id);

  return {
    cluster_id: rule.cluster_id,
    title: rule.title,
    summary: summarizeCluster(rule, sorted_alarms),
    priority: sorted_alarms[0]?.priority ?? "P3",
    visibility_rule: critical_alarm_ids.length > 0 ? "always_visible" : "standard_visible",
    alarm_ids: sorted_alarms.map((alarm) => alarm.alarm_id),
    alarms: sorted_alarms,
    critical_alarm_ids,
    primary_alarm_ids,
    grouped_alarm_count: sorted_alarms.length,
  };
}

function fallbackRule(alarm: AlarmRecord): ClusterRule {
  const subsystem_label = alarm.subsystem_tag.replace(/_/g, " ");

  return {
    cluster_id: `cluster_${alarm.group_hint}`,
    title: `${subsystem_label} signals`,
    summary: `Related ${subsystem_label} alarms are active.`,
    group_hints: [alarm.group_hint],
  };
}

export function buildAlarmIntelligence(
  alarm_set: AlarmSet,
  runtime_profile_id: ScenarioRuntimeProfileId = "feedwater_degradation",
): AlarmIntelligenceSnapshot {
  const clusterRules = clusterRulesForProfile(runtime_profile_id);
  const alarms_by_cluster = new Map<string, { rule: ClusterRule; alarms: AlarmRecord[] }>();

  for (const alarm of alarm_set.active_alarms) {
    const matching_rule = clusterRules.find((rule) => rule.group_hints.includes(alarm.group_hint)) ?? fallbackRule(alarm);
    const current = alarms_by_cluster.get(matching_rule.cluster_id);

    if (current) {
      current.alarms.push(alarm);
      continue;
    }

    alarms_by_cluster.set(matching_rule.cluster_id, {
      rule: matching_rule,
      alarms: [alarm],
    });
  }

  const clusters = Array.from(alarms_by_cluster.values())
    .map((entry) => buildCluster(entry.rule, entry.alarms))
    .sort((left, right) => {
      const priority_delta = priorityRank(left.priority) - priorityRank(right.priority);
      if (priority_delta !== 0) {
        return priority_delta;
      }

      return right.grouped_alarm_count - left.grouped_alarm_count;
    });

  return {
    visible_alarm_card_count: clusters.length,
    grouped_alarm_count: clusters.length,
    compression_ratio: Number((alarm_set.active_alarm_count / Math.max(clusters.length, 1)).toFixed(2)),
    dominant_cluster_id: clusters[0]?.cluster_id,
    clusters,
  };
}

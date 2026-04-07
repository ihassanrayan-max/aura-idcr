import type {
  ScenarioCatalogSummary,
  ScenarioDefinition,
  ScenarioRuntimeProfileId,
  ScenarioUiControlSchema,
} from "../contracts/aura";
import { scnAlarmCascadeRootCause } from "./scn_alarm_cascade_root_cause";
import { scnLossOfOffsitePowerSbo } from "./scn_loss_of_offsite_power_sbo";
import { scnMainSteamIsolationUpset } from "./scn_main_steam_isolation_upset";

export type ScenarioCatalogEntry = {
  definition: ScenarioDefinition;
  runtime_profile_id: ScenarioRuntimeProfileId;
  ui_control_schema: ScenarioUiControlSchema;
};

const scenarioCatalogEntries: ScenarioCatalogEntry[] = [
  {
    definition: scnAlarmCascadeRootCause,
    runtime_profile_id: "feedwater_degradation",
    ui_control_schema: {
      title: "Manual Control Input",
      helper_text: "The baseline bounded controls remain available for deterministic replay.",
      controls: [
        {
          control_id: "feedwater-demand",
          label: "Feedwater Demand Target",
          action_id: "act_adjust_feedwater",
          min: 35,
          max: 95,
          step: 1,
          default_value: 82,
          unit_label: "% rated",
          apply_button_label: "Apply feedwater correction",
          reason_note: "Manual feedwater correction request from the baseline HMI.",
        },
      ],
    },
  },
  {
    definition: scnLossOfOffsitePowerSbo,
    runtime_profile_id: "loss_of_offsite_power_sbo",
    ui_control_schema: {
      title: "Manual Control Input",
      helper_text: "The bounded operator action for this scenario is isolation-condenser demand alignment.",
      controls: [
        {
          control_id: "isolation-condenser-demand",
          label: "Isolation Condenser Demand Target",
          action_id: "act_adjust_isolation_condenser",
          min: 0,
          max: 100,
          step: 1,
          default_value: 68,
          unit_label: "% rated",
          apply_button_label: "Apply IC alignment",
          reason_note: "Manual isolation-condenser alignment request from the bounded HMI.",
        },
      ],
    },
  },
  {
    definition: scnMainSteamIsolationUpset,
    runtime_profile_id: "main_steam_isolation_upset",
    ui_control_schema: {
      title: "Manual Control Input",
      helper_text:
        "The bounded operator action for this scenario is alternate heat-sink establishment through isolation-condenser demand alignment.",
      controls: [
        {
          control_id: "main-steam-isolation-ic-demand",
          label: "Isolation Condenser Demand Target",
          action_id: "act_adjust_isolation_condenser",
          min: 0,
          max: 100,
          step: 1,
          default_value: 72,
          unit_label: "% rated",
          apply_button_label: "Apply IC recovery alignment",
          reason_note: "Manual isolation-condenser recovery request for the bounded steam-isolation scenario.",
        },
      ],
    },
  },
];

export const scenarioCatalog = scenarioCatalogEntries.map((entry) => ({
  scenario_id: entry.definition.scenario_id,
  version: entry.definition.version,
  title: entry.definition.title,
  summary: entry.definition.summary,
  runtime_profile_id: entry.runtime_profile_id,
})) satisfies ScenarioCatalogSummary[];

export function getDefaultScenarioCatalogEntry(): ScenarioCatalogEntry {
  return scenarioCatalogEntries[0];
}

export function listScenarioCatalogEntries(): ScenarioCatalogEntry[] {
  return [...scenarioCatalogEntries];
}

export function resolveScenarioCatalogEntry(scenario_id?: string): ScenarioCatalogEntry {
  if (!scenario_id) {
    return getDefaultScenarioCatalogEntry();
  }

  const matched = scenarioCatalogEntries.find((entry) => entry.definition.scenario_id === scenario_id);
  return matched ?? getDefaultScenarioCatalogEntry();
}

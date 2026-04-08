import type {
  PendingActionConfirmation,
  PendingSupervisorOverride,
  ScenarioControlRangeSchema,
  SessionSnapshot,
} from "../contracts/aura";
import { getValidatorDemoPresets } from "../runtime/actionValidator";
import { buildPresentationPolicy } from "../runtime/presentationPolicy";
import { validationBadgeTone } from "./format";
import { MetricStrip, SectionShell, StatusPill, cx } from "./primitives";
import type { OperateWorkspaceModel } from "./viewModel";
import type { TutorialActionId } from "./tutorial";

type OperateWorkspaceProps = {
  snapshot: SessionSnapshot;
  model: OperateWorkspaceModel;
  controlValues: Record<string, number>;
  actionConfirmationPending: boolean;
  pendingConfirmation?: PendingActionConfirmation;
  pendingSupervisorOverride?: PendingSupervisorOverride;
  presentationPolicy: ReturnType<typeof buildPresentationPolicy>;
  onToggleCluster: (clusterId: string) => void;
  onRequestLaneAction: (actionId: string, recommendedValue?: number) => void;
  onChangeControlValue: (controlId: string, value: number) => void;
  onApplyControlAction: (control: ScenarioControlRangeSchema, value: number) => void;
  onTriggerValidationDemoPreset: (control: ScenarioControlRangeSchema, requestedValue: number, label: string) => void;
  onAcknowledgeTopAlarm: () => void;
  onConfirmPendingAction: () => void;
  onDismissPendingActionConfirmation: () => void;
  onRequestSupervisorOverrideReview: () => void;
  onOpenReview: () => void;
  isTutorialActionAllowed: (actionId: TutorialActionId) => boolean;
};

function EidMassBalanceOverlay(props: {
  feedwaterFlowPct: number;
  steamFlowPct: number;
  vesselLevelM: number;
}) {
  const { feedwaterFlowPct, steamFlowPct, vesselLevelM } = props;
  const netFlow = feedwaterFlowPct - steamFlowPct;
  const isLosingInventory = netFlow < -1;
  const tripSetpointLevel = 6.15;
  const marginToTrip = vesselLevelM - tripSetpointLevel;

  let projectedLimit = "Stable";
  if (isLosingInventory && marginToTrip > 0) {
    const rateOfDrop = Math.abs(netFlow) * 0.0031;
    const secondsToTrip = marginToTrip / rateOfDrop;
    if (secondsToTrip > 3600) {
      projectedLimit = "> 60m";
    } else {
      const min = Math.floor(secondsToTrip / 60);
      const sec = Math.floor(secondsToTrip % 60);
      projectedLimit = `${min}m ${sec}s`;
    }
  } else if (marginToTrip <= 0) {
    projectedLimit = "Tripped";
  } else if (netFlow > 1) {
    projectedLimit = "Recovering";
  }

  const fillPct = Math.max(0, Math.min(100, (marginToTrip / 2.05) * 100));

  return (
    <div className="eid-overlay" data-testid="eid-mass-balance-overlay">
      <div className="section-divider">
        <strong>Ecological constraints</strong>
        <span>Mass balance and trip margin stay visible while the storyline updates.</span>
      </div>
      <div className="eid-grid">
        <article className={cx("utility-card", isLosingInventory && "utility-card--alert")}>
          <span className="utility-card__label">Mass inventory balance</span>
          <strong>{netFlow > 0 ? "+" : ""}{netFlow.toFixed(1)}% net</strong>
          <p>In {feedwaterFlowPct.toFixed(1)}% | out {steamFlowPct.toFixed(1)}%</p>
        </article>
        <article className={cx("utility-card", marginToTrip < 0.25 && marginToTrip > 0 && "utility-card--alert")}>
          <span className="utility-card__label">Trip margin (level &lt; 6.15m)</span>
          <strong>{marginToTrip > 0 ? `${marginToTrip.toFixed(2)} m` : "0.00 m"}</strong>
          <p>Projected limit {projectedLimit}</p>
          <div className="eid-progress">
            <div
              className={cx("eid-progress__fill", isLosingInventory ? "eid-progress__fill--alert" : "eid-progress__fill--steady")}
              style={{ width: `${fillPct}%` }}
            />
          </div>
        </article>
      </div>
    </div>
  );
}

export function OperateWorkspace(props: OperateWorkspaceProps) {
  const {
    snapshot,
    model,
    controlValues,
    actionConfirmationPending,
    pendingConfirmation,
    pendingSupervisorOverride,
    presentationPolicy,
    onToggleCluster,
    onRequestLaneAction,
    onChangeControlValue,
    onApplyControlAction,
    onTriggerValidationDemoPreset,
    onAcknowledgeTopAlarm,
    onConfirmPendingAction,
    onDismissPendingActionConfirmation,
    onRequestSupervisorOverrideReview,
    onOpenReview,
    isTutorialActionAllowed,
  } = props;

  const lastValidation = snapshot.last_validation_result;
  const orderedSupportSections = presentationPolicy.support_section_order
    .map((sectionId) => model.supportSections.find((section) => section.id === sectionId))
    .filter((section): section is NonNullable<(typeof model.supportSections)[number]> => Boolean(section));
  const leadSupportSection = orderedSupportSections[0];
  const supportingSections = orderedSupportSections.slice(1);

  return (
    <main className="workspace-canvas" data-testid="operate-workspace" id="app-workspace">
      <div className="operate-grid">
        <SectionShell
          className="operate-summary"
          title="Operator Orientation"
          subtitle="The first screen should answer what is happening, what matters, and what to do next before anything else."
          data-testid="orientation-board"
          data-tutorial-target="orientation-board"
        >
          <div className="summary-triad">
            {model.orientationCards.map((card) => (
              <article key={card.id} className={cx("summary-card", `summary-card--${card.tone}`)}>
                <span className="summary-card__eyebrow">{card.eyebrow}</span>
                <strong className="summary-card__headline">{card.headline}</strong>
                <p className="summary-card__body">{card.body}</p>
                {card.meta ? <span className="summary-card__meta">{card.meta}</span> : null}
              </article>
            ))}
          </div>
        </SectionShell>

        <SectionShell
          className="operate-situation"
          title="Situation Board"
          subtitle="Plant mimic, critical variables, and state ribbon stay continuously visible."
          data-tutorial-target="situation-board"
        >
          <div className="mimic-row">
            <div className="mimic-node">
              <span>Reactor</span>
              <strong>{Number(snapshot.plant_tick.plant_state.reactor_power_pct).toFixed(0)}% rated</strong>
            </div>
            <div className="mimic-link" />
            <div className="mimic-node">
              <span>Vessel level</span>
              <strong>{Number(snapshot.plant_tick.plant_state.vessel_water_level_m).toFixed(2)} m</strong>
            </div>
            <div className="mimic-link" />
            <div className="mimic-node">
              <span>Steam path</span>
              <strong>{Number(snapshot.plant_tick.plant_state.main_steam_flow_pct).toFixed(0)}% rated</strong>
            </div>
            <div className="mimic-link" />
            <div className="mimic-node">
              <span>Turbine / generator</span>
              <strong>{Number(snapshot.plant_tick.plant_state.turbine_output_mwe).toFixed(0)} MW_e</strong>
            </div>
            <div className="mimic-link" />
            <div className="mimic-node">
              <span>Condenser</span>
              <strong>{snapshot.plant_tick.plant_state.condenser_heat_sink_available ? "Available" : "Lost"}</strong>
            </div>
          </div>

          <MetricStrip items={model.criticalMetrics} />

          <div className="state-ribbon">
            {model.situationRibbon.map((chip) => (
              <StatusPill key={chip.label} tone={chip.tone}>
                {chip.label}
              </StatusPill>
            ))}
          </div>

          {snapshot.runtime_profile_id === "feedwater_degradation" ? (
            <EidMassBalanceOverlay
              feedwaterFlowPct={Number(snapshot.plant_tick.plant_state.feedwater_flow_pct)}
              steamFlowPct={Number(snapshot.plant_tick.plant_state.main_steam_flow_pct)}
              vesselLevelM={Number(snapshot.plant_tick.plant_state.vessel_water_level_m)}
            />
          ) : null}
        </SectionShell>

        <SectionShell
          className="operate-alarm"
          title="Alarm Board"
          subtitle="Pinned critical alarms stay in view. Grouped clusters keep raw flood detail behind expansion."
          data-tutorial-target="alarm-board"
        >
          <MetricStrip items={model.alarmMetrics} className="metric-strip--compact" />

          <div className="critical-strip">
            <div className="section-divider">
              <strong>Pinned critical alarms</strong>
              <span>{model.pinnedAlarms.length}</span>
            </div>
            <p className="section-shell__subtitle">{snapshot.support_policy.critical_visibility.summary}</p>
            <div className="pill-row">
              {model.pinnedAlarms.length > 0 ? (
                model.pinnedAlarms.map((alarm) => (
                  <StatusPill key={alarm.id} tone={alarm.tone} data-testid="critical-alarm-chip">
                    {alarm.label}
                  </StatusPill>
                ))
              ) : (
                <StatusPill tone="ok">No active P1/P2 or always-visible alarms</StatusPill>
              )}
            </div>
          </div>

          <div className="alarm-cluster-list">
            {model.clusters.length === 0 ? (
              <p className="section-shell__subtitle">No active alarm clusters yet.</p>
            ) : (
              model.clusters.map((cluster) => (
                <article key={cluster.id} className={cx("alarm-cluster", `alarm-cluster--${cluster.priorityTone}`)}>
                  <div className="section-divider">
                    <strong>{cluster.title}</strong>
                    <StatusPill tone={cluster.priorityTone}>{cluster.priorityLabel}</StatusPill>
                  </div>
                  <p>{cluster.summary}</p>
                  <div className="pill-row">
                    <StatusPill tone="neutral">{cluster.groupedCount} related alarms</StatusPill>
                    <StatusPill tone={cluster.criticalCount > 0 ? "alert" : "ok"}>
                      {cluster.criticalCount} critical visible
                    </StatusPill>
                    {cluster.primaryLabels.map((label) => (
                      <StatusPill key={label} tone={cluster.priorityTone}>
                        {label}
                      </StatusPill>
                    ))}
                  </div>
                  <button
                    type="button"
                    className="ghost-button"
                    disabled={!isTutorialActionAllowed("alarm:inspect-cluster")}
                    onClick={() => onToggleCluster(cluster.id)}
                  >
                    {cluster.expanded ? "Hide raw alarms" : "Inspect raw alarms"}
                  </button>
                  {cluster.expanded ? (
                    <div className="alarm-raw-list">
                      {cluster.alarms.map((alarm) => (
                        <article key={alarm.id} className={cx("alarm-raw-item", alarm.active ? "is-active" : "is-inactive")}>
                          <div className="section-divider">
                            <strong>{alarm.title}</strong>
                            <StatusPill tone={alarm.priorityTone}>{alarm.priorityLabel}</StatusPill>
                          </div>
                          <p>
                            {alarm.subsystemTag} | {alarm.visibilityLabel}
                          </p>
                        </article>
                      ))}
                    </div>
                  ) : null}
                </article>
              ))
            )}
          </div>
        </SectionShell>

        <SectionShell
          className={cx("operate-actions", `operate-actions--${presentationPolicy.validator_priority}`)}
          title="Next Actions"
          subtitle="The first-response lane is the primary action surface. Manual intervention is intentionally secondary."
          data-tutorial-target="next-actions"
          actions={
            <button
              type="button"
              className="ghost-button"
              disabled={!isTutorialActionAllowed("workspace:review")}
              onClick={onOpenReview}
            >
              Open Review workspace
            </button>
          }
        >
          <p className="section-shell__subtitle">{snapshot.first_response_lane.prototype_notice}</p>
          <article
            className={cx(
              "assistance-cue",
              `assistance-cue--${model.assistanceCue.tone}`,
              `assistance-cue--${presentationPolicy.validator_priority}`,
            )}
            data-testid="assistance-posture-cue"
          >
            <div className="section-divider">
              <div>
                <span className="utility-card__label">{model.assistanceCue.eyebrow}</span>
                <strong>{model.assistanceCue.headline}</strong>
              </div>
            </div>
            <p>{model.assistanceCue.body}</p>
            <div className="pill-row">
              {model.assistanceCue.pills.map((pill) => (
                <StatusPill key={pill.label} tone={pill.tone}>
                  {pill.label}
                </StatusPill>
              ))}
            </div>
          </article>

          <div className="lane-guidance-grid">
            {model.laneGuidanceCards.map((card) => (
              <article key={card.id} className={cx("lane-guidance-card", `lane-guidance-card--${card.tone}`)}>
                <span className="utility-card__label">{card.label}</span>
                <strong>{card.headline}</strong>
                <p>{card.body}</p>
              </article>
            ))}
          </div>

          <div className="pill-row">
            {model.laneBadges.map((badge) => (
              <StatusPill key={badge.label} tone={badge.tone}>
                {badge.label}
              </StatusPill>
            ))}
          </div>
          <p className="lane-mode-note">{snapshot.support_policy.support_behavior_changes.join(" ")}</p>

          <div className={cx("lane-list", presentationPolicy.support_panel_mode_class)}>
            {model.laneItems.map((item) => (
              <article key={item.id} className={cx("lane-item", item.emphasis && "lane-item--emphasized")}>
                <div className="section-divider">
                  <div>
                    <strong>{item.label}</strong>
                    <p>{item.kind}</p>
                  </div>
                  <div className="pill-row">
                    {item.badges.map((badge) => (
                      <StatusPill key={`${item.id}-${badge.label}`} tone={badge.tone}>
                        {badge.label}
                      </StatusPill>
                    ))}
                  </div>
                </div>
                <p>{item.why}</p>
                {item.whyNow ? <p className="lane-why-now">{item.whyNow}</p> : null}
                {item.cautions.map((caution) => (
                  <p key={caution} className="lane-caution">
                    {caution}
                  </p>
                ))}
                <p className="lane-meta">{item.completionHint}</p>
                {item.signals ? <p className="lane-meta">Signals: {item.signals}</p> : null}
                {item.actionId && item.actionLabel ? (
                  <button
                    type="button"
                    className="lane-action-button"
                    disabled={actionConfirmationPending || !isTutorialActionAllowed("actions:lane-primary")}
                    onClick={() => onRequestLaneAction(item.actionId!, item.actionValue)}
                  >
                    {item.actionLabel}
                    {item.actionValueLabel ? ` (${item.actionValueLabel})` : ""}
                  </button>
                ) : null}
              </article>
            ))}
          </div>

          {pendingConfirmation ? (
            <div
              className={cx("validation-banner", presentationPolicy.validation_mode_class)}
              data-testid="pending-validation-banner"
              data-tutorial-target="validation-banner"
              aria-live="polite"
            >
              <div className="section-divider">
                <strong>Soft warning confirmation required</strong>
                <span>{pendingConfirmation.action_request.action_id}</span>
              </div>
              <p className="lane-mode-note">{presentationPolicy.pending_confirmation_intro}</p>
              <p>{pendingConfirmation.validation_result.explanation}</p>
              <p className="lane-why-now">{pendingConfirmation.validation_result.risk_context}</p>
              <p className="lane-caution">{pendingConfirmation.validation_result.confidence_note}</p>
              {pendingConfirmation.validation_result.recommended_safe_alternative ? (
                <p className="lane-meta">
                  Safer direction: {pendingConfirmation.validation_result.recommended_safe_alternative}
                </p>
              ) : null}
              <div className="utility-action-row">
                <button type="button" disabled={!isTutorialActionAllowed("actions:confirm-pending")} onClick={onConfirmPendingAction}>
                  Confirm and apply action
                </button>
                <button
                  type="button"
                  className="ghost-button"
                  disabled={!isTutorialActionAllowed("actions:dismiss-pending")}
                  onClick={onDismissPendingActionConfirmation}
                >
                  Cancel warning
                </button>
              </div>
            </div>
          ) : null}

          {lastValidation && presentationPolicy.validator_should_surface ? (
            <div
              className={cx("validation-banner", presentationPolicy.validation_mode_class)}
              data-tutorial-target="validation-banner"
              aria-live="polite"
            >
              <div className="section-divider">
                <strong>Last action validation</strong>
                <StatusPill tone={validationBadgeTone(lastValidation.outcome)}>{lastValidation.outcome}</StatusPill>
              </div>
              <p className="lane-mode-note">{presentationPolicy.validator_mode_summary}</p>
              <p>{lastValidation.explanation}</p>
              <p className="lane-meta">Reason code {lastValidation.reason_code}</p>
              <p className="lane-why-now">{lastValidation.risk_context}</p>
              {lastValidation.recommended_safe_alternative ? (
                <p className="lane-meta">Safer direction: {lastValidation.recommended_safe_alternative}</p>
              ) : null}
              <p className="lane-caution">{lastValidation.confidence_note}</p>
              <div className="pill-row">
                <StatusPill tone={lastValidation.requires_confirmation ? "neutral" : "ok"}>
                  {lastValidation.requires_confirmation ? "Confirmation required" : "No confirmation required"}
                </StatusPill>
                <StatusPill tone={lastValidation.prevented_harm ? "alert" : "neutral"}>
                  {lastValidation.prevented_harm ? "Prevented-harm signal yes" : "Prevented-harm signal no"}
                </StatusPill>
                {lastValidation.override_allowed ? <StatusPill tone="neutral">Supervisor review eligible</StatusPill> : null}
              </div>
              {lastValidation.outcome === "hard_prevent" && lastValidation.override_allowed ? (
                <div className="utility-action-row">
                  {pendingSupervisorOverride?.request_status === "requested" ? (
                    <p className="section-shell__subtitle">{presentationPolicy.supervisor_override_summary}</p>
                  ) : (
                    <button type="button" className="ghost-button" onClick={onRequestSupervisorOverrideReview}>
                      Request Demo/Research Supervisor Override
                    </button>
                  )}
                  <button
                    type="button"
                    className="ghost-button"
                    disabled={!isTutorialActionAllowed("workspace:review")}
                    onClick={onOpenReview}
                  >
                    Open Review workspace
                  </button>
                </div>
              ) : null}
            </div>
          ) : null}

          <div className="manual-utility" data-tutorial-target="manual-utility">
            <div className="section-divider">
              <div>
                <strong>Manual intervention</strong>
                <p>{snapshot.manual_control_schema.helper_text}</p>
              </div>
              <StatusPill tone="neutral">Utility controls only</StatusPill>
            </div>

            {snapshot.manual_control_schema.controls.map((control) => {
              const controlValue = controlValues[control.control_id] ?? control.default_value;
              const presets = getValidatorDemoPresets(snapshot.runtime_profile_id, control.action_id);

              return (
                <article key={control.control_id} className="manual-control">
                  <label htmlFor={control.control_id}>{control.label}</label>
                  <input
                    id={control.control_id}
                    name={control.control_id}
                    type="range"
                    min={control.min}
                    max={control.max}
                    step={control.step}
                    value={controlValue}
                    disabled={!isTutorialActionAllowed("actions:manual-apply") && !isTutorialActionAllowed("actions:demo-preset")}
                    onChange={(event) => onChangeControlValue(control.control_id, Number(event.target.value))}
                  />
                  <div className="utility-action-row">
                    <strong>
                      {controlValue}
                      {control.unit_label ? ` ${control.unit_label}` : ""}
                    </strong>
                    <button
                      type="button"
                      disabled={actionConfirmationPending || !isTutorialActionAllowed("actions:manual-apply")}
                      onClick={() => onApplyControlAction(control, controlValue)}
                    >
                      {control.apply_button_label}
                    </button>
                  </div>
                  {presets.length > 0 ? (
                    <div className="preset-strip">
                      <span className="utility-card__label">Validator demo presets</span>
                      <div className="pill-row">
                        {presets.map((preset) => (
                          <button
                            key={preset.preset_id}
                            type="button"
                            className="ghost-button"
                            disabled={actionConfirmationPending || !isTutorialActionAllowed("actions:demo-preset")}
                            onClick={() => onTriggerValidationDemoPreset(control, preset.requested_value, preset.label)}
                          >
                            {preset.label}
                          </button>
                        ))}
                      </div>
                    </div>
                  ) : null}
                </article>
              );
            })}

            <div className="utility-action-row">
              <button
                type="button"
                disabled={actionConfirmationPending || !isTutorialActionAllowed("actions:ack-top-alarm")}
                onClick={onAcknowledgeTopAlarm}
              >
                Acknowledge top alarm
              </button>
              <button
                type="button"
                className="ghost-button"
                disabled={!isTutorialActionAllowed("workspace:review")}
                onClick={onOpenReview}
              >
                Need deeper oversight? Review
              </button>
            </div>
          </div>
        </SectionShell>

        <SectionShell
          className={cx("operate-support", presentationPolicy.support_panel_mode_class)}
          title="Support Posture"
          subtitle="Active posture, recommendation, guardrails, and operator-control cues stay legible without hiding the rest of the shell."
          data-tutorial-target="support-posture"
        >
          <MetricStrip items={model.supportMetrics} className="metric-strip--compact" />

          <div className="pill-row">
            {model.supportPills.map((badge) => (
              <StatusPill key={badge.label} tone={badge.tone}>
                {badge.label}
              </StatusPill>
            ))}
          </div>

          <div className="support-layout">
            {leadSupportSection ? (
              <article
                className={cx(
                  "support-section-card",
                  "support-section-card--lead",
                  `support-section-card--${leadSupportSection.tone}`,
                )}
              >
                <span className="utility-card__label">{leadSupportSection.label}</span>
                <strong>{leadSupportSection.headline}</strong>
                <p>{leadSupportSection.body}</p>
                {leadSupportSection.meta ? <p className="lane-meta">{leadSupportSection.meta}</p> : null}
                {leadSupportSection.pills && leadSupportSection.pills.length > 0 ? (
                  <div className="pill-row">
                    {leadSupportSection.pills.map((pill) => (
                      <StatusPill key={`${leadSupportSection.id}-${pill.label}`} tone={pill.tone}>
                        {pill.label}
                      </StatusPill>
                    ))}
                  </div>
                ) : null}
              </article>
            ) : null}

            <div className="support-section-grid">
              {supportingSections.map((section) => (
                <article key={section.id} className={cx("support-section-card", `support-section-card--${section.tone}`)}>
                  <span className="utility-card__label">{section.label}</span>
                  <strong>{section.headline}</strong>
                  <p>{section.body}</p>
                  {section.meta ? <p className="lane-meta">{section.meta}</p> : null}
                  {section.pills && section.pills.length > 0 ? (
                    <div className="pill-row">
                      {section.pills.map((pill) => (
                        <StatusPill key={`${section.id}-${pill.label}`} tone={pill.tone}>
                          {pill.label}
                        </StatusPill>
                      ))}
                    </div>
                  ) : null}
                </article>
              ))}
            </div>
          </div>

          <div className="section-divider">
            <strong>Top posture drivers</strong>
            <span>{snapshot.combined_risk.combined_risk_band} risk band</span>
          </div>
          <div className="factor-list">
            {model.topFactors.map((factor) => (
              <article key={factor.id} className="factor-card">
                <div className="section-divider">
                  <strong>{factor.label}</strong>
                  <span>{factor.contribution}</span>
                </div>
                <p>{factor.detail}</p>
              </article>
            ))}
          </div>
        </SectionShell>

        <SectionShell
          className="operate-storyline"
          title="Storyline Board"
          subtitle="One dominant explanation sits up front. Secondary hypotheses stay compressed until needed."
          data-tutorial-target="storyline-board"
        >
          <article className="storyline-primary">
            <div className="section-divider">
              <div>
                <strong>{model.dominantHypothesis.title}</strong>
                <p>{model.dominantHypothesis.confidence}</p>
              </div>
              <div className="pill-row">
                {model.dominantHypothesis.chips.map((chip) => (
                  <StatusPill key={chip.label} tone={chip.tone}>
                    {chip.label}
                  </StatusPill>
                ))}
              </div>
            </div>
            <p>{model.dominantHypothesis.summary}</p>
            <div className="storyline-context-grid">
              {model.dominantHypothesis.supportContext.map((context) => (
                <article key={context.label} className="utility-card">
                  <span className="utility-card__label">{context.label}</span>
                  <p>{context.body}</p>
                </article>
              ))}
            </div>
            <div className="evidence-grid">
              {model.dominantHypothesis.evidence.map((evidence) => (
                <article key={evidence.id} className="evidence-card">
                  <strong>{evidence.label}</strong>
                  <p>{evidence.detail}</p>
                </article>
              ))}
            </div>
          </article>

          <div className="secondary-storyline-list">
            {model.secondaryHypotheses.map((hypothesis) => (
              <details key={hypothesis.id} className="secondary-hypothesis">
                <summary>
                  <span>{hypothesis.title}</span>
                  <strong>{hypothesis.score}</strong>
                </summary>
                <p>{hypothesis.summary}</p>
                <p className="lane-meta">Watch {hypothesis.watchSignals}</p>
              </details>
            ))}
          </div>
        </SectionShell>
      </div>

      <div className="workspace-hint">
        <StatusPill tone="neutral">{model.reviewHint}</StatusPill>
      </div>
    </main>
  );
}

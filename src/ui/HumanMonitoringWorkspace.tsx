import type { MetricItemModel } from "./primitives";
import { EmptyState, MetricStrip, SectionShell, StatusPill } from "./primitives";
import type { WebcamMonitoringController } from "./useWebcamMonitoring";
import type { HumanMonitoringWorkspaceModel } from "./viewModel";

type HumanMonitoringWorkspaceProps = {
  model: HumanMonitoringWorkspaceModel;
  webcamMonitoring: WebcamMonitoringController;
};

function MonitoringMetricGrid(props: { items: MetricItemModel[]; className?: string }) {
  return <MetricStrip items={props.items} className={props.className} />;
}

export function HumanMonitoringWorkspace(props: HumanMonitoringWorkspaceProps) {
  const { model, webcamMonitoring } = props;

  return (
    <main className="workspace-canvas" data-testid="human-monitoring-workspace" id="app-workspace">
      <div className="monitoring-grid">
        <SectionShell
          className="monitoring-summary"
          title="Human Monitoring 2.0"
          subtitle="Inspectable monitoring surface showing source status, extracted features, fused interpretation, final operator-state outputs, and downstream support meaning."
          data-testid="monitoring-summary"
          data-tutorial-target="monitoring-summary"
        >
          <MonitoringMetricGrid items={model.summaryMetrics} className="metric-strip--compact" />
          <div className="pill-row">
            {model.summaryPills.map((pill) => (
              <StatusPill key={pill.label} tone={pill.tone}>
                {pill.label}
              </StatusPill>
            ))}
          </div>
          <div className="monitoring-card monitoring-card--summary">
            <strong>{model.summaryHeadline}</strong>
            <p>{model.summaryBody}</p>
          </div>
          <div className="monitoring-card">
            <span className="utility-card__label">Current Operate behavior this explains</span>
            <p>{model.operateCrossReference}</p>
          </div>
        </SectionShell>

        <SectionShell
          className="monitoring-sources"
          title="Source Status"
          subtitle="What source adapters are connected, how fresh they are, whether they are degraded, and whether the system is falling back."
          data-testid="monitoring-source-status"
          data-tutorial-target="monitoring-source-status"
        >
          <div className="monitoring-card-grid">
            {model.sourceCards.map((source) => (
              <article key={source.id} className={`monitoring-card monitoring-card--${source.tone}`}>
                <div className="section-divider">
                  <strong>{source.title}</strong>
                  <div className="pill-row">
                    {source.pills.map((pill) => (
                      <StatusPill key={pill.label} tone={pill.tone}>
                        {pill.label}
                      </StatusPill>
                    ))}
                  </div>
                </div>
                <MonitoringMetricGrid items={source.metrics} className="metric-strip--compact" />
                <p>{source.summary}</p>
                <p className="section-shell__subtitle">{source.detail}</p>
              </article>
            ))}
          </div>
        </SectionShell>

        <SectionShell
          className="monitoring-webcam"
          title="Webcam / CV Observability"
          subtitle="Bounded local visual preview plus the exact CV lifecycle and sample window the monitoring pipeline is using."
          data-testid="monitoring-webcam"
          data-tutorial-target="monitoring-webcam"
          actions={
            <button type="button" className="ghost-button" disabled={webcamMonitoring.disabled} onClick={webcamMonitoring.toggle}>
              {webcamMonitoring.buttonLabel}
            </button>
          }
        >
          <div className="section-divider">
            <div className="monitoring-preview-shell">
              <div className="monitoring-preview-frame">
                <video ref={webcamMonitoring.previewRef} className="monitoring-preview-video" autoPlay muted playsInline />
              </div>
              <p className="section-shell__subtitle">
                {webcamMonitoring.statusDetail}
              </p>
            </div>
            <div className="monitoring-preview-sidebar">
              <div className="pill-row">
                <StatusPill tone={webcamMonitoring.statusTone}>{webcamMonitoring.statusLabel}</StatusPill>
                {model.webcam.statusPills.map((pill) => (
                  <StatusPill key={pill.label} tone={pill.tone}>
                    {pill.label}
                  </StatusPill>
                ))}
              </div>
              <MonitoringMetricGrid items={model.webcam.metrics} className="metric-strip--compact" />
              <p>{model.webcam.summary}</p>
              <p className="section-shell__subtitle">{model.webcam.detail}</p>
            </div>
          </div>
          {model.webcam.observationCards.length > 0 ? (
            <div className="monitoring-card-grid">
              {model.webcam.observationCards.map((observation) => (
                <article key={observation.id} className="monitoring-card">
                  <strong>{observation.title}</strong>
                  <MonitoringMetricGrid items={observation.metrics} className="metric-strip--compact" />
                  <p>{observation.detail}</p>
                </article>
              ))}
            </div>
          ) : (
            <EmptyState
              title="No bounded CV samples yet"
              body="Enable webcam monitoring to populate the bounded preview window and the recent CV observation list."
            />
          )}
        </SectionShell>

        <SectionShell
          className="monitoring-telemetry"
          title="Interaction Telemetry Observability"
          subtitle="Recent real UI interactions the subsystem is watching: workspace switches, control adjustments, runtime controls, and action flow."
          data-testid="monitoring-telemetry"
        >
          <div className="pill-row">
            {model.interactionTelemetry.statusPills.map((pill) => (
              <StatusPill key={pill.label} tone={pill.tone}>
                {pill.label}
              </StatusPill>
            ))}
          </div>
          <MonitoringMetricGrid items={model.interactionTelemetry.metrics} className="metric-strip--compact" />
          <p>{model.interactionTelemetry.summary}</p>
          <p className="section-shell__subtitle">{model.interactionTelemetry.detail}</p>
          {model.interactionTelemetry.recordCards.length > 0 ? (
            <div className="monitoring-card-grid">
              {model.interactionTelemetry.recordCards.map((record) => (
                <article key={record.id} className="monitoring-card">
                  <div className="section-divider">
                    <strong>{record.title}</strong>
                    <div className="pill-row">
                      {record.pills.map((pill) => (
                        <StatusPill key={`${record.id}-${pill.label}`} tone={pill.tone}>
                          {pill.label}
                        </StatusPill>
                      ))}
                    </div>
                  </div>
                  <p>{record.detail}</p>
                </article>
              ))}
            </div>
          ) : (
            <EmptyState
              title="No recent interaction records"
              body="Interaction telemetry becomes visible here as the live runtime is used."
            />
          )}
        </SectionShell>

        <SectionShell
          className="monitoring-features"
          title="Extracted Features"
          subtitle="Per-source bounded features and risk cues being derived before fusion."
          data-testid="monitoring-extracted-features"
          data-tutorial-target="monitoring-extracted-features"
        >
          {model.extractedFeatures.length > 0 ? (
            <div className="monitoring-card-grid">
              {model.extractedFeatures.map((feature) => (
                <article key={feature.id} className={`monitoring-card monitoring-card--${feature.tone}`}>
                  <strong>{feature.title}</strong>
                  <MonitoringMetricGrid items={feature.metrics} className="metric-strip--compact" />
                  <p>{feature.summary}</p>
                  <div className="monitoring-kv-grid">
                    {feature.riskCues.map((cue) => (
                      <div key={`${feature.id}-${cue.label}`} className="monitoring-kv">
                        <span>{cue.label}</span>
                        <strong>{cue.value}</strong>
                      </div>
                    ))}
                  </div>
                  <p className="section-shell__subtitle">{feature.note}</p>
                </article>
              ))}
            </div>
          ) : (
            <EmptyState
              title="No source features published yet"
              body="The per-source feature panels will populate once the live adapters publish their latest bounded interpretation windows."
            />
          )}
        </SectionShell>

        <SectionShell
          className="monitoring-fused"
          title="Fused Interpretation Input"
          subtitle="The cross-source interpretation that feeds the final operator-state output."
          data-testid="monitoring-fused-interpretation"
          data-tutorial-target="monitoring-fused-interpretation"
        >
          {model.fusedInterpretation ? (
            <>
              <div className="pill-row">
                {model.fusedInterpretation.pills.map((pill) => (
                  <StatusPill key={pill.label} tone={pill.tone}>
                    {pill.label}
                  </StatusPill>
                ))}
              </div>
              <MonitoringMetricGrid items={model.fusedInterpretation.metrics} className="metric-strip--compact" />
              <p>{model.fusedInterpretation.summary}</p>
              <p className="section-shell__subtitle">{model.fusedInterpretation.detail}</p>
              <div className="monitoring-kv-grid">
                {model.fusedInterpretation.riskCues.map((cue) => (
                  <div key={cue.label} className="monitoring-kv">
                    <span>{cue.label}</span>
                    <strong>{cue.value}</strong>
                  </div>
                ))}
              </div>
            </>
          ) : (
            <EmptyState
              title="No fused interpretation yet"
              body="The subsystem is not yet publishing a fused interpretation input from the current source window."
            />
          )}
        </SectionShell>

        <SectionShell
          className="monitoring-output"
          title="Final Output State"
          subtitle="The operator-state output actually published by the subsystem after the fused interpretation step."
          data-testid="monitoring-final-output"
        >
          <div className="pill-row">
            {model.finalOutput.pills.map((pill) => (
              <StatusPill key={pill.label} tone={pill.tone}>
                {pill.label}
              </StatusPill>
            ))}
          </div>
          <MonitoringMetricGrid items={model.finalOutput.metrics} className="metric-strip--compact" />
          <p>{model.finalOutput.summary}</p>
          <p className="section-shell__subtitle">{model.finalOutput.detail}</p>
        </SectionShell>

        <SectionShell
          className="monitoring-impact"
          title="Advisory Meaning / System Impact"
          subtitle="How the published monitoring output would influence combined risk, support posture, and operator-facing adaptation."
          data-testid="monitoring-system-impact"
          data-tutorial-target="monitoring-system-impact"
        >
          <div className="pill-row">
            {model.downstreamImpact.pills.map((pill) => (
              <StatusPill key={pill.label} tone={pill.tone}>
                {pill.label}
              </StatusPill>
            ))}
          </div>
          <MonitoringMetricGrid items={model.downstreamImpact.metrics} className="metric-strip--compact" />
          <p>{model.downstreamImpact.summary}</p>
          <p className="section-shell__subtitle">{model.downstreamImpact.detail}</p>
          <div className="monitoring-card-grid">
            {model.downstreamImpact.implications.map((implication) => (
              <article key={implication.label} className="monitoring-card">
                <strong>{implication.label}</strong>
                <p>{implication.body}</p>
              </article>
            ))}
          </div>
          <div className="monitoring-card-grid">
            {model.downstreamImpact.factors.map((factor) => (
              <article key={factor.id} className="monitoring-card">
                <strong>{factor.label}</strong>
                <p>{factor.detail}</p>
              </article>
            ))}
          </div>
        </SectionShell>
      </div>
    </main>
  );
}

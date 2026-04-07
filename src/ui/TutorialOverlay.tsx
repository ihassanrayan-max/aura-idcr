import { useEffect, useLayoutEffect, useMemo, useState } from "react";
import { StatusPill } from "./primitives";
import type { TutorialFlow, TutorialPathId, TutorialStep, TutorialTargetId } from "./tutorial";

type RectState = {
  top: number;
  left: number;
  width: number;
  height: number;
};

type SpotlightState = {
  rect?: RectState;
  targetFound: boolean;
};

type TutorialOverlayProps = {
  mode: "menu" | "running";
  flow?: TutorialFlow;
  step?: TutorialStep;
  stepIndex?: number;
  targetId?: TutorialTargetId;
  canAdvance: boolean;
  isTaskComplete: boolean;
  lockedActionCount?: number;
  onBack: () => void;
  onNext: () => void;
  onSkip: () => void;
  onStartPath: (pathId: TutorialPathId) => void;
  onPanelAction?: () => void;
};

function useSpotlightRect(targetId?: TutorialTargetId): SpotlightState {
  const [state, setState] = useState<SpotlightState>({ targetFound: false });

  useLayoutEffect(() => {
    if (!targetId) {
      setState({ targetFound: false });
      return undefined;
    }

    function updateRect() {
      const element = document.querySelector<HTMLElement>(`[data-tutorial-target="${targetId}"]`);
      if (!element) {
        setState({ targetFound: false });
        return;
      }

      const bounds = element.getBoundingClientRect();
      const margin = 10;
      setState({
        targetFound: true,
        rect: {
          top: Math.max(0, bounds.top - margin),
          left: Math.max(0, bounds.left - margin),
          width: bounds.width + margin * 2,
          height: bounds.height + margin * 2,
        },
      });
    }

    updateRect();

    window.addEventListener("resize", updateRect);
    window.addEventListener("scroll", updateRect, true);
    return () => {
      window.removeEventListener("resize", updateRect);
      window.removeEventListener("scroll", updateRect, true);
    };
  }, [targetId]);

  return state;
}

function TutorialMenu(props: Pick<TutorialOverlayProps, "onSkip" | "onStartPath">) {
  const { onSkip, onStartPath } = props;

  const cards = useMemo(
    () => [
      {
        id: "full" as const,
        title: "Full guided walkthrough",
        body: "Resets to the intro feedwater scenario, slows the runtime down, and teaches Operate and Review as one end-to-end decision-support flow.",
      },
      {
        id: "operate" as const,
        title: "Operate workspace tour",
        body: "Focuses on the live operator flow: situation, alarms, storyline, support posture, validator behavior, and first-response actions.",
      },
      {
        id: "review" as const,
        title: "Review workspace tour",
        body: "Focuses on oversight, after-action review, comparison, and export without restarting the current session state.",
      },
    ],
    [],
  );

  return (
    <div className="tutorial-overlay tutorial-overlay--menu" aria-live="polite" data-testid="tutorial-menu">
      <div className="tutorial-overlay__backdrop" />
      <section className="tutorial-panel tutorial-panel--menu" aria-label="Tutorial launcher">
        <div className="tutorial-panel__header">
          <div>
            <p className="eyebrow">Built-in tutorial</p>
            <h2>Learn AURA-IDCR as a control-room support system</h2>
          </div>
          <StatusPill tone="neutral">Runtime paused for onboarding</StatusPill>
        </div>

        <p className="tutorial-panel__summary">
          This walkthrough teaches the product as a serious digital-twin-based decision-support prototype: what the
          twin shows, how grouped alarms and storyline work together, how first-response guidance and validation
          behave, and how Review turns runs into evidence.
        </p>

        <div className="tutorial-menu-grid">
          {cards.map((card) => (
            <article key={card.id} className="tutorial-choice-card">
              <div className="section-divider">
                <strong>{card.title}</strong>
              </div>
              <p>{card.body}</p>
              <button type="button" aria-label={`Start ${card.title}`} onClick={() => onStartPath(card.id)}>
                Start
              </button>
            </article>
          ))}
        </div>

        <div className="tutorial-panel__footer">
          <p>You can skip for now and reopen the tutorial later from the command bar.</p>
          <button type="button" className="ghost-button" onClick={onSkip}>
            Skip for now
          </button>
        </div>
      </section>
    </div>
  );
}

export function TutorialOverlay(props: TutorialOverlayProps) {
  const {
    mode,
    flow,
    step,
    stepIndex,
    targetId,
    canAdvance,
    isTaskComplete,
    lockedActionCount = 0,
    onBack,
    onNext,
    onSkip,
    onStartPath,
    onPanelAction,
  } =
    props;
  const spotlightState = useSpotlightRect(targetId);
  const spotlightRect = spotlightState.rect;

  useEffect(() => {
    if (!targetId) {
      return;
    }

    const element = document.querySelector<HTMLElement>(`[data-tutorial-target="${targetId}"]`);
    if (!element) {
      return;
    }

    const reduceMotion =
      typeof window.matchMedia === "function" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    element.scrollIntoView({
      behavior: reduceMotion ? "auto" : "smooth",
      block: "center",
      inline: "nearest",
    });

    const hadTabIndex = element.hasAttribute("tabindex");
    if (!hadTabIndex) {
      element.setAttribute("tabindex", "-1");
    }

    element.focus({ preventScroll: true });

    return () => {
      if (!hadTabIndex) {
        element.removeAttribute("tabindex");
      }
    };
  }, [targetId]);

  if (mode === "menu") {
    return <TutorialMenu onSkip={onSkip} onStartPath={onStartPath} />;
  }

  if (!flow || !step || stepIndex === undefined) {
    return null;
  }

  const progressPct = ((stepIndex + 1) / flow.steps.length) * 100;

  return (
    <div className="tutorial-overlay" aria-live="polite">
      {spotlightRect ? (
        <>
          <div className="tutorial-scrim tutorial-scrim--top" style={{ height: spotlightRect.top }} />
          <div
            className="tutorial-scrim tutorial-scrim--left"
            style={{ top: spotlightRect.top, width: spotlightRect.left, height: spotlightRect.height }}
          />
          <div
            className="tutorial-scrim tutorial-scrim--right"
            style={{
              top: spotlightRect.top,
              left: spotlightRect.left + spotlightRect.width,
              height: spotlightRect.height,
            }}
          />
          <div
            className="tutorial-scrim tutorial-scrim--bottom"
            style={{ top: spotlightRect.top + spotlightRect.height }}
          />
          <div
            className="tutorial-spotlight"
            data-testid="tutorial-spotlight"
            style={{
              top: spotlightRect.top,
              left: spotlightRect.left,
              width: spotlightRect.width,
              height: spotlightRect.height,
            }}
          />
        </>
      ) : (
        <div className="tutorial-overlay__backdrop" />
      )}

      <aside className="tutorial-panel" aria-label="Tutorial step">
        <div className="tutorial-panel__header">
          <div>
            <p className="eyebrow">{flow.label}</p>
            <h2>{step.title}</h2>
          </div>
          <div className="tutorial-panel__status-row">
            <StatusPill tone={step.taskPrompt ? (isTaskComplete ? "ok" : "neutral") : "neutral"}>
              Step {stepIndex + 1} of {flow.steps.length}
            </StatusPill>
            {lockedActionCount > 0 ? (
              <StatusPill tone={isTaskComplete ? "ok" : "neutral"}>
                {isTaskComplete ? "Action gate cleared" : "Guided action gate active"}
              </StatusPill>
            ) : null}
          </div>
        </div>

        <div className="tutorial-progress" aria-hidden="true" data-testid="tutorial-progress">
          <div className="tutorial-progress__fill" data-testid="tutorial-progress-fill" style={{ width: `${progressPct}%` }} />
        </div>

        <p className="tutorial-panel__summary">{step.summary}</p>

        {targetId && !spotlightState.targetFound ? (
          <div className="tutorial-target-note">
            <strong>Spotlight note</strong>
            <p>The highlighted region is not currently available, so the tutorial is guiding you with text for this step.</p>
          </div>
        ) : null}

        <div className="tutorial-copy-grid">
          <article className="tutorial-copy-card">
            <span className="utility-card__label">What this area shows</span>
            <p>{step.shows}</p>
          </article>
          <article className="tutorial-copy-card">
            <span className="utility-card__label">Why it exists</span>
            <p>{step.whyItExists}</p>
          </article>
          <article className="tutorial-copy-card">
            <span className="utility-card__label">When to care</span>
            <p>{step.whenToCare}</p>
          </article>
          <article className="tutorial-copy-card">
            <span className="utility-card__label">Decision support value</span>
            <p>{step.decisionSupport}</p>
          </article>
          {step.competitionTieIn ? (
            <article className="tutorial-copy-card tutorial-copy-card--accent">
              <span className="utility-card__label">Competition connection</span>
              <p>{step.competitionTieIn}</p>
            </article>
          ) : null}
        </div>

        {step.taskPrompt ? (
          <div className="tutorial-task">
            <div className="section-divider">
              <strong>Try it now</strong>
              <StatusPill tone={isTaskComplete ? "ok" : "neutral"}>
                {isTaskComplete ? "Checkpoint reached" : "Waiting for action"}
              </StatusPill>
            </div>
            <p>{step.taskPrompt}</p>
            {!isTaskComplete && step.completionLabel ? <p className="tutorial-task__hint">{step.completionLabel}</p> : null}
            {lockedActionCount > 0 && !isTaskComplete ? (
              <p className="tutorial-task__lock-note" data-testid="tutorial-lock-note">
                Other controls stay temporarily locked so this step can teach one action at a time.
              </p>
            ) : null}
            {step.panelActionId && step.panelActionLabel ? (
              <button type="button" onClick={onPanelAction}>
                {step.panelActionLabel}
              </button>
            ) : null}
          </div>
        ) : null}

        <div className="tutorial-panel__footer">
          <div className="utility-action-row">
            <button type="button" className="ghost-button" onClick={onBack} disabled={stepIndex <= 0}>
              Back
            </button>
            <button type="button" onClick={onNext} disabled={!canAdvance}>
              {stepIndex >= flow.steps.length - 1 ? "Finish tutorial" : "Next"}
            </button>
          </div>
          <button type="button" className="ghost-button" onClick={onSkip}>
            Close tutorial
          </button>
        </div>
      </aside>
    </div>
  );
}

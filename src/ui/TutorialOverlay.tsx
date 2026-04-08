import { useEffect, useLayoutEffect, useMemo, useRef, useState, type MouseEvent as ReactMouseEvent } from "react";
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

type FloatingPosition = {
  x: number;
  y: number;
};

type FloatingSize = {
  width: number;
  height: number;
};

type ViewportSize = {
  width: number;
  height: number;
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

const FLOATING_MARGIN = 16;
const FLOATING_GAP = 18;
const PANEL_FALLBACK_SIZE: FloatingSize = { width: 480, height: 620 };
const DOCK_FALLBACK_SIZE: FloatingSize = { width: 280, height: 64 };

function getViewportSize(): ViewportSize {
  return {
    width: window.innerWidth,
    height: window.innerHeight,
  };
}

function clamp(value: number, min: number, max: number): number {
  if (max <= min) {
    return min;
  }

  return Math.min(Math.max(value, min), max);
}

function clampPosition(position: FloatingPosition, size: FloatingSize, viewport: ViewportSize): FloatingPosition {
  const maxX = Math.max(FLOATING_MARGIN, viewport.width - size.width - FLOATING_MARGIN);
  const maxY = Math.max(FLOATING_MARGIN, viewport.height - size.height - FLOATING_MARGIN);

  return {
    x: clamp(position.x, FLOATING_MARGIN, maxX),
    y: clamp(position.y, FLOATING_MARGIN, maxY),
  };
}

function rectsOverlap(a: RectState, b: RectState): boolean {
  return a.left < b.left + b.width && a.left + a.width > b.left && a.top < b.top + b.height && a.top + a.height > b.top;
}

function getOverlapArea(a: RectState, b: RectState): number {
  const overlapWidth = Math.max(0, Math.min(a.left + a.width, b.left + b.width) - Math.max(a.left, b.left));
  const overlapHeight = Math.max(0, Math.min(a.top + a.height, b.top + b.height) - Math.max(a.top, b.top));
  return overlapWidth * overlapHeight;
}

function buildRect(position: FloatingPosition, size: FloatingSize): RectState {
  return {
    top: position.y,
    left: position.x,
    width: size.width,
    height: size.height,
  };
}

function getMeasuredSize(element: HTMLElement | null, minimized: boolean): FloatingSize {
  const fallback = minimized ? DOCK_FALLBACK_SIZE : PANEL_FALLBACK_SIZE;
  if (!element) {
    return fallback;
  }

  const bounds = element.getBoundingClientRect();
  const width = bounds.width || element.offsetWidth || fallback.width;
  const height = bounds.height || element.offsetHeight || fallback.height;

  return {
    width,
    height,
  };
}

function chooseSmartPosition(
  size: FloatingSize,
  viewport: ViewportSize,
  targetRect?: RectState,
): FloatingPosition {
  const topLeft = clampPosition({ x: FLOATING_MARGIN, y: FLOATING_MARGIN }, size, viewport);
  const topRight = clampPosition({ x: viewport.width - size.width - FLOATING_MARGIN, y: FLOATING_MARGIN }, size, viewport);
  const bottomLeft = clampPosition({ x: FLOATING_MARGIN, y: viewport.height - size.height - FLOATING_MARGIN }, size, viewport);
  const bottomRight = clampPosition(
    { x: viewport.width - size.width - FLOATING_MARGIN, y: viewport.height - size.height - FLOATING_MARGIN },
    size,
    viewport,
  );

  if (!targetRect) {
    return bottomRight;
  }

  const preferRightSide = targetRect.left + targetRect.width / 2 < viewport.width / 2;
  const alignedY = clamp(targetRect.top, FLOATING_MARGIN, viewport.height - size.height - FLOATING_MARGIN);
  const alignedX = clamp(targetRect.left + targetRect.width - size.width, FLOATING_MARGIN, viewport.width - size.width - FLOATING_MARGIN);

  const sideCandidates = preferRightSide
    ? [
        { x: targetRect.left + targetRect.width + FLOATING_GAP, y: alignedY },
        bottomRight,
        topRight,
        { x: alignedX, y: targetRect.top + targetRect.height + FLOATING_GAP },
        { x: alignedX, y: targetRect.top - size.height - FLOATING_GAP },
        { x: targetRect.left - size.width - FLOATING_GAP, y: alignedY },
        bottomLeft,
        topLeft,
      ]
    : [
        { x: targetRect.left - size.width - FLOATING_GAP, y: alignedY },
        bottomLeft,
        topLeft,
        { x: alignedX, y: targetRect.top + targetRect.height + FLOATING_GAP },
        { x: alignedX, y: targetRect.top - size.height - FLOATING_GAP },
        { x: targetRect.left + targetRect.width + FLOATING_GAP, y: alignedY },
        bottomRight,
        topRight,
      ];

  const candidateRects = sideCandidates.map((candidate) => {
    const position = clampPosition(candidate, size, viewport);
    const rect = buildRect(position, size);
    return {
      position,
      overlapArea: getOverlapArea(rect, targetRect),
      overlaps: rectsOverlap(rect, targetRect),
    };
  });

  const nonOverlapping = candidateRects.find((candidate) => !candidate.overlaps);
  if (nonOverlapping) {
    return nonOverlapping.position;
  }

  return candidateRects.reduce((best, candidate) =>
    candidate.overlapArea < best.overlapArea ? candidate : best,
  ).position;
}

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
  } = props;

  const [isMinimized, setIsMinimized] = useState(false);
  const [floatingPosition, setFloatingPosition] = useState<FloatingPosition>({
    x: FLOATING_MARGIN,
    y: FLOATING_MARGIN,
  });
  const spotlightState = useSpotlightRect(targetId);
  const spotlightRect = spotlightState.rect;
  const floatingRef = useRef<HTMLDivElement | null>(null);
  const floatingPositionRef = useRef(floatingPosition);
  const floatingSizeRef = useRef<FloatingSize>(PANEL_FALLBACK_SIZE);
  const manualPositionRef = useRef(false);
  const previousStepKeyRef = useRef<string | null>(null);
  const dragStateRef = useRef<{ startX: number; startY: number; originX: number; originY: number } | null>(null);

  function updateFloatingPosition(nextPosition: FloatingPosition): void {
    floatingPositionRef.current = nextPosition;
    setFloatingPosition(nextPosition);
  }

  function applySmartPosition(nextMinimized: boolean, nextRect = spotlightRect): void {
    const viewport = getViewportSize();
    const size = getMeasuredSize(floatingRef.current, nextMinimized);
    floatingSizeRef.current = size;
    updateFloatingPosition(chooseSmartPosition(size, viewport, nextRect));
  }

  useEffect(() => {
    if (mode !== "running") {
      setIsMinimized(false);
      manualPositionRef.current = false;
      previousStepKeyRef.current = null;
    }
  }, [mode]);

  useLayoutEffect(() => {
    if (mode !== "running" || !flow || !step) {
      return;
    }

    const stepKey = `${flow.id}:${step.id}`;
    const stepChanged = previousStepKeyRef.current !== stepKey;
    previousStepKeyRef.current = stepKey;

    const viewport = getViewportSize();
    const size = getMeasuredSize(floatingRef.current, isMinimized);
    floatingSizeRef.current = size;

    if (stepChanged) {
      manualPositionRef.current = false;
      updateFloatingPosition(chooseSmartPosition(size, viewport, spotlightRect));
      return;
    }

    if (manualPositionRef.current) {
      updateFloatingPosition(clampPosition(floatingPositionRef.current, size, viewport));
      return;
    }

    updateFloatingPosition(chooseSmartPosition(size, viewport, spotlightRect));
  }, [flow, isMinimized, mode, spotlightRect, step]);

  useEffect(() => {
    if (mode !== "running") {
      return undefined;
    }

    function handleResize() {
      const viewport = getViewportSize();
      const size = getMeasuredSize(floatingRef.current, isMinimized);
      floatingSizeRef.current = size;

      if (manualPositionRef.current) {
        updateFloatingPosition(clampPosition(floatingPositionRef.current, size, viewport));
        return;
      }

      updateFloatingPosition(chooseSmartPosition(size, viewport, spotlightRect));
    }

    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, [isMinimized, mode, spotlightRect]);

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

  useEffect(() => {
    return () => {
      document.body.classList.remove("tutorial-dragging");
    };
  }, []);

  if (mode === "menu") {
    return <TutorialMenu onSkip={onSkip} onStartPath={onStartPath} />;
  }

  if (!flow || !step || stepIndex === undefined) {
    return null;
  }

  const progressPct = ((stepIndex + 1) / flow.steps.length) * 100;
  const floatingWindowStyle = {
    left: `${floatingPosition.x}px`,
    top: `${floatingPosition.y}px`,
  };

  function beginDrag(event: ReactMouseEvent<HTMLDivElement>): void {
    if (event.button !== 0) {
      return;
    }

    manualPositionRef.current = true;
    dragStateRef.current = {
      startX: event.clientX,
      startY: event.clientY,
      originX: floatingPositionRef.current.x,
      originY: floatingPositionRef.current.y,
    };

    document.body.classList.add("tutorial-dragging");

    function handleMouseMove(moveEvent: MouseEvent) {
      const dragState = dragStateRef.current;
      if (!dragState) {
        return;
      }

      const viewport = getViewportSize();
      const nextPosition = clampPosition(
        {
          x: dragState.originX + (moveEvent.clientX - dragState.startX),
          y: dragState.originY + (moveEvent.clientY - dragState.startY),
        },
        floatingSizeRef.current,
        viewport,
      );
      updateFloatingPosition(nextPosition);
    }

    function stopDrag() {
      dragStateRef.current = null;
      document.body.classList.remove("tutorial-dragging");
      window.removeEventListener("mousemove", handleMouseMove);
      window.removeEventListener("mouseup", stopDrag);
    }

    window.addEventListener("mousemove", handleMouseMove);
    window.addEventListener("mouseup", stopDrag);
  }

  function resetFloatingPosition(): void {
    manualPositionRef.current = false;
    applySmartPosition(isMinimized);
  }

  function minimizePanel(): void {
    setIsMinimized(true);
  }

  function expandPanel(): void {
    setIsMinimized(false);
  }

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
          <div className="tutorial-scrim tutorial-scrim--bottom" style={{ top: spotlightRect.top + spotlightRect.height }} />
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

      <div className="tutorial-floating-window" data-testid="tutorial-floating-window" ref={floatingRef} style={floatingWindowStyle}>
        {isMinimized ? (
          <div className="tutorial-dock" data-testid="tutorial-dock">
            <div
              className="tutorial-dock__drag-handle"
              data-testid="tutorial-drag-handle"
              onMouseDown={beginDrag}
              role="presentation"
            >
              <span className="tutorial-drag-grip" aria-hidden="true" />
              <div className="tutorial-dock__copy">
                <strong>{step.title}</strong>
                <span>
                  Step {stepIndex + 1} of {flow.steps.length}
                </span>
              </div>
            </div>
            <div className="tutorial-dock__actions">
              <button type="button" className="ghost-button tutorial-window-button" onClick={resetFloatingPosition}>
                Reset position
              </button>
              <button type="button" className="tutorial-window-button" onClick={expandPanel}>
                Expand tutorial
              </button>
            </div>
          </div>
        ) : (
          <aside className="tutorial-panel tutorial-panel--sidecar" aria-label="Tutorial step" data-testid="tutorial-panel">
            <div className="tutorial-window-chrome">
              <div
                className="tutorial-window-chrome__drag-handle"
                data-testid="tutorial-drag-handle"
                onMouseDown={beginDrag}
                role="presentation"
              >
                <span className="tutorial-drag-grip" aria-hidden="true" />
                <div className="tutorial-window-chrome__copy">
                  <p className="eyebrow">{flow.label}</p>
                  <span>Drag tutorial window</span>
                </div>
              </div>
              <div className="tutorial-window-chrome__actions">
                <button type="button" className="ghost-button tutorial-window-button" onClick={resetFloatingPosition}>
                  Reset position
                </button>
                <button type="button" className="tutorial-window-button" onClick={minimizePanel}>
                  Minimize
                </button>
              </div>
            </div>

            <div className="tutorial-panel__header">
              <div>
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
        )}
      </div>
    </div>
  );
}

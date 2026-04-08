import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { TutorialOverlay } from "./TutorialOverlay";
import { getTutorialFlow } from "./tutorial";

describe("TutorialOverlay", () => {
  beforeEach(() => {
    Object.defineProperty(window, "innerWidth", {
      configurable: true,
      writable: true,
      value: 1400,
    });
    Object.defineProperty(window, "innerHeight", {
      configurable: true,
      writable: true,
      value: 900,
    });
    Object.defineProperty(HTMLElement.prototype, "scrollIntoView", {
      configurable: true,
      value: vi.fn(),
    });
    Object.defineProperty(HTMLElement.prototype, "focus", {
      configurable: true,
      value: vi.fn(),
    });
  });

  it("renders the launcher menu with the three guided paths", () => {
    const onStartPath = vi.fn();

    render(
      <TutorialOverlay
        mode="menu"
        canAdvance
        isTaskComplete
        onBack={() => undefined}
        onNext={() => undefined}
        onSkip={() => undefined}
        onStartPath={onStartPath}
      />,
    );

    expect(screen.getByTestId("tutorial-menu")).toBeInTheDocument();
    expect(screen.getByText(/Full guided walkthrough/i)).toBeInTheDocument();
    expect(screen.getByText(/Operate workspace tour/i)).toBeInTheDocument();
    expect(screen.getByText(/Review workspace tour/i)).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /Start Full guided walkthrough/i }));
    expect(onStartPath).toHaveBeenCalledWith("full");
  });

  it("places the sidecar away from the spotlighted target when there is room", () => {
    const flow = getTutorialFlow("full");
    const step = flow.steps[0];
    const target = document.createElement("div");
    target.setAttribute("data-tutorial-target", "command-bar");
    target.getBoundingClientRect = () =>
      ({
        top: 80,
        left: 920,
        width: 300,
        height: 160,
        bottom: 240,
        right: 1220,
        x: 920,
        y: 80,
        toJSON: () => undefined,
      }) as DOMRect;
    document.body.appendChild(target);

    render(
      <TutorialOverlay
        mode="running"
        flow={flow}
        step={step}
        stepIndex={0}
        targetId={step.targetId}
        canAdvance
        isTaskComplete
        onBack={() => undefined}
        onNext={() => undefined}
        onSkip={() => undefined}
        onStartPath={() => undefined}
      />,
    );

    const floatingWindow = screen.getByTestId("tutorial-floating-window");
    const left = Number.parseFloat(floatingWindow.style.left);
    expect(left + 480).toBeLessThanOrEqual(910);
    expect(screen.getByTestId("tutorial-spotlight")).toBeInTheDocument();

    target.remove();
  });

  it("minimizes into a restore dock and expands back into the full panel", () => {
    const flow = getTutorialFlow("full");
    const step = flow.steps[0];

    render(
      <TutorialOverlay
        mode="running"
        flow={flow}
        step={step}
        stepIndex={0}
        targetId={step.targetId}
        canAdvance
        isTaskComplete
        onBack={() => undefined}
        onNext={() => undefined}
        onSkip={() => undefined}
        onStartPath={() => undefined}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: /Minimize/i }));
    expect(screen.getByTestId("tutorial-dock")).toBeInTheDocument();
    expect(screen.queryByTestId("tutorial-panel")).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /Expand tutorial/i }));
    expect(screen.getByTestId("tutorial-panel")).toBeInTheDocument();
  });

  it("supports desktop dragging and resetting back to the smart position", () => {
    const flow = getTutorialFlow("full");
    const step = flow.steps[0];

    render(
      <TutorialOverlay
        mode="running"
        flow={flow}
        step={step}
        stepIndex={0}
        targetId={step.targetId}
        canAdvance
        isTaskComplete
        onBack={() => undefined}
        onNext={() => undefined}
        onSkip={() => undefined}
        onStartPath={() => undefined}
      />,
    );

    const floatingWindow = screen.getByTestId("tutorial-floating-window");
    const initialLeft = floatingWindow.style.left;
    const initialTop = floatingWindow.style.top;

    fireEvent.mouseDown(screen.getByTestId("tutorial-drag-handle"), {
      button: 0,
      clientX: 220,
      clientY: 120,
    });
    fireEvent.mouseMove(window, {
      clientX: 80,
      clientY: 60,
    });
    fireEvent.mouseUp(window);

    expect(floatingWindow.style.left).not.toBe(initialLeft);
    expect(floatingWindow.style.top).not.toBe(initialTop);

    fireEvent.click(screen.getByRole("button", { name: /Reset position/i }));
    expect(floatingWindow.style.left).toBe(initialLeft);
    expect(floatingWindow.style.top).toBe(initialTop);
  });

  it("shows a locked-action note for guided task steps until the required action is complete", () => {
    const flow = getTutorialFlow("full");
    const step = flow.steps.find((entry) => entry.id === "runtime-step-control");
    if (!step) {
      throw new Error("Expected runtime-step-control step to exist.");
    }

    render(
      <TutorialOverlay
        mode="running"
        flow={flow}
        step={step}
        stepIndex={2}
        targetId={step.targetId}
        canAdvance={false}
        isTaskComplete={false}
        lockedActionCount={step.lockedActionIds?.length ?? 0}
        onBack={() => undefined}
        onNext={() => undefined}
        onSkip={() => undefined}
        onStartPath={() => undefined}
      />,
    );

    expect(screen.getByTestId("tutorial-lock-note")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /^Next$/i })).toBeDisabled();
    expect(screen.getByText(/Guided action gate active/i)).toBeInTheDocument();
  });
});

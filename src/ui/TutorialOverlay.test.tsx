import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { TutorialOverlay } from "./TutorialOverlay";
import { getTutorialFlow } from "./tutorial";

describe("TutorialOverlay", () => {
  beforeEach(() => {
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
    render(
      <TutorialOverlay
        mode="menu"
        canAdvance
        isTaskComplete
        onBack={() => undefined}
        onNext={() => undefined}
        onSkip={() => undefined}
        onStartPath={() => undefined}
      />,
    );

    expect(screen.getByTestId("tutorial-menu")).toBeInTheDocument();
    expect(screen.getByText(/Full guided walkthrough/i)).toBeInTheDocument();
    expect(screen.getByText(/Operate workspace tour/i)).toBeInTheDocument();
    expect(screen.getByText(/Review workspace tour/i)).toBeInTheDocument();
  });

  it("renders spotlight geometry and progress when a targeted step is active", () => {
    const flow = getTutorialFlow("full");
    const step = flow.steps[0];
    const target = document.createElement("div");
    target.setAttribute("data-tutorial-target", "command-bar");
    target.getBoundingClientRect = () =>
      ({
        top: 40,
        left: 50,
        width: 320,
        height: 120,
        bottom: 160,
        right: 370,
        x: 50,
        y: 40,
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

    expect(screen.getByTestId("tutorial-spotlight")).toBeInTheDocument();
    expect(screen.getByTestId("tutorial-progress-fill")).toHaveStyle({
      width: `${((1 / flow.steps.length) * 100).toString()}%`,
    });

    target.remove();
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

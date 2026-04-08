import type { SessionSnapshot } from "../contracts/aura";
import type { WorkspaceId } from "./viewModel";

export type RunPace = "guided" | "live";

export type TutorialPathId = "full" | "operate" | "review";

export type TutorialTargetId =
  | "command-bar"
  | "workspace-switch"
  | "runtime-controls"
  | "orientation-board"
  | "situation-board"
  | "alarm-board"
  | "next-actions"
  | "manual-utility"
  | "support-posture"
  | "storyline-board"
  | "validation-banner"
  | "review-oversight"
  | "review-completed"
  | "review-comparison";

export type TutorialActionId =
  | "workspace:operate"
  | "workspace:review"
  | "runtime:run-guided"
  | "runtime:run-live"
  | "runtime:pause"
  | "runtime:advance"
  | "runtime:toggle-checkpoint"
  | "runtime:change-scenario"
  | "runtime:change-mode"
  | "runtime:reset"
  | "alarm:inspect-cluster"
  | "actions:lane-primary"
  | "actions:ack-top-alarm"
  | "actions:manual-apply"
  | "actions:demo-preset"
  | "actions:confirm-pending"
  | "actions:dismiss-pending"
  | "tutorial:complete-run";

export type TutorialSignal =
  | "workspace-review-opened"
  | "workspace-operate-opened"
  | "runtime-guided-started"
  | "runtime-live-started"
  | "runtime-advanced"
  | "alarm-cluster-opened"
  | "lane-action-requested"
  | "validator-demo-requested"
  | "tutorial-run-completed";

export type TutorialContext = {
  snapshot: SessionSnapshot;
  workspace: WorkspaceId;
  isRunning: boolean;
  runPace: RunPace;
  checkpointPauseEnabled: boolean;
  expandedClusterIds: string[];
  signals: ReadonlySet<TutorialSignal>;
};

type TutorialPanelActionId = "complete-run";

type TutorialCompletion =
  | {
      kind: "manual";
    }
  | {
      kind: "condition";
      autoAdvance?: boolean;
      isComplete: (context: TutorialContext) => boolean;
    };

export type TutorialStep = {
  id: string;
  workspace?: WorkspaceId;
  requiresManualWorkspaceSwitch?: boolean;
  targetId?: TutorialTargetId;
  title: string;
  summary: string;
  shows: string;
  whyItExists: string;
  whenToCare: string;
  decisionSupport: string;
  competitionTieIn?: string;
  taskPrompt?: string;
  completionLabel?: string;
  lockedActionIds?: TutorialActionId[];
  panelActionId?: TutorialPanelActionId;
  panelActionLabel?: string;
  completion: TutorialCompletion;
};

export type TutorialFlow = {
  id: TutorialPathId;
  label: string;
  kickoffSummary: string;
  restartMode: "reset_intro_session" | "preserve_current_state";
  steps: TutorialStep[];
};

function hasSignal(context: TutorialContext, signal: TutorialSignal): boolean {
  return context.signals.has(signal);
}

const fullFlow: TutorialFlow = {
  id: "full",
  label: "Full guided walkthrough",
  kickoffSummary:
    "Resets to the introductory feedwater scenario, pauses the runtime, and walks through Operate and Review as one end-to-end first-run lesson.",
  restartMode: "reset_intro_session",
  steps: [
    {
      id: "full-briefing",
      workspace: "operate",
      targetId: "command-bar",
      title: "What AURA-IDCR is",
      summary: "This is a digital-twin-based abnormal-event decision-support prototype, not a generic dashboard and not an autonomous controller.",
      shows:
        "The command bar identifies the scenario, session mode, support mode, and runtime status so the operator always knows what environment is active.",
      whyItExists:
        "A control-room support system has to orient the user immediately before they interpret alarms, storyline, or first-response advice.",
      whenToCare:
        "Use this band first on every run, after every reset, and any time the storyline feels confusing or the support posture changes.",
      decisionSupport:
        "It anchors the operating context: which scenario is running, whether the session is baseline or adaptive, how the runtime is paced, and whether review evidence is ready.",
      competitionTieIn:
        "This is the competition story in one place: a believable plant twin, human-aware support logic, and evaluator-ready evidence inside one operator shell.",
      completion: { kind: "manual" },
    },
    {
      id: "workspace-model",
      workspace: "operate",
      targetId: "workspace-switch",
      title: "Operate versus Review",
      summary: "Operate is the live console for first response. Review is the oversight and evidence workspace for after-action learning and judge-facing comparison.",
      shows:
        "The workspace switch separates real-time abnormal response from evaluator-heavy material so the operator surface stays focused during a run.",
      whyItExists:
        "A first-open user should not have to parse replay, exports, comparison, and supervisor tooling while also responding to the plant.",
      whenToCare:
        "Stay in Operate while diagnosing and acting. Move to Review when you need oversight, completed-run evidence, comparison, or exports.",
      decisionSupport:
        "The split preserves the live decision loop in Operate while still keeping the evaluation story available on demand.",
      completion: { kind: "manual" },
    },
    {
      id: "runtime-step-control",
      workspace: "operate",
      targetId: "runtime-controls",
      title: "Start, pause, resume, step, and reset",
      summary: "The tutorial keeps the twin paused on purpose. Choose the next scenario and run mode deliberately, then advance or run the twin only when you are ready to read what changed.",
      shows:
        "The runtime controls let you choose scenario and mode for the next run, start or resume guided pace, start or resume live pace, pause, advance one tick, and reset cleanly.",
      whyItExists:
        "Learning suffers if the simulation starts immediately or moves faster than the user can connect causes to effects.",
      whenToCare:
        "Use guided pace for learning and demos, live pace when you want a more realistic continuous run, step mode for close reading, and reset when you want a fresh deterministic pass.",
      decisionSupport:
        "Checkpoint pauses slow the story at meaningful moments so the user can read alarms, storyline, and procedures before acting.",
      taskPrompt: "Advance one tick so you can see the plant change under your control.",
      completionLabel: "Waiting for one manual simulation step.",
      lockedActionIds: ["runtime:advance"],
      completion: {
        kind: "condition",
        autoAdvance: true,
        isComplete: (context) => hasSignal(context, "runtime-advanced") && context.snapshot.tick_index >= 1,
      },
    },
    {
      id: "orientation-band",
      workspace: "operate",
      targetId: "orientation-board",
      title: "Read the screen in three questions",
      summary: "The orientation band teaches the core mental model: what is happening, what matters most right now, and what to do next.",
      shows:
        "Each card compresses the live reasoning output into an operator-first answer instead of forcing the user to scan every region in parallel.",
      whyItExists:
        "This is the anti-confusion layer for first-time users and for overloaded moments inside a scenario.",
      whenToCare:
        "Read it first after any checkpoint pause, support-mode shift, or validator interruption.",
      decisionSupport:
        "It bridges the twin, the alarm intelligence, the reasoning engine, and the first-response lane into one fast first scan.",
      completion: { kind: "manual" },
    },
    {
      id: "situation-board",
      workspace: "operate",
      targetId: "situation-board",
      title: "The plant situation board",
      summary: "This is the continuously visible process picture: mimic, critical variables, state ribbon, and ecological constraints.",
      shows:
        "The board keeps the reactor, vessel, steam path, turbine, condenser, and critical process values in view while also exposing physical relationships such as mass balance and trip margin.",
      whyItExists:
        "A decision-support prototype stays credible only if the operator can still supervise the plant directly rather than trusting a black-box summary.",
      whenToCare:
        "Stay here for confirmation of severity, constraint proximity, trend direction, and whether recovery actions are actually improving the plant.",
      decisionSupport:
        "This is where the storyline must stay honest. If the explanation says recovery is working, the vessel level, pressure, heat-sink state, and ecological cues should agree.",
      competitionTieIn:
        "This is the digital twin part of the competition story: the support layer is grounded in a repeatable simulated plant rather than static slides.",
      completion: { kind: "manual" },
    },
    {
      id: "guided-onset",
      workspace: "operate",
      targetId: "runtime-controls",
      title: "Guided pace and checkpoint pauses",
      summary: "Now let the twin advance at guided pace. The app will pause itself when the abnormal picture becomes worth reading.",
      shows:
        "Guided pace is intentionally slower than live pace, and checkpoint pauses halt the run when the phase shifts, alarms surface, validation holds occur, or the session ends.",
      whyItExists:
        "The goal is comprehension first: you should see the cause/effect chain as it develops instead of missing it between ticks.",
      whenToCare:
        "Use guided pace whenever you are learning a scenario, demonstrating the system, or walking a judge through the support logic.",
      decisionSupport:
        "The system is teaching you where to stop and think, not just how to keep the clock moving.",
      taskPrompt: "Start guided pace. The walkthrough will pause when the first real abnormal indications are ready to inspect.",
      completionLabel: "Waiting for guided pace to reach the first meaningful checkpoint.",
      lockedActionIds: ["runtime:run-guided", "runtime:pause"],
      completion: {
        kind: "condition",
        autoAdvance: true,
        isComplete: (context) =>
          hasSignal(context, "runtime-guided-started") &&
          !context.isRunning &&
          context.snapshot.alarm_set.active_alarm_count > 0,
      },
    },
    {
      id: "alarm-board",
      workspace: "operate",
      targetId: "alarm-board",
      title: "Grouped alarms, not raw alarm flood",
      summary: "The alarm board keeps critical alarms pinned while grouping related alarms into operational clusters.",
      shows:
        "Pinned alarms preserve visibility for the alarms that must never disappear. Clusters compress the broader flood into a smaller number of operational stories.",
      whyItExists:
        "A long raw list increases search burden. The cluster view is meant to help the operator understand whether many alarms are symptoms of one event family or several independent problems.",
      whenToCare:
        "Use the board whenever alarm load rises, especially if multiple alarms arrive together and you need to separate dominant signals from secondary noise.",
      decisionSupport:
        "It tells you which alarms are critical to keep in view, which ones belong together, and how much alarm compression the system is giving you.",
      completion: { kind: "manual" },
    },
    {
      id: "alarm-inspection",
      workspace: "operate",
      targetId: "alarm-board",
      title: "Inspect compressed detail",
      summary: "Clusters are there to reduce noise, not to hide detail. You can still open the raw alarm list when you need to audit what was grouped.",
      shows:
        "Each cluster exposes its grouped count, critical count, primary alarm labels, and raw members behind expansion.",
      whyItExists:
        "Transparent support means the operator can verify the abstraction rather than being forced to accept it.",
      whenToCare:
        "Open raw alarms when you want to audit the grouped picture, explain the cluster to someone else, or check whether a new alarm changed the story.",
      decisionSupport:
        "This lets the user connect the compressed operational story to the underlying alarm evidence.",
      taskPrompt: "Open one raw alarm list so you can compare the grouped view with the underlying signals.",
      completionLabel: "Waiting for a cluster expansion.",
      lockedActionIds: ["alarm:inspect-cluster"],
      completion: {
        kind: "condition",
        autoAdvance: true,
        isComplete: (context) => hasSignal(context, "alarm-cluster-opened") && context.expandedClusterIds.length > 0,
      },
    },
    {
      id: "storyline-board",
      workspace: "operate",
      targetId: "storyline-board",
      title: "Storyline, root cause, evidence, and hypotheses",
      summary: "This is where the app explains its current best interpretation of the event instead of leaving the operator with only alarms and raw variables.",
      shows:
        "The dominant hypothesis leads, evidence cards explain why it is on top, secondary hypotheses stay compressed, and watch signals show what could confirm or disprove the current story.",
      whyItExists:
        "Alarm intelligence alone is not enough. Operators also need a transparent diagnosis aid that explains how the event picture is being interpreted.",
      whenToCare:
        "Use it when the event is ambiguous, when the diagnosis shifts, or when you want to explain why one alarm cluster matters more than another.",
      decisionSupport:
        "It narrows the root-cause search, shows uncertainty honestly, and points to the next signals that would strengthen or weaken the current explanation.",
      completion: { kind: "manual" },
    },
    {
      id: "support-posture",
      workspace: "operate",
      targetId: "support-posture",
      title: "Risk, workload, confidence, and assistance mode",
      summary: "AURA-IDCR is not only reading the plant. It is also estimating how hard the situation is to manage and adapting the support posture accordingly.",
      shows:
        "Combined risk, top contributing factors, operator-state proxies, degraded-confidence caveats, and the current support-mode effects stay visible in one compact region.",
      whyItExists:
        "The competition story is human-performance-aware assistance, not only plant-state analytics.",
      whenToCare:
        "Watch this board when support mode changes, when workload rises, when confidence degrades, or when you need to explain why the UI is becoming more explicit or more protective.",
      decisionSupport:
        "It explains why the system is emphasizing certain lane items, how certain it is in that posture, and where the current difficulty is really coming from.",
      competitionTieIn:
        "This is the human-monitoring and decision-support link: plant state and operator context are being interpreted together rather than in isolation.",
      completion: { kind: "manual" },
    },
    {
      id: "next-actions",
      workspace: "operate",
      targetId: "next-actions",
      title: "The first-response lane",
      summary: "The first-response lane is the primary action surface. It turns the live diagnosis into a short set of checks, actions, and watch items.",
      shows:
        "Lane items explain what to do, why it matters now, what signals to watch, and whether the system is emphasizing the item more strongly because of current risk or workload.",
      whyItExists:
        "In overload, the main failure mode is not lack of information. It is search burden and uncertainty about what to do first.",
      whenToCare:
        "Use the lane when the event picture is clear enough to act, or when the app is deliberately narrowing the response to protect against harmful delay or distraction.",
      decisionSupport:
        "This is where the storyline becomes action guidance without removing operator authority.",
      taskPrompt: "Apply the recommended recovery action from the first-response lane.",
      completionLabel: "Waiting for the guided recovery action.",
      lockedActionIds: ["actions:lane-primary"],
      completion: {
        kind: "condition",
        autoAdvance: true,
        isComplete: (context) =>
          hasSignal(context, "lane-action-requested") &&
          context.snapshot.executed_actions.some((action) => action.action_id === "act_adjust_feedwater"),
      },
    },
    {
      id: "validator-demo",
      workspace: "operate",
      targetId: "manual-utility",
      title: "Validator warnings and hard prevents",
      summary: "The manual utility area is secondary on purpose. It is also where the app exposes validator demo presets so users can safely see pass, warning, and prevent behavior.",
      shows:
        "Routine low-risk actions pass quietly, some risky actions trigger a soft warning, and clearly harmful requests can be blocked with a hard prevent.",
      whyItExists:
        "The prototype has to show how it prevents harmful operator error without turning into a constant nuisance.",
      whenToCare:
        "Use this area to understand validator behavior, demonstrate the intervention model, or inspect controls that are intentionally outside the primary guided lane.",
      decisionSupport:
        "It teaches the user that the system is advisory and bounded: it supports the operator, warns when risk rises, and blocks only clearly unsafe moves.",
      taskPrompt: "Trigger the hard-prevent demo preset. The validator will block it before plant state changes.",
      completionLabel: "Waiting for a blocked validator demonstration.",
      lockedActionIds: ["actions:demo-preset"],
      completion: {
        kind: "condition",
        autoAdvance: true,
        isComplete: (context) =>
          hasSignal(context, "validator-demo-requested") && context.snapshot.last_validation_result?.outcome === "hard_prevent",
      },
    },
    {
      id: "validator-result",
      workspace: "operate",
      targetId: "validation-banner",
      title: "How validation results are explained",
      summary: "Validator results stay visible in the action region so the operator can see what was blocked or warned, why, and what safer path is recommended.",
      shows:
        "The banner explains the reason code, risk context, confidence note, and whether a supervisor review path exists for bounded demo use.",
      whyItExists:
        "Protected actions must be explainable. Otherwise the system feels arbitrary and users stop trusting it.",
      whenToCare:
        "Read this whenever a risky action is held or blocked, especially during a high-workload or competition demonstration run.",
      decisionSupport:
        "It keeps the action-intervention model transparent and teaches the user which controls are being defended and why.",
      completion: { kind: "manual" },
    },
    {
      id: "complete-run",
      workspace: "operate",
      targetId: "next-actions",
      title: "From live response to review evidence",
      summary: "A good operator flow ends in evidence. After the response stabilizes or the session terminates, Review turns the run into replay, KPI, comparison, and export artifacts.",
      shows:
        "This tutorial can carry the current corrected run forward so you can inspect real review artifacts without waiting through every remaining tick.",
      whyItExists:
        "The product story is not only live support. It is also measurable human-performance improvement and explainable comparison across runs.",
      whenToCare:
        "Use this handoff whenever you are done acting and want to inspect the outcome, discuss performance, or export evidence.",
      decisionSupport:
        "It closes the loop from digital twin -> alarm intelligence -> guidance -> validation -> evaluator evidence.",
      taskPrompt: "Use the tutorial checkpoint action to complete the current run and unlock review evidence.",
      completionLabel: "Waiting for the tutorial review checkpoint.",
      lockedActionIds: ["tutorial:complete-run"],
      panelActionId: "complete-run",
      panelActionLabel: "Complete run for review",
      completion: {
        kind: "condition",
        autoAdvance: true,
        isComplete: (context) =>
          hasSignal(context, "tutorial-run-completed") && Boolean(context.snapshot.completed_review),
      },
    },
    {
      id: "open-review",
      workspace: "operate",
      requiresManualWorkspaceSwitch: true,
      targetId: "workspace-switch",
      title: "Move into Review",
      summary: "Operate taught you how the live loop works. Review shows how the same session becomes oversight, replay, KPI evidence, and comparison-ready artifacts.",
      shows:
        "The workspace switch keeps this move explicit so the user understands they are leaving first-response mode and entering evaluator mode.",
      whyItExists:
        "This preserves a clean mental boundary between operating the scenario and judging what happened.",
      whenToCare:
        "Open Review after a validator intervention, when a supervisor decision is pending, or after a run completes and you want to inspect evidence.",
      decisionSupport:
        "It teaches the user that Review is not a second dashboard home page. It is the evidence and oversight workspace.",
      taskPrompt: "Open the Review workspace.",
      completionLabel: "Waiting for the Review workspace.",
      lockedActionIds: ["workspace:review"],
      completion: {
        kind: "condition",
        autoAdvance: true,
        isComplete: (context) => hasSignal(context, "workspace-review-opened") && context.workspace === "review",
      },
    },
    {
      id: "review-oversight",
      workspace: "review",
      targetId: "review-oversight",
      title: "Live oversight and validator traceability",
      summary: "Review starts with live oversight: validator demo markers, pending supervisor review, and recent event payloads.",
      shows:
        "This region makes the support and validation behavior auditable without crowding Operate.",
      whyItExists:
        "A serious prototype has to be explainable to supervisors, trainers, and judges, not only helpful to the live operator.",
      whenToCare:
        "Use it when you want to inspect why an intervention happened, confirm that validator demonstrations were captured, or review recent event payloads.",
      decisionSupport:
        "It connects operator actions and interventions back to the canonical event stream so the system can be audited instead of hand-waved.",
      completion: { kind: "manual" },
    },
    {
      id: "review-completed",
      workspace: "review",
      targetId: "review-completed",
      title: "Completed run review",
      summary: "Once a session reaches a terminal outcome, this region turns it into a bounded after-action review with milestones, highlights, replayable key events, and KPI summary.",
      shows:
        "The review artifact captures the terminal outcome, key events, milestones, highlights, and the demo-facing KPI bundle for that run.",
      whyItExists:
        "The app needs to prove impact, not just display features. This region is where a run becomes evidence.",
      whenToCare:
        "Use it after every completed scenario to understand what happened, what mattered, and how the support system performed.",
      decisionSupport:
        "It lets trainers and judges step through the run without rereading the entire raw event log.",
      completion: { kind: "manual" },
    },
    {
      id: "review-comparison",
      workspace: "review",
      targetId: "review-comparison",
      title: "Comparison and export",
      summary: "A single run gives you a session report. Paired baseline and adaptive runs on the same scenario unlock comparison and export for the competition story.",
      shows:
        "This region exposes report-download controls and, when both modes are available, a judge-facing comparison of KPI deltas and milestone counts.",
      whyItExists:
        "The prototype’s value claim depends on measurable difference between baseline support and full adaptive support.",
      whenToCare:
        "Use it when preparing a demo, writing up evidence, or comparing how support changed diagnosis time, stabilization, workload, and intervention quality.",
      decisionSupport:
        "It turns the product from a one-off demo into a repeatable evaluation tool.",
      competitionTieIn:
        "This is where the competition goal becomes explicit: digital twin scenarios, human monitoring, transparent support, and measurable human-performance improvement.",
      completion: { kind: "manual" },
    },
    {
      id: "full-finish",
      workspace: "review",
      title: "A good end-to-end flow",
      summary: "A strong user flow is: orient -> read the situation -> use grouped alarms and storyline to diagnose -> act through the first-response lane -> let validation guard risky moves -> finish in Review for evidence and comparison.",
      shows:
        "You have seen the live operator path and the evaluator path as one connected system.",
      whyItExists:
        "First-time users need a mental model, not just named panels.",
      whenToCare:
        "Restart this walkthrough whenever you want the full story again, or use the shorter Operate and Review tours for focused refreshers.",
      decisionSupport:
        "The tutorial is teaching the product as a closed decision-support loop rather than a pile of widgets.",
      completion: { kind: "manual" },
    },
  ],
};

const operateFlow: TutorialFlow = {
  id: "operate",
  label: "Operate workspace tour",
  kickoffSummary:
    "Resets to the introductory feedwater scenario, pauses the runtime, and focuses on the live operator loop without carrying you through Review.",
  restartMode: "reset_intro_session",
  steps: [
    ...fullFlow.steps.filter((step) =>
      [
        "full-briefing",
        "workspace-model",
        "runtime-step-control",
        "orientation-band",
        "situation-board",
        "guided-onset",
        "alarm-board",
        "alarm-inspection",
        "storyline-board",
        "support-posture",
        "next-actions",
        "validator-demo",
        "validator-result",
      ].includes(step.id),
    ),
    {
      id: "operate-finish",
      workspace: "operate",
      targetId: "next-actions",
      title: "Operate workspace mental model",
      summary: "Operate is the live decision-support loop: orient, read the plant, compress alarms into a usable story, act through the first-response lane, and let validation guard the risky edges.",
      shows:
        "You have seen how the operator-first surface keeps critical variables visible while grouped alarms, storyline, support posture, and the lane reinforce each other.",
      whyItExists:
        "A focused operator workspace is easier to trust and easier to teach than a single screen that mixes operation, evidence, comparison, and exports together.",
      whenToCare:
        "Reopen this tour whenever you want a refresher on the live response surface without stepping into Review.",
      decisionSupport:
        "It frames Operate as a closed loop: what is happening, what matters, what to do next, and what the validator will protect.",
      completion: { kind: "manual" },
    },
  ],
};

const reviewFlow: TutorialFlow = {
  id: "review",
  label: "Review workspace tour",
  kickoffSummary:
    "Keeps the current session state, opens Review, and explains the oversight, after-action, comparison, and export model.",
  restartMode: "preserve_current_state",
  steps: [
    {
      id: "review-briefing",
      workspace: "operate",
      requiresManualWorkspaceSwitch: true,
      targetId: "workspace-switch",
      title: "Why Review is separate",
      summary: "Review exists so evaluator evidence and supervisor tooling never drown out the live operator surface.",
      shows:
        "The workspace switch is the deliberate handoff between abnormal-event response and post-run interpretation.",
      whyItExists:
        "This prevents the product from becoming a generic dashboard mosaic on first open.",
      whenToCare:
        "Open Review when you need oversight, replay, KPI evidence, comparison, or exports.",
      decisionSupport:
        "It keeps the operator loop tight while preserving the evidence story for trainers and judges.",
      taskPrompt: "Open the Review workspace.",
      completionLabel: "Waiting for the Review workspace.",
      lockedActionIds: ["workspace:review"],
      completion: {
        kind: "condition",
        autoAdvance: true,
        isComplete: (context) => hasSignal(context, "workspace-review-opened") && context.workspace === "review",
      },
    },
    {
      id: "review-oversight-only",
      workspace: "review",
      targetId: "review-oversight",
      title: "Live oversight",
      summary: "The top Review section keeps validator markers, pending supervisor review, and recent event payloads available without cluttering Operate.",
      shows:
        "It is the bounded oversight layer for interventions, event traceability, and demo markers.",
      whyItExists:
        "Operators, trainers, and judges need to verify what the system actually did, not just what the interface implied.",
      whenToCare:
        "Use it during a run if a validator event or supervisor review matters, or after a run when you want to trace how the session unfolded.",
      decisionSupport:
        "It preserves traceability from live behavior back to the canonical event stream.",
      completion: { kind: "manual" },
    },
    {
      id: "review-completed-only",
      workspace: "review",
      targetId: "review-completed",
      title: "Completed-run evidence",
      summary: "The middle Review section turns any terminal run into a replayable after-action review.",
      shows:
        "If a run is complete, this section shows the actual review artifact. If not, the empty state honestly tells you what must happen first.",
      whyItExists:
        "The product is meant to improve human performance and then show evidence of that improvement.",
      whenToCare:
        "Use it after every terminal run to inspect milestones, highlights, key events, and KPI summary.",
      decisionSupport:
        "It compresses the run into a trainer-friendly and judge-friendly artifact without hiding the canonical payloads.",
      completion: { kind: "manual" },
    },
    {
      id: "review-comparison-only",
      workspace: "review",
      targetId: "review-comparison",
      title: "Comparison and export logic",
      summary: "Review ends with the comparison and export model: session report for one run, paired comparison when baseline and adaptive both complete on the same scenario.",
      shows:
        "This area surfaces report readiness, download actions, and judge-facing comparison when the evidence set is complete.",
      whyItExists:
        "The competition argument depends on measured comparison, not just an attractive UI.",
      whenToCare:
        "Use it when building demo evidence, exporting artifacts, or comparing baseline and adaptive support behavior.",
      decisionSupport:
        "It closes the loop between operation, evaluation, and human-performance improvement.",
      completion: { kind: "manual" },
    },
    {
      id: "review-finish",
      workspace: "review",
      title: "Review workspace mental model",
      summary: "Think of Review as the evidence deck built into the product: live oversight first, completed-run review second, comparison/export third.",
      shows:
        "This workspace is where the system proves what it did and why it mattered.",
      whyItExists:
        "A strong competition prototype needs a built-in path from scenario runtime to evaluator evidence.",
      whenToCare:
        "Reopen this short tour whenever you want to refresh the evaluator flow without replaying the full operator tutorial.",
      decisionSupport:
        "It helps users understand how the product supports both live operation and measurable learning.",
      completion: { kind: "manual" },
    },
  ],
};

export const tutorialFlows: Record<TutorialPathId, TutorialFlow> = {
  full: fullFlow,
  operate: operateFlow,
  review: reviewFlow,
};

export function getTutorialFlow(pathId: TutorialPathId): TutorialFlow {
  return tutorialFlows[pathId];
}

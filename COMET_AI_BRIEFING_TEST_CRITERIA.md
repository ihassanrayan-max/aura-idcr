# Comet AI Briefing Test Criteria

## Purpose
Use this file to verify the grounded AI briefing layer that now ships in AURA-IDCR:

- `AI Incident Commander` in `Operate`
- `Why / Why-Not Assistant` on support posture and validator surfaces
- `AI After-Action Reviewer` in `Review`

This layer is optional, bounded, and advisory. The deterministic runtime remains the source of truth.

## Test environment

- Start from the current repo root.
- Run `npm run dev`.
- Use the local Vite URL.
- Do not treat a missing `OPENAI_API_KEY` as a failure.
- If the AI key is missing, deterministic fallback is the expected pass condition.
- Do not require webcam access for this test pass.

## Global pass rules

- The app loads without layout breakage on desktop-width and mobile-width browser views.
- `Operate` remains the default workspace and the existing control-room shell still works before any AI button is pressed.
- AI never replaces the plant, alarms, lane, validator, or review surfaces.
- AI never creates a freeform chat box, prompt box, or open-ended conversation UI.
- AI language stays advisory, grounded, and non-punitive.
- AI language must not make medical claims, fatigue diagnoses, or stigmatizing judgments about the operator.
- Operator authority remains explicit in the wording.
- Keyboard access works for AI buttons and refresh actions.
- If the server-side AI path is unavailable, fallback still renders usable content and the app stays operational.

## Test group 1: Operate loads cleanly

### Steps
1. Open the app and stay on `Operate`.
2. Confirm the usual operator shell is visible before touching any AI controls.
3. Check desktop width first, then a narrow mobile width.

### Pass criteria
- `Next Actions`, `Support Posture`, plant state, alarms, and storyline still render.
- `AI Incident Commander` is visible inside `Next Actions`.
- The support posture card shows buttons for `Why this posture?` and `Why not the other posture?`.
- No AI text area or chat composer is present.

## Test group 2: Incident Commander generation

### Steps
1. In `Operate`, click `Generate AI briefing`.
2. Wait for the result.
3. Advance the simulation by one tick.
4. Confirm the live briefing becomes stale.
5. Click `Refresh briefing`.

### Pass criteria
- The panel renders a compact structured briefing, not a long essay.
- The panel includes all of these concepts:
  - what is happening now
  - what to do next
  - what to watch next
  - why the system believes that
- A provider label appears.
- If the key is missing or the request fails, a fallback notice appears and the panel still shows grounded content.
- After a tick advances, the panel marks the briefing as stale.
- Refresh replaces the stale state with a fresh anchored result.
- The rest of the operator shell remains usable while the AI panel is loading or refreshing.

## Test group 3: Why / Why-Not on support posture

### Steps
1. In `Support Posture`, click `Why this posture?`.
2. Read the inline explanation.
3. Click `Why not the other posture?`.
4. Use the hide action on each explanation.

### Pass criteria
- Each explanation opens inline, not in a modal and not in a chat surface.
- The explanation includes a short answer plus bullet-style reasons.
- The explanation includes a confidence note.
- The explanation can be hidden cleanly.
- The explanation stays respectful and non-blaming.
- The explanation does not invent new plant behavior beyond what the deterministic UI already shows.

## Test group 4: Validator why explanation

### Steps
1. Stay in `Operate`.
2. In the manual utility or validation demo area, trigger:
   - `Show pass`
   - `Show soft warning`
   - `Show hard prevent`
3. For the `soft warning` and `hard prevent` cases, click `Why this result?`.

### Pass criteria
- `Show pass` does not create unnecessary AI clutter.
- `Show soft warning` produces the expected validator warning banner or last-validation banner.
- `Show hard prevent` produces the expected blocked-action path.
- `Why this result?` opens an inline explanation tied to the validator output.
- The explanation names the risk context and does not contradict the validator banner.
- The AI explanation does not override or weaken the validator outcome.

## Test group 5: Review after-action summary

### Steps
1. Run a scenario to a terminal outcome.
2. Open `Review`.
3. In `Completed Run`, click `Generate grounded AI summary`.

### Pass criteria
- `AI After-Action Reviewer` appears at the top of the completed-run section.
- The summary stays structured and includes:
  - overall assessment
  - turning points
  - adaptive observations
  - validator observations
  - training takeaways
- If the AI key is missing, fallback still produces a usable summary.
- The deterministic completed-review cards remain visible underneath the AI summary.

## Test group 6: Logging and traceability

### Steps
1. Generate at least one Incident Commander result.
2. Generate at least one Why / Why-Not result.
3. Generate one After-Action Reviewer result after a completed run.
4. Open `Review` and inspect the recent event stream.

### Pass criteria
- Recent events include AI briefing metadata events from `ai_briefing_layer`.
- Expected event types are visible:
  - `ai_briefing_requested`
  - `ai_briefing_resolved`
  - `ai_briefing_failed` only when fallback was needed
- The event stream shows metadata only.
- The event stream should not dump long raw AI prose into the canonical log payload.

## Test group 7: Inclusive quality checks

### Pass criteria
- The app does not require webcam, voice, or any biometric input to use the AI briefing layer.
- AI text avoids phrases that shame, diagnose, or stereotype the operator.
- AI text keeps the operator as the actor and the system as advisory support.
- Fallback behavior is honest about why it appeared.
- The UI remains understandable whether AI is available or unavailable.

## Test group 8: Final acceptance

Mark the pass as successful only if all of the following are true:

- The app passes the existing deterministic workflow even without AI.
- The three AI briefing surfaces all render in their intended locations.
- Fallback behavior is graceful and honest.
- No freeform AI chat UI appears.
- No AI surface mutates plant state, support mode, validator decisions, or completed-review truth.
- The experience remains operator-first, bounded, and readable.

## What Comet should capture if something fails

- Exact page or workspace
- Exact button clicked
- Scenario and run mode
- Whether AI key was present or missing
- Whether the issue happened in LLM mode or fallback mode
- Screenshot of the broken state
- Short note on whether the issue blocked operation or was only cosmetic

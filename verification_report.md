# AURA-IDCR Verification And Browser Test Protocol

## 1. Purpose of this document
This document serves two purposes:

1. It states the current AI implementation status in the repo so there is no ambiguity about what has and has not been built.
2. It provides a detailed browser-driven testing protocol that a generic web-testing agent such as Comet can execute like a human tester.

This document is written for the current repo state as of `2026-04-08`.

---

## 2. Current status of the AI roadmap

### Quick status
Only the **second AI idea** has been implemented as the main new AI feature:

- Implemented: **AI Counterfactual Twin Advisor**
- Not yet implemented: **AI Incident Commander**
- Not yet implemented: **AI After-Action Reviewer** as a standalone feature
- Not yet implemented: **AI Human Monitoring 2.0**
- Not yet implemented: **AI Why / Why-Not Assistant**

### What “implemented” means here
The repo now includes a real AI-backed, bounded decision-support layer that:

- compares exactly **three short-horizon branches**
  - guided recovery branch
  - operator-requested branch
  - hold / no-action branch
- uses the existing deterministic twin as the source of truth
- generates a short AI summary on top of those deterministic branch results
- logs the recommendation
- shows the branch comparison in **Operate**
- carries advisor evidence into **Review**
- records whether the next operator action matched the recommendation

### Important clarification
This implementation includes some supporting evaluation/reporting work because the Counterfactual Twin Advisor would have been weak if it existed only as a one-off popup. That extra work does **not** mean the third AI idea was fully implemented. It means the second idea was made judge-visible and testable.

### Safety / secret-handling status
The AI path is now integrated more safely than before:

- the OpenAI key is **not** stored in browser-exposed `VITE_*` variables
- the UI calls a local endpoint: `/api/counterfactual-advisor`
- the server-side handler calls OpenAI
- a bounded in-memory rate limit is applied
- deterministic fallback still works if:
  - the key is missing
  - the AI request fails
  - the AI output is malformed
  - the endpoint is rate-limited

### Current default rate limit
- `8` requests per `60` seconds per client IP

### Current automated verification status
- `npm test`: pass
- `npm run build`: pass
- Current suite status: `104 tests passed`

---

## 3. Scope that Comet should understand before testing

Comet should treat AURA-IDCR as:

- a **control-room decision-support prototype**
- not a chatbot
- not a freeform assistant
- not a real reactor control system
- a deterministic abnormal-event simulator with adaptive assistance

The AI feature being tested is specifically:

- **not** plant autonomy
- **not** AI directly controlling the simulation
- **not** training a custom model
- a bounded “what happens next?” advisor that compares short future branches before the operator commits to an action

---

## 4. Required setup before browser testing

### Precondition A: local app must be running
Start the app before launching Comet:

```bash
npm run dev
```

### Precondition B: AI key should be configured server-side
The local `.env` should contain:

- `OPENAI_API_KEY`
- `OPENAI_MODEL`
- `COUNTERFACTUAL_ADVISOR_RATE_LIMIT_MAX_REQUESTS`
- `COUNTERFACTUAL_ADVISOR_RATE_LIMIT_WINDOW_MS`

### Precondition C: browser URL
Unless the port changed, Comet should open:

- `http://127.0.0.1:5173`

If that fails, Comet should try the port shown by the terminal.

### Precondition D: testing mode
Comet should behave like a careful human evaluator:

- do not assume what the app should do
- inspect visible text
- click primary controls deliberately
- wait for short loading states to finish
- capture screenshots of important states
- note mismatches between expected and observed behavior

---

## 5. Global pass/fail rules

### Global pass
The feature is considered globally healthy if:

- the app loads without a blank screen
- `Operate` is the default workspace
- the `What Happens Next?` panel is visible
- generating a preview does not crash the app
- the branch preview shows three branches
- a recommendation appears
- Review shows advisor evidence after a preview is generated
- the simulation remains usable after AI preview generation

### Global fail
The feature should be marked failed if any of these occur:

- app does not load
- AI button click breaks the page
- preview never completes
- fewer than three branches appear
- recommendation is missing after preview completion
- Review does not show advisor evidence after a preview
- the live session mutates in an obviously wrong way before action is applied
- the UI becomes stuck after previewing

---

## 6. Browser test plan for Comet

Comet should execute the following tests in order.

For every test case:

- capture at least one screenshot
- log pass/fail
- include brief observed behavior
- include any visible mismatch text verbatim if possible

---

## 7. Test case group A: application smoke and shell integrity

### TC-A1: App loads and defaults to Operate
**Goal:** confirm the shell is working before AI-specific testing.

**Steps**
1. Open the local app URL.
2. Wait for the app shell to finish loading.
3. Confirm the top bar is visible.
4. Confirm the `Operate` tab is active.
5. Confirm the `Review` tab is visible but not active.

**Expected results**
- The page renders without console-visible crash behavior.
- The default workspace is `Operate`.
- The command bar is visible.
- The scenario title should initially be `Feedwater Degradation Alarm Cascade`.

**Evidence to capture**
- One full-page screenshot of the initial load.

### TC-A2: Core operator regions are visible
**Goal:** confirm the operator-first shell is intact.

**Steps**
1. On the default Operate workspace, locate the following section headers:
   - `Operator Orientation`
   - `Situation Board`
   - `Alarm Board`
   - `Next Actions`
   - `What Happens Next?`
   - `Support Posture`
   - `Storyline Board`

**Expected results**
- All listed sections are visible.
- `What Happens Next?` is present in the main operator workflow, not hidden in Review.

---

## 8. Test case group B: AI advisor empty state and generation behavior

### TC-B1: Advisor empty state is correct before first run
**Goal:** confirm the advisor starts in a safe non-chat empty state.

**Steps**
1. Stay on the default initial load.
2. Scroll to `What Happens Next?`.
3. Read the panel text before clicking anything.

**Expected results**
- The panel should not show a fake conversation or chatbot transcript.
- It should communicate that no branch preview exists yet.
- It should offer a button labeled `Preview next-action branches`.

### TC-B2: Generate first advisor preview from Operate
**Goal:** confirm the AI branch-preview flow runs end to end.

**Steps**
1. In `What Happens Next?`, click `Preview next-action branches`.
2. Wait for the loading state.
3. Observe the panel until the result settles.

**Expected results**
- While working, the button may show `Generating preview...`.
- After completion, the panel should show:
  - a recommendation headline
  - three compared branches
  - a short rationale
  - top watch signals or a similar watch list
  - a confidence / caveat note
- A provider label should appear:
  - ideally `LLM summary (gpt-4.1-mini)` or similar
  - acceptable fallback: `Deterministic fallback summary`

**Important note**
If fallback appears instead of LLM, that is not automatically a failure. It means the bounded feature still works, but Comet should note it clearly.

**Evidence to capture**
- Screenshot during loading, if possible.
- Screenshot after result is ready.

### TC-B3: Exactly three branches are shown
**Goal:** verify the bounded design, not a freeform AI output.

**Steps**
1. After a preview completes, count the branch cards shown in the advisor panel.

**Expected results**
- Exactly three branch cards should appear:
  - guided recovery path
  - manual operator request
  - hold and monitor

**Failure condition**
- Fewer than three or more than three branch options appear.

---

## 9. Test case group C: Scenario A AI behavior

### Scenario under test
- Scenario title: `Feedwater Degradation Alarm Cascade`
- Manual control label: `Feedwater Demand Target`
- Apply button: `Apply feedwater correction`

### TC-C1: Preview with default recommended-looking value in Scenario A
**Goal:** validate the happy-path AI preview.

**Steps**
1. Make sure the selected scenario is `Feedwater Degradation Alarm Cascade`.
2. Make sure `Next run` is `adaptive`.
3. Click `Reset session` to start clean.
4. In the manual control area, keep the default value at `82 % rated` if already present.
5. Click `Preview with AI`.
6. Wait for the advisor result.

**Expected results**
- The advisor should complete.
- The branch summaries should not all be identical.
- One branch should be marked `Recommended`.
- The rationale should read like a short operational brief, not a generic paragraph.

### TC-C2: Apply the recommended-looking Scenario A correction after preview
**Goal:** verify that advisor usage does not block normal operation.

**Steps**
1. After the preview is visible, click `Apply feedwater correction`.
2. If a soft warning appears, follow the visible warning flow and note it.
3. Resume the scenario using `Run guided pace` or `Run live pace`.
4. Let the scenario progress until a clear state change occurs.
5. Open `Review`.

**Expected results**
- Applying the action should still work after preview generation.
- The simulation should continue normally.
- Review should later show advisor evidence.

### TC-C3: Preview a risky Scenario A value
**Goal:** verify the advisor can distinguish a riskier manual branch from a safer branch.

**Steps**
1. Return to `Operate`.
2. Click `Reset session`.
3. In the `Feedwater Demand Target` slider, move the value to `55`.
4. Click `Preview with AI`.
5. Wait for the result.

**Expected results**
- The operator-requested branch should appear as one of the compared branches.
- Its summary should usually look worse than the safer branch.
- A different branch should usually be recommended.

**Important interpretation rule**
If the risky manual branch is still recommended, Comet should not instantly mark the app failed. It should record:
- what value was used
- which branch was recommended
- what the branch summaries said

That gives us a debugging artifact.

---

## 10. Test case group D: Scenario B AI behavior

### Scenario under test
- Scenario title: `Loss of Offsite Power Toward Station Blackout`
- Manual control label: `Isolation Condenser Demand Target`
- Apply button: `Apply IC alignment`

### TC-D1: Generate a preview in Scenario B
**Goal:** verify the advisor behaves on a different scenario family.

**Steps**
1. In the command bar, change `Next scenario` to `Loss of Offsite Power Toward Station Blackout`.
2. Keep `Next run` as `adaptive`.
3. Click `Reset session`.
4. In the manual control area, keep the default value `68`.
5. Click `Preview with AI`.

**Expected results**
- The advisor should generate a bounded three-branch preview.
- The rationale should be scenario-relevant, not copied from Scenario A.
- The branch summaries should mention different operational consequences.

### TC-D2: Review branch comparison quality in Scenario B
**Goal:** ensure the branch cards are meaningful and distinct.

**Checks**
- Each branch should have a one-line summary.
- The summaries should not all be the same sentence.
- The recommended branch should be visually distinguishable.
- The panel should still include a caveat / boundedness note.

---

## 11. Test case group E: Scenario C AI behavior

### Scenario under test
- Scenario title: `Main Steam Isolation Upset`
- Manual control label: `Isolation Condenser Demand Target`
- Apply button: `Apply IC recovery alignment`

### TC-E1: Generate a preview in Scenario C
**Goal:** verify the advisor works on the highest-intensity scenario.

**Steps**
1. Change `Next scenario` to `Main Steam Isolation Upset`.
2. Keep `Next run` as `adaptive`.
3. Click `Reset session`.
4. Keep the default manual value `72`.
5. Click `Preview with AI`.

**Expected results**
- The preview should complete without app instability.
- The result should still show exactly three branches.
- The wording should remain concise and operational.

### TC-E2: Check that critical operator surfaces remain visible
**Goal:** ensure AI does not crowd out the core control-room UI.

**Steps**
1. While the Scenario C preview is visible, confirm the following are still visible without leaving Operate:
   - `Situation Board`
   - `Alarm Board`
   - `Next Actions`
   - `What Happens Next?`

**Expected results**
- The advisor should feel additive, not like it replaced the operator interface.

---

## 12. Test case group F: Review workspace evidence and traceability

### TC-F1: Advisor evidence appears in Review after preview generation
**Goal:** ensure the AI contribution is judge-visible.

**Steps**
1. Generate at least one advisor preview from Operate.
2. Click `Review`.
3. Look for a card titled `Counterfactual advisor evidence`.

**Expected results**
- Review should show:
  - source tick
  - source time
  - recommendation
  - provider type
  - per-branch summary list

### TC-F2: Follow-up tracking after action
**Goal:** verify the app can record whether the operator followed the AI recommendation.

**Steps**
1. Generate an advisor preview.
2. Note which branch is recommended.
3. Apply the manual action associated with the visible control.
4. After the action is applied, open `Review` again.

**Expected results**
- If the applied action matches the recommended branch, Review should say the next applied action matched the recommendation.
- If it does not match, Review should say it diverged.

**Pass condition**
- Either message is acceptable as long as it is logically consistent with what the tester actually did.

---

## 13. Test case group G: Baseline vs adaptive behavior around the AI feature

### TC-G1: Confirm the AI advisor does not disappear from the product identity
**Goal:** ensure the feature still exists clearly in adaptive mode.

**Steps**
1. Set `Next run` to `adaptive`.
2. Click `Reset session`.
3. Verify `What Happens Next?` is present and interactive.

**Expected results**
- The advisor is clearly visible in adaptive mode.

### TC-G2: Check baseline mode behavior
**Goal:** verify whether the UI remains coherent when switching modes.

**Steps**
1. Change `Next run` to `baseline`.
2. Click `Reset session`.
3. Check whether the advisor panel still renders.
4. Try generating a preview if the button is still available.

**Expected results**
- The app should remain stable.
- If preview is available, it should still behave coherently.
- If the product team intends adaptive mode to be the main AI demonstration mode, Comet should note whether baseline still exposes the advisor and whether that feels acceptable or confusing.

**Interpretation**
This is not necessarily a fail condition. It is an evaluator insight.

---

## 14. Test case group H: Rate-limit and fallback behavior

These are higher-value tests if Comet can perform repeated interactions reliably.

### TC-H1: Repeated preview generation does not crash the app
**Goal:** verify bounded resilience.

**Steps**
1. On one scenario, click preview repeatedly across multiple resets or interactions.
2. If the app eventually shows fallback behavior or stops using LLM wording, note exactly what happened.

**Expected results**
- The app should not crash.
- If the rate limit is hit, the advisor should still show a deterministic fallback rather than failing catastrophically.

### TC-H2: Provider label should reflect actual mode
**Goal:** verify honest AI status reporting.

**Expected results**
- If the AI summary is active, provider label should look like `LLM summary (...)`.
- If AI is unavailable, provider label should indicate deterministic fallback.

---

## 15. Test case group I: Export and completed-run evidence

### TC-I1: Complete a run after using the advisor
**Goal:** verify the advisor is not just a transient front-end effect.

**Steps**
1. Generate at least one advisor preview.
2. Apply an action.
3. Run the scenario until terminal outcome.
4. Open `Review`.
5. Inspect:
   - completed run summary
   - KPI summary
   - highlights
   - key events replay

**Expected results**
- The session should complete normally.
- The run should still produce completed review evidence.
- The AI feature should not prevent normal reporting.

### TC-I2: Comparison and export section remains stable
**Goal:** verify the AI addition did not break Review.

**Steps**
1. In `Review`, inspect the `Comparison & Export` section.
2. If reports are ready, try the download buttons.
3. If not ready, confirm the empty/disabled states make sense.

**Expected results**
- The section should render cleanly.
- Buttons should not break the page.

---

## 16. What Comet should record for every major test

For each major test case, Comet should report:

- test case ID
- pass / fail / partial
- exact scenario name
- exact mode (`adaptive` or `baseline`)
- exact user actions performed
- observed visible result
- screenshot name or screenshot reference
- any inconsistency or ambiguity

For every advisor run, Comet should also capture:

- whether the provider was `LLM summary` or `Deterministic fallback summary`
- which branch was recommended
- whether three branches were shown
- whether watch signals were shown
- whether a caveat was shown

---

## 17. Suggested report template for Comet output

Comet’s final response should preferably follow this structure:

### A. Environment
- URL tested
- browser used
- whether app loaded successfully

### B. Current AI status observed
- was the advisor visible?
- did it appear AI-backed or deterministic fallback?

### C. Test results by case ID
- `TC-A1`
- `TC-A2`
- `TC-B1`
- `TC-B2`
- `TC-B3`
- `TC-C1`
- `TC-C2`
- `TC-C3`
- `TC-D1`
- `TC-D2`
- `TC-E1`
- `TC-E2`
- `TC-F1`
- `TC-F2`
- `TC-G1`
- `TC-G2`
- `TC-H1`
- `TC-H2`
- `TC-I1`
- `TC-I2`

### D. Key findings
- biggest success
- biggest bug
- biggest ambiguity
- whether the AI feature felt clearly integrated into the product

### E. Recommendation
- ready for demo
- ready with caveats
- not ready

---

## 18. Final interpretation guidance

The browser test should judge this feature on the right standard:

- Does it make the system visibly more AI-driven?
- Does it remain bounded and believable?
- Does it strengthen decision support without turning into a chat gimmick?
- Does it produce evidence visible in Review?

That is the right evaluation frame for the current implementation.

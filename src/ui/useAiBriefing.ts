import { useEffect, useMemo, useState } from "react";
import type {
  AiAfterActionReviewerBriefing,
  AiBriefingFailureKind,
  AiBriefingKind,
  AiBriefingProvider,
  AiBriefingWhySubjectId,
  AiIncidentCommanderBriefing,
  AiWhyAssistantBriefing,
  CompletedSessionReview,
  SessionSnapshot,
} from "../contracts/aura";
import type { AuraSessionStore } from "../state/sessionStore";
import {
  AI_BRIEFING_SCHEMA_VERSION,
  buildAfterActionReviewerFallback,
  buildAfterActionReviewerRequest,
  buildIncidentCommanderFallback,
  buildIncidentCommanderRequest,
  buildWhyAssistantFallback,
  buildWhyAssistantRequest,
  requestAiBriefing,
} from "../runtime/aiBriefing";

type AiBriefingEntry = {
  key: string;
  kind: AiBriefingKind;
  anchor_id: string;
  session_id: string;
  subject_id?: AiBriefingWhySubjectId;
  status: "loading" | "ready";
  provider?: AiBriefingProvider;
  model?: string;
  used_fallback?: boolean;
  failure_kind?: AiBriefingFailureKind;
  response?: AiIncidentCommanderBriefing | AiAfterActionReviewerBriefing | AiWhyAssistantBriefing;
};

type UseAiBriefingParams = {
  store: AuraSessionStore;
  snapshot: SessionSnapshot;
  completedReview?: CompletedSessionReview;
};

function makeKey(kind: AiBriefingKind, anchorId: string, subjectId?: AiBriefingWhySubjectId): string {
  return [kind, anchorId, subjectId ?? "none"].join("::");
}

export function useAiBriefing(params: UseAiBriefingParams) {
  const { store, snapshot, completedReview } = params;
  const [entries, setEntries] = useState<Record<string, AiBriefingEntry>>({});
  const [currentIncidentKey, setCurrentIncidentKey] = useState<string>();
  const [currentWhyKeys, setCurrentWhyKeys] = useState<Partial<Record<AiBriefingWhySubjectId, string>>>({});

  useEffect(() => {
    setCurrentIncidentKey(undefined);
    setCurrentWhyKeys({});
  }, [snapshot.session_id]);

  const liveAnchorId = snapshot.plant_tick.tick_id;
  const incidentEntry = currentIncidentKey ? entries[currentIncidentKey] : undefined;
  const incidentStale = Boolean(incidentEntry && incidentEntry.anchor_id !== liveAnchorId);

  const afterActionEntry = useMemo(() => {
    if (!completedReview) {
      return undefined;
    }
    return entries[makeKey("after_action_reviewer", completedReview.session_id)];
  }, [completedReview, entries]);

  const whyEntries = useMemo(
    () =>
      ({
        support_current: currentWhyKeys.support_current ? entries[currentWhyKeys.support_current] : undefined,
        support_alternative: currentWhyKeys.support_alternative ? entries[currentWhyKeys.support_alternative] : undefined,
        validator_last_result: currentWhyKeys.validator_last_result ? entries[currentWhyKeys.validator_last_result] : undefined,
      }) satisfies Partial<Record<AiBriefingWhySubjectId, AiBriefingEntry | undefined>>,
    [currentWhyKeys, entries],
  );

  const whyStale = {
    support_current: Boolean(whyEntries.support_current && whyEntries.support_current.anchor_id !== liveAnchorId),
    support_alternative: Boolean(whyEntries.support_alternative && whyEntries.support_alternative.anchor_id !== liveAnchorId),
    validator_last_result: Boolean(
      whyEntries.validator_last_result && whyEntries.validator_last_result.anchor_id !== liveAnchorId,
    ),
  } satisfies Record<AiBriefingWhySubjectId, boolean>;

  async function loadIncidentCommander(force = false): Promise<void> {
    const request = buildIncidentCommanderRequest(snapshot);
    const fallback = buildIncidentCommanderFallback(snapshot);
    const key = makeKey(request.kind, request.anchor.anchor_id);
    setCurrentIncidentKey(key);

    if (!force && entries[key]?.status === "ready") {
      return;
    }

    setEntries((current) => ({
      ...current,
      [key]: {
        key,
        kind: request.kind,
        anchor_id: request.anchor.anchor_id,
        session_id: request.anchor.session_id,
        status: "loading",
      },
    }));

    store.recordAiBriefingRequested({
      briefing_kind: request.kind,
      anchor_kind: request.anchor.anchor_kind,
      anchor_id: request.anchor.anchor_id,
      schema_version: AI_BRIEFING_SCHEMA_VERSION,
      sim_time_sec: request.anchor.sim_time_sec,
    });

    const result = await requestAiBriefing({ request, fallback });
    if (store.getSnapshot().session_id !== request.anchor.session_id) {
      return;
    }

    if (result.used_fallback && result.failure_kind) {
      store.recordAiBriefingFailed({
        briefing_kind: request.kind,
        anchor_id: request.anchor.anchor_id,
        failure_kind: result.failure_kind,
        fallback_used: true,
        schema_version: AI_BRIEFING_SCHEMA_VERSION,
        sim_time_sec: request.anchor.sim_time_sec,
      });
    }

    store.recordAiBriefingResolved({
      briefing_kind: request.kind,
      anchor_id: request.anchor.anchor_id,
      used_fallback: result.used_fallback,
      evidence_ref_ids: result.response.evidence_refs.map((ref) => ref.ref_id),
      schema_version: AI_BRIEFING_SCHEMA_VERSION,
      sim_time_sec: request.anchor.sim_time_sec,
    });

    setEntries((current) => ({
      ...current,
      [key]: {
        key,
        kind: request.kind,
        anchor_id: request.anchor.anchor_id,
        session_id: request.anchor.session_id,
        status: "ready",
        provider: result.provider,
        model: result.model,
        used_fallback: result.used_fallback,
        failure_kind: result.failure_kind,
        response: result.response,
      },
    }));
  }

  async function loadAfterActionReviewer(force = false): Promise<void> {
    if (!completedReview) {
      return;
    }

    const request = buildAfterActionReviewerRequest(completedReview);
    const fallback = buildAfterActionReviewerFallback(completedReview);
    const key = makeKey(request.kind, request.anchor.anchor_id);

    if (!force && entries[key]?.status === "ready") {
      return;
    }

    setEntries((current) => ({
      ...current,
      [key]: {
        key,
        kind: request.kind,
        anchor_id: request.anchor.anchor_id,
        session_id: request.anchor.session_id,
        status: "loading",
      },
    }));

    store.recordAiBriefingRequested({
      briefing_kind: request.kind,
      anchor_kind: request.anchor.anchor_kind,
      anchor_id: request.anchor.anchor_id,
      schema_version: AI_BRIEFING_SCHEMA_VERSION,
      sim_time_sec: request.anchor.sim_time_sec,
    });

    const result = await requestAiBriefing({ request, fallback });
    if (store.getSnapshot().session_id !== request.anchor.session_id) {
      return;
    }

    if (result.used_fallback && result.failure_kind) {
      store.recordAiBriefingFailed({
        briefing_kind: request.kind,
        anchor_id: request.anchor.anchor_id,
        failure_kind: result.failure_kind,
        fallback_used: true,
        schema_version: AI_BRIEFING_SCHEMA_VERSION,
        sim_time_sec: request.anchor.sim_time_sec,
      });
    }

    store.recordAiBriefingResolved({
      briefing_kind: request.kind,
      anchor_id: request.anchor.anchor_id,
      used_fallback: result.used_fallback,
      evidence_ref_ids: result.response.evidence_refs.map((ref) => ref.ref_id),
      schema_version: AI_BRIEFING_SCHEMA_VERSION,
      sim_time_sec: request.anchor.sim_time_sec,
    });

    setEntries((current) => ({
      ...current,
      [key]: {
        key,
        kind: request.kind,
        anchor_id: request.anchor.anchor_id,
        session_id: request.anchor.session_id,
        status: "ready",
        provider: result.provider,
        model: result.model,
        used_fallback: result.used_fallback,
        failure_kind: result.failure_kind,
        response: result.response,
      },
    }));
  }

  async function loadWhyAssistant(subjectId: AiBriefingWhySubjectId, force = false): Promise<void> {
    const request = buildWhyAssistantRequest(snapshot, subjectId);
    const fallback = buildWhyAssistantFallback(snapshot, subjectId);
    const key = makeKey(request.kind, request.anchor.anchor_id, subjectId);

    setCurrentWhyKeys((current) => ({
      ...current,
      [subjectId]: key,
    }));

    if (!force && entries[key]?.status === "ready") {
      return;
    }

    setEntries((current) => ({
      ...current,
      [key]: {
        key,
        kind: request.kind,
        anchor_id: request.anchor.anchor_id,
        session_id: request.anchor.session_id,
        subject_id: subjectId,
        status: "loading",
      },
    }));

    store.recordAiBriefingRequested({
      briefing_kind: request.kind,
      subject_id: subjectId,
      anchor_kind: request.anchor.anchor_kind,
      anchor_id: request.anchor.anchor_id,
      schema_version: AI_BRIEFING_SCHEMA_VERSION,
      sim_time_sec: request.anchor.sim_time_sec,
    });

    const result = await requestAiBriefing({ request, fallback });
    if (store.getSnapshot().session_id !== request.anchor.session_id) {
      return;
    }

    if (result.used_fallback && result.failure_kind) {
      store.recordAiBriefingFailed({
        briefing_kind: request.kind,
        subject_id: subjectId,
        anchor_id: request.anchor.anchor_id,
        failure_kind: result.failure_kind,
        fallback_used: true,
        schema_version: AI_BRIEFING_SCHEMA_VERSION,
        sim_time_sec: request.anchor.sim_time_sec,
      });
    }

    store.recordAiBriefingResolved({
      briefing_kind: request.kind,
      subject_id: subjectId,
      anchor_id: request.anchor.anchor_id,
      used_fallback: result.used_fallback,
      evidence_ref_ids: result.response.evidence_refs.map((ref) => ref.ref_id),
      schema_version: AI_BRIEFING_SCHEMA_VERSION,
      sim_time_sec: request.anchor.sim_time_sec,
    });

    setEntries((current) => ({
      ...current,
      [key]: {
        key,
        kind: request.kind,
        anchor_id: request.anchor.anchor_id,
        session_id: request.anchor.session_id,
        subject_id: subjectId,
        status: "ready",
        provider: result.provider,
        model: result.model,
        used_fallback: result.used_fallback,
        failure_kind: result.failure_kind,
        response: result.response,
      },
    }));
  }

  function clearWhyAssistant(subjectId: AiBriefingWhySubjectId): void {
    setCurrentWhyKeys((current) => ({
      ...current,
      [subjectId]: undefined,
    }));
  }

  return {
    incidentCommander: {
      entry: incidentEntry,
      stale: incidentStale,
    },
    afterActionReviewer: {
      entry: afterActionEntry,
    },
    whyAssistant: {
      entries: whyEntries,
      stale: whyStale,
    },
    loadIncidentCommander,
    loadAfterActionReviewer,
    loadWhyAssistant,
    clearWhyAssistant,
  };
}

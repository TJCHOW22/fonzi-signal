"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import {
  GlobalAIControls,
  type ActivityJob,
  type ActivityStage,
  type AppNotification,
  type DraftNavigationTarget,
  type GlobalAIControlsPlacement,
} from "./global-ai-controls";
import type {
  DraftProductionStage,
  DraftGenerationRunRecord,
  DraftNotificationRecord,
  DraftRecord,
} from "@/lib/media-drafts/types";

type DraftsResponse = {
  drafts: DraftRecord[];
  notifications: DraftNotificationRecord[];
};

type CreateDraftResponse = {
  draft: DraftRecord;
  created: boolean;
};

type GenerateDraftResponse = {
  draft: DraftRecord;
  notification: DraftNotificationRecord;
};

type ReadNotificationResponse = {
  notification: DraftNotificationRecord;
};

type UpdateProductionStageResponse = {
  draft: DraftRecord;
};

export type CreateMediaDraftResult = {
  draft: DraftRecord;
  created: boolean;
};

export interface GlobalAIStateValue {
  drafts: readonly DraftRecord[];
  activities: readonly ActivityJob[];
  notifications: readonly AppNotification[];
  loading: boolean;
  error: string | null;
  createDraft: (sourceMediaId: string) => Promise<CreateMediaDraftResult>;
  rerunDraft: (draftId: number) => Promise<DraftRecord>;
  setDraftProductionStage: (
    draftId: number,
    productionStage: DraftProductionStage,
  ) => Promise<DraftRecord>;
  refreshDrafts: () => Promise<void>;
  markNotificationRead: (notificationId: string) => Promise<void>;
}

const GlobalAIStateContext = createContext<GlobalAIStateValue | null>(null);

const RUN_STAGE_PRESENTATION: Record<
  Exclude<DraftGenerationRunRecord["stage"], "ready" | "failed">,
  {
  stage: Exclude<ActivityStage, "ready">;
  progress: null;
  label: string;
}> = {
  preparing_source: { stage: "preparing source", progress: null, label: "Preparing source" },
  writing: { stage: "writing", progress: null, label: "Writing draft" },
  verifying_facts: { stage: "verifying facts", progress: null, label: "Verifying facts" },
  checking_voice: { stage: "checking voice", progress: null, label: "Checking Brett's voice" },
};

const ACTIVE_RUN_STAGES = new Set<DraftGenerationRunRecord["stage"]>([
  "preparing_source",
  "writing",
  "verifying_facts",
  "checking_voice",
]);

const activityId = (draftId: number) => `media-draft:${draftId}`;

const draftTitle = (draft: DraftRecord) =>
  draft.thumbnailHook?.trim() ||
  draft.scriptHook?.trim() ||
  `Instagram draft ${draft.id}`;

function activityForDraft(
  draft: DraftRecord,
  run: DraftGenerationRunRecord | null = draft.latestRun,
): ActivityJob {
  const activeStage = run && ACTIVE_RUN_STAGES.has(run.stage)
    ? RUN_STAGE_PRESENTATION[run.stage as keyof typeof RUN_STAGE_PRESENTATION]
    : RUN_STAGE_PRESENTATION.preparing_source;
  const passLabel = run?.passNumber ? ` · pass ${run.passNumber}` : "";

  return {
    id: activityId(draft.id),
    draftTitle: draftTitle(draft),
    speaker: draft.speaker,
    stage: activeStage.stage,
    progress: activeStage.progress,
    progressLabel: `${activeStage.label}${passLabel}`,
  };
}

function readyActivity(draft: DraftRecord): ActivityJob {
  const passLabel = draft.latestRun?.passNumber
    ? ` · pass ${draft.latestRun.passNumber}`
    : "";
  return {
    id: activityId(draft.id),
    draftTitle: draftTitle(draft),
    speaker: draft.speaker,
    stage: "ready",
    progress: 100,
    progressLabel: `Ready for review${passLabel}`,
  };
}

function hasActiveRun(draft: DraftRecord) {
  return Boolean(draft.latestRun && ACTIVE_RUN_STAGES.has(draft.latestRun.stage));
}

function displayTimestamp(value: string) {
  const normalizedValue = /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/.test(value)
    ? `${value.replace(" ", "T")}Z`
    : value;
  const date = new Date(normalizedValue);
  if (Number.isNaN(date.getTime())) return value;

  const elapsedSeconds = Math.max(0, Math.floor((Date.now() - date.getTime()) / 1000));
  if (elapsedSeconds < 60) return "Just now";
  const elapsedMinutes = Math.floor(elapsedSeconds / 60);
  if (elapsedMinutes < 60) return `${elapsedMinutes} min ago`;
  const elapsedHours = Math.floor(elapsedMinutes / 60);
  if (elapsedHours < 24) return `${elapsedHours} hr ago`;

  return new Intl.DateTimeFormat(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(date);
}

function notificationForRecord(notification: DraftNotificationRecord): AppNotification {
  return {
    id: String(notification.id),
    eventStatus: "draft ready",
    draftTitle: notification.draftTitle,
    speaker: notification.speaker,
    timestamp: displayTimestamp(notification.createdAt),
    read: notification.readAt !== null,
    target: {
      href: notification.draftUrl,
      draftId: String(notification.draftId),
      label: notification.draftTitle,
    },
  };
}

function upsertDraft(current: readonly DraftRecord[], draft: DraftRecord) {
  const found = current.some((item) => item.id === draft.id);
  return found
    ? current.map((item) => (item.id === draft.id ? draft : item))
    : [draft, ...current];
}

function upsertActivity(current: readonly ActivityJob[], activity: ActivityJob) {
  const found = current.some((item) => item.id === activity.id);
  return found
    ? current.map((item) => (item.id === activity.id ? activity : item))
    : [activity, ...current];
}

function upsertNotification(
  current: readonly AppNotification[],
  notification: AppNotification,
) {
  const found = current.some((item) => item.id === notification.id);
  return found
    ? current.map((item) => (item.id === notification.id ? notification : item))
    : [notification, ...current];
}

async function requestJson<T>(input: string, init?: RequestInit): Promise<T> {
  const response = await fetch(input, init);
  if (response.ok) return response.json() as Promise<T>;

  let message = `Request failed (${response.status})`;
  try {
    const body = (await response.json()) as { error?: unknown };
    if (typeof body.error === "string" && body.error.trim()) message = body.error;
  } catch {
    // Keep the status-based fallback when an endpoint returns no JSON body.
  }
  throw new Error(message);
}

export function GlobalAIStateProvider({
  children,
  enabled,
}: {
  children: ReactNode;
  enabled: boolean;
}) {
  const [drafts, setDrafts] = useState<DraftRecord[]>([]);
  const [activities, setActivities] = useState<ActivityJob[]>([]);
  const [notifications, setNotifications] = useState<AppNotification[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const generationRequests = useRef(new Map<number, Promise<void>>());
  const creationRequests = useRef(new Map<string, Promise<CreateMediaDraftResult>>());
  const syncRequest = useRef<Promise<void> | null>(null);

  const applyServerState = useCallback((result: DraftsResponse) => {
    setDrafts(result.drafts);
    setNotifications(result.notifications.map(notificationForRecord));
    const activeDrafts = result.drafts.filter(hasActiveRun);
    setActivities((current) => {
      const activeIds = new Set(activeDrafts.map((draft) => activityId(draft.id)));
      const completedThisSession = current.filter(
        (activity) => activity.stage === "ready" && !activeIds.has(activity.id),
      );
      return [
        ...activeDrafts.map((draft) => activityForDraft(draft)),
        ...completedThisSession,
      ];
    });
  }, []);

  const syncDrafts = useCallback((showLoading: boolean) => {
    if (!enabled) return Promise.resolve();
    const pending = syncRequest.current;
    if (pending) return pending;

    if (showLoading) setLoading(true);
    const request = (async () => {
      try {
        const result = await requestJson<DraftsResponse>("/api/drafts", {
          cache: "no-store",
        });
        applyServerState(result);
        setError(null);
      } catch (refreshError) {
        setError(
          refreshError instanceof Error
            ? refreshError.message
            : "Could not load drafts",
        );
      } finally {
        if (showLoading) setLoading(false);
        syncRequest.current = null;
      }
    })();
    syncRequest.current = request;
    return request;
  }, [applyServerState, enabled]);

  const runGeneration = useCallback((draft: DraftRecord, force = false) => {
    const pending = generationRequests.current.get(draft.id);
    if (pending) return pending;

    setActivities((current) => upsertActivity(current, activityForDraft(draft)));
    setDrafts((current) => current.map((item) => item.id === draft.id
      ? { ...item, generationStatus: "generating" }
      : item));

    const request = (async () => {
      try {
        const result = await requestJson<GenerateDraftResponse>(
          `/api/drafts/${draft.id}/generate`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ force }),
          },
        );
        setDrafts((current) => upsertDraft(current, result.draft));
        setActivities((current) =>
          upsertActivity(current, readyActivity(result.draft)),
        );
        setNotifications((current) =>
          upsertNotification(current, notificationForRecord(result.notification)),
        );
        setError(null);
      } catch (generationError) {
        await syncDrafts(false);
        setError(
          generationError instanceof Error
            ? generationError.message
            : "Draft generation failed",
        );
        throw generationError;
      } finally {
        generationRequests.current.delete(draft.id);
      }
    })();

    generationRequests.current.set(draft.id, request);
    return request;
  }, [syncDrafts]);

  const refreshDrafts = useCallback(async () => {
    await syncDrafts(true);
  }, [syncDrafts]);

  useEffect(() => {
    if (!enabled) return;
    void refreshDrafts();
  }, [enabled, refreshDrafts]);

  const hasRunningActivity = activities.some((activity) => activity.stage !== "ready");

  useEffect(() => {
    if (!enabled || !hasRunningActivity) return;
    const poll = window.setInterval(() => {
      void syncDrafts(false);
    }, 800);
    return () => window.clearInterval(poll);
  }, [enabled, hasRunningActivity, syncDrafts]);

  const createDraft = useCallback((sourceMediaId: string) => {
    const normalizedSourceId = sourceMediaId.trim();
    if (!normalizedSourceId) {
      return Promise.reject(new Error("A source Media id is required"));
    }

    const pending = creationRequests.current.get(normalizedSourceId);
    if (pending) return pending;

    const request = (async (): Promise<CreateMediaDraftResult> => {
      try {
        const result = await requestJson<CreateDraftResponse>("/api/drafts", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ sourceMediaId: normalizedSourceId }),
        });
        setDrafts((current) => upsertDraft(current, result.draft));
        setError(null);
        if (result.draft.generationStatus === "generating") {
          await runGeneration(result.draft);
        }
        return result;
      } catch (creationError) {
        setError(
          creationError instanceof Error
            ? creationError.message
            : "Could not create draft",
        );
        throw creationError;
      } finally {
        creationRequests.current.delete(normalizedSourceId);
      }
    })();

    creationRequests.current.set(normalizedSourceId, request);
    return request;
  }, [runGeneration]);

  const rerunDraft = useCallback(async (draftId: number) => {
    const draft = drafts.find((item) => item.id === draftId);
    if (!draft) throw new Error("Draft not found");
    await runGeneration(draft, true);
    const refreshed = await requestJson<DraftsResponse>("/api/drafts", {
      cache: "no-store",
    });
    applyServerState(refreshed);
    const updated = refreshed.drafts.find((item) => item.id === draftId);
    if (!updated) throw new Error("Draft not found after generation");
    return updated;
  }, [applyServerState, drafts, runGeneration]);

  const setDraftProductionStage = useCallback(async (
    draftId: number,
    productionStage: DraftProductionStage,
  ) => {
    const result = await requestJson<UpdateProductionStageResponse>(
      `/api/drafts/${draftId}/production-stage`,
      {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ productionStage }),
      },
    );
    setDrafts((current) => upsertDraft(current, result.draft));
    setError(null);
    return result.draft;
  }, []);

  const markNotificationRead = useCallback(async (notificationId: string) => {
    const previous = notifications.find(
      (notification) => notification.id === notificationId,
    );
    if (!previous || previous.read) return;

    setNotifications((current) =>
      current.map((notification) =>
        notification.id === notificationId
          ? { ...notification, read: true }
          : notification,
      ),
    );

    try {
      const result = await requestJson<ReadNotificationResponse>(
        `/api/draft-notifications/${encodeURIComponent(notificationId)}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ read: true }),
        },
      );
      setNotifications((current) =>
        upsertNotification(current, notificationForRecord(result.notification)),
      );
      setError(null);
    } catch (readError) {
      setNotifications((current) =>
        current.map((notification) =>
          notification.id === notificationId ? previous : notification,
        ),
      );
      setError(
        readError instanceof Error
          ? readError.message
          : "Could not mark notification as read",
      );
    }
  }, [notifications]);

  const value = useMemo<GlobalAIStateValue>(() => ({
    drafts,
    activities,
    notifications,
    loading,
    error,
    createDraft,
    rerunDraft,
    setDraftProductionStage,
    refreshDrafts,
    markNotificationRead,
  }), [
    activities,
    createDraft,
    drafts,
    error,
    loading,
    markNotificationRead,
    notifications,
    rerunDraft,
    setDraftProductionStage,
    refreshDrafts,
  ]);

  return (
    <GlobalAIStateContext.Provider value={value}>
      {children}
    </GlobalAIStateContext.Provider>
  );
}

export function useGlobalAIState() {
  const value = useContext(GlobalAIStateContext);
  if (!value) {
    throw new Error("useGlobalAIState must be used inside GlobalAIStateProvider");
  }
  return value;
}

export function ConnectedGlobalAIControls({
  placement,
  onNavigate,
}: {
  placement: GlobalAIControlsPlacement;
  onNavigate: (target: DraftNavigationTarget) => void;
}) {
  const { activities, notifications, markNotificationRead } = useGlobalAIState();

  return (
    <GlobalAIControls
      activities={activities}
      notifications={notifications}
      placement={placement}
      onNavigate={onNavigate}
      onNotificationRead={(notificationId) => {
        void markNotificationRead(notificationId);
      }}
    />
  );
}

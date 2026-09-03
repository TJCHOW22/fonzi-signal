"use client";

import { useCallback, useEffect, useId, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import styles from "./global-ai-controls.module.css";
import {
  MOCK_ACTIVITY_JOBS,
  MOCK_NOTIFICATIONS,
  type ActivityJob,
  type AppNotification,
  type DraftNavigationTarget,
} from "./mock-state";

export type {
  ActivityJob,
  ActivityStage,
  AppNotification,
  DraftNavigationTarget,
  NotificationEventStatus,
} from "./mock-state";

export type GlobalAIControlsPlacement = "media" | "canvas";

export interface GlobalAIControlsProps {
  activities?: readonly ActivityJob[];
  notifications?: readonly AppNotification[];
  placement?: GlobalAIControlsPlacement;
  onNavigate?: (target: DraftNavigationTarget) => void;
  onNotificationRead?: (notificationId: string) => void;
}

type OpenPanel = "activity" | "notifications" | null;

function ProgressState({ job }: { job: ActivityJob }) {
  const isIndeterminate = job.progress === null;

  return (
    <div className={styles.progressState}>
      <div className={styles.progressText}>
        <span>{job.progressLabel}</span>
        {!isIndeterminate ? <span>{job.progress}%</span> : <span>Working</span>}
      </div>
      <div
        className={`${styles.progressTrack} ${isIndeterminate ? styles.progressIndeterminate : ""}`}
        role="progressbar"
        aria-label={`${job.draftTitle}: ${job.progressLabel}`}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={job.progress ?? undefined}
      >
        <span style={isIndeterminate ? undefined : { width: `${job.progress}%` }} />
      </div>
    </div>
  );
}

function ActivityPanel({
  activities,
  headingRef,
  panelId,
  onClose,
}: {
  activities: readonly ActivityJob[];
  headingRef: React.RefObject<HTMLHeadingElement | null>;
  panelId: string;
  onClose: () => void;
}) {
  const runningCount = activities.filter((job) => job.stage !== "ready").length;

  return (
    <aside
      className={styles.panel}
      id={panelId}
      role="dialog"
      aria-labelledby={`${panelId}-title`}
    >
      <header className={styles.panelHeader}>
        <div>
          <p className={styles.eyebrow}>Live workspace</p>
          <h2 id={`${panelId}-title`} ref={headingRef} tabIndex={-1}>
            AI activity
          </h2>
          <p>
            {runningCount > 0
              ? `${runningCount} ${runningCount === 1 ? "job" : "jobs"} running`
              : "Nothing is running"}
          </p>
        </div>
        <button className={styles.closeButton} type="button" onClick={onClose} aria-label="Close AI activity">
          <span aria-hidden="true">×</span>
        </button>
      </header>

      <div className={styles.panelBody}>
        {activities.length === 0 ? (
          <div className={styles.emptyState}>
            <span className={styles.emptyActivityMark} aria-hidden="true" />
            <h3>No AI jobs running</h3>
            <p>New drafting jobs will appear here with live progress.</p>
          </div>
        ) : (
          <ol className={styles.activityList} aria-label="AI jobs">
            {activities.map((job) => {
              const isReady = job.stage === "ready";

              return (
                <li className={`${styles.activityItem} ${isReady ? styles.activityReady : ""}`} key={job.id}>
                  <div className={styles.itemTopline}>
                    <span className={styles.jobStateMark} aria-hidden="true" />
                    <span className={styles.stageLabel}>{job.stage}</span>
                  </div>
                  <h3>{job.draftTitle}</h3>
                  <p className={styles.speaker}>{job.speaker}</p>
                  <ProgressState job={job} />
                </li>
              );
            })}
          </ol>
        )}
      </div>
    </aside>
  );
}

function NotificationsPanel({
  notifications,
  headingRef,
  panelId,
  onClose,
  onNotificationClick,
}: {
  notifications: readonly AppNotification[];
  headingRef: React.RefObject<HTMLHeadingElement | null>;
  panelId: string;
  onClose: () => void;
  onNotificationClick: (notification: AppNotification) => void;
}) {
  const unreadCount = notifications.filter((notification) => !notification.read).length;

  return (
    <aside
      className={styles.panel}
      id={panelId}
      role="dialog"
      aria-labelledby={`${panelId}-title`}
    >
      <header className={styles.panelHeader}>
        <div>
          <p className={styles.eyebrow}>Updates</p>
          <h2 id={`${panelId}-title`} ref={headingRef} tabIndex={-1}>
            Notifications
          </h2>
          <p>{unreadCount > 0 ? `${unreadCount} unread` : "You are all caught up"}</p>
        </div>
        <button className={styles.closeButton} type="button" onClick={onClose} aria-label="Close notifications">
          <span aria-hidden="true">×</span>
        </button>
      </header>

      <div className={styles.panelBody}>
        {notifications.length === 0 ? (
          <div className={styles.emptyState}>
            <span className={styles.emptyBellMark} aria-hidden="true" />
            <h3>No notifications yet</h3>
            <p>Draft updates will stay here as a history.</p>
          </div>
        ) : (
          <ol className={styles.notificationList} aria-label="Notifications">
            {notifications.map((notification) => (
              <li key={notification.id}>
                <button
                  className={`${styles.notificationItem} ${notification.read ? styles.notificationRead : styles.notificationUnread}`}
                  type="button"
                  onClick={() => onNotificationClick(notification)}
                  aria-label={`${notification.eventStatus}: ${notification.draftTitle}, ${notification.speaker}, ${notification.timestamp}`}
                >
                  <span className={styles.notificationStatusRow}>
                    <span className={styles.notificationStatus}>{notification.eventStatus}</span>
                    <time>{notification.timestamp}</time>
                  </span>
                  <strong>{notification.draftTitle}</strong>
                  <span className={styles.notificationMeta}>
                    <span>{notification.speaker}</span>
                    <span className={styles.openMark} aria-hidden="true">›</span>
                  </span>
                </button>
              </li>
            ))}
          </ol>
        )}
      </div>
    </aside>
  );
}

export function GlobalAIControls({
  activities = MOCK_ACTIVITY_JOBS,
  notifications = MOCK_NOTIFICATIONS,
  placement = "canvas",
  onNavigate,
  onNotificationRead,
}: GlobalAIControlsProps) {
  const router = useRouter();
  const rootRef = useRef<HTMLDivElement>(null);
  const activityButtonRef = useRef<HTMLButtonElement>(null);
  const notificationsButtonRef = useRef<HTMLButtonElement>(null);
  const panelHeadingRef = useRef<HTMLHeadingElement>(null);
  const returnFocusRef = useRef<HTMLButtonElement | null>(null);
  const [openPanel, setOpenPanel] = useState<OpenPanel>(null);
  const [locallyReadIds, setLocallyReadIds] = useState<ReadonlySet<string>>(() => new Set());
  const instanceId = useId();
  const activityPanelId = `${instanceId}-activity-panel`;
  const notificationsPanelId = `${instanceId}-notifications-panel`;

  const displayedNotifications = useMemo(
    () =>
      notifications.map((notification) =>
        locallyReadIds.has(notification.id) ? { ...notification, read: true } : notification,
      ),
    [locallyReadIds, notifications],
  );

  const runningCount = activities.filter((job) => job.stage !== "ready").length;
  const unreadCount = displayedNotifications.filter((notification) => !notification.read).length;

  const closePanel = useCallback((restoreFocus = true) => {
    setOpenPanel(null);
    if (restoreFocus) {
      window.requestAnimationFrame(() => returnFocusRef.current?.focus());
    }
  }, []);

  const togglePanel = useCallback((panel: Exclude<OpenPanel, null>) => {
    const trigger = panel === "activity" ? activityButtonRef.current : notificationsButtonRef.current;
    returnFocusRef.current = trigger;
    setOpenPanel((current) => (current === panel ? null : panel));
  }, []);

  useEffect(() => {
    if (!openPanel) return;

    window.requestAnimationFrame(() => panelHeadingRef.current?.focus());

    function handlePointerDown(event: PointerEvent) {
      if (rootRef.current?.contains(event.target as Node)) return;
      closePanel(false);
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key !== "Escape") return;
      event.preventDefault();
      closePanel();
    }

    document.addEventListener("pointerdown", handlePointerDown, true);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("pointerdown", handlePointerDown, true);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [closePanel, openPanel]);

  const handleNotificationClick = useCallback(
    (notification: AppNotification) => {
      if (!notification.read && !locallyReadIds.has(notification.id)) {
        setLocallyReadIds((current) => new Set(current).add(notification.id));
        onNotificationRead?.(notification.id);
      }

      closePanel(false);
      if (onNavigate) {
        onNavigate(notification.target);
        return;
      }
      router.push(notification.target.href);
    },
    [closePanel, locallyReadIds, onNavigate, onNotificationRead, router],
  );

  return (
    <div
      className={`${styles.root} ${placement === "media" ? styles.placementMedia : styles.placementCanvas}`}
      ref={rootRef}
      data-global-ai-controls
    >
      <div className={styles.controlBar} aria-label="Global AI controls" role="group">
        <button
          className={`${styles.controlButton} ${runningCount > 0 ? styles.activityButtonActive : ""}`}
          ref={activityButtonRef}
          type="button"
          onClick={() => togglePanel("activity")}
          aria-label={runningCount > 0 ? `AI activity, ${runningCount} jobs running` : "AI activity, no jobs running"}
          aria-expanded={openPanel === "activity"}
          aria-controls={activityPanelId}
          aria-haspopup="dialog"
        >
          <span className={styles.activityGlyph} aria-hidden="true">
            <span />
          </span>
          {runningCount > 0 ? <span className={styles.countBadge}>{runningCount}</span> : null}
        </button>

        <button
          className={`${styles.controlButton} ${unreadCount > 0 ? styles.notificationButtonUnread : ""}`}
          ref={notificationsButtonRef}
          type="button"
          onClick={() => togglePanel("notifications")}
          aria-label={unreadCount > 0 ? `Notifications, ${unreadCount} unread` : "Notifications, no unread items"}
          aria-expanded={openPanel === "notifications"}
          aria-controls={notificationsPanelId}
          aria-haspopup="dialog"
        >
          <span className={styles.bellGlyph} aria-hidden="true" />
          {unreadCount > 0 ? <span className={styles.unreadDot} aria-hidden="true" /> : null}
        </button>
      </div>

      {openPanel === "activity" ? (
        <ActivityPanel
          activities={activities}
          headingRef={panelHeadingRef}
          panelId={activityPanelId}
          onClose={closePanel}
        />
      ) : null}

      {openPanel === "notifications" ? (
        <NotificationsPanel
          notifications={displayedNotifications}
          headingRef={panelHeadingRef}
          panelId={notificationsPanelId}
          onClose={closePanel}
          onNotificationClick={handleNotificationClick}
        />
      ) : null}
    </div>
  );
}

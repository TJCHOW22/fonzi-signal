export const ACTIVITY_STAGES = [
  "preparing source",
  "writing",
  "verifying facts",
  "checking voice",
  "ready",
] as const;

export type ActivityStage = (typeof ACTIVITY_STAGES)[number];

export interface ActivityJob {
  id: string;
  draftTitle: string;
  speaker: string;
  stage: ActivityStage;
  /** A value from 0 to 100. Null represents an indeterminate loading state. */
  progress: number | null;
  progressLabel: string;
}

export interface DraftNavigationTarget {
  href: string;
  draftId?: string;
  label?: string;
}

export type NotificationEventStatus =
  | "draft ready"
  | "needs review"
  | "draft updated"
  | "draft failed";

export interface AppNotification {
  id: string;
  eventStatus: NotificationEventStatus;
  draftTitle: string;
  speaker: string;
  timestamp: string;
  read: boolean;
  target: DraftNavigationTarget;
}

export const MOCK_ACTIVITY_JOBS: readonly ActivityJob[] = [
  {
    id: "activity-stripe-distribution",
    draftTitle: "Stripe is buying distribution",
    speaker: "Brett Martin",
    stage: "writing",
    progress: 46,
    progressLabel: "Writing first draft",
  },
  {
    id: "activity-founder-speed",
    draftTitle: "The founder speed advantage",
    speaker: "Natalie Fratto",
    stage: "verifying facts",
    progress: null,
    progressLabel: "Checking source claims",
  },
  {
    id: "activity-no-code-moat",
    draftTitle: "No-code is becoming the interface",
    speaker: "Soft Girl No Code",
    stage: "ready",
    progress: 100,
    progressLabel: "Ready for review",
  },
] as const;

export const MOCK_NOTIFICATIONS: readonly AppNotification[] = [
  {
    id: "notification-no-code-ready",
    eventStatus: "draft ready",
    draftTitle: "No-code is becoming the interface",
    speaker: "Soft Girl No Code",
    timestamp: "2 min ago",
    read: false,
    target: { href: "/drafts/3", draftId: "3", label: "No-code is becoming the interface" },
  },
  {
    id: "notification-founder-review",
    eventStatus: "needs review",
    draftTitle: "The founder speed advantage",
    speaker: "Natalie Fratto",
    timestamp: "18 min ago",
    read: false,
    target: { href: "/drafts/2", draftId: "2", label: "The founder speed advantage" },
  },
  {
    id: "notification-marketplaces-updated",
    eventStatus: "draft updated",
    draftTitle: "Why talent marketplaces compound",
    speaker: "Brett Martin",
    timestamp: "Yesterday",
    read: true,
    target: {
      href: "/drafts/1",
      draftId: "1",
      label: "Why talent marketplaces compound",
    },
  },
] as const;

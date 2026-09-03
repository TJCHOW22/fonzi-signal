"use client";

import { useCallback } from "react";
import { useRouter } from "next/navigation";
import {
  ConnectedGlobalAIControls,
  GlobalAIStateProvider,
} from "@/components/global-controls/global-ai-state";
import type { DraftNavigationTarget } from "@/components/global-controls/global-ai-controls";

export function AppShell({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const navigateToDraft = useCallback((target: DraftNavigationTarget) => {
    const draftId = Number(target.draftId);
    if (!Number.isSafeInteger(draftId) || draftId < 1) return;
    router.push(`/drafts/${draftId}`);
  }, [router]);

  return (
    <GlobalAIStateProvider enabled>
      {children}
      <ConnectedGlobalAIControls
        placement="media"
        onNavigate={navigateToDraft}
      />
    </GlobalAIStateProvider>
  );
}

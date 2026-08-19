"use client";

import { useFormStatus } from "react-dom";

/** Submit button that shows a pending label while its form's server action
 * runs. Used for the slow buttons (gatheros sync, interview, concepts). */
export function PendingButton({
  children,
  pendingLabel = "working…",
  className,
}: {
  children: React.ReactNode;
  pendingLabel?: string;
  className?: string;
}) {
  const { pending } = useFormStatus();
  return (
    <button disabled={pending} className={`${className ?? ""} disabled:opacity-50`}>
      {pending ? pendingLabel : children}
    </button>
  );
}

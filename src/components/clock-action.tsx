"use client";

import { clockAction } from "@/app/actions";
import { ActionButton } from "@/components/action-button";

export function ClockAction({ operation, label, className, confirm }: {
  operation: string;
  label: string;
  className: string;
  confirm?: string;
  disabled?: boolean;
  onAction: (operation: string, clickedAt: string) => void;
}) {
  return <form onSubmit={(event) => {
    event.preventDefault();
    if (disabled) return;
    if (confirm && !window.confirm(confirm)) return;
    onAction(operation, new Date().toISOString());
  }}>
    <input type="hidden" name="operation" value={operation} />
    <ActionButton label={label} pendingLabel="Updating…" className={className} disabled={disabled} />
  </form>;
}

"use client";

import { clockAction } from "@/app/actions";
import { ActionButton } from "@/components/action-button";

export function ClockAction({ operation, label, className, confirm }: {
  operation: string;
  label: string;
  className: string;
  confirm?: string;
}) {
  return <form action={clockAction} onSubmit={(event) => {
    if (confirm && !window.confirm(confirm)) event.preventDefault();
  }}>
    <input type="hidden" name="operation" value={operation} />
    <ActionButton label={label} pendingLabel="Updating…" className={className} />
  </form>;
}

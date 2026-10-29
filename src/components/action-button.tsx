"use client";

import { useFormStatus } from "react-dom";

export function ActionButton({ label, pendingLabel = "Saving…", className = "button button-primary", disabled = false }: {
  label: string;
  pendingLabel?: string;
  className?: string;
  disabled?: boolean;
}) {
  const { pending } = useFormStatus();
  return <button className={className} type="submit" disabled={pending || disabled}>
    {pending ? pendingLabel : label}
  </button>;
}

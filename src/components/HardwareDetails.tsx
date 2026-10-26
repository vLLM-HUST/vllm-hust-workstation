"use client";

import { useState, type ReactNode } from "react";

/** Presentation only: opt-in per view, never persisted or opened by telemetry. */
export default function HardwareDetails({ children, label = "硬件信息" }: { children: ReactNode; label?: string }) {
  const [expanded, setExpanded] = useState(false);
  return <details data-hardware-details open={expanded} className="app-text-muted text-xs"
    onToggle={event => setExpanded(event.currentTarget.open)}
    onKeyDownCapture={event => {
      if (event.key === "Escape" && expanded) {
        event.stopPropagation(); setExpanded(false);
        event.currentTarget.querySelector("summary")?.focus();
      }
    }}>
    <summary className="cursor-pointer rounded py-1">{label}</summary>
    {expanded && <div className="mt-2 space-y-1 break-words">{children}</div>}
  </details>;
}

"use client";

import { useEffect, useRef } from "react";

/** Keep keyboard interaction inside an open overlay and restore its trigger. */
export function useDialogFocus<T extends HTMLElement = HTMLDivElement>(active: boolean, onClose: () => void) {
  const ref = useRef<T>(null);
  const close = useRef(onClose);
  close.current = onClose;
  useEffect(() => {
    const dialog = ref.current;
    if (!active || !dialog) return;
    const previous = document.activeElement as HTMLElement | null;
    const controls = () => Array.from(dialog.querySelectorAll<HTMLElement>(
      'button:not(:disabled), a[href], input:not(:disabled), textarea:not(:disabled), select:not(:disabled), summary, [tabindex="0"]',
    )).filter((el) => el.getClientRects().length && !el.closest('[inert]'));
    const first = () => controls()[0] || dialog;
    first().focus();
    const keydown = (event: KeyboardEvent) => {
      if (event.key === "Escape") { event.preventDefault(); close.current(); }
      if (event.key !== "Tab") return;
      const items = controls();
      const index = items.indexOf(document.activeElement as HTMLElement);
      if (!items.length || index < 0 || (event.shiftKey ? index === 0 : index === items.length - 1)) {
        event.preventDefault();
        (event.shiftKey ? items[items.length - 1] || dialog : first()).focus();
      }
    };
    const focusin = (event: FocusEvent) => {
      if (!dialog.contains(event.target as Node)) first().focus();
    };
    document.addEventListener("keydown", keydown);
    document.addEventListener("focusin", focusin);
    return () => {
      document.removeEventListener("keydown", keydown);
      document.removeEventListener("focusin", focusin);
      if (previous?.isConnected) previous.focus();
    };
  }, [active]);
  return ref;
}

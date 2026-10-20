"use client";

import { useCallback, useEffect, useRef, useState } from "react";

/** Follow only while the reader is at the end; updates never revoke that choice. */
export function useChatFollow(revision: unknown, empty: boolean) {
  const viewport = useRef<HTMLDivElement>(null);
  const content = useRef<HTMLDivElement>(null);
  const following = useRef(true);
  const [away, setAway] = useState(false);
  const [unread, setUnread] = useState(false);
  const latest = useCallback(() => {
    following.current = true;
    setAway(false); setUnread(false);
    if (viewport.current) viewport.current.scrollTop = viewport.current.scrollHeight;
  }, []);
  const onScroll = useCallback(() => {
    const element = viewport.current;
    if (!element) return;
    const atEnd = element.scrollHeight - element.scrollTop - element.clientHeight < 48;
    following.current = atEnd;
    setAway(!atEnd);
    if (atEnd) setUnread(false);
  }, []);
  useEffect(() => {
    if (empty || following.current) latest();
    else setUnread(true);
  }, [revision, empty, latest]);
  useEffect(() => {
    if (!content.current || typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(() => {
      if (following.current && viewport.current) viewport.current.scrollTop = viewport.current.scrollHeight;
    });
    observer.observe(content.current);
    return () => observer.disconnect();
  }, []);
  return { viewport, content, away, unread, latest, onScroll };
}

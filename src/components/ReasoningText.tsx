"use client";

import { useEffect, useRef, useState } from "react";

/** Follow new model text only while the reader stays at the tail. */
export function ReasoningText({ text }: { text: string }) {
  const viewport = useRef<HTMLDivElement>(null);
  const following = useRef(true);
  useEffect(() => {
    const element = viewport.current;
    if (element && following.current) element.scrollTop = element.scrollHeight;
  }, [text]);
  return <div ref={viewport} data-reasoning-text
    className="max-h-72 overflow-y-auto whitespace-pre-wrap break-words"
    onScroll={event => {
      const element = event.currentTarget;
      following.current = element.scrollHeight - element.scrollTop - element.clientHeight < 32;
    }}>{text}</div>;
}

export function ReasoningDisclosure({ text, streaming }: { text: string; streaming: boolean }) {
  const [expanded, setExpanded] = useState(streaming);
  useEffect(() => { if (!streaming) setExpanded(false); }, [streaming]);
  return <details className="mb-3 text-white/60" open={expanded} aria-busy={streaming}>
    <summary className="cursor-pointer" onClick={event => {
      event.preventDefault();
      setExpanded(value => !value);
    }}>{streaming ? "正在思考（实时更新，非最终答案）" : "思考过程（非最终答案）"}</summary>
    <div className="mt-2"><ReasoningText text={text} /></div>
  </details>;
}

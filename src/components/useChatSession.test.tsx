import React, { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, expect, it, vi } from "vitest";
import { useChatSession } from "./useChatSession";
import { CHAT_SESSION_KEY, decodeChatSession } from "@/lib/chatSession";

afterEach(() => { sessionStorage.clear(); vi.restoreAllMocks(); vi.unstubAllGlobals(); vi.useRealTimers(); });

it("restores old raw content after remount without requesting a model", async () => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  vi.useFakeTimers(); const fetch = vi.fn(); vi.stubGlobal('fetch', fetch);
  let state!: ReturnType<typeof useChatSession>;
  function Harness({streaming=false}:{streaming?:boolean}) { state=useChatSession(streaming); return <span>{state.notice}</span>; }
  const host = document.createElement('div'); let root = createRoot(host);
  await act(async()=>root.render(<Harness />));
  const content = '## 历史表格\n\n| KV | GiB |\n| --- | --- |\n| KV | 4 |\n\n$2^{30}$';
  await act(async()=>state.setMessages([{id:'old',role:'assistant',content,timestamp:1,completionStatus:'completed'}]));
  await act(async()=>vi.advanceTimersByTime(300));
  await act(async()=>root.unmount());
  root=createRoot(host); await act(async()=>root.render(<Harness />));
  expect(state.messages[0].content).toBe(content); expect(fetch).not.toHaveBeenCalled();
  await act(async()=>root.render(<Harness streaming />));
  await act(async()=>window.dispatchEvent(new Event('pagehide')));
  expect(decodeChatSession(sessionStorage.getItem(CHAT_SESSION_KEY)!).messages[0].completionStatus).toBe('interrupted');
  await act(async()=>root.unmount());
});

it("reports storage quota failure without losing current answers", async () => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true }); vi.useFakeTimers();
  let state!: ReturnType<typeof useChatSession>;
  function Harness() { state=useChatSession(false); return null; }
  const root=createRoot(document.createElement('div'));
  await act(async()=>root.render(<Harness />));
  vi.spyOn(Storage.prototype,'setItem').mockImplementation(()=>{throw new Error('quota');});
  await act(async()=>state.setMessages([{id:'old',role:'assistant',content:'保留正文',timestamp:1}]));
  await act(async()=>vi.advanceTimersByTime(300));
  expect(state.notice).toContain('保存失败'); expect(state.messages[0].content).toBe('保留正文');
  await act(async()=>root.unmount());
});

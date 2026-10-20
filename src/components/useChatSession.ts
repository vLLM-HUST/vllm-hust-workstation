"use client";

import { useEffect, useRef, useState } from "react";
import type { Message } from "@/types";
import { CHAT_SESSION_KEY, decodeChatSession, encodeChatSession } from "@/lib/chatSession";

/** Per-tab, local-only recovery. Never fetch or automatically resume restored messages. */
export function useChatSession(streaming: boolean) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [ready, setReady] = useState(false);
  const [notice, setNotice] = useState("");
  const latest = useRef({ messages, streaming });
  latest.current = { messages, streaming };
  useEffect(() => {
    try {
      const saved = sessionStorage.getItem(CHAT_SESSION_KEY);
      if (saved) setMessages(decodeChatSession(saved).messages);
      setReady(true);
    } catch {
      setNotice("本机会话无法恢复；未删除原记录。可先导出当前对话，避免刷新丢失。");
    }
  }, []);
  useEffect(() => {
    if (!ready) return;
    const save = () => {
      try {
        sessionStorage.setItem(CHAT_SESSION_KEY, encodeChatSession(latest.current.messages, latest.current.streaming));
        setNotice("");
      } catch { setNotice("本机会话保存失败（可能是存储已满）；请导出后再刷新。"); }
    };
    const timer = setTimeout(save, 250);
    window.addEventListener("pagehide", save);
    return () => { clearTimeout(timer); window.removeEventListener("pagehide", save); };
  }, [messages, streaming, ready]);
  return { messages, setMessages, notice };
}

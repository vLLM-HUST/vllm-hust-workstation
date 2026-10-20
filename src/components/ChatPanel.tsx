"use client";

import { useRef, useCallback, useState } from "react";
import {
  Send,
  Bot,
  User,
  Square,
  RotateCcw,
  Copy,
  CheckCheck,
  Globe,
  Lightbulb,
  Gauge,
  MoreHorizontal,
  ArrowDown,
  Download,
  Upload,
} from "lucide-react";
import type { Message, ServiceProbeStatus } from "@/types";
import clsx from "clsx";
import { ReasoningDisclosure } from "./ReasoningText";
import AnswerMarkdown from "./AnswerMarkdown";
import { decodeChatSession, encodeChatSession } from "@/lib/chatSession";
import { useChatFollow } from "./useChatFollow";

interface ChatPanelProps {
  sessionNotice?: string;
  onImportMessages?: (messages: Message[]) => void;
  messages: Message[];
  loading: boolean;
  accentColor: string;
  webSearch: boolean;
  searchEnabled: boolean;
  thinkingEnabled: boolean;
  onSend: (text: string) => void;
  onStop: () => void;
  onClear: () => void;
  onToggleWebSearch: () => void;
  onToggleThinking: () => void;
  onOpenInference: () => void;
  onOpenMetrics: () => void;
  serviceStatus: ServiceProbeStatus;
  model: string;
  hardware: { npu: string; cpu: string; memory: string };
}

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  const copy = () => {
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };
  return (
    <button
      onClick={copy}
      aria-label={copied ? "已复制回答" : "复制回答 Markdown"}
      className="workspace-copy transition-opacity ml-2"
    >
      {copied ? <CheckCheck size={13} /> : <Copy size={13} />}
    </button>
  );
}

function MessageBubble({ msg, accentColor, streaming }: { msg: Message; accentColor: string; streaming: boolean }) {
  const isUser = msg.role === "user";
  return (
    <div
      className={clsx(
        "flex gap-3 animate-slide-up",
        isUser ? "flex-row-reverse" : "flex-row"
      )}
    >
      <div
        className={clsx(
          "w-8 h-8 rounded-lg flex-shrink-0 flex items-center justify-center mt-0.5",
          isUser ? "bg-white/10" : "rounded-lg"
        )}
        style={!isUser ? { background: `${accentColor}30` } : undefined}
      >
        {isUser ? (
          <User size={16} className="text-white/70" />
        ) : (
          <Bot size={16} style={{ color: accentColor }} />
        )}
      </div>

      <div
        className={clsx(
          "workspace-message group min-w-0 max-w-[90%] sm:max-w-[85%] rounded-2xl px-4 py-3 text-sm leading-relaxed",
          isUser
            ? "workspace-message-user rounded-tr-sm"
            : "workspace-message-assistant rounded-tl-sm"
        )}
      >
        {!isUser && msg.reasoning && (
          <ReasoningDisclosure text={msg.reasoning} streaming={streaming} />
        )}
        {isUser ? <div className="whitespace-pre-wrap break-words">{msg.content}</div>
          : <AnswerMarkdown content={msg.content} streaming={streaming} />}
        {!isUser && msg.completionNotice && (
          <p role="status" className="mt-2 text-amber-300" data-completion-status={msg.completionStatus}>
            {msg.completionNotice}
          </p>
        )}

        <div
          className={clsx(
            "flex items-center gap-2 mt-1.5 text-[11px] text-white/25",
            isUser ? "justify-end" : "justify-start"
          )}
        >
          <span>
            {new Date(msg.timestamp).toLocaleTimeString("zh-CN", {
              hour: "2-digit",
              minute: "2-digit",
            })}
          </span>
          {msg.tokensUsed !== undefined && <span>{msg.tokensUsed} tokens（含思考，上游统计）</span>}
          {msg.latencyMs && <span>{msg.latencyMs}ms</span>}
          {!isUser && <CopyButton text={msg.content} />}
        </div>
      </div>
    </div>
  );
}

export default function ChatPanel({
  sessionNotice,
  onImportMessages,
  messages,
  loading,
  accentColor,
  webSearch,
  searchEnabled,
  thinkingEnabled,
  onSend,
  onStop,
  onClear,
  onToggleWebSearch,
  onToggleThinking,
  onOpenMetrics,
  serviceStatus,
  model,
  hardware,
}: ChatPanelProps) {
  const online = serviceStatus === "online";
  const checking = serviceStatus === "checking";
  const [input, setInput] = useState("");
  const [importError, setImportError] = useState("");
  const importRef = useRef<HTMLInputElement>(null);
  const follow = useChatFollow(messages, messages.length === 0);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const handleSend = useCallback(() => {
    const text = input.trim();
    if (!text || loading || !model.trim() || !online) return;
    setInput("");
    if (textareaRef.current) textareaRef.current.style.height = "auto";
    onSend(text);
  }, [input, loading, onSend, model, online]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const handleInput = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setInput(e.target.value);
    e.target.style.height = "auto";
    e.target.style.height = `${Math.min(e.target.scrollHeight, 180)}px`;
  };

  return (
    <div className="relative min-w-0 flex-1 flex flex-col overflow-hidden">
      {/* Messages */}
      <div ref={follow.viewport} role="region" aria-label="对话记录" className="min-h-0 flex-1 overflow-y-auto px-3 py-4 sm:px-6 sm:py-6" onScroll={follow.onScroll}>
        <div ref={follow.content} className="mx-auto max-w-4xl space-y-5">
        {messages.length === 0 && (
          <div className="flex min-h-[calc(100vh-15rem)] items-center justify-center py-6 sm:min-h-[32rem]">
            <section className="app-card workspace-welcome w-full max-w-2xl rounded-3xl p-5 text-left sm:p-8">
              <div className="flex items-start gap-4">
            <div
                  className="flex h-12 w-12 flex-shrink-0 items-center justify-center rounded-2xl sm:h-14 sm:w-14"
              style={{ background: `${accentColor}20` }}
            >
                  <Bot size={26} style={{ color: "var(--focus)" }} />
            </div>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="app-text-muted text-[11px] font-semibold uppercase tracking-[0.18em]">Private inference</span>
                    <span className={online ? "text-emerald-300" : checking ? "text-amber-300" : "text-red-300"}>● {online ? "服务在线" : checking ? "正在核验" : "服务离线"}</span>
                  </div>
                  <h1 className="app-text mt-2 text-xl font-semibold tracking-tight sm:text-2xl">
                    {online ? "推理工作区已就绪" : checking ? "正在核验推理服务" : "推理服务暂时离线"}
                  </h1>
                  <p className="app-text-muted mt-2 text-sm leading-6">
                    {online
                      ? "对话在本地算力上完成；模型、硬件与运行来源均可核验。"
                      : checking
                        ? "正在读取模型、服务健康与运行来源；核验完成前不作在线或离线判断。"
                        : "页面仍保留模型、硬件与运行来源证据；可在运行状态中查看探测结果。"}
                  </p>
                </div>
              </div>

              <div className="app-surface-muted app-border mt-5 rounded-2xl border p-4">
                <p className="app-text-muted text-[11px] font-semibold uppercase tracking-wider">当前模型</p>
                <p className="app-text-secondary mt-1 truncate font-mono text-sm" title={model || undefined}>{model || "正在读取实际运行模型…"}</p>
                <div className="mt-3 flex flex-wrap gap-2">
                  {[hardware.npu, hardware.cpu, hardware.memory].filter(Boolean).map((item) => (
                    <span key={item} className="app-control rounded-full border px-2.5 py-1 text-[11px]">{item}</span>
                  ))}
                </div>
              </div>

              <div className="mt-5 grid gap-2 sm:grid-cols-2">
                {["分析当前推理服务的性能指标", "帮我排查一次请求的延迟瓶颈"].map((suggestion) => (
                  <button
                    key={suggestion}
                    onClick={() => onSend(suggestion)}
                    className="app-control rounded-xl border px-3 py-2.5 text-left text-xs transition-colors"
                  >
                    {suggestion}
                  </button>
                ))}
              </div>
              <button type="button" onClick={onOpenMetrics} className="app-text-secondary mt-4 inline-flex items-center gap-2 text-xs font-medium hover:underline">
                <Gauge size={14} /> 查看模型、监控与运行来源
              </button>
            </section>
            </div>
        )}

        {messages.map((msg, index) => (
          <MessageBubble key={msg.id} msg={msg} accentColor={accentColor}
            streaming={loading && msg.role === "assistant" && index === messages.length - 1} />
        ))}

        {/* Typing indicator */}
        {loading && (
          <div className="flex gap-3 animate-fade-in">
            <div
              className="w-8 h-8 rounded-lg flex-shrink-0 flex items-center justify-center"
              style={{ background: `${accentColor}30` }}
            >
              <Bot size={16} style={{ color: accentColor }} />
            </div>
            <div className="flex items-center gap-1.5 px-4 py-3 bg-white/5 rounded-2xl rounded-tl-sm border border-white/8">
              <span className="w-1.5 h-1.5 bg-white/40 rounded-full animate-bounce [animation-delay:0ms]" />
              <span className="w-1.5 h-1.5 bg-white/40 rounded-full animate-bounce [animation-delay:150ms]" />
              <span className="w-1.5 h-1.5 bg-white/40 rounded-full animate-bounce [animation-delay:300ms]" />
            </div>
          </div>
        )}

        </div>
      </div>

      {/* Input */}
      <div className="app-divider border-t px-3 pb-3 pt-2 sm:px-6 sm:pb-5">
        {follow.away && <div className="mx-auto mb-2 flex max-w-4xl justify-center">
          <button type="button" onClick={follow.latest} className="app-control inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs shadow-sm"><ArrowDown size={13} />{follow.unread ? "有新内容 · 回到最新" : "回到最新"}</button>
          <span role="status" className="sr-only">{follow.unread ? "有新回答内容，可点击回到最新" : ""}</span>
        </div>}
        <div className="app-control workspace-composer mx-auto flex max-w-4xl flex-wrap items-end gap-2 rounded-2xl border px-3 py-3 transition-colors sm:flex-nowrap sm:gap-3 sm:px-4">
          <textarea
            ref={textareaRef}
            value={input}
            onChange={handleInput}
            onKeyDown={handleKeyDown}
            placeholder="输入消息…"
            rows={1}
            aria-label="输入消息"
            className="min-w-0 basis-full flex-1 bg-transparent text-white/90 text-sm placeholder-white/25 resize-none focus:outline-none leading-relaxed sm:basis-auto"
            style={{ minHeight: "24px", maxHeight: "180px" }}
          />
          <div className="ml-auto flex items-center gap-2 flex-shrink-0 mb-0.5">
            <button
              type="button"
              onClick={onToggleThinking}
              className={clsx(
                "w-8 h-8 rounded-xl flex items-center justify-center transition-colors border",
                thinkingEnabled
                  ? "text-violet-200 border-violet-400/35 bg-violet-400/15"
                  : "text-white/30 border-white/10 hover:text-white/60 hover:border-white/20"
              )}
              title={thinkingEnabled ? "深度思考：已开启" : "深度思考：已关闭"}
              aria-pressed={thinkingEnabled}
            >
              <Lightbulb size={14} />
            </button>
            {searchEnabled && (
              <button
                type="button"
                onClick={onToggleWebSearch}
                className={clsx(
                  "w-8 h-8 rounded-xl flex items-center justify-center transition-colors border",
                  webSearch
                    ? "text-sky-200 border-sky-400/35 bg-sky-400/15"
                    : "text-white/30 border-white/10 hover:text-white/60 hover:border-white/20"
                )}
                title={webSearch ? "联网搜索：已开启" : "联网搜索：已关闭"}
                aria-pressed={webSearch}
              >
                <Globe size={14} />
              </button>
            )}
            <details className="workspace-tools relative" onKeyDown={event => {
              if (event.key === "Escape") { event.currentTarget.open = false; event.currentTarget.querySelector("summary")?.focus(); }
            }}>
              <summary className="app-text-muted flex h-8 w-8 cursor-pointer list-none items-center justify-center rounded-lg" aria-label="会话操作" title="会话操作"><MoreHorizontal size={16} /></summary>
              <div className="workspace-tools-popover app-surface app-border absolute bottom-full right-0 z-20 mb-2 w-52 rounded-xl border p-1.5 shadow-xl">
            {messages.length > 0 && (
              <button type="button" title="导出对话（本机 JSON）" aria-label="导出对话（本机 JSON）" className="app-text-muted"
                onClick={() => {
                  const url = URL.createObjectURL(new Blob([encodeChatSession(messages, loading)], { type: "application/json" }));
                  const link = document.createElement("a"); link.href = url;
                  link.download = `workstation-session-${new Date().toISOString().replace(/[:.]/g,"-")}.json`;
                  link.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
                }}><Download size={16} />导出会话 JSON</button>
            )}
            {onImportMessages && <>
              <button type="button" title="导入旧会话（只在本机渲染，不请求模型）" aria-label="导入旧会话" disabled={loading}
                className="app-text-muted" onClick={() => importRef.current?.click()}><Upload size={16} />导入旧会话</button>
              <input ref={importRef} type="file" accept=".json,application/json" hidden onChange={async event => {
                const file = event.target.files?.[0]; event.target.value = "";
                if (!file) return;
                try {
                  if (file.size > 10 * 1024 * 1024) throw new Error("会话超过10 MiB，未导入或截断；请保留原文件");
                  const restored = decodeChatSession(await file.text());
                  const batchId = crypto.randomUUID();
                  onImportMessages(restored.messages.map((message, i) => ({...message, id:`import-${batchId}-${i}`})));
                  setImportError("");
                } catch (error) { setImportError((error as Error).message); }
              }} />
            </>}
            {messages.length > 0 && (
              <button
                onClick={onClear}
                className="text-white/25 hover:text-white/60 transition-colors"
                title="清空对话"
              >
                <RotateCcw size={16} />清空对话
              </button>
            )}
              </div>
            </details>
            <button
              onClick={loading ? onStop : handleSend}
              aria-label={loading ? "停止生成" : "发送消息"}
              disabled={!loading && (!input.trim() || serviceStatus !== "online" || !model.trim())}
              className="w-8 h-8 rounded-xl flex items-center justify-center transition-all"
              style={
                loading || (input.trim() && serviceStatus === "online")
                  ? { background: accentColor }
                  : { background: "rgba(255,255,255,0.1)" }
              }
            >
              {loading ? (
                <Square size={14} className="text-white" />
              ) : (
                <Send size={14} className="text-white" />
              )}
            </button>
          </div>
        </div>
        {(sessionNotice || importError) && <p role="status" className="app-text-muted mt-2 text-xs">{importError || sessionNotice}</p>}
        <div className="app-text-muted mx-auto mt-2 flex max-w-4xl items-center justify-center gap-3 text-xs">
          <p className="hidden sm:block">本地算力推理 · 请求经工作站转发</p>
          {searchEnabled && webSearch && <span className="text-sky-300/80">🌐 联网搜索已开启</span>}
          {thinkingEnabled && <span className="text-violet-300/80">💡 深度思考已开启</span>}
        </div>
      </div>
    </div>
  );
}

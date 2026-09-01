"use client";

import { useRef, useEffect, useCallback, useState } from "react";
import {
  Send,
  Paperclip,
  Bot,
  User,
  Square,
  RotateCcw,
  Copy,
  CheckCheck,
  Globe,
  Lightbulb,
  Gauge,
  Telescope,
} from "lucide-react";
import type { Message } from "@/types";
import clsx from "clsx";

interface ChatPanelProps {
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
  online: boolean;
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
      className="opacity-0 group-hover:opacity-100 transition-opacity text-white/30 hover:text-white/70 ml-2"
    >
      {copied ? <CheckCheck size={13} /> : <Copy size={13} />}
    </button>
  );
}

function MessageBubble({ msg, accentColor }: { msg: Message; accentColor: string }) {
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
          "group max-w-[75%] rounded-2xl px-4 py-3 text-sm leading-relaxed",
          isUser
            ? "bg-white/10 text-white/90 rounded-tr-sm"
            : "bg-white/5 text-white/85 rounded-tl-sm border border-white/8"
        )}
      >
        {/* Render content — basic markdown-lite: code blocks */}
        <FormattedContent content={msg.content} />

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
          {msg.tokensUsed && <span>{msg.tokensUsed} tokens</span>}
          {msg.latencyMs && <span>{msg.latencyMs}ms</span>}
          {!isUser && <CopyButton text={msg.content} />}
        </div>
      </div>
    </div>
  );
}

// Minimal content formatter: handles ```code``` blocks + inline `code`
function FormattedContent({ content }: { content: string }) {
  const parts = content.split(/(```[\s\S]*?```|`[^`]+`)/g);
  return (
    <div className="whitespace-pre-wrap break-words">
      {parts.map((part, i) => {
        if (part.startsWith("```")) {
          const code = part.slice(3, -3).replace(/^\w+\n/, "");
          return (
            <pre
              key={i}
              className="my-2 p-3 bg-black/30 rounded-lg text-xs font-mono overflow-x-auto text-emerald-300"
            >
              {code}
            </pre>
          );
        }
        if (part.startsWith("`") && part.endsWith("`")) {
          return (
            <code key={i} className="px-1.5 py-0.5 bg-black/30 rounded text-xs font-mono text-amber-300">
              {part.slice(1, -1)}
            </code>
          );
        }
        return <span key={i}>{part}</span>;
      })}
    </div>
  );
}

export default function ChatPanel({
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
  onOpenInference,
  onOpenMetrics,
  online,
  model,
  hardware,
}: ChatPanelProps) {
  const [input, setInput] = useState("");
  const bottomRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const handleSend = useCallback(() => {
    const text = input.trim();
    if (!text || loading) return;
    setInput("");
    if (textareaRef.current) textareaRef.current.style.height = "auto";
    onSend(text);
  }, [input, loading, onSend]);

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
    <div className="min-w-0 flex-1 flex flex-col overflow-hidden">
      {/* Messages */}
      <div className="flex-1 overflow-y-auto px-3 py-4 sm:px-6 sm:py-6">
        <div className="mx-auto max-w-4xl space-y-5">
        {messages.length === 0 && (
          <div className="flex min-h-[calc(100vh-15rem)] items-center justify-center py-6 sm:min-h-[32rem]">
            <section className="app-card w-full max-w-2xl rounded-3xl p-5 text-left sm:p-8">
              <div className="flex items-start gap-4">
            <div
                  className="flex h-12 w-12 flex-shrink-0 items-center justify-center rounded-2xl sm:h-14 sm:w-14"
              style={{ background: `${accentColor}20` }}
            >
                  <Bot size={26} style={{ color: accentColor }} />
            </div>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="app-text-muted text-[11px] font-semibold uppercase tracking-[0.18em]">Private inference</span>
                    <span className={online ? "text-emerald-300" : "text-red-300"}>● {online ? "服务在线" : "服务离线"}</span>
                  </div>
                  <h1 className="app-text mt-2 text-xl font-semibold tracking-tight sm:text-2xl">
                    {online ? "推理工作区已就绪" : "推理服务暂时离线"}
                  </h1>
                  <p className="app-text-muted mt-2 text-sm leading-6">
                    {online
                      ? "对话在本地算力上完成；模型、硬件与运行来源均可核验。"
                      : "页面仍保留模型、硬件与运行来源证据；可在运行状态中查看探测结果。"}
                  </p>
                </div>
              </div>

              <div className="app-surface-muted app-border mt-5 rounded-2xl border p-4">
                <p className="app-text-muted text-[11px] font-semibold uppercase tracking-wider">当前模型</p>
                <p className="app-text-secondary mt-1 truncate font-mono text-sm" title={model}>{model}</p>
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
              <button type="button" onClick={onOpenMetrics} className="app-text-secondary mt-4 inline-flex items-center gap-2 text-xs font-medium hover:underline xl:hidden">
                <Gauge size={14} /> 查看模型、监控与运行来源
              </button>
            </section>
            </div>
        )}

        {messages.map((msg) => (
          <MessageBubble key={msg.id} msg={msg} accentColor={accentColor} />
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

        <div ref={bottomRef} />
        </div>
      </div>

      {/* Input */}
      <div className="app-divider border-t px-3 pb-3 pt-2 sm:px-6 sm:pb-5">
        <div className="app-control mx-auto flex max-w-4xl items-end gap-2 rounded-2xl border px-3 py-3 transition-colors sm:gap-3 sm:px-4">
          <button className="hidden sm:block text-white/30 hover:text-white/60 transition-colors flex-shrink-0 mb-0.5">
            <Paperclip size={18} />
          </button>
          <textarea
            ref={textareaRef}
            value={input}
            onChange={handleInput}
            onKeyDown={handleKeyDown}
            placeholder="输入消息…"
            rows={1}
            className="flex-1 bg-transparent text-white/90 text-sm placeholder-white/25 resize-none focus:outline-none leading-relaxed"
            style={{ minHeight: "24px", maxHeight: "180px" }}
          />
          <div className="flex items-center gap-2 flex-shrink-0 mb-0.5">
            <button
              type="button"
              onClick={onOpenInference}
              className="app-control flex h-8 w-8 items-center justify-center rounded-xl border md:hidden"
              title="查看推理过程"
              aria-label="查看推理过程"
            >
              <Telescope size={14} />
            </button>
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
              >
                <Globe size={14} />
              </button>
            )}
            {messages.length > 0 && (
              <button
                onClick={onClear}
                className="text-white/25 hover:text-white/60 transition-colors"
                title="清空对话"
              >
                <RotateCcw size={16} />
              </button>
            )}
            <button
              onClick={loading ? onStop : handleSend}
              disabled={!loading && !input.trim()}
              className="w-8 h-8 rounded-xl flex items-center justify-center transition-all"
              style={
                loading || input.trim()
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
        <div className="app-text-muted mx-auto mt-2 flex max-w-4xl items-center justify-center gap-3 text-xs">
          <p className="hidden sm:block">平台私有推理 · 端到端加密 · 零数据上报</p>
          {searchEnabled && webSearch && <span className="text-sky-300/80">🌐 联网搜索已开启</span>}
          {thinkingEnabled && <span className="text-violet-300/80">💡 深度思考已开启</span>}
        </div>
      </div>
    </div>
  );
}

"use client";

import clsx from "clsx";
import type { SearchResult } from "@/types";

export interface ProcessStep {
  id: string;
  icon: string;
  label: string;
  state: "pending" | "active" | "done" | "error";
  detail?: string;
}

interface InferenceSidebarProps {
  open: boolean;
  onToggle: () => void;
  processSteps: ProcessStep[];
  searchQuery: string;
  searchResults: SearchResult[];
  thinkText: string;
}

function statusClass(state: ProcessStep["state"]) {
  switch (state) {
    case "active":
      return "border-sky-400/30 bg-sky-400/10 text-sky-200";
    case "done":
      return "border-emerald-400/25 bg-emerald-400/10 text-emerald-200";
    case "error":
      return "border-red-400/25 bg-red-400/10 text-red-200";
    default:
      return "border-white/10 bg-white/5 text-white/60";
  }
}

export default function InferenceSidebar({
  open,
  onToggle,
  processSteps,
  searchQuery,
  searchResults,
  thinkText,
}: InferenceSidebarProps) {
  const hasContent = processSteps.length > 0 || searchResults.length > 0 || Boolean(thinkText.trim());

  return (
    <aside
      className={clsx(
        "app-surface app-border flex-shrink-0 overflow-hidden border-r transition-all duration-300 ease-out",
        open
          ? "w-80 min-w-[320px] max-md:absolute max-md:inset-y-0 max-md:left-0 max-md:z-40 max-md:w-[min(20rem,calc(100vw-2.5rem))] max-md:min-w-0 max-md:shadow-2xl"
          : "w-12 max-md:w-0 max-md:border-r-0"
      )}
    >
      <div className="h-full flex">
        <button
          type="button"
          onClick={onToggle}
          className="app-border app-text-muted flex w-12 flex-col items-center justify-center gap-2 border-r transition-colors hover:bg-white/5 hover:text-white max-md:hidden"
          title={open ? "收起推理面板" : "展开推理面板"}
        >
          <span className="text-base">🔭</span>
          <span className="text-[11px] tracking-widest [writing-mode:vertical-rl]">
            推理
          </span>
        </button>

        {open && (
          <div className="flex-1 min-w-0 flex flex-col">
            <div className="app-divider flex items-center justify-between border-b px-4 py-4">
              <div>
                <p className="app-text text-sm font-semibold">推理过程</p>
                <p className="app-text-muted mt-1 text-xs">处理流程 / 搜索来源 / 思考过程</p>
              </div>
              <button
                type="button"
                onClick={onToggle}
                className="app-text-muted transition-colors hover:text-white"
                title="收起"
              >
                ✕
              </button>
            </div>

            <div className="flex-1 overflow-y-auto px-4 py-4 space-y-4">
              {!hasContent && (
                <div className="app-text-muted flex h-full min-h-[240px] items-center justify-center text-center text-sm leading-7">
                  <div>
                    发送消息后
                    <br />
                    这里会显示推理过程
                  </div>
                </div>
              )}

              {processSteps.length > 0 && (
                <section className="space-y-3">
                  <div className="text-xs font-semibold tracking-widest text-white/55 uppercase">
                    ⚙️ 处理流程
                  </div>
                  <div className="space-y-2">
                    {processSteps.map((step) => (
                      <div
                        key={step.id}
                        className={clsx(
                          "rounded-xl border px-3 py-2.5 transition-colors",
                          statusClass(step.state)
                        )}
                      >
                        <div className="flex items-start gap-2">
                          <span className="text-sm leading-5">{step.icon}</span>
                          <div className="min-w-0 flex-1">
                            <div className="text-sm leading-5">{step.label}</div>
                            {step.detail && (
                              <div className="text-xs mt-1 opacity-75 break-words">{step.detail}</div>
                            )}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </section>
              )}

              {searchResults.length > 0 && (
                <section className="space-y-3">
                  <div className="text-xs font-semibold tracking-widest text-white/55 uppercase">
                    🌐 搜索来源
                  </div>
                  {searchQuery && (
                    <div className="rounded-lg bg-white/5 border border-white/8 px-3 py-2 text-xs text-white/45 break-words">
                      “{searchQuery}”
                    </div>
                  )}
                  <div className="space-y-2.5">
                    {searchResults.map((result, index) => (
                      <article
                        key={`${result.url}-${index}`}
                        className="rounded-xl border border-white/8 bg-white/5 px-3 py-3"
                      >
                        <div className="text-sm text-white/85 leading-5">
                          <span className="text-sky-300 mr-2">[{index + 1}]</span>
                          {result.title}
                        </div>
                        {result.snippet && (
                          <p className="mt-2 text-xs text-white/50 leading-5 whitespace-pre-wrap break-words">
                            {result.snippet}
                          </p>
                        )}
                        {result.url && (
                          <a
                            href={result.url}
                            target="_blank"
                            rel="noreferrer"
                            className="mt-2 block text-xs text-sky-300/90 break-all hover:text-sky-200"
                          >
                            {result.url}
                          </a>
                        )}
                      </article>
                    ))}
                  </div>
                </section>
              )}

              {thinkText.trim() && (
                <section className="space-y-3">
                  <div className="text-xs font-semibold tracking-widest text-white/55 uppercase">
                    💭 思考过程
                  </div>
                  <div className="rounded-xl border border-white/8 bg-white/5 px-3 py-3 text-sm text-white/75 leading-6 whitespace-pre-wrap break-words max-h-[360px] overflow-y-auto">
                    {thinkText.trim()}
                  </div>
                </section>
              )}
            </div>
          </div>
        )}
      </div>
    </aside>
  );
}

"use client";

import { useEffect, useRef } from "react";
import { ChevronDown, PackageOpen, Bot, Gauge, Moon, Sun, Puzzle, Zap, MoreHorizontal, Telescope } from "lucide-react";
import Link from "next/link";
import type { ServiceProbeStatus } from "@/types";

interface HeaderProps {
  brandName: string;
  brandLogo: string | null;
  accentColor: string;
  model: string;
  models: string[];
  liveModelSwitchSupported: boolean;
  onModelChange: (m: string) => void;
  onOpenModelHub: () => void;
  onOpenAgentLab: () => void;
  onOpenMetrics: () => void;
  onOpenInference: () => void;
  theme: "light" | "dark";
  onToggleTheme: () => void;
  serviceStatus: ServiceProbeStatus;
}

export default function Header({
  brandName,
  brandLogo,
  accentColor,
  model,
  models,
  liveModelSwitchSupported,
  onModelChange,
  onOpenModelHub,
  onOpenAgentLab,
  onOpenMetrics,
  onOpenInference,
  theme,
  onToggleTheme,
  serviceStatus,
}: HeaderProps) {
  const online = serviceStatus === "online";
  const checking = serviceStatus === "checking";
  const tools = useRef<HTMLDetailsElement>(null);
  const closeTools = () => {
    if (!tools.current) return;
    tools.current.open = false;
    tools.current.querySelector("summary")?.focus();
  };
  useEffect(() => {
    const outside = (event: PointerEvent) => {
      if (tools.current && !tools.current.contains(event.target as Node)) tools.current.open = false;
    };
    document.addEventListener("pointerdown", outside);
    return () => document.removeEventListener("pointerdown", outside);
  }, []);
  return (
    <header className="app-header workspace-header flex min-w-0 flex-wrap items-center justify-between gap-2 border-b px-3 py-3 sm:gap-4 sm:px-6">
      {/* Brand */}
      <div className="flex min-w-0 items-center gap-3">
        {brandLogo ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={brandLogo} alt="logo" className="h-8 w-auto" />
        ) : (
          <div
            className="w-8 h-8 rounded-lg flex items-center justify-center text-white font-bold text-sm"
            style={{ background: accentColor, color: "#ffffff" }}
          >
            AI
          </div>
        )}
        <span className="app-text truncate text-sm font-semibold tracking-tight min-[360px]:text-base sm:text-lg">
          {brandName}
        </span>
      </div>

      <div className="workspace-header-actions ml-auto flex flex-wrap items-center gap-1.5 sm:gap-2">
        <span
          className={`flex h-9 items-center gap-1.5 rounded-full border px-2.5 text-xs font-medium sm:px-3 ${
            online
              ? "border-emerald-400/25 bg-emerald-400/10 text-emerald-300"
              : checking
                ? "border-amber-400/25 bg-amber-400/10 text-amber-300"
                : "border-red-400/25 bg-red-400/10 text-red-300"
          }`}
          aria-label={online ? "推理服务在线" : checking ? "正在核验推理服务" : "推理服务离线"}
          title={online ? "推理服务在线" : checking ? "正在核验推理服务" : "推理服务离线"}
        >
          <span
            className="w-1.5 h-1.5 rounded-full"
            style={{ background: online ? "var(--success)" : checking ? "var(--warning)" : "var(--danger)" }}
          />
          <span className="hidden sm:inline">{online ? "在线" : checking ? "核验中" : "离线"}</span>
        </span>
        <button type="button" onClick={onOpenInference} className="app-control inline-flex h-9 w-9 items-center justify-center rounded-lg" aria-label="查看推理过程" title="推理过程" aria-controls="inference-panel"><Telescope size={16} /></button>
        <button
          type="button"
          onClick={onOpenMetrics}
          className="app-control inline-flex h-9 items-center gap-2 rounded-lg border px-2.5 text-sm transition-colors"
          aria-label="打开运行状态"
          aria-controls="metrics-panel"
          title="运行状态"
        >
          <Gauge size={14} />
          <span className="hidden md:inline">运行状态</span>
        </button>
        <details ref={tools} className="workspace-tools relative" onKeyDown={event => {
          if (event.key === "Escape") { event.preventDefault(); closeTools(); }
        }}>
          <summary className="app-control flex h-9 w-9 cursor-pointer list-none items-center justify-center rounded-lg" aria-label="更多工具" title="更多工具"><MoreHorizontal size={18} /></summary>
          <nav aria-label="工作站工具" className="workspace-tools-popover app-surface app-border absolute right-0 top-full z-30 mt-2 w-52 rounded-xl border p-1.5 shadow-xl">
            <button type="button" onClick={() => { closeTools(); onOpenModelHub(); }}><PackageOpen size={15} />模型库</button>
            <button type="button" onClick={() => { closeTools(); onOpenAgentLab(); }}><Bot size={15} />EvoScientist 任务与日志</button>
            <Link href="/mods" onClick={closeTools}><Puzzle size={15} />Mod 中心</Link>
            <Link href="/research" onClick={closeTools}><Telescope size={15} />研究模式 · 原始 prompt</Link>
            <Link href="/switch" onClick={closeTools}><Zap size={15} />GenNova 推理开关</Link>
          </nav>
        </details>
        <button
          type="button"
          onClick={onToggleTheme}
          className="app-control inline-flex h-9 w-9 items-center justify-center rounded-lg border transition-colors"
          aria-label={theme === "dark" ? "切换到浅色主题" : "切换到深色主题"}
          title={theme === "dark" ? "切换到浅色主题" : "切换到深色主题"}
        >
          {theme === "dark" ? <Sun size={15} /> : <Moon size={15} />}
        </button>
        {model && <div className="workspace-model relative min-w-0 max-w-[45vw] sm:max-w-none">
          <select
            value={model}
            onChange={(e) => onModelChange(e.target.value)}
            disabled={!liveModelSwitchSupported}
            title={liveModelSwitchSupported ? "在线切换当前请求使用的模型" : "当前后端是单模型服务，切换模型需重启后端"}
            className="app-control w-full max-w-[260px] appearance-none rounded-lg border py-2 pl-3 pr-8 text-xs transition-colors focus:outline-none sm:text-sm"
          >
            {models.map((m) => (
              <option key={m} value={m} className="app-surface-raised">
                {m}
              </option>
            ))}
          </select>
          <ChevronDown size={14} className="app-text-muted pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2" />
        </div>}
      </div>
    </header>
  );
}

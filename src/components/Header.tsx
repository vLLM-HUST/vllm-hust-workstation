"use client";

import { ChevronDown, PackageOpen, Bot, Gauge, Moon, Sun, Puzzle } from "lucide-react";
import Link from "next/link";

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
  theme: "light" | "dark";
  onToggleTheme: () => void;
  online: boolean;
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
  theme,
  onToggleTheme,
  online,
}: HeaderProps) {
  return (
    <header className="app-header flex min-w-0 items-center justify-between gap-2 border-b px-3 py-3 sm:gap-4 sm:px-6">
      {/* Brand */}
      <div className="flex min-w-0 items-center gap-3">
        {brandLogo ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={brandLogo} alt="logo" className="h-8 w-auto" />
        ) : (
          <div
            className="w-8 h-8 rounded-lg flex items-center justify-center text-white font-bold text-sm"
            style={{ background: accentColor }}
          >
            AI
          </div>
        )}
        <span className="app-text truncate text-sm font-semibold tracking-tight min-[360px]:text-base sm:text-lg">
          {brandName}
        </span>
      </div>

      <div className="ml-auto flex items-center gap-1.5 sm:gap-2">
        <Link href="/mods" className="app-control inline-flex h-9 items-center gap-2 rounded-lg border px-2.5 text-sm" aria-label="打开 Mod 中心" title="Mod 中心"><Puzzle size={14} /><span className="hidden md:inline">Mod 中心</span></Link>
        <span
          className={`flex h-9 items-center gap-1.5 rounded-full border px-2.5 text-xs font-medium sm:px-3 ${
            online
              ? "border-emerald-400/25 bg-emerald-400/10 text-emerald-300"
              : "border-red-400/25 bg-red-400/10 text-red-300"
          }`}
          aria-label={online ? "推理服务在线" : "推理服务离线"}
          title={online ? "推理服务在线" : "推理服务离线"}
        >
          <span
            className="w-1.5 h-1.5 rounded-full"
            style={{ background: online ? "var(--success)" : "var(--danger)" }}
          />
          <span className="hidden sm:inline">{online ? "在线" : "离线"}</span>
        </span>
        <button
          type="button"
          onClick={onOpenAgentLab}
          className="app-control inline-flex h-9 items-center gap-2 rounded-lg border px-2.5 text-sm transition-colors lg:px-3"
          aria-label="打开 EvoScientist 任务与日志"
          title="EvoScientist 任务与日志"
        >
          <Bot size={14} />
          <span className="hidden lg:inline">EvoScientist</span>
        </button>
        <button
          type="button"
          onClick={onOpenModelHub}
          className="app-control inline-flex h-9 items-center gap-2 rounded-lg border px-2.5 text-sm transition-colors md:px-3"
          aria-label="打开模型库"
          title="模型库"
        >
          <PackageOpen size={14} />
          <span className="hidden md:inline">模型库</span>
        </button>
        <button
          type="button"
          onClick={onOpenMetrics}
          className="app-control inline-flex h-9 items-center gap-2 rounded-lg border px-2.5 text-sm transition-colors xl:hidden"
          aria-label="打开运行状态"
          title="运行状态"
        >
          <Gauge size={14} />
          <span className="hidden md:inline">运行状态</span>
        </button>
        <button
          type="button"
          onClick={onToggleTheme}
          className="app-control inline-flex h-9 w-9 items-center justify-center rounded-lg border transition-colors"
          aria-label={theme === "dark" ? "切换到浅色主题" : "切换到深色主题"}
          title={theme === "dark" ? "切换到浅色主题" : "切换到深色主题"}
        >
          {theme === "dark" ? <Sun size={15} /> : <Moon size={15} />}
        </button>
        <div className="relative hidden max-w-[36vw] sm:block lg:max-w-none">
          <select
            value={model}
            onChange={(e) => onModelChange(e.target.value)}
            disabled={!liveModelSwitchSupported}
            title={liveModelSwitchSupported ? "在线切换当前请求使用的模型" : "当前后端是单模型服务，切换模型需重启后端"}
            className="app-control max-w-[220px] appearance-none rounded-lg border py-2 pl-4 pr-8 text-sm transition-colors focus:outline-none"
          >
            {models.map((m) => (
              <option key={m} value={m} className="app-surface-raised">
                {m}
              </option>
            ))}
          </select>
          <ChevronDown size={14} className="app-text-muted pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2" />
        </div>
      </div>
    </header>
  );
}

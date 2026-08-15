"use client";

import { ChevronDown, PackageOpen, Bot } from "lucide-react";

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
  online,
}: HeaderProps) {
  return (
    <header
      className="flex min-w-0 items-center justify-between gap-3 px-3 py-3 sm:px-6 border-b border-white/10"
      style={{ background: `linear-gradient(135deg, ${accentColor}22 0%, #0f172a 100%)` }}
    >
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
        <span className="truncate text-white font-semibold text-base sm:text-lg tracking-tight">
          {brandName}
        </span>
      </div>

      {/* Keep the top bar operational: one health signal, no marketing copy. */}
      <div className="hidden sm:flex items-center gap-3">
        <span
          className={`flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded-full border ${
            online
              ? "text-emerald-400 bg-emerald-400/10 border-emerald-400/20"
              : "text-red-400 bg-red-400/10 border-red-400/20"
          }`}
        >
          <span
            className={`w-1.5 h-1.5 rounded-full ${online ? "bg-emerald-400 animate-pulse" : "bg-red-400"}`}
          />
          {online ? "在线" : "离线"}
        </span>
      </div>

      {/* Model selector */}
      <div className="hidden sm:flex min-w-0 items-center gap-2 lg:gap-3">
        <button
          type="button"
          onClick={onOpenAgentLab}
          className="hidden lg:inline-flex items-center gap-2 px-3 py-2 rounded-lg border border-cyan-300/25 bg-cyan-300/10 text-cyan-100 hover:bg-cyan-300/20 transition-colors text-sm"
        >
          <Bot size={14} />
          EvoScientist
        </button>
        <button
          type="button"
          onClick={onOpenModelHub}
          className="hidden md:inline-flex items-center gap-2 px-3 py-2 rounded-lg border border-white/10 bg-white/5 text-white/80 hover:bg-white/10 hover:text-white transition-colors text-sm"
        >
          <PackageOpen size={14} />
          模型库
        </button>
        <div className="relative max-w-[44vw] lg:max-w-none">
          <select
            value={model}
            onChange={(e) => onModelChange(e.target.value)}
            disabled={!liveModelSwitchSupported}
            title={liveModelSwitchSupported ? "在线切换当前请求使用的模型" : "当前后端是单模型服务，切换模型需重启后端"}
            className="appearance-none bg-white/5 border border-white/10 text-white text-sm px-4 py-2 pr-8 rounded-lg cursor-pointer focus:outline-none focus:border-white/30 hover:bg-white/10 transition-colors max-w-[220px] disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {models.map((m) => (
              <option key={m} value={m} className="bg-slate-800">
                {m}
              </option>
            ))}
          </select>
          <ChevronDown size={14} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-white/50 pointer-events-none" />
        </div>
      </div>
    </header>
  );
}

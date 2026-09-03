"use client";

import { useEffect, useState } from "react";
import {
  AreaChart,
  Area,
  ResponsiveContainer,
  Tooltip,
  YAxis,
} from "recharts";
import { Zap, Clock, Activity, HardDrive, Database, Server, X } from "lucide-react";
import RuntimeStackCard from "@/components/RuntimeStackCard";
import clsx from "clsx";
import { useDialogFocus } from "@/components/useDialogFocus";
import LocalServiceCard from "@/components/LocalServiceCard";
import type { MetricsSnapshot } from "@/types";
import type { RuntimeProvenance } from "@/lib/runtimeProvenance";

interface MetricsDashboardProps {
  snapshot: MetricsSnapshot | null;
  history: { time: number; tps: number; latency: number; gpu: number }[];
  accentColor: string;
  model: string;
  models: string[];
  liveModelSwitchSupported: boolean;
  online: boolean;
  onModelChange: (model: string) => void;
  open: boolean;
  onClose: () => void;
  runtimeProvenance: RuntimeProvenance;
}

function StatCard({
  icon,
  label,
  value,
  unit,
  sub,
  color,
}: {
  icon: React.ReactNode;
  label: string;
  value: string | number;
  unit?: string;
  sub?: string;
  color: string;
}) {
  return (
    <div className="app-card-flat rounded-xl p-3 transition-colors">
      <div className="mb-2 flex items-center gap-2">
        <div className="p-1.5 rounded-lg" style={{ background: `color-mix(in srgb, ${color} 12%, transparent)` }}>
          <div style={{ color }}>{icon}</div>
        </div>
        <span className="app-text-muted text-[11px] font-medium uppercase tracking-wider">
          {label}
        </span>
      </div>
      <div className="flex items-end gap-1.5">
        <span className="app-text text-xl font-bold tabular-nums leading-none">
          {value}
        </span>
        {unit && (
          <span className="app-text-muted pb-0.5 text-xs">{unit}</span>
        )}
      </div>
      {sub && <p className="app-text-muted mt-1 text-[11px]">{sub}</p>}
    </div>
  );
}

function MiniChart({
  data,
  dataKey,
  color,
  label,
}: {
  data: { time: number; [key: string]: number }[];
  dataKey: string;
  color: string;
  label: string;
}) {
  return (
    <div className="app-card-flat rounded-xl p-3">
      <p className="app-text-muted mb-2 text-[11px] font-medium uppercase tracking-wider">
        {label}
      </p>
      <ResponsiveContainer width="100%" height={60}>
        <AreaChart data={data} margin={{ top: 2, right: 0, left: 0, bottom: 0 }}>
          <defs>
            <linearGradient id={`grad-${dataKey}`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={color} stopOpacity={0.3} />
              <stop offset="100%" stopColor={color} stopOpacity={0} />
            </linearGradient>
          </defs>
          <YAxis domain={["auto", "auto"]} hide />
          <Tooltip
            contentStyle={{
              background: "var(--tooltip-bg)",
              border: "1px solid var(--border)",
              borderRadius: "8px",
              color: "var(--text-primary)",
              fontSize: "12px",
              padding: "4px 10px",
            }}
            formatter={(v: number) => [v.toFixed(1), label]}
            labelFormatter={() => ""}
          />
          <Area
            type="monotone"
            dataKey={dataKey}
            stroke={color}
            strokeWidth={2}
            fill={`url(#grad-${dataKey})`}
            dot={false}
            isAnimationActive={false}
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}

function GpuBar({ used, total, color }: { used: number; total: number; color: string }) {
  const pct = total > 0 ? Math.min((used / total) * 100, 100) : 0;
  return (
    <div className="app-card-flat rounded-xl p-3">
      <div className="flex items-center gap-2 mb-3">
        <div className="p-1.5 rounded-lg" style={{ background: `color-mix(in srgb, ${color} 12%, transparent)` }}>
          <HardDrive size={14} style={{ color }} />
        </div>
        <span className="app-text-muted text-[11px] font-medium uppercase tracking-wider">
          显存占用
        </span>
      </div>
      <div className="flex justify-between items-end mb-2">
        <span className="app-text text-xl font-bold tabular-nums">
          {used.toFixed(1)}
        </span>
        <span className="app-text-muted text-xs">/ {total.toFixed(0)} GB</span>
      </div>
      <div className="app-control h-2 overflow-hidden rounded-full">
        <div
          className="h-full rounded-full transition-all duration-700"
          style={{ width: `${pct}%`, background: color }}
        />
      </div>
      <p className="app-text-muted mt-1.5 text-right text-[11px]">{pct.toFixed(0)}%</p>
    </div>
  );
}

export default function MetricsDashboard({
  snapshot,
  history,
  accentColor,
  model,
  models,
  liveModelSwitchSupported,
  online,
  onModelChange,
  open,
  onClose,
  runtimeProvenance,
}: MetricsDashboardProps) {
  const s = snapshot;
  const [desktopRail, setDesktopRail] = useState(false);
  const dialogRef = useDialogFocus<HTMLElement>(open && !desktopRail, onClose);

  useEffect(() => {
    const media = window.matchMedia("(min-width: 1280px)");
    const update = () => setDesktopRail(media.matches);
    update();
    media.addEventListener("change", update);
    return () => media.removeEventListener("change", update);
  }, []);

  const panelInteractive = desktopRail || open;

  return (
    <>
      {open ? <button type="button" aria-label="关闭运行状态" onClick={onClose} className="fixed inset-0 z-40 bg-slate-950/80 backdrop-blur-sm xl:hidden" /> : null}
      <aside
        ref={dialogRef}
        role={open && !desktopRail ? "dialog" : undefined}
        aria-modal={open && !desktopRail ? true : undefined}
        aria-label="运行状态"
        tabIndex={-1}
        aria-hidden={!panelInteractive}
        inert={panelInteractive ? undefined : true}
        className={clsx(
        "app-surface app-border fixed inset-y-0 right-0 z-50 flex w-[min(23rem,calc(100vw-1rem))] flex-col overflow-y-auto border-l shadow-2xl transition-transform xl:static xl:z-auto xl:w-[22rem] xl:min-w-[320px] xl:translate-x-0 xl:shadow-none",
        open ? "translate-x-0" : "translate-x-full xl:translate-x-0"
      )}>
      <div className="app-surface app-divider sticky top-0 z-10 flex items-center justify-between border-b px-4 py-3">
        <div>
          <h2 className="app-text text-sm font-semibold">运行状态</h2>
          <p className="app-text-muted mt-0.5 text-[11px]">服务、模型与性能证据</p>
        </div>
        <button type="button" onClick={onClose} className="app-control inline-flex h-9 w-9 items-center justify-center rounded-lg border xl:hidden" aria-label="关闭运行状态"><X size={16} /></button>
      </div>

      <div className="flex flex-col gap-3 px-4 py-4">
        <LocalServiceCard />

        <div className="app-card rounded-xl p-4 space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-white/55 text-xs font-medium uppercase tracking-wider">
              模型选择
            </span>
            <span
              className={
                !online
                  ? "text-red-300 text-xs"
                  : liveModelSwitchSupported
                    ? "text-emerald-300 text-xs"
                    : "text-amber-300 text-xs"
              }
            >
              {!online ? "离线兜底" : liveModelSwitchSupported ? "在线可切换" : "平台单模型"}
            </span>
          </div>
          <select
            value={model}
            onChange={(e) => onModelChange(e.target.value)}
            disabled={!liveModelSwitchSupported}
            title={liveModelSwitchSupported ? "在线切换当前请求使用的模型" : "当前后端由平台托管为单模型服务"}
            className="app-control w-full appearance-none rounded-lg border px-3 py-2 text-sm focus:outline-none"
          >
            {models.map((item) => (
              <option key={item} value={item} className="bg-slate-900">
                {item}
              </option>
            ))}
          </select>
          <p className="app-text-muted text-xs leading-5">
            {liveModelSwitchSupported
              ? "当前后端暴露了多个在线模型，切换会作用于新请求。"
              : "当前后端是平台托管的单模型服务；模型切换由平台运维统一完成。"}
          </p>
        </div>

        <div className="grid grid-cols-2 gap-2">
        <StatCard
          icon={<Zap size={14} />}
          label="吞吐率"
          value={s ? s.tokensPerSecond.toFixed(1) : "—"}
          unit="tok/s"
          color="var(--chart-purple)"
        />
        <StatCard
          icon={<Clock size={14} />}
          label="首 token 延迟"
          value={s ? s.avgLatencyMs.toFixed(0) : "—"}
          unit="ms"
          sub="P50 · 未采集时为 0"
          color="var(--chart-blue)"
        />
        <StatCard
          icon={<Activity size={14} />}
          label="加速器利用率"
          value={s && s.gpuMemTotalGb > 0 ? s.gpuUtilPct.toFixed(0) : "—"}
          sub={s && s.gpuMemTotalGb > 0 ? undefined : "未提供设备遥测"}
          unit="%"
          color="var(--chart-green)"
        />

        <StatCard
          icon={<Database size={14} />}
          label="已服务"
          value={s ? s.totalRequestsServed : "—"}
          color="var(--chart-orange)"
        />
        </div>

        {/* Only display device memory when a real capacity was reported. */}
        {s && s.gpuMemTotalGb > 0 && (
          <GpuBar
            used={s.gpuMemUsedGb}
            total={s.gpuMemTotalGb}
            color={accentColor}
          />
        )}

        <div className="grid grid-cols-2 gap-2">
          <MiniChart data={history} dataKey="tps" color="var(--chart-purple)" label="吞吐趋势" />
          <MiniChart data={history} dataKey="latency" color="var(--chart-blue)" label="延迟趋势" />
        </div>

        <div className="grid grid-cols-2 gap-2">
          <StatCard
            icon={<Server size={14} />}
            label="排队中"
            value={s ? s.pendingRequests : "—"}
            color="var(--chart-pink)"
          />
          <StatCard
            icon={<Clock size={14} />}
            label="运行时长"
            value={s ? Math.floor(s.uptimeSeconds / 3600) : "—"}
            unit="h"
            color="var(--chart-teal)"
          />
        </div>

        {/* Model info */}
        {s && (
          <div className="app-card-flat rounded-xl p-4 text-xs space-y-2">
            <div className="flex justify-between gap-3">
              <span className="text-white/40">模型</span>
              <span className="text-white/80 min-w-0 max-w-[75%] break-all text-right font-mono" title={s.modelName}>
                {s.modelName}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-white/40">后端</span>
              <span className="text-emerald-400 font-medium">{s.backendType}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-white/40">状态</span>
              <span className={online ? "text-emerald-400 font-medium" : "text-red-300 font-medium"}>{online ? "服务在线" : "服务离线"}</span>
            </div>
          </div>
        )}

        <RuntimeStackCard provenance={runtimeProvenance} />
      </div>
    </aside>
    </>
  );
}

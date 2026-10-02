"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  Activity,
  ArrowLeft,
  CheckCircle2,
  CirclePause,
  Gauge,
  Moon,
  RefreshCw,
  ShieldCheck,
  Sun,
  Zap,
} from "lucide-react";
import {
  SWITCH_EVIDENCE,
  enabledStrategies,
  improvementLabel,
  type SwitchMetric,
} from "@/lib/inferenceSwitch";

type Phase = "observing" | "matching" | "verifying" | "enabled";

const phaseCopy: Record<Phase, string> = {
  observing: "观测硬件与负载",
  matching: "匹配已验证策略",
  verifying: "校验组合边界",
  enabled: "自动启用更优组合",
};

function metricValue(metric: SwitchMetric, optimized: boolean): string {
  return (optimized ? metric.optimized : metric.baseline).toFixed(metric.decimals);
}

function MetricComparison({ metric, autoEnabled }: { metric: SwitchMetric; autoEnabled: boolean }) {
  const maximum = Math.max(metric.baseline, metric.optimized);
  const baselineWidth = `${Math.max(12, metric.baseline / maximum * 100)}%`;
  const optimizedWidth = `${Math.max(12, metric.optimized / maximum * 100)}%`;
  return (
    <article className="app-surface rounded-2xl border app-border p-5">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="app-text-muted text-xs">{metric.label}</p>
          <p className="mt-2 text-3xl font-semibold tracking-tight">
            {metricValue(metric, autoEnabled)} <span className="app-text-muted text-sm font-normal">{metric.unit}</span>
          </p>
        </div>
        <span className="rounded-full bg-emerald-400/10 px-3 py-1 text-sm font-semibold text-emerald-300">
          {improvementLabel(metric)}
        </span>
      </div>
      <div className="mt-5 space-y-3 text-xs">
        <div className="grid grid-cols-[58px_1fr_62px] items-center gap-2">
          <span className="app-text-muted">Native</span>
          <span className="h-2 overflow-hidden rounded-full app-surface-muted"><i className="block h-full rounded-full bg-slate-500" style={{ width: baselineWidth }} /></span>
          <span className="text-right tabular-nums">{metric.baseline.toFixed(metric.decimals)}</span>
        </div>
        <div className="grid grid-cols-[58px_1fr_62px] items-center gap-2">
          <span className="text-indigo-300">GenNova</span>
          <span className="h-2 overflow-hidden rounded-full app-surface-muted"><i className="block h-full rounded-full bg-indigo-400" style={{ width: optimizedWidth }} /></span>
          <span className="text-right tabular-nums text-indigo-200">{metric.optimized.toFixed(metric.decimals)}</span>
        </div>
      </div>
    </article>
  );
}

export default function InferenceSwitchDashboard() {
  const [autoEnabled, setAutoEnabled] = useState(true);
  const [phase, setPhase] = useState<Phase>("enabled");
  const [theme, setTheme] = useState<"dark" | "light">("dark");
  const active = useMemo(() => enabledStrategies(autoEnabled), [autoEnabled]);

  useEffect(() => {
    const current = document.documentElement.dataset.theme === "light" ? "light" : "dark";
    setTheme(current);
  }, []);

  const runAutomaticMatch = () => {
    setAutoEnabled(true);
    const phases: Phase[] = ["observing", "matching", "verifying", "enabled"];
    phases.forEach((next, index) => window.setTimeout(() => setPhase(next), index * 420));
  };

  const toggleTheme = () => {
    setTheme(previous => {
      const next = previous === "dark" ? "light" : "dark";
      document.documentElement.dataset.theme = next;
      document.documentElement.style.colorScheme = next;
      return next;
    });
  };

  return (
    <main className="min-h-screen app-bg app-text">
      <header className="app-header flex items-center justify-between gap-3 border-b px-4 py-3 sm:px-7">
        <div className="flex min-w-0 items-center gap-3">
          <Link href="/" className="app-control inline-flex h-9 w-9 items-center justify-center rounded-lg border" aria-label="返回工作站"><ArrowLeft size={16} /></Link>
          <div className="min-w-0">
            <p className="truncate font-semibold">GenNova 推理开关</p>
            <p className="app-text-muted truncate text-xs">vLLM-HUST Workstation</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <span className="hidden rounded-full border border-emerald-400/25 bg-emerald-400/10 px-3 py-1.5 text-xs text-emerald-300 sm:inline-flex sm:items-center sm:gap-2"><i className="h-1.5 w-1.5 rounded-full bg-emerald-400" />实测证据已载入</span>
          <button type="button" className="app-control inline-flex h-9 w-9 items-center justify-center rounded-lg border" onClick={toggleTheme} aria-label="切换主题">{theme === "dark" ? <Sun size={15} /> : <Moon size={15} />}</button>
        </div>
      </header>

      <div className="mx-auto max-w-7xl space-y-6 px-4 py-6 sm:px-7 lg:py-8">
        <section className="grid gap-5 lg:grid-cols-[1.4fr_.9fr]">
          <div className="app-surface relative overflow-hidden rounded-3xl border app-border p-6 sm:p-8">
            <div className="absolute right-0 top-0 h-40 w-40 rounded-full bg-indigo-500/10 blur-3xl" />
            <div className="relative">
              <p className="app-text-muted text-xs font-medium uppercase tracking-[.18em]">当前场景</p>
              <h1 className="mt-3 text-2xl font-semibold tracking-tight sm:text-4xl">{SWITCH_EVIDENCE.title}</h1>
              <p className="app-text-secondary mt-3 text-sm">{SWITCH_EVIDENCE.hardware} · {SWITCH_EVIDENCE.measuredSeconds / 60} 分钟真实负载对照</p>
              <div className="mt-7 flex flex-wrap items-center gap-3">
                <button type="button" role="switch" aria-checked={autoEnabled} onClick={() => { setAutoEnabled(value => !value); setPhase(autoEnabled ? "observing" : "enabled"); }} className={`inline-flex items-center gap-3 rounded-xl border px-4 py-3 text-sm font-medium transition ${autoEnabled ? "border-emerald-400/40 bg-emerald-400/10 text-emerald-200" : "app-control"}`}>
                  <span className={`relative h-5 w-9 rounded-full ${autoEnabled ? "bg-emerald-400" : "bg-slate-600"}`}><i className={`absolute top-0.5 h-4 w-4 rounded-full bg-white transition ${autoEnabled ? "left-[18px]" : "left-0.5"}`} /></span>
                  自动优化{autoEnabled ? "已开启" : "已暂停"}
                </button>
                <button type="button" onClick={runAutomaticMatch} className="app-control inline-flex items-center gap-2 rounded-xl border px-4 py-3 text-sm"><RefreshCw size={15} />重新匹配</button>
              </div>
            </div>
          </div>

          <div className="app-surface rounded-3xl border app-border p-6">
            <div className="flex items-center justify-between gap-3"><div><p className="app-text-muted text-xs">当前状态</p><p className="mt-2 text-xl font-semibold">{autoEnabled ? "优化组合已自动启用" : "Native 基线运行"}</p></div><ShieldCheck className={autoEnabled ? "text-emerald-300" : "app-text-muted"} size={28} /></div>
            <div className="mt-5 space-y-3">
              {Object.entries(phaseCopy).map(([key, label]) => {
                const order = ["observing", "matching", "verifying", "enabled"];
                const complete = order.indexOf(key) <= order.indexOf(phase) && autoEnabled;
                return <div key={key} className="flex items-center gap-3 text-sm"><span className={`inline-flex h-7 w-7 items-center justify-center rounded-full ${complete ? "bg-indigo-400/15 text-indigo-300" : "app-surface-muted app-text-muted"}`}>{complete ? <CheckCircle2 size={15} /> : <CirclePause size={15} />}</span><span className={complete ? "app-text" : "app-text-muted"}>{label}</span></div>;
              })}
            </div>
          </div>
        </section>

        <section>
          <div className="mb-4 flex flex-wrap items-end justify-between gap-3"><div><p className="app-text-muted text-xs">实测加速效果</p><h2 className="mt-1 text-xl font-semibold">Native 基线与自动优化组合</h2></div><a href={SWITCH_EVIDENCE.sourceUrl} target="_blank" rel="noreferrer" className="app-control rounded-lg border px-3 py-2 text-xs">打开 Frontier 证据</a></div>
          <div className="grid gap-4 md:grid-cols-3">{SWITCH_EVIDENCE.metrics.map(metric => <MetricComparison key={metric.label} metric={metric} autoEnabled={autoEnabled} />)}</div>
        </section>

        <section className="grid gap-5 lg:grid-cols-[1.35fr_.65fr]">
          <div className="app-surface rounded-3xl border app-border p-5 sm:p-6">
            <div className="flex items-center gap-3"><Zap className="text-indigo-300" size={20} /><div><p className="font-semibold">自动策略组合</p><p className="app-text-muted mt-1 text-xs">只启用当前场景有匹配证据且不发生领域冲突的能力</p></div></div>
            <div className="mt-5 divide-y app-border">
              {SWITCH_EVIDENCE.strategies.map(strategy => {
                const enabled = autoEnabled && strategy.status === "enabled";
                return <article key={strategy.id} className="grid gap-3 py-4 sm:grid-cols-[1fr_1.5fr_auto] sm:items-center">
                  <div><p className="font-medium">{strategy.name}</p><p className="app-text-muted mt-1 text-xs">{strategy.role}</p></div>
                  <p className="app-text-secondary text-sm leading-6">{strategy.reason}</p>
                  <span className={`w-fit rounded-full px-3 py-1 text-xs ${enabled ? "bg-emerald-400/10 text-emerald-300" : strategy.status === "conditional" ? "bg-amber-400/10 text-amber-300" : "app-surface-muted app-text-muted"}`}>{enabled ? "已自动启用" : strategy.status === "conditional" ? "条件候选" : "已按住"}</span>
                </article>;
              })}
            </div>
          </div>

          <aside className="space-y-4">
            <div className="app-surface rounded-3xl border app-border p-5"><div className="flex items-center gap-3"><Gauge size={19} className="text-indigo-300" /><p className="font-semibold">当前运行组合</p></div><div className="mt-4 flex flex-wrap gap-2">{active.length ? active.map(strategy => <span key={strategy.id} className="rounded-full border border-indigo-400/30 bg-indigo-400/10 px-3 py-1.5 text-xs text-indigo-200">{strategy.name}</span>) : <span className="app-text-muted text-sm">Native 基线</span>}</div></div>
            <div className="app-surface rounded-3xl border app-border p-5"><div className="flex items-center gap-3"><Activity size={19} className="text-emerald-300" /><p className="font-semibold">证据完整性</p></div><dl className="app-text-secondary mt-4 space-y-3 text-sm"><div className="flex justify-between gap-3"><dt>采样日期</dt><dd>{SWITCH_EVIDENCE.sampledAt}</dd></div><div className="flex justify-between gap-3"><dt>基线 run</dt><dd className="font-mono text-xs">{SWITCH_EVIDENCE.baselineRunId.slice(0, 10)}</dd></div><div className="flex justify-between gap-3"><dt>优化 run</dt><dd className="font-mono text-xs">{SWITCH_EVIDENCE.optimizedRunId.slice(0, 10)}</dd></div></dl></div>
          </aside>
        </section>

        <p className="app-text-muted pb-4 text-xs leading-5">本页数字来自 Frontier 的实测运行。对照使用相同模型、同类负载与相同硬件，展示整体优化配置与 Native 基线的观测差异，不作为单一组件的因果消融结论。
        </p>
      </div>
    </main>
  );
}

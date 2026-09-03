"use client";

import React from "react";
import { ChevronDown, ExternalLink, ShieldCheck } from "lucide-react";
import type { RuntimeProvenance } from "@/lib/runtimeProvenance";

function displayTime(value?: string) {
  if (!value || !Number.isFinite(Date.parse(value))) return "—";
  return new Intl.DateTimeFormat("zh-CN", {
    timeZone: "Asia/Shanghai", year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", hour12: false,
  }).format(new Date(value));
}

export default function RuntimeStackCard({ provenance }: { provenance: RuntimeProvenance }) {
  const { components, image, compatibility, verification } = provenance;
  if (!provenance.available || !components || !image) {
    return <section aria-label="推理栈" className="app-card-flat rounded-xl p-4">
      <div className="flex items-center justify-between gap-3">
        <h3 className="app-text text-sm font-semibold">推理栈</h3>
        <span className="text-amber-300 text-xs">待核验</span>
      </div>
      <details className="mt-3 text-xs">
        <summary className="app-text-muted cursor-pointer">查看原因</summary>
        <p className="app-text-secondary mt-2 leading-5" role="status">{provenance.reason || "正在读取运行来源"}</p>
      </details>
    </section>;
  }

  return <section aria-label="推理栈" className="app-card-flat rounded-xl p-4">
    <div className="flex items-center justify-between gap-3">
      <h3 className="app-text text-sm font-semibold">推理栈</h3>
      <span className="inline-flex items-center gap-1 text-xs text-emerald-300" title={verification?.message}>
        <ShieldCheck size={13} aria-hidden="true" />容器已核验
      </span>
    </div>
    <div className="mt-4 space-y-3">
      {[components.core, components.plugin].map(component => (
        <a key={component.name} href={component.commitUrl} target="_blank" rel="noopener noreferrer"
          title={`${component.name} · ${component.version} · ${component.commit}`}
          className="group flex items-center justify-between gap-3 rounded text-xs">
          <span className="app-text-secondary font-medium group-hover:underline">{component.name}</span>
          <span className="app-text-muted inline-flex shrink-0 items-center gap-1.5">
            <code>{component.commit.slice(0, 8)}</code><ExternalLink size={11} aria-hidden="true" />
          </span>
        </a>
      ))}
    </div>
    <details className="group mt-4 border-t app-border pt-3" onKeyDownCapture={event => {
      if (event.key === "Escape") { event.stopPropagation(); event.currentTarget.open = false; event.currentTarget.querySelector("summary")?.focus(); }
    }}>
      <summary className="app-text-muted flex cursor-pointer list-none items-center justify-between rounded text-xs [&::-webkit-details-marker]:hidden">
        版本与构建详情<ChevronDown size={14} aria-hidden="true" className="transition-transform group-open:rotate-180" />
      </summary>
      <div className="mt-3 max-h-80 overflow-y-auto overscroll-contain pr-1 text-xs">
        <dl className="space-y-3">
          {[
            ["Core source", components.core.version],
            ["Core package", compatibility?.vllmPackage],
            ["Plugin source", components.plugin.version],
            ["Plugin package", compatibility?.vllmAscendPackage],
            ["兼容基线", compatibility?.stableRelease],
            ["源码通道", compatibility?.sourceProfile],
            ["兼容说明", compatibility?.base],
            ["镜像", image.reference],
            ["Image digest", image.digest],
            ["容器", provenance.container?.name],
            ["Core SHA", components.core.commit],
            ["Plugin SHA", components.plugin.commit],
          ].map(([label, value]) => <div key={label}>
            <dt className="app-text-muted">{label}</dt>
            <dd className="app-text-secondary mt-1 break-all leading-5">{value || "—"}</dd>
          </div>)}
          {[["构建", image.createdAt], ["凭据采集", provenance.capturedAt], ["身份核验", verification?.checkedAt]].map(([label, value]) => (
            <div key={label} className="flex flex-wrap justify-between gap-x-2 gap-y-1">
              <dt className="app-text-muted">{label}</dt><dd className="app-text-secondary"><time title={value} dateTime={value}>{displayTime(value)}</time></dd>
            </div>
          ))}
        </dl>
        <p className="app-text-muted mt-2 text-[11px]">时间均为北京时间（UTC+8）</p>
        <div className="app-border mt-4 border-t pt-3 app-text-muted leading-5">
          <p>{verification?.message}</p>
          <p className="mt-2">源码为构建时冻结快照，不代表当前 latest main。</p>
        </div>
      </div>
    </details>
  </section>;
}

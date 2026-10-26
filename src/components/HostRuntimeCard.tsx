"use client";

import type { RuntimeProvenance } from "@/lib/runtimeProvenance";

export default function HostRuntimeCard({ provenance, selectedModel }: { provenance: RuntimeProvenance; selectedModel?: string }) {
  const host = provenance.hostEvidence;
  if (!host) return null;
  const covered = !selectedModel || host.coveredModels.includes(selectedModel);
  return <section aria-label="宿主运行来源" className="app-card-flat rounded-xl p-4 text-xs">
    <h3 className="app-text text-sm font-semibold">运行来源 · 本机服务与磁盘制品已核验</h3>
    {!covered && <p className="mt-2 text-amber-300" role="status">当前选择的模型不在这份本机证据覆盖范围内；不能据此核验远程后端或自动路由。</p>}
    <a className="app-text-secondary mt-2 inline-block underline" href={host.commitUrl} target="_blank" rel="noopener noreferrer">vLLM-HUST · {host.commit.slice(0, 8)}</a>
    <details className="mt-3" onKeyDownCapture={event => {
      if (event.key === "Escape") { event.stopPropagation(); event.currentTarget.open = false; event.currentTarget.querySelector("summary")?.focus(); }
    }}>
    <summary className="app-text-muted cursor-pointer">核验范围与证据详情</summary>
    <p className="app-text-secondary mt-2 break-all">覆盖模型：{host.coveredModels.join("、")}</p>
    <dl className="app-text-secondary mt-3 space-y-2 break-all">
      <div><dt className="app-text-muted">服务 / PID</dt><dd>{host.service} / {host.pid}</dd></div>
      <div><dt className="app-text-muted">网关 / PID / 启动配置摘要</dt><dd>{host.routerService} / {host.routerPid}<br />{host.routeDigest}</dd></div>
      <div><dt className="app-text-muted">安装包版本</dt><dd>{host.version}</dd></div>
      <div><dt className="app-text-muted">源码与原生制品摘要</dt><dd>{host.sourceDigest}</dd></div>
      <div><dt className="app-text-muted">核对文件</dt><dd>{host.trackedAndNativeFiles}（原生制品 {host.nativeArtifacts}）· 工作树干净</dd></div>
      <div><dt className="app-text-muted">服务启动 / 本次核验（北京时间）</dt><dd>{new Date(host.startedAt).toLocaleString("zh-CN", { timeZone: "Asia/Shanghai" })} / {new Date(host.observedAt).toLocaleString("zh-CN", { timeZone: "Asia/Shanghai" })}</dd></div>
    </dl>
    <p className="app-text-muted mt-3 leading-5">{provenance.verification?.message}</p>
    <p className="app-text-muted mt-2 leading-5">CUDA 宿主部署不适用 Ascend 插件或 Docker 镜像凭据；包版本、源码 commit 与本次磁盘摘要分别展示。</p>
    </details>
  </section>;
}

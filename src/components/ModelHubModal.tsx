"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { Download, LoaderCircle, X } from "lucide-react";
import clsx from "clsx";
import { useDialogFocus } from "@/components/useDialogFocus";
import type { ModelHubCatalog, ModelHubModel } from "@/types";

interface ModelHubModalProps {
  open: boolean;
  currentModel: string;
  onClose: () => void;
}

export default function ModelHubModal({
  open,
  currentModel,
  onClose,
}: ModelHubModalProps) {
  const dialogRef = useDialogFocus(open, onClose);
  const [catalog, setCatalog] = useState<ModelHubModel[]>([]);
  const [payload, setPayload] = useState<ModelHubCatalog | null>(null);
  const [adminToken, setAdminToken] = useState("");
  const [tokenInput, setTokenInput] = useState("");
  const [showLogin, setShowLogin] = useState(false);
  const [pendingModel, setPendingModel] = useState("");
  const epoch = useRef(0);
  const invalidateRequests = useCallback(() => { ++epoch.current; }, []);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [actionMessage, setActionMessage] = useState("");

  const loadCatalog = useCallback(async (token = "") => {
    const requestEpoch = ++epoch.current;
    setLoading(true);
    setError("");
    try {
      const res = await fetch("/api/hub/catalog", { cache: "no-store", headers: token ? { "X-Workstation-Admin-Token": token } : {} });
      if (requestEpoch !== epoch.current) return;
      if (!res.ok) {
        if (res.status === 401) { setAdminToken(""); setPayload(null); }
        if (res.status === 401) throw new Error("管理员令牌无效或已失效。");
        throw new Error(`HTTP ${res.status}`);
      }
      const data: ModelHubCatalog = await res.json();
      if (requestEpoch !== epoch.current) return;
      setCatalog(data.catalog || []);
      setPayload(data);
      if (token && data.permissions?.administrator) { setAdminToken(token); setTokenInput(""); setShowLogin(false); }
    } catch (err) {
      if (requestEpoch === epoch.current) setError(err instanceof Error ? err.message : "模型库加载失败");
    } finally {
      if (requestEpoch === epoch.current) setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!open) {
      ++epoch.current;
      setAdminToken(""); setTokenInput(""); setShowLogin(false); setPayload(null); setCatalog([]);
      return;
    }
    setActionMessage("");
    void loadCatalog(adminToken);
    return invalidateRequests;
  }, [open, loadCatalog, adminToken, invalidateRequests]);

  const hasDownloading = useMemo(
    () => catalog.some((item) => item.download?.status === "downloading"),
    [catalog]
  );

  useEffect(() => {
    if (!open || !hasDownloading || pendingModel) {
      return;
    }
    const id = window.setInterval(() => {
      void loadCatalog(adminToken);
    }, 1500);
    return () => window.clearInterval(id);
  }, [open, hasDownloading, loadCatalog, adminToken, pendingModel]);

  const runAction = async (modelId: string, method: "POST" | "DELETE") => {
    if (!adminToken || pendingModel) return;
    const actionEpoch = epoch.current;
    setPendingModel(modelId);
    setActionMessage("");
    try {
      const res = await fetch(`/api/hub/download/${encodeURIComponent(modelId)}`, { method, headers: { "X-Workstation-Admin-Token": adminToken } });
      const data = await res.json();
      if (actionEpoch !== epoch.current) return;
      if (res.status === 401) { setAdminToken(""); setPayload(null); }
      if (!res.ok) throw new Error(data.message || data.error || `HTTP ${res.status}`);
      setActionMessage(method === "DELETE" ? "已请求取消，保留已下载文件以便续传。" : data.message);
      await loadCatalog(adminToken);
    } catch (err) {
      if (actionEpoch === epoch.current) setActionMessage(err instanceof Error ? err.message : "操作失败，请稍后重试。");
    } finally {
      setPendingModel("");
    }
  };

  const login = (event: FormEvent) => {
    event.preventDefault();
    void loadCatalog(tokenInput.trim());
  };
  const isAdmin = Boolean(adminToken && payload?.permissions?.administrator);

  if (!open) {
    return null;
  }

  return (
    <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-6">
      <div ref={dialogRef} role="dialog" aria-modal="true" aria-label="模型库" tabIndex={-1} className="w-full max-w-6xl max-h-[88vh] overflow-hidden rounded-3xl border border-white/10 bg-slate-950 shadow-2xl shadow-black/40 flex flex-col">
        <div className="px-6 py-5 border-b border-white/10 flex items-center justify-between">
          <div>
            <h2 className="text-white text-xl font-semibold">模型库</h2>
            <p className="app-text-muted text-sm mt-1">浏览模型与权重状态 · 下载不等于部署，不会切换当前推理服务</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="关闭模型库"
            className="app-control shrink-0 w-10 h-10 rounded-xl border flex items-center justify-center"
          >
            <X size={18} />
          </button>
        </div>

        <div className="px-6 py-3 border-b app-border text-sm space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
          <span className="app-text-secondary">{isAdmin ? "管理员 · 下载管理" : "只读浏览"}</span>
          <div className="flex flex-wrap gap-3">
          {isAdmin ? <button type="button" className="app-control rounded-lg border px-3 py-2" onClick={() => { ++epoch.current; setAdminToken(""); setPayload(null); setCatalog([]); setActionMessage(""); }}>退出管理</button>
            : <button type="button" className="app-control rounded-lg border px-3 py-2" onClick={() => setShowLogin(value => !value)}>管理员登录</button>}
          <button
            type="button"
            onClick={() => void loadCatalog(adminToken)}
            disabled={loading}
            className="app-control rounded-lg border px-3 py-2"
          >
            刷新列表
          </button>
          </div>
          </div>
          {showLogin && !isAdmin && <form onSubmit={login} className="flex flex-wrap items-end gap-2">
            <label className="app-text-secondary flex-1 min-w-0">管理员令牌
              <input type="password" autoComplete="off" value={tokenInput} onChange={event => setTokenInput(event.target.value)} className="app-control mt-1 block w-full rounded-lg border px-3 py-2" />
            </label>
            <button type="submit" disabled={loading || !tokenInput.trim()} className="app-control rounded-lg border px-3 py-2">验证令牌</button>
            <p className="app-text-muted w-full text-xs">令牌仅保存在本次弹窗内存，关闭后清除。</p>
          </form>}
          {isAdmin && <div className="app-text-secondary space-y-1 break-all">
            <p>{payload?.storage.message}</p>
            {payload?.storage.path && <p>模型存储：{payload.storage.path}</p>}
            {payload?.storage.freeBytes !== undefined && <p>可用空间：{(payload.storage.freeBytes / 1024 ** 3).toFixed(1)} GiB</p>}
          </div>}
          <p className="app-text-muted text-xs">权重下载由管理员管理；模型上线、切换和回滚由平台运维执行。</p>
        </div>

        <div className="flex-1 overflow-y-auto px-6 py-6">
          {loading && catalog.length === 0 && (
            <div className="text-white/40 text-sm">正在加载模型库…</div>
          )}
          {error && (
            <div className="mb-4 rounded-xl border border-red-400/20 bg-red-400/10 px-4 py-3 text-sm text-red-200">
              {error}
            </div>
          )}
          {actionMessage && (
            <div className="mb-4 rounded-xl border border-sky-400/20 bg-sky-400/10 px-4 py-3 text-sm text-sky-100 whitespace-pre-wrap">
              {actionMessage}
            </div>
          )}

          {!loading && !error && catalog.length === 0 && (
            <p className="app-text-muted rounded-xl border app-border p-6 text-sm" role="status">模型目录为空，请刷新列表或检查目录配置。</p>
          )}
          <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
            {catalog.map((item) => {
              const download = item.download;
              const isCurrent = item.id === currentModel || item.repoId === currentModel;
              const isDownloading = download?.status === "downloading";
              const progress = download?.pct ?? 0;
              const enoughSpace = (payload?.storage.freeBytes ?? 0) >= item.sizeGb * 1e9 * 1.1 + 5 * 1024 ** 3;

              return (
                <article
                  key={item.id}
                  className={clsx(
                    "rounded-2xl border bg-white/[0.03] p-5",
                    isCurrent ? "border-sky-400/35" : "border-white/10"
                  )}
                >
                  <div className="flex flex-col items-start justify-between gap-3 sm:flex-row sm:gap-4">
                    <div className="min-w-0 break-words [overflow-wrap:anywhere]">
                      <div className="flex items-center gap-3 flex-wrap">
                        <h3 className="text-white text-lg font-semibold">{item.name}</h3>
                        <span className="text-xs px-2 py-1 rounded-full bg-white/5 border border-white/10 text-white/60">
                          {item.params}
                        </span>
                        {isCurrent && (
                          <span className="text-xs px-2 py-1 rounded-full bg-sky-400/15 border border-sky-400/20 text-sky-200">
                            当前模型
                          </span>
                        )}
                        {item.installed && !isCurrent && (
                          <span className="text-xs px-2 py-1 rounded-full bg-emerald-400/15 border border-emerald-400/20 text-emerald-200">
                            权重就绪 · 未部署
                          </span>
                        )}
                      </div>
                      <p className="text-white/40 text-xs mt-2">{item.repoId}</p>
                    </div>
                    <div className="shrink-0 text-xs text-white/45 space-y-1 sm:text-right">
                      <div>权重约 {item.sizeGb} GB</div>
                      <div>建议显存 {item.vramGb} GB</div>
                    </div>
                  </div>

                  <p className="mt-4 text-sm text-white/70 leading-6">{item.description}</p>

                  <div className="mt-4 flex flex-wrap gap-2">
                    {item.tags.map((tag) => (
                      <span
                        key={tag}
                        className="app-text-secondary app-surface-muted app-border text-xs px-2.5 py-1 rounded-full border"
                      >
                        {tag}
                      </span>
                    ))}
                    {item.requiresAuth && (
                      <span className="text-xs px-2.5 py-1 rounded-full border border-amber-400/25 text-amber-200 bg-amber-400/10">
                        需要 HF_TOKEN
                      </span>
                    )}
                  </div>

                  {download?.status === "error" && download.error && (
                    <div className="mt-4 rounded-xl border border-red-400/20 bg-red-400/10 px-3 py-2 text-xs text-red-100 whitespace-pre-wrap">
                      {download.error}
                    </div>
                  )}

                  {isDownloading && (
                    <div className="mt-4 space-y-2">
                      <div className="flex items-center justify-between text-xs text-white/45">
                        <span>{download.currentFile || "下载中…"}</span>
                        <span>{progress}%</span>
                      </div>
                      <div className="h-2 rounded-full bg-white/10 overflow-hidden">
                        <div className="h-full rounded-full bg-sky-400 transition-all" style={{ width: `${progress}%` }} />
                      </div>
                      <div className="text-xs text-white/35">
                        {download.speedMbps ? `${download.speedMbps} MB/s` : "等待速度统计"}
                      </div>
                    </div>
                  )}

                  <div className="mt-5 flex items-center gap-3">
                    {isAdmin && !item.installed && !isDownloading && (
                      <button
                        type="button"
                        onClick={() => void runAction(item.id, "POST")}
                        disabled={!payload?.permissions.canDownload || !enoughSpace || Boolean(pendingModel) || hasDownloading}
                        className="app-control inline-flex items-center gap-2 px-4 py-2 rounded-xl border text-sm"
                      >
                        <Download size={15} />
                        {!payload?.permissions.canDownload ? "存储未就绪" : !enoughSpace ? "空间不足" : pendingModel === item.id ? "正在提交…" : "下载权重"}
                      </button>
                    )}

                    {isDownloading && (
                      <>
                        <span
                          className="app-text-secondary inline-flex items-center gap-2 px-4 py-2 text-sm"
                        >
                          <LoaderCircle size={15} className="animate-spin" />
                          下载中
                        </span>
                        {isAdmin && <button
                          type="button"
                          onClick={() => void runAction(item.id, "DELETE")}
                          disabled={Boolean(pendingModel)}
                          className="app-control px-4 py-2 rounded-xl border text-sm"
                        >
                          取消
                        </button>}
                      </>
                    )}

                    {!isAdmin && !isCurrent && <span className="app-text-muted text-sm">{item.installed ? "权重已下载，部署由平台管理" : "未下载 · 由管理员管理"}</span>}

                    {isCurrent && (
                      <div className="text-sm text-emerald-200">当前已选中该模型</div>
                    )}
                  </div>
                </article>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}

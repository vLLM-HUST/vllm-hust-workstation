"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";
import { ArrowLeft, ExternalLink, Moon, Puzzle, Sun } from "lucide-react";
import { MOD_CATALOG_SOURCE, type ModAction, type ModCatalogPayload } from "@/lib/modCatalog";
import { useDialogFocus } from "./useDialogFocus";
import ModRuntimePanel from "./ModRuntimePanel";

const labels: Record<string, string> = { install: "安装", configure: "保存配置", enable: "启用意图", disable: "停用意图", uninstall: "卸载", queued: "排队中", running: "执行中", succeeded: "已完成", failed: "失败", interrupted: "已中断" };
export default function ModCenter() {
  const [payload, setPayload] = useState<ModCatalogPayload | null>(null);
  const [token, setToken] = useState("");
  const [password, setPassword] = useState("");
  const [loginOpen, setLoginOpen] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [pending, setPending] = useState(false);
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState("all");
  const [theme, setTheme] = useState("dark");
  const [confirmation, setConfirmation] = useState<{ id: string; action: ModAction } | null>(null);
  const closeConfirmation = useCallback(() => { if (!pending) setConfirmation(null); }, [pending]);
  const confirmationRef = useDialogFocus(Boolean(confirmation), closeConfirmation);
  const [configs, setConfigs] = useState<Record<string, string>>({});
  const epoch = useRef(0);
  const invalidate = useCallback(() => { ++epoch.current; }, []);
  const load = useCallback(async (credential: string) => {
    const current = ++epoch.current;
    setLoading(true);
    try {
      const response = await fetch("/api/mods", { cache: "no-store", headers: credential ? { "X-Workstation-Admin-Token": credential } : {} });
      const data = await response.json();
      if (current !== epoch.current) return;
      if (!response.ok) {
        if (response.status === 401) { setToken(""); setPayload(null); }
        throw new Error(response.status === 401 ? "管理员密码无效或已失效。" : data.error || "Mod 中心暂时无法连接。");
      }
      setPayload(data);
      if (credential && data.administrator) { setToken(credential); setPassword(""); setLoginOpen(false); }
    } catch (err) {
      if (current === epoch.current) { setError(err instanceof Error ? err.message : "加载失败"); setPayload(null); }
    } finally { if (current === epoch.current) setLoading(false); }
  }, []);
  useEffect(() => {
    setTheme(document.documentElement.dataset.theme || "dark");
    void load("");
    return invalidate;
  }, [load, invalidate]);
  const busy = Boolean(payload?.tasks.some(t => ["running", "queued"].includes(t.status)));
  useEffect(() => {
    if (!busy || pending) return;
    const timer = window.setInterval(() => { void load(token); }, 2000);
    return () => window.clearInterval(timer);
  }, [busy, pending, load, token]);
  const administrator = Boolean(token && payload?.administrator);
  const expireAuthorization = useCallback(() => { ++epoch.current; setToken(""); setPayload(null); void load(""); }, [load]);
  const refreshLibrary = useCallback(() => { void load(token); }, [load, token]);
  const toggleTheme = () => {
    const next = theme === "dark" ? "light" : "dark";
    setTheme(next); document.documentElement.dataset.theme = next; document.documentElement.style.colorScheme = next;
    try { localStorage.setItem("vllm_hust_theme", next); } catch { /* Storage can be disabled. */ }
  };
  const login = (event: FormEvent) => { event.preventDefault(); setError(""); void load(password.trim()); };
  const runAction = async () => {
    if (!confirmation || !administrator || pending || busy) return;
    setPending(true); setError("");
    const current = epoch.current;
    try {
      const { id, action } = confirmation;
      const configuration = action === "configure" ? JSON.parse(configs[id] || "{}") : undefined;
      const response = await fetch("/api/mods", { method: "POST", headers: { "Content-Type": "application/json", "X-Workstation-Admin-Token": token }, body: JSON.stringify({ id, action, configuration }) });
      const data = await response.json();
      if (current !== epoch.current) return;
      if (response.status === 401) { setToken(""); setPayload(null); }
      if (!response.ok) throw new Error(data.error || "操作失败");
      setConfirmation(null);
      await load(token);
    } catch (err) { if (current === epoch.current) setError(err instanceof Error ? err.message : "操作失败"); }
    finally { setPending(false); }
  };
  const visible = payload?.catalog.filter(mod => (`${mod.name} ${mod.description}`.toLowerCase().includes(query.toLowerCase())) && (filter === "all" || (filter === "installed" ? mod.currentRuntimeState.installed : mod.kind === "外部服务"))) || [];
  return <main className="mod-center app-shell min-h-full app-text">
    <header className="app-header sticky top-0 z-10 border-b px-4 py-3">
      <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-3">
        <Link href="/" className="app-text-secondary inline-flex min-h-10 items-center gap-2 text-sm"><ArrowLeft size={16} />返回工作站</Link>
        <div className="flex items-center gap-2">
          <span className="app-text-muted text-sm">{administrator ? "管理员模式" : "只读浏览"}</span>
          <button type="button" className="app-control rounded-lg border px-3 py-2 text-sm" onClick={() => {
            if (administrator) { ++epoch.current; setToken(""); setPayload(null); setConfigs({}); setConfirmation(null); setError(""); void load(""); }
            else setLoginOpen(value => !value);
          }} disabled={pending}>{administrator ? "退出管理" : "管理员登录"}</button>
          <button type="button" className="app-control rounded-lg border p-2.5" onClick={toggleTheme} aria-label={theme === "dark" ? "切换到浅色主题" : "切换到深色主题"}>{theme === "dark" ? <Sun size={17} /> : <Moon size={17} />}</button>
        </div>
      </div>
    </header>
    <div className="mx-auto max-w-6xl space-y-6 px-4 py-6 sm:px-6 sm:py-10">
      <section className="flex flex-wrap items-end justify-between gap-4">
        <div><p className="app-text-muted mb-3 flex items-center gap-2 text-xs tracking-widest"><Puzzle size={16} /> WORKSTATION EXTENSIONS</p><h1 className="text-3xl font-semibold tracking-tight">Mod 中心</h1><p className="app-text-secondary mt-3 max-w-xl text-sm leading-6">准备扩展制品，核对兼容性，并管理已登记实例的运行状态。</p></div>
        <a href={MOD_CATALOG_SOURCE} target="_blank" rel="noreferrer" className="app-text-secondary inline-flex items-center gap-2 text-sm underline underline-offset-4">官方插件目录<ExternalLink size={14} /></a>
      </section>
      {loginOpen && !administrator && <form onSubmit={login} className="app-surface rounded-xl border app-border p-4 flex flex-wrap items-end gap-3">
        <label className="app-text-secondary flex-1 text-sm">管理员密码<input type="password" autoComplete="off" value={password} onChange={event => setPassword(event.target.value)} className="app-control mt-2 block w-full rounded-lg border px-3 py-2" /></label>
        <button type="submit" className="app-control rounded-lg border px-4 py-2 text-sm" disabled={loading || !password.trim()}>进入管理员模式</button>
        <p className="app-text-muted w-full text-xs">密码仅保存在当前页面内存，离开或刷新页面后清除。</p>
      </form>}
      {error && <div role="alert" className="rounded-xl border p-4 text-sm" style={{ color: "var(--danger)", borderColor: "var(--danger)" }}>{error}</div>}
      {payload && !payload.storageReady && <p className="app-text-secondary text-sm">Mod 安装存储未就绪，目前只能浏览目录。</p>}
      <ModRuntimePanel token={token} onAuthorizationExpired={expireAuthorization} onLibraryChanged={refreshLibrary} />
      <div className="flex flex-wrap items-center gap-3">
        <label className="min-w-0 flex-1"><span className="sr-only">搜索 Mod</span><input type="search" placeholder="搜索 Mod 或能力…" value={query} onChange={event => setQuery(event.target.value)} className="app-control w-full rounded-xl border px-4 py-2.5 text-sm" /></label>
        <label><span className="sr-only">筛选 Mod</span><select value={filter} onChange={event => setFilter(event.target.value)} className="app-control rounded-xl border px-3 py-2.5 text-sm"><option value="all">全部 Mod</option><option value="installed">已准备制品</option><option value="external">外部服务</option></select></label>
        <button type="button" onClick={() => { setError(""); void load(token); }} disabled={loading || pending} className="app-control rounded-xl border px-3 py-2.5 text-sm">刷新</button>
      </div>
      {loading && !payload && <p role="status" className="app-text-muted">正在加载 Mod…</p>}
      {payload && visible.length === 0 && <p className="app-surface rounded-xl p-8 text-center app-text-muted">{filter === "installed" ? "Mod 库中还没有已准备的制品。" : "没有符合条件的 Mod。"}</p>}
      <section className="grid gap-4 lg:grid-cols-2" aria-label="Mod 目录">
        {visible.map(mod => <article key={mod.id} className="app-surface flex min-w-0 flex-col rounded-2xl border app-border p-5 sm:p-6">
          <div className="flex items-start justify-between gap-3"><div><p className="app-text-muted mb-2 text-xs">{mod.kind}</p><h2 className="text-xl font-semibold">{mod.name}</h2></div><a href={mod.repository} target="_blank" rel="noreferrer" className="app-control rounded-lg border p-2.5" aria-label={`${mod.name} 源码`}><ExternalLink size={16} /></a></div>
          <p className="app-text-secondary mt-3 text-sm leading-6">{mod.description}</p>
          {mod.sha ? <details className="mt-4 text-sm">
            <summary className="app-text-secondary cursor-pointer py-2">当前运行制品 · {mod.currentRuntimeCompatibility.label}</summary>
            <dl className="mt-2 space-y-3 text-xs leading-5">
              <div><dt className="app-text-secondary font-medium">当前运行制品兼容性</dt><dd className={mod.currentRuntimeCompatibility.status === "compatible" ? "mt-1 text-emerald-300" : mod.currentRuntimeCompatibility.status === "incompatible" ? "mt-1 text-red-300" : "mt-1 text-amber-300"}>{mod.currentRuntimeCompatibility.reason}</dd></div>
              <div><dt className="app-text-secondary font-medium">候选制品功能资格</dt><dd className="app-text-muted mt-1">{mod.artifactQualification.label}：{mod.artifactQualification.scope}</dd></div>
              <div><dt className="app-text-secondary font-medium">效果资格（仅限所列测试单元）</dt><dd className="app-text-muted mt-1">{mod.effectivenessQualification.label}：{mod.effectivenessQualification.scope}</dd></div>
              <div><dt className="app-text-secondary font-medium">证据与限制</dt><dd className="app-text-muted mt-1">{mod.requirements}</dd></div>
            </dl>
            <p className="app-text-muted mt-3 text-xs leading-5">候选制品功能资格、当前运行制品兼容性和当前实例的安装/配置/启用/运行生效是三组独立事实。仓库资格不能把当前实例自动标记为运行生效。</p>
          </details> : <><p className="app-text-secondary mt-4 text-sm leading-6">{mod.compatibility}</p><p className="app-text-muted mt-2 text-xs leading-5">{mod.requirements}</p></>}
          {mod.sha && <><div className="mt-5 flex flex-wrap gap-2 text-xs"><span className="app-surface-muted rounded-md px-2.5 py-1.5">{mod.currentRuntimeState.installed ? `制品已准备 · ${mod.currentRuntimeState.version}` : "制品未准备"}</span><span className="app-surface-muted rounded-md px-2.5 py-1.5">{mod.currentRuntimeState.configured ? "配置已保存" : "未配置"}</span><span className="app-surface-muted rounded-md px-2.5 py-1.5">{mod.currentRuntimeState.enabled ? "启用意图已保存" : "未启用"}</span><span className="app-surface-muted rounded-md px-2.5 py-1.5">{mod.currentRuntimeState.runtimeEffective === true ? "运行已生效" : mod.currentRuntimeState.runtimeEffective === false ? "运行未生效" : "运行生效性未知"}</span></div>
          <a href={`${mod.repository}/commit/${mod.sha}`} target="_blank" rel="noreferrer" className="app-text-muted mt-3 text-xs underline underline-offset-4">固定源码 {mod.sha.slice(0, 12)}</a></>}
          {mod.stateError && <p role="alert" className="mt-3 text-sm" style={{ color: "var(--danger)" }}>{mod.stateError}</p>}
          {administrator && mod.sha && <details className="mt-auto pt-5"><summary className="app-text-secondary cursor-pointer py-2 text-sm">制品与配置</summary><div className="pt-3">
            {mod.currentRuntimeState.installed && <details className="mb-4 text-sm"><summary className="cursor-pointer app-text-secondary py-2">配置 · {mod.currentRuntimeState.configured ? "已保存" : "未配置"}</summary>
              <p className="app-text-muted my-2 text-xs leading-5">仅接受 launch_options。BidKV / LatchMoE 可先保存空对象；DiffSpec 需要 speculative_config.model。配置不代表宿主兼容。</p>
              <label className="block"><span className="sr-only">{mod.name} 配置 JSON</span><textarea rows={5} value={configs[mod.id] ?? (mod.id === "diffspec" ? '{"launch_options":{"speculative_config":{"model":"","method":"eagle3"}}}' : "{}")} onChange={event => setConfigs(value => ({...value, [mod.id]: event.target.value}))} className="app-control w-full rounded-lg border p-3 font-mono text-xs" /></label>
              <button type="button" className="app-control mt-2 rounded-lg border px-3 py-2" disabled={busy || pending} onClick={() => setConfirmation({id: mod.id, action: "configure"})}>保存配置</button>
            </details>}
            <div className="flex flex-wrap gap-2 text-sm">
              {!mod.currentRuntimeState.installed ? <button type="button" disabled={!payload?.storageReady || busy || pending || Boolean(mod.stateError)} className="app-control rounded-lg border px-3 py-2" onClick={() => setConfirmation({id: mod.id, action: "install"})}>准备到 Mod 库</button> : <>
                <button type="button" disabled={busy || pending || (!mod.currentRuntimeState.enabled && (!mod.currentRuntimeState.configured || mod.currentRuntimeCompatibility.status !== "compatible"))} title={!mod.currentRuntimeState.enabled && mod.currentRuntimeCompatibility.status !== "compatible" ? `当前运行制品${mod.currentRuntimeCompatibility.label}，不能启用` : undefined} className="app-control rounded-lg border px-3 py-2" onClick={() => setConfirmation({id: mod.id, action: mod.currentRuntimeState.enabled ? "disable" : "enable"})}>{mod.currentRuntimeState.enabled ? "停用意图" : "启用意图"}</button>
                <button type="button" disabled={busy || pending || mod.currentRuntimeState.enabled} className="app-control rounded-lg border px-3 py-2" onClick={() => setConfirmation({id: mod.id, action: "uninstall"})}>卸载</button>
              </>}
            </div>
          </div></details>}
        </article>)}
      </section>
      {administrator && confirmation && <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: "var(--overlay)" }}><section ref={confirmationRef} role="dialog" aria-modal="true" tabIndex={-1} className="app-surface-raised w-full max-w-lg rounded-xl border app-border p-5" aria-label="操作确认">
        <h2 className="font-medium">确认{labels[confirmation.action]} · {confirmation.id}</h2>
        <p className="app-text-secondary mt-2 text-sm leading-6">{confirmation.action === "install" ? "将构建固定源码，并在隔离的制品验收环境中验证；这只是 Mod 库准备，不会让当前推理加载。正式应用必须把 Extension Manager 与插件装入运行 vLLM 命令的同一环境，并通过获批部署原子切换。" : confirmation.action === "uninstall" ? "先停用库内意图，再移入可恢复归档。归档仍占用磁盘；不会删除共享数据。" : "仅更新 Mod 库的配置或启用意图，不代表正在运行。"}</p>
        <div className="mt-4 flex gap-3"><button type="button" className="app-control rounded-lg border px-4 py-2 text-sm" disabled={pending || busy} onClick={() => void runAction()}>{pending ? "提交中…" : "确认操作"}</button><button type="button" className="app-control rounded-lg border px-4 py-2 text-sm" disabled={pending} onClick={() => setConfirmation(null)}>取消</button></div>
      </section></div>}
      {administrator && <section aria-label="Mod 任务日志" className="space-y-3"><h2 className="text-lg font-semibold">任务与日志</h2>{!payload?.tasks.length && <p className="app-text-muted text-sm">暂无 Mod 管理任务。</p>}{payload?.tasks.map(task => <details key={task.id} className="app-surface rounded-xl border app-border p-4" open={task.status === "running" || task.status === "failed"}><summary className="cursor-pointer text-sm">{task.modId} · {labels[task.action]} · {labels[task.status]}<span className="app-text-muted ml-2 text-xs">{new Date(task.createdAt).toLocaleString()}</span></summary><pre className="app-text-secondary mt-3 whitespace-pre-wrap break-all text-xs leading-5">{task.logs.join("\n")}</pre></details>)}</section>}
      <footer className="app-text-muted border-t app-border pt-5 text-xs leading-6">制品准备、运行配置与服务生命周期分别记录；只有目标 worker 的执行证据才会标记为生效。</footer>
    </div>
  </main>;
}

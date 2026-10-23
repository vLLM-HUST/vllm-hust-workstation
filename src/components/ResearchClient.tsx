"use client";
import Link from "next/link";
import { useRef, useState } from "react";

type Target = { id: string; model: string; engine_model: string; shared: boolean };
type Json = Record<string, unknown>;

export default function ResearchClient() {
  const [inputKey, setInputKey] = useState("");
  const [token, setToken] = useState("");
  const [targets, setTargets] = useState<Target[]>([]);
  const [model, setModel] = useState("");
  const [kind, setKind] = useState("text");
  const [prompt, setPrompt] = useState("");
  const [budget, setBudget] = useState(1024);
  const [seed, setSeed] = useState(42);
  const [stopJson, setStopJson] = useState("[]");
  const [special, setSpecial] = useState(false);
  const [output, setOutput] = useState("");
  const [receipt, setReceipt] = useState<Json | null>(null);
  const [engine, setEngine] = useState<Json | null>(null);
  const [metrics, setMetrics] = useState("");
  const [plan, setPlan] = useState<Json | null>(null);
  const [status, setStatus] = useState("研究通道需要授权；凭据仅保存在当前页面内存，不写入浏览器存储。");
  const [busy, setBusy] = useState(false);
  const abort = useRef<AbortController | null>(null);

  async function request(path: string, key = token, body?: Json) {
    const response = await fetch(`/api/research/${path}`, { method: body ? "POST" : "GET",
      headers: { Authorization: `Bearer ${key}`, ...(body ? { "Content-Type": "application/json" } : {}) },
      ...(body ? { body: JSON.stringify(body) } : {}), cache: "no-store" });
    if (!response.ok) throw new Error(`研究接口 HTTP ${response.status}；未使用聊天服务凭据代替。`);
    return response;
  }
  async function login() {
    setBusy(true);
    try {
      const data = await (await request("targets", inputKey)).json();
      setTargets(data.targets); setModel(data.targets[0]?.model || "");
      setToken(inputKey); setInputKey(""); setStatus("研究权限已验证；请选择固定后端。");
    } catch (error) { setStatus(String(error)); }
    finally { setBusy(false); }
  }
  async function observe() {
    setBusy(true); setEngine(null); setMetrics("");
    try {
      const query = `?model=${encodeURIComponent(model)}`;
      const [configuration, measured] = await Promise.all([request("engine"+query), request("metrics"+query)]);
      setEngine(await configuration.json()); setMetrics(await measured.text());
      setStatus("已读取实际引擎指标与配置证据；指标为共享实例聚合，不能归因给某一个请求。");
    } catch (error) { setStatus(String(error)); }
    finally { setBusy(false); }
  }
  function payload(): Json {
    const stop: unknown = JSON.parse(stopJson);
    if (!Array.isArray(stop) || stop.length > 16 || stop.some(value => typeof value !== "string" || !value)) {
      throw new Error("停止序列必须是至多 16 个非空字符串的 JSON 数组。");
    }
    return { model, prompt: kind === "ids" ? JSON.parse(prompt) : prompt, max_tokens: budget,
      temperature: 0, seed, add_special_tokens: special, stream: true, stream_options: { include_usage: true },
      ...(stop.length ? { stop } : {}) };
  }
  async function run() {
    setBusy(true); setOutput(""); setReceipt(null);
    abort.current = new AbortController();
    const started = performance.now();
    try {
      const response = await fetch("/v1/completions", { method: "POST", headers: {
        Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify(payload()), signal: abort.current.signal, cache: "no-store" });
      if (!response.ok) throw new Error(`原始接口 HTTP ${response.status}，没有切换模型或聊天接口。`);
      const trace = response.headers.get("x-research-trace-id");
      const reader = response.body?.getReader();
      if (!reader || !trace) throw new Error("缺少真实流或研究回执；不能标记成功。");
      const decoder = new TextDecoder();
      let buffer = "", text = "", done = false, firstText: number | null = null;
      setStatus("正在接收原始输出；不解析或删除模型控制 token。");
      for (;;) {
        const chunk = await reader.read();
        if (chunk.done) break;
        buffer += decoder.decode(chunk.value, { stream: true });
        const lines = buffer.split("\n"); buffer = lines.pop()!;
        for (const line of lines) {
          if (!line.startsWith("data:")) continue;
          const data = line.slice(5).trim();
          if (data === "[DONE]") { done = true; continue; }
          if (!data) continue;
          const event = JSON.parse(data);
          for (const choice of event.choices || []) {
            if (choice.text) {
              if (firstText === null) firstText = performance.now()-started;
              text += choice.text;
            }
          }
          setOutput(text);
        }
      }
      const observed = await (await request(`receipts/${trace}`)).json();
      setReceipt({ ...observed, browser_total_ms: performance.now()-started, browser_first_text_ms: firstText,
        browser_scope: "包含 Cloudflare、WS 中继、网络、排队和推理；不是纯引擎计时" });
      setStatus(observed.state === "completed" && done ? "原始流正常结束；不代表内容已被事实核验。" :
        observed.state === "length" ? "生成额度耗尽，原始输出可能不完整；未标记成功。" : "流未正常完成，请查看实际回执。");
    } catch (error) {
      setStatus(abort.current?.signal.aborted ? "本地已停止读取；未宣称引擎取消已确认。" : String(error));
    } finally { setBusy(false); abort.current = null; }
  }
  async function createPlan() {
    setBusy(true);
    try { setPlan(await (await request("experiments/plan", token, { model, feature: "factorial" })).json()); }
    catch (error) { setStatus(String(error)); }
    finally { setBusy(false); }
  }
  const box = "app-control rounded-lg border px-3 py-2";
  return <main className="app-text mx-auto max-w-5xl space-y-5 px-4 py-6">
    <header className="flex items-center justify-between"><h1 className="text-xl font-semibold">研究模式</h1><Link href="/" className={box}>返回聊天</Link></header>
    <p className="app-text-muted">原始 Completions · 固定物理后端 · 引擎指标 · 受控实验。此页面不添加 chat template、系统提示词、搜索或 SAGE 答案改写。</p>
    {!token ? <section className="flex flex-wrap gap-2"><input type="password" autoComplete="off" aria-label="研究凭据" className={box} value={inputKey} onChange={event => setInputKey(event.target.value)} placeholder="个人研究凭据" /><button className={box} disabled={busy || !inputKey} onClick={() => void login()}>验证研究权限</button></section> :
      <section className="flex flex-wrap gap-2"><select aria-label="固定研究后端" className={box} disabled={busy} value={model} onChange={event => { setModel(event.target.value); setEngine(null); setMetrics(""); setPlan(null); }}>
        {targets.map(target => <option key={target.id} value={target.model}>{target.model} · {target.shared ? "共享只读配置" : "隔离实验"}</option>)}</select>
        <button className={box} disabled={busy} onClick={() => void observe()}>读取引擎状态与指标</button><button className={box} disabled={busy} onClick={() => { setToken(""); setTargets([]); setEngine(null); setMetrics(""); setReceipt(null); setOutput(""); }}>退出研究权限</button></section>}
    <p role="status" className="app-surface app-border rounded-lg border p-3">{status}</p>
    {token && <>
      <section className="space-y-3"><h2 className="font-semibold">原始输入</h2>
        <div className="flex flex-wrap items-center gap-3"><select aria-label="原始输入格式" className={box} value={kind} onChange={event => setKind(event.target.value)} disabled={busy}><option value="text">原始文本</option><option value="ids">Token IDs（JSON 数组）</option></select>
          <label>max_tokens <input aria-label="生成额度" type="number" min={1} max={65536} className={`${box} w-28`} disabled={busy} value={budget} onChange={event => setBudget(Number(event.target.value))} /></label>
          <label>seed <input aria-label="随机种子" type="number" className={`${box} w-24`} disabled={busy} value={seed} onChange={event => setSeed(Number(event.target.value))} /></label>
          <label className="flex items-center gap-2"><input type="checkbox" checked={special} disabled={busy} onChange={event => setSpecial(event.target.checked)} />添加 BOS 等特殊 token（不是聊天模板）</label></div>
        <textarea className={`${box} min-h-40 w-full font-mono`} aria-label="原始 prompt" value={prompt} disabled={busy} onChange={event => setPrompt(event.target.value)} placeholder="逐字发送原始文本，或切换为 token ID 数组；不会包装成 messages。" />
        <label className="block space-y-1"><span>停止序列（JSON 数组；空数组表示不添加）</span><input aria-label="停止序列" className={`${box} w-full font-mono`} disabled={busy} value={stopJson} onChange={event => setStopJson(event.target.value)} placeholder={'["\\n"]'} /></label>
        <details><summary>实际请求参数</summary><pre className="overflow-auto text-xs">{(() => { try { return JSON.stringify(payload(), null, 2); } catch { return "Token IDs 或停止序列不是有效 JSON 参数"; } })()}</pre></details>
        <button className={box} disabled={busy || !prompt || !model} onClick={() => void run()}>发送原始 prompt</button>{busy && abort.current && <button className={`${box} ml-2`} onClick={() => abort.current?.abort()}>停止读取</button>}
      </section>
      <section className="space-y-2"><h2 className="font-semibold">原始输出</h2><pre aria-label="原始模型输出" className="app-surface app-border min-h-24 overflow-auto whitespace-pre-wrap rounded-lg border p-3">{output || "尚未生成"}</pre></section>
      <details open={Boolean(receipt)}><summary>计时与完成回执</summary><p className="app-text-muted">浏览器计时包含公网链路；研究服务计时为固定引擎 HTTP 路径。纯直连请在引擎主机使用 control-plane 的 research_benchmark CLI，绕过 Cloudflare、WS 和路由；仍不能把 HTTP TTFT 当作 GPU 内核耗时。</p><pre className="overflow-auto text-xs">{JSON.stringify(receipt, null, 2)}</pre></details>
      <details><summary>实际引擎配置（未知不等于关闭）</summary><pre className="overflow-auto text-xs">{JSON.stringify(engine, null, 2)}</pre></details>
      <details><summary>引擎 Prometheus 指标（聚合值，不是网关指标）</summary><pre className="max-h-80 overflow-auto text-xs">{metrics || "尚未读取"}</pre></details>
      <section className="space-y-2"><h2 className="font-semibold">APC／SuffixDecoding 对照</h2><p className="app-text-muted">不会对共享引擎切开关或清缓存。实验由独占 GPU 租约和本机受控 runner 执行，覆盖镜像顺序、冷／热边界、配置证据、投机指标和原始输出一致性；资源未分配时明确拒绝。</p><button className={box} disabled={busy} onClick={() => void createPlan()}>查看四组受控实验计划</button>{plan && <pre className="overflow-auto text-xs">{JSON.stringify(plan, null, 2)}</pre>}</section>
    </>}
  </main>;
}

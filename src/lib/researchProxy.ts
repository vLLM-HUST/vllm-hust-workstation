/** Research-only relay. Never substitutes the public chat service credential. */
import { performance } from "node:perf_hooks";

const ALLOWED = /^(targets|engine|metrics|experiments\/plan|receipts\/[a-f0-9]{32})$/;
const NO_STORE = { "Cache-Control": "no-store" };

export async function researchProxy(request: Request, endpoint: string): Promise<Response> {
  if (endpoint !== "completions" && !ALLOWED.test(endpoint)) {
    return Response.json({ error: "unknown research operation" }, { status: 404, headers: NO_STORE });
  }
  const rawAuthorization = request.headers.get("authorization") || "";
  if (!/^Bearer [^\s]{8,1024}$/.test(rawAuthorization)) {
    return Response.json({ error: "研究模式需要个人研究凭据；普通聊天密钥不会自动获得研究权限。" }, { status: 401, headers: NO_STORE });
  }
  const configured = process.env.WORKSTATION_RESEARCH_URL || "http://127.0.0.1:18013";
  let base: URL;
  try { base = new URL(configured); }
  catch { return Response.json({ error: "研究服务地址无效。" }, { status: 503, headers: NO_STORE }); }
  if (base.protocol !== "http:" || !["127.0.0.1", "localhost", "[::1]"].includes(base.hostname) || base.pathname !== "/" || base.username || base.password || base.search || base.hash) {
    return Response.json({ error: "研究服务地址未安全配置。" }, { status: 503, headers: NO_STORE });
  }
  const path = endpoint === "completions" ? "/v1/completions" : `/research/${endpoint}`;
  const url = new URL(path, base);
  const params = new URL(request.url).searchParams;
  if ([...params.keys()].some(key => key !== "model")) {
    return Response.json({ error: "只接受固定后端 model；不能指定 URL 或命令。" }, { status: 400, headers: NO_STORE });
  }
  if (params.has("model")) url.searchParams.set("model", params.get("model")!);
  let body: Uint8Array | undefined;
  if (request.method === "POST") {
    const reader = request.body?.getReader();
    const chunks: Uint8Array[] = [];
    let size = 0;
    if (reader) {
      for (;;) {
        const next = await reader.read();
        if (next.done) break;
        size += next.value.length;
        if (size > 1024 * 1024) {
          await reader.cancel();
          return Response.json({ error: "请求超过 1 MiB。" }, { status: 413, headers: NO_STORE });
        }
        chunks.push(next.value);
      }
    }
    body = new Uint8Array(size);
    let offset = 0;
    for (const chunk of chunks) { body.set(chunk, offset); offset += chunk.length; }
  }
  const started = performance.now();
  const timer = new AbortController();
  const abort = () => timer.abort();
  request.signal.addEventListener("abort", abort, { once: true });
  if (request.signal.aborted) abort();
  const timeout = setTimeout(abort, 300_000);
  try {
    const upstream = await fetch(url, { method: request.method, body: body as BodyInit | undefined,
      headers: { Authorization: rawAuthorization, "Content-Type": "application/json", "Accept-Encoding": "identity" },
      signal: timer.signal, cache: "no-store", redirect: "error" });
    const headers = new Headers(NO_STORE);
    for (const key of ["content-type", "x-research-trace-id", "x-research-backend", "x-research-prompt-sha256", "x-research-metrics-scope", "retry-after"]) {
      if (upstream.headers.has(key)) headers.set(key, upstream.headers.get(key)!);
    }
    headers.set("Server-Timing", [upstream.headers.get("server-timing"), `ws_relay_headers;dur=${(performance.now()-started).toFixed(3)}`].filter(Boolean).join(", "));
    if (!upstream.body) {
      clearTimeout(timeout); request.signal.removeEventListener("abort", abort);
      return new Response(null, { status: upstream.status, headers });
    }
    const reader = upstream.body.getReader();
    const cleanup = () => { clearTimeout(timeout); request.signal.removeEventListener("abort", abort); };
    const stream = new ReadableStream({
      async pull(controller) {
        try {
          const next = await reader.read();
          if (next.done) { cleanup(); controller.close(); }
          else controller.enqueue(next.value);
        } catch (error) { cleanup(); controller.error(error); }
      },
      async cancel() { abort(); cleanup(); await reader.cancel(); },
    });
    return new Response(stream, { status: upstream.status, headers });
  } catch {
    clearTimeout(timeout);
    request.signal.removeEventListener("abort", abort);
    return Response.json({ error: "研究链路未完成；未切换聊天接口或其他模型。" }, { status: 502, headers: NO_STORE });
  }
}

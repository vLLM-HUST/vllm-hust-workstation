import { hasValidAdminCredential, hasValidAdminToken, requireAdmin } from "@/lib/adminAuth";
import { ModError } from "@/lib/modStore";
import { getModRuntime, startRuntimePreparation } from "@/lib/modRuntimeStore";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
const headers = { "Cache-Control": "no-store" };

export async function GET(request: Request) {
  if (request.headers.has("x-workstation-admin-token") && !hasValidAdminToken(request)) return requireAdmin(request)!;
  try { return Response.json(await getModRuntime(hasValidAdminToken(request)), { headers }); }
  catch { return Response.json({ error: "实例状态读取失败，请检查部署登记或稍后刷新。" }, { status: 503, headers }); }
}

export async function POST(request: Request) {
  const denied = requireAdmin(request); if (denied) return denied;
  try {
    const raw = await request.text();
    if (raw.length > 2048) throw new ModError("请求过大。", 413);
    let body;
    try { body = JSON.parse(raw); } catch { throw new ModError("请求不是有效 JSON。", 400); }
    if (!body || typeof body.targetId !== "string" || typeof body.modId !== "string" || typeof body.action !== "string") throw new ModError("仅允许实例、Mod 和操作 ID。", 400);
    if (["apply", "disable", "rollback"].includes(body.action)) throw new ModError("请使用明确的启动、停止或重启操作。");
    if (["start", "stop", "restart"].includes(body.action)) {
      if (Object.keys(body).sort().join() !== "action,confirmation,modId,targetId" || typeof body.confirmation !== "string") throw new ModError("运行操作需要管理员二次确认。", 400);
      if (!hasValidAdminCredential(body.confirmation)) throw new ModError("管理员二次确认失败。", 401);
      const runtime = await getModRuntime(true);
      const compatibility = runtime.mods.find(mod => mod.id === body.modId)?.compatibility;
      if (!runtime.target || runtime.target.id !== body.targetId) throw new ModError("实例未登记。", 404);
      if (compatibility !== "compatible") throw new ModError("当前 Mod 与实例尚未通过兼容性验收。");
      if (!runtime.lifecycle.identityLive) throw new ModError("实例身份不是当前 live 身份。");
      if (!runtime.lifecycle.instanceRegistered || !runtime.lifecycle.rollbackReady || !runtime.lifecycle.oneUseAuthorization || !runtime.applicationAvailable) throw new ModError(runtime.lifecycle.reason);
      throw new ModError("运行操作尚未取得 owner 执行凭据。");
    }
    if (Object.keys(body).sort().join() !== "action,modId,targetId") throw new ModError("准备操作仅允许实例、Mod 和操作 ID。", 400);
    if (body.action !== "prepare") throw new ModError("不支持的实例操作。", 400);
    return Response.json(await startRuntimePreparation(body.targetId, body.modId), { status: 202, headers });
  } catch (error) { return Response.json({ error: error instanceof ModError ? error.message : "实例准备未提交，请检查部署配置。" }, { status: error instanceof ModError ? error.status : 503, headers }); }
}

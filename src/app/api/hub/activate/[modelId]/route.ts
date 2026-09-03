import { requireAdmin } from "@/lib/adminAuth";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const denied = requireAdmin(request);
  if (denied) return denied;
  // Changing DEFAULT_MODEL is not a serving-engine deployment. Fail closed
  // until a separately authorized orchestration/rollback workflow exists.
  return Response.json({ error: "模型部署由平台管理；工作站不提供模型切换。" }, { status: 409 });
}

import { cancelDownload, startDownload } from "@/lib/modelHubStore";
import { requireAdmin } from "@/lib/adminAuth";

export const runtime = "nodejs";

export async function POST(
  request: Request,
  context: { params: Promise<{ modelId: string }> }
) {
  const denied = requireAdmin(request);
  if (denied) return denied;
  const { modelId } = await context.params;
  const result = await startDownload(modelId);
  return Response.json(result, { status: result.status, headers: { "Cache-Control": "no-store" } });
}

export async function DELETE(
  request: Request,
  context: { params: Promise<{ modelId: string }> }
) {
  const denied = requireAdmin(request);
  if (denied) return denied;
  const { modelId } = await context.params;
  const ok = cancelDownload(modelId);
  return Response.json({ ok }, { status: ok ? 200 : 404, headers: { "Cache-Control": "no-store" } });
}

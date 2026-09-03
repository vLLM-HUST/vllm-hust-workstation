import { getCatalog } from "@/lib/modelHubStore";
import { hasValidAdminToken, requireAdmin } from "@/lib/adminAuth";

export const runtime = "nodejs";

export const dynamic = "force-dynamic";
export async function GET(request: Request) {
  if (request.headers.has("x-workstation-admin-token")) {
    const denied = requireAdmin(request);
    if (denied) return denied;
  }
  const payload = await getCatalog(hasValidAdminToken(request));
  return Response.json(payload, { headers: { "Cache-Control": "no-store", Vary: "X-Workstation-Admin-Token" } });
}

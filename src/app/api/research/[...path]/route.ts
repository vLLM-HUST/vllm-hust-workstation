import { researchProxy } from "@/lib/researchProxy";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

async function relay(request: Request, context: { params: Promise<{ path: string[] }> }) {
  const { path } = await context.params;
  return researchProxy(request, path.join("/"));
}
export { relay as GET, relay as POST };

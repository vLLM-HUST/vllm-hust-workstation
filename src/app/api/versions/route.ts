import { getRuntimeProvenance } from "@/lib/runtimeProvenance";

export const runtime = "nodejs";
export const revalidate = 0;

export async function GET() {
  return Response.json(await getRuntimeProvenance(), { headers: { "Cache-Control": "no-store" } });
}

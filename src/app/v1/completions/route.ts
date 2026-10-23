import { researchProxy } from "@/lib/researchProxy";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;
export async function POST(request: Request) { return researchProxy(request, "completions"); }

import { createHash } from "node:crypto";
import { NextRequest } from "next/server";
import { ADVISORY_UNAVAILABLE, validateAdvisoryReport } from "@/lib/answerAdvisory";

export const runtime = "nodejs";

/** Independent request: /api/chat never calls or waits for this endpoint. */
export async function POST(req: NextRequest) {
  const headers = { "Cache-Control": "no-store" };
  let input;
  try {
    const reader = req.body?.getReader();
    if (!reader) throw new Error("Missing body");
    const chunks: Uint8Array[] = [];
    let bytes = 0;
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      bytes += value.byteLength;
      if (bytes > 2_000_000) {
        void reader.cancel();
        return Response.json({ status: "unchecked" }, { status: 413, headers });
      }
      chunks.push(value);
    }
    const text = Buffer.concat(chunks).toString("utf8");
    input = JSON.parse(text);
    if (!input || Object.keys(input).sort().join(",") !== "answer,question" ||
      typeof input.question !== "string" || typeof input.answer !== "string" || !input.answer.trim()) throw new Error("Invalid input");
  } catch {
    return Response.json({ status: "unchecked", message: "核验输入无效，未作正确性判断。" }, { status: 400, headers });
  }
  try {
    const endpoint = new URL(process.env.WORKSTATION_SAGE_ADVISORY_URL || "http://127.0.0.1:55109/audit");
    if (endpoint.protocol !== "http:" || endpoint.hostname !== "127.0.0.1" || endpoint.pathname !== "/audit" ||
      endpoint.username || endpoint.password || endpoint.search || endpoint.hash) throw new Error("Non-loopback advisory endpoint");
    const result = await fetch(endpoint, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify(input), signal: AbortSignal.any([req.signal, AbortSignal.timeout(5000)]), cache: "no-store",
    });
    if (!result.ok) throw new Error("SAGE advisory unavailable");
    const report = validateAdvisoryReport(await result.json(), input.answer);
    const digest = (text: string) => createHash("sha256").update(text).digest("hex");
    if (report.answer_sha256 !== digest(input.answer) || report.question_sha256 !== digest(input.question)) throw new Error("Stale advisory");
    return Response.json(report, { headers });
  } catch {
    // Do not expose answer bodies, private paths or upstream error text.
    return Response.json({ status: "unavailable", message: ADVISORY_UNAVAILABLE }, { status: 503, headers });
  }
}

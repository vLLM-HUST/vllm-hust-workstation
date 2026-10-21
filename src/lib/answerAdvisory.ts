/** Side-channel metadata only. Never merge it into content, reasoning or history. */
export interface AdvisoryReport {
  version: 1;
  mode: "advisory";
  status: "issues" | "unchecked" | "no_dependency_gap";
  answer_sha256: string;
  question_sha256: string;
  checked_formulas: number;
  scope: string;
  limitations: string[];
  findings: { code: string; title: string; quote: string; details: string; source_ids: string[] }[];
  sources: { id: string; title: string; url: string; excerpt: string; assumptions: string }[];
}

export type AnswerAdvisory = { status: "pending" } | { status: "ready"; report: AdvisoryReport }
  | { status: "unavailable"; message: string };

export const ADVISORY_UNAVAILABLE = "SAGE 旁路核验暂不可用；原始答案不受影响，未作正确性判断。";

export function validateAdvisoryReport(value: unknown, answer: string): AdvisoryReport {
  const report = value as AdvisoryReport;
  if (!report || report.version !== 1 || report.mode !== "advisory" ||
    !["issues", "unchecked", "no_dependency_gap"].includes(report.status) ||
    !/^[0-9a-f]{64}$/.test(report.answer_sha256) || !/^[0-9a-f]{64}$/.test(report.question_sha256) ||
    !Number.isInteger(report.checked_formulas) || report.checked_formulas < 0 ||
    typeof report.scope !== "string" || !Array.isArray(report.limitations) ||
    report.limitations.some(v => typeof v !== "string") || !Array.isArray(report.sources) ||
    !Array.isArray(report.findings) || report.findings.length > 8192 || report.sources.length > 32) {
    throw new Error("Invalid SAGE advisory envelope");
  }
  const sources = new Set<string>();
  for (const source of report.sources) {
    if (!source || [source.id, source.title, source.url, source.excerpt, source.assumptions].some(v => typeof v !== "string" || !v) ||
      sources.has(source.id) || !/^https:\/\//.test(source.url)) throw new Error("Invalid advisory source");
    sources.add(source.id);
  }
  for (const finding of report.findings) {
    if (!finding || [finding.code, finding.title, finding.quote, finding.details].some(v => typeof v !== "string" || !v) ||
      !answer.includes(finding.quote) || !Array.isArray(finding.source_ids) || !finding.source_ids.length ||
      finding.source_ids.some(id => !sources.has(id))) throw new Error("Unbound advisory finding");
  }
  if ((report.status === "issues") !== (report.findings.length > 0) ||
    (report.status === "no_dependency_gap" && report.checked_formulas === 0)) throw new Error("Inconsistent advisory status");
  return report;
}

export async function requestAnswerAdvisory(question: string, answer: string): Promise<AnswerAdvisory> {
  try {
    const response = await fetch("/api/advisory", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ question, answer }), signal: AbortSignal.timeout(8000),
    });
    if (!response.ok) throw new Error("Advisory unavailable");
    const report = validateAdvisoryReport(await response.json(), answer);
    const digest = async (text: string) => Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text))))
      .map(v => v.toString(16).padStart(2, "0")).join("");
    if (report.answer_sha256 !== await digest(answer) || report.question_sha256 !== await digest(question)) {
      throw new Error("Stale advisory");
    }
    return { status: "ready", report };
  } catch {
    return { status: "unavailable", message: ADVISORY_UNAVAILABLE };
  }
}

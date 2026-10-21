import type { AnswerAdvisory as Advisory } from "@/lib/answerAdvisory";

export default function AnswerAdvisory({ advisory }: { advisory?: Advisory }) {
  if (!advisory) return <p className="mt-2 text-xs opacity-70">此回答尚无旁路核验记录</p>;
  if (advisory.status === "pending") return <p role="status" className="mt-2 text-xs opacity-80">SAGE 旁路核验中 · 原始答案已返回</p>;
  if (advisory.status === "unavailable") return <p role="status" className="mt-2 text-xs">{advisory.message}</p>;
  const { report } = advisory;
  const title = report.status === "issues" ? `SAGE 旁路提示 · ${report.findings.length} 项待核对`
    : report.status === "unchecked" ? "SAGE 旁路 · 无匹配的可核验公式"
      : "SAGE 旁路 · 未发现变量依赖缺项（不代表答案正确）";
  return <details className="mt-3 rounded-lg border border-current/20 p-2 text-xs" data-advisory-status={report.status}>
    <summary className="cursor-pointer">{title}</summary>
    <p className="mt-2">{report.scope}</p>
    {report.findings.map((finding, index) => <section className="mt-3" key={index}>
      <p className="font-medium">{finding.title}</p>
      <p>{finding.details}</p>
      <pre className="my-2 whitespace-pre-wrap break-words text-xs">{finding.quote}</pre>
      {finding.source_ids.map(id => <p key={id}>依据：{report.sources.find(source => source.id === id)?.title}</p>)}
    </section>)}
    {report.sources.map(source => <section key={source.id} className="mt-3">
      <a href={source.url} target="_blank" rel="noopener noreferrer" className="underline break-all">{source.title}</a>
      <p className="mt-1">{source.excerpt}</p>
      <p className="mt-1">适用条件：{source.assumptions}</p>
    </section>)}
    {report.limitations.map((text, index) => <p className="mt-2 opacity-80" key={index}>{text}</p>)}
  </details>;
}

"use client";

import { memo, useDeferredValue } from "react";
import Markdown from "react-markdown";
import remarkGfm from "remark-gfm";
import remarkMath from "remark-math";
import rehypeKatex from "rehype-katex";

/** Normalize common model LaTeX delimiters, never fenced/inline code or escaped slashes. */
export function normalizeMathDelimiters(source: string): string {
  let result = "";
  for (let i = 0; i < source.length;) {
    const lineStart = i === 0 || source[i - 1] === "\n";
    const fence = lineStart ? /^ {0,3}(`{3,}|~{3,})[^\n]*(?:\n|$)/.exec(source.slice(i)) : null;
    if (fence) {
      const marker = fence[1][0];
      const end = new RegExp(`^ {0,3}${marker}{${fence[1].length},}[ \\t\\r]*$`, "m");
      const rest = source.slice(i + fence[0].length);
      const match = end.exec(rest);
      const size = match ? fence[0].length + match.index + match[0].length : source.length - i;
      result += source.slice(i, i + size); i += size; continue;
    }
    if (source[i] === "`") {
      const ticks = /^`+/.exec(source.slice(i))![0];
      const end = source.indexOf(ticks, i + ticks.length);
      const size = end < 0 ? source.length - i : end + ticks.length - i;
      result += source.slice(i, i + size); i += size; continue;
    }
    if (source.slice(i, i + 2) === "\\\\") {
      result += source.slice(i, i + 2); i += 2; continue;
    }
    const opener = source.slice(i, i + 2);
    if (opener === "\\(" || opener === "\\[") {
      const end = source.indexOf(opener === "\\(" ? "\\)" : "\\]", i + 2);
      if (end >= 0) {
        const expression = source.slice(i + 2, end);
        result += opener === "\\(" ? `$${expression}$` : `\n$$\n${expression}\n$$\n`;
        i = end + 2; continue;
      }
    }
    result += source[i++];
  }
  return result;
}

const RenderMarkdown = memo(function RenderMarkdown({ content }: { content: string }) {
  return <Markdown skipHtml remarkPlugins={[remarkGfm, remarkMath]}
    rehypePlugins={[[rehypeKatex, { trust: false, strict: "ignore", maxExpand: 1000 }]]}
    components={{
      table: ({ children }) => <div className="answer-table-scroll" tabIndex={0} role="region" aria-label="回答表格"><table>{children}</table></div>,
      a: ({ children, href }) => <a href={href} target="_blank" rel="noopener noreferrer">{children}</a>,
      // Generated remote image URLs must not leak the reader's IP or conversation identifiers.
      img: ({ alt }) => <span className="answer-image-alt">[图片：{alt || "未提供说明"}]</span>,
    }}>{normalizeMathDelimiters(content)}</Markdown>;
});

export default function AnswerMarkdown({ content, streaming = false }: { content: string; streaming?: boolean }) {
  const deferred = useDeferredValue(content);
  return <div className="answer-markdown"><RenderMarkdown content={streaming ? deferred : content} /></div>;
}

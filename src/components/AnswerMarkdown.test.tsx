import React, { act } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { createRoot } from "react-dom/client";
import { describe, expect, it } from "vitest";
import AnswerMarkdown, { normalizeMathDelimiters } from "./AnswerMarkdown";

const render = (content: string) => renderToStaticMarkup(<AnswerMarkdown content={content} />);
describe("safe answer Markdown for both legacy and streaming text", () => {
  it("renders headings, strong text, nested lists, blockquotes and GFM tables", () => {
    const html = render('## 用量\n\n**基准**\n\n1. 父项\n   - 子项\n\n> 来源\n\n| 场景 | GiB |\n| --- | ---: |\n| 基准 | 4 |\n| 翻倍 | 8 |');
    expect(html).toContain('<h2>用量</h2>'); expect(html).toContain('<strong>基准</strong>');
    expect(html).toContain('<ol>'); expect(html).toContain('<ul>'); expect(html).toContain('<blockquote>');
    expect(html).toContain('<table>'); expect(html).toContain('<td>基准</td>'); expect(html).toContain('text-align:right');
  });
  it.each(['$2^{30}$', '$$\n\\frac{2^{32}}{2^{30}}=4\n$$', '\\(2^{30}\\)', '\\[\\frac{2^{32}}{2^{30}}=4\\]'])("renders math %s as KaTeX/accessible MathML", source => {
    const html = render(source);
    expect(html).toContain('class="katex"'); expect(html).toContain('<math');
    expect(html).not.toContain('katex-error');
  });
  it("does not interpret math delimiters or HTML inside code", () => {
    const source = '`\\(x\\)`\n\n```python\n\\[x\\]\n<script>danger()</script>\n```\n\n~~~text\n\\(x\\)\n~~~';
    expect(normalizeMathDelimiters(source)).toBe(source);
    const html = render(source); expect(html).not.toContain('class="katex"');
    expect(html).toContain('&lt;script&gt;'); expect(html).toContain('class="language-python"');
  });
  it("preserves escaped currency, escaped delimiters and complete long URLs", () => {
    const url = 'https://example.org/wiki?topic=kv-cache&length=131072#measurements';
    const html = render('价格 \\$20\n\n[完整来源]('+url+')\n\n\\\\(literal\\\\)');
    expect(html).toContain('$20'); expect(html).not.toContain('class="katex"');
    expect(html).toContain('length=131072#measurements'); expect(html).toContain('rel="noopener noreferrer"');
  });
  it("disables raw HTML, dangerous URLs, remote images and trusted TeX HTML", () => {
    const html = render('<script>alert(1)</script>\n\n[坏链接](javascript:alert%281%29)\n\n![图](https://example.org/track)\n\n$\\htmlClass{evil}{x}$');
    expect(html).not.toContain('<script'); expect(html).not.toContain('href="javascript:');
    expect(html).not.toContain('<img'); expect(html).not.toContain('class="evil"'); expect(html).toContain('[图片：图]');
  });
  it("never throws for partial tables, code fences, links or malformed math", () => {
    for (const source of ['| A | B |\n| --', '```js\nconst x = 1', '[来源](https://exa', '\\[x+', '$$\n\\unknown{x}\n$$', '$\\frac{']) {
      expect(() => render(source)).not.toThrow();
    }
  });
  it("re-renders the same legacy message as additional streaming tokens finish math and a table", async () => {
    const host = document.createElement('div'); const root = createRoot(host);
    const complete = '\\[x^2=4\\]\n\n| 项 | 值 |\n| --- | --- |\n| KV | 4 |';
    try {
      await act(async () => root.render(<AnswerMarkdown content={'\\[x^2='} streaming />));
      await act(async () => root.render(<AnswerMarkdown content={complete} streaming />));
      expect(host.querySelectorAll('table')).toHaveLength(1); expect(host.querySelector('.katex')).not.toBeNull();
      await act(async () => root.render(<AnswerMarkdown content={complete} />));
      expect(host.querySelector('td')?.textContent).toBe('KV');
    } finally { await act(async () => root.unmount()); }
  });
});

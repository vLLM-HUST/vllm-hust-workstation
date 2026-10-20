import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import ChatPanel from "./ChatPanel";
import type { Message } from "@/types";

function render(message: Partial<Message>) {
  return renderToStaticMarkup(<ChatPanel messages={[{id:"synthetic",role:"assistant",content:"",
    timestamp:0,...message}]} loading={false} accentColor="#6366f1" webSearch={false}
    searchEnabled={true} thinkingEnabled={true} onSend={()=>{}} onStop={()=>{}} onClear={()=>{}}
    onToggleWebSearch={()=>{}} onToggleThinking={()=>{}} onOpenInference={()=>{}} onOpenMetrics={()=>{}}
    serviceStatus="online" model="test" hardware={{npu:"A100",cpu:"",memory:""}} />);
}

describe("final answer presentation",()=>{
  it("uses semantic message surfaces and a named keyboard-accessible copy action",()=>{
    const html=render({content:"测试回答"});
    expect(html).toContain('workspace-message-assistant');
    expect(html).toContain('aria-label="复制回答 Markdown"');
    expect(html).toContain('workspace-copy');
    expect(render({role:"user",content:"测试问题"})).toContain('workspace-message-user');
  });
  it("renders historical assistant Markdown without re-asking and leaves user text literal",()=>{
    const html=render({timestamp:1,content:'## 旧回答\n\n| 场景 | GiB |\n| --- | --- |\n| 基准 | 4 |\n\n$2^{30}$'});
    expect(html).toContain('<table>'); expect(html).toContain('class="katex"'); expect(html).toContain('<h2>旧回答');
    const user=render({role:'user',content:'**原始输入** $x$'});
    expect(user).not.toContain('<strong>原始输入'); expect(user).not.toContain('class="katex"');
  });
  it("keeps thinking collapsed outside the final answer, without fake token counts",()=>{
    const html=render({reasoning:"这里是思考",content:"这是最终答案",completionStatus:"completed"});
    expect(html).toContain('<details');
    expect(html).not.toContain('<details open');
    expect(html).toContain('思考过程（非最终答案）');
    expect(html.indexOf('这里是思考')).toBeLessThan(html.indexOf('</details>'));
    expect(html.indexOf('这是最终答案')).toBeGreaterThan(html.indexOf('</details>'));
    expect(html).not.toContain('tokens');
  });
  it.each(['truncated','empty','interrupted','failed','cancelled'] as const)("shows %s without claiming success",status=>{
    const html=render({reasoning:"只有思考",completionStatus:status,completionNotice:"生成未完整完成"});
    expect(html).toContain('data-completion-status="'+status+'"');
    expect(html).toContain('生成未完整完成');
    expect(html).not.toContain('生成完成');
  });
});

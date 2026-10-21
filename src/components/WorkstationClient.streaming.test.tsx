import React, { act } from "react";
import { createRoot } from "react-dom/client";
import { expect, it, vi } from "vitest";
import type { Message } from "@/types";
import WorkstationClient from "./WorkstationClient";

const captured = vi.hoisted(() => ({ props: null as null | {
  messages: Message[]; loading: boolean; onSend: (text: string) => Promise<void>;
} }));
vi.mock("./ChatPanel", () => ({default: (props: NonNullable<typeof captured.props>) => {
  captured.props = props; return null;
}}));

it.each([["stop","completed",true], ["length","truncated",false], ["cancelled","cancelled",false]] as const)("publishes reasoning before EOF and keeps %s separate from advisory", async (finishReason,completionStatus,shouldAudit) => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  vi.stubGlobal("ResizeObserver", class { observe() {} unobserve() {} disconnect() {} });
  Object.defineProperty(window,"matchMedia",{configurable:true,value:vi.fn(() => ({matches:false,addEventListener(){},removeEventListener(){}}))});
  let controller!: ReadableStreamDefaultController<Uint8Array>;
  const stream = new ReadableStream<Uint8Array>({start(value){ controller = value; }});
  const json = (body: unknown) => Promise.resolve(new Response(JSON.stringify(body)));
  vi.stubGlobal("fetch", vi.fn((url: string) => {
    if (url === "/api/chat") return Promise.resolve(new Response(stream));
    if (url === "/api/models") return json({data:[{id:"fixture"}],engineReady:true});
    if (url === "/api/versions") return json({available:false});
    if (url === "/api/hardware") return json({});
    return new Promise(() => {});
  }));
  const host = document.createElement("div"); document.body.append(host);
  const root = createRoot(host);
  const encoder = new TextEncoder();
  try {
    await act(async () => root.render(<WorkstationClient config={{brandName:"fixture",brandLogo:null,
      accentColor:"#6366f1",baseUrl:"http://fixture.invalid",searchEnabled:false}} />));
    let sending!: Promise<void>;
    await act(async () => { sending = captured.props!.onSend("fixture question"); });
    await act(async () => controller.enqueue(encoder.encode('data: {"choices":[{"delta":{"reasoning":"实时思考片段"}}]}\n\n')));
    expect(captured.props!.loading).toBe(true);
    expect(captured.props!.messages.at(-1)).toMatchObject({reasoning:"实时思考片段",content:""});
    expect(captured.props!.messages.at(-1)!.completionStatus).toBeUndefined();
    await act(async () => {
      controller.enqueue(encoder.encode('data: {"choices":[{"delta":{"content":"最终答案"}}]}\n\ndata: {"choices":[{"delta":{},"finish_reason":"'+finishReason+'"}]}\n\ndata: [DONE]\n\n'));
      controller.close(); await sending;
    });
    expect(host.querySelector('[aria-label="推理过程"]')).toBeNull();
    expect(host.querySelector('[aria-label="运行状态"]')?.hasAttribute('hidden')).toBe(true);
    expect(captured.props!.loading).toBe(false);
    expect(captured.props!.messages.at(-1)).toMatchObject({reasoning:"实时思考片段",content:"最终答案",completionStatus});
    // An indefinitely pending advisory cannot delay original completion.
    expect(captured.props!.messages.at(-1)?.advisory).toEqual(shouldAudit ? {status:"pending"} : undefined);
    const calls = vi.mocked(fetch).mock.calls;
    const advisoryCall = calls.find(call => call[0] === "/api/advisory");
    if (shouldAudit) {
      expect(advisoryCall).toBeDefined();
      expect(JSON.parse(advisoryCall![1]!.body as string)).toEqual({question:"fixture question",answer:"最终答案"});
    } else expect(advisoryCall).toBeUndefined();
    const chatCall = calls.find(call => call[0] === "/api/chat");
    expect(JSON.stringify(chatCall)).not.toContain("实时思考片段");
  } finally {
    await act(async () => root.unmount()); host.remove();
    vi.unstubAllGlobals(); vi.restoreAllMocks();
  }
});

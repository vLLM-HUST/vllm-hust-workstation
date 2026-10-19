import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it } from "vitest";
import { ReasoningDisclosure, ReasoningText } from "./ReasoningText";

let host: HTMLDivElement;
let root: Root;
beforeEach(() => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  host = document.createElement("div"); document.body.append(host);
  root = createRoot(host);
});
afterEach(async () => { await act(async () => root.unmount()); host.remove(); });

it("shows reasoning while streaming, respects collapse across chunks, folds on completion", async () => {
  await act(async () => root.render(<ReasoningDisclosure text="首段思考" streaming />));
  expect(host.querySelector("details")!.open).toBe(true);
  expect(host.textContent).toContain("实时更新");
  await act(async () => host.querySelector("summary")!.click());
  await act(async () => root.render(<ReasoningDisclosure text="首段思考，新增内容" streaming />));
  expect(host.querySelector("details")!.open).toBe(false);
  expect(host.textContent).toContain("新增内容");
  await act(async () => host.querySelector("summary")!.click());
  await act(async () => root.render(<ReasoningDisclosure text="完整思考" streaming={false} />));
  expect(host.querySelector("details")!.open).toBe(false);
  expect(host.textContent).toContain("完整思考");
  expect(host.textContent).not.toContain("实时更新");
});

it("follows reasoning tail but leaves a reader scrolling upward in place", async () => {
  await act(async () => root.render(<ReasoningText text="first" />));
  const area = host.querySelector<HTMLDivElement>("[data-reasoning-text]")!;
  Object.defineProperties(area, {scrollHeight:{configurable:true,value:1000}, clientHeight:{configurable:true,value:100}});
  await act(async () => root.render(<ReasoningText text="second" />));
  expect(area.scrollTop).toBe(1000);
  area.scrollTop = 100;
  await act(async () => area.dispatchEvent(new Event("scroll")));
  await act(async () => root.render(<ReasoningText text="third" />));
  expect(area.scrollTop).toBe(100);
  area.scrollTop = 900;
  await act(async () => area.dispatchEvent(new Event("scroll")));
  Object.defineProperty(area,"scrollHeight",{configurable:true,value:1200});
  await act(async () => root.render(<ReasoningText text="fourth" />));
  expect(area.scrollTop).toBe(1200);
});

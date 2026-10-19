import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { expect, it } from "vitest";
import { createSteps } from "./WorkstationClient";
import InferenceSidebar from "./InferenceSidebar";

it("renders user stop independently from generation failure or success", () => {
  const steps = createSteps({ webSearch: false, stage: "cancelled", detail: "已停止当前生成" });
  expect(steps.find(step => step.id === "generate")).toMatchObject({
    state: "cancelled", label: "已停止生成", icon: "⏹️",
  });
  const html = renderToStaticMarkup(<InferenceSidebar open onToggle={() => {}}
    processSteps={steps} searchQuery="" searchResults={[]} thinkText="" />);
  expect(html).toContain("已停止生成");
  expect(html).not.toContain("生成失败");
  expect(html).not.toContain("生成完成");
});

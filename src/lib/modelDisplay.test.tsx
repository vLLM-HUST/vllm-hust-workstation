import { renderToStaticMarkup } from "react-dom/server";
import { expect, it } from "vitest";
import Header from "@/components/Header";
import { modelChoiceLabel, modelDisplayName, modelSummaryLabel } from "./modelDisplay";

it("removes deployment hardware suffixes but preserves architecture, size and quantization", () => {
  for (const suffix of ["A100","A6000","H100","H200","L40S"]) {
    expect(modelDisplayName(`Qwen/Qwen3.5-35B-A3B-${suffix}`)).toBe("Qwen/Qwen3.5-35B-A3B");
  }
  for (const name of ["Qwen/Qwen3.5-35B-A3B","Qwen/Qwen3-Embedding-8B","model-AWQ","model-FP8","sage-auto"]) {
    expect(modelDisplayName(name)).toBe(name);
  }
});

it("uses unique stable neutral labels without rewriting identities or merging choices", () => {
  const ids=["Qwen/model-A100","Qwen/model","sage-auto"];
  const before=[...ids];
  expect(modelChoiceLabel(ids[0],ids)).not.toContain("A100");
  expect(modelChoiceLabel(ids[0],ids)).not.toBe(modelChoiceLabel(ids[1],ids));
  expect(modelChoiceLabel(ids[0],[...ids].reverse())).toBe(modelChoiceLabel(ids[0],ids));
  expect(ids).toEqual(before);
  expect(modelSummaryLabel("Qwen/model-A100 · Qwen/model · sage-auto")).toBe("Qwen/model · sage-auto");
});

it("renders hardware-free option text but preserves the exact values selected for routing", () => {
  const ids=["Qwen/model-A100","Qwen/model"];
  const noop=()=>{};
  const host=document.createElement("div");
  host.innerHTML=renderToStaticMarkup(<Header brandName="test" brandLogo={null} accentColor="#6366f1"
    model={ids[0]} models={ids} liveModelSwitchSupported onModelChange={noop} onOpenModelHub={noop}
    onOpenAgentLab={noop} onOpenMetrics={noop} onOpenInference={noop} theme="light"
    onToggleTheme={noop} serviceStatus="online" />);
  const options=[...host.querySelectorAll("option")];
  expect(options.map(item=>item.value)).toEqual(ids);
  expect(options.map(item=>item.textContent).join(" ")).not.toContain("A100");
  expect(host.querySelector("select")?.value).toBe(ids[0]);
});

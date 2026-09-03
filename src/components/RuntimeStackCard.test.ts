import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import RuntimeStackCard from "./RuntimeStackCard";
import type { RuntimeProvenance } from "@/lib/runtimeProvenance";

const sha = "a".repeat(40);
const evidence: RuntimeProvenance = {
  available: true, source: "docker-inspect-receipt", vllmHust: sha, vllmAscendHust: sha,
  capturedAt: "2026-09-03T02:16:36.736727Z",
  image: { id: "sha256:abc", digest: "sha256:abc", reference: "runtime:locked", createdAt: "2026-09-02T12:24:35Z" },
  components: {
    core: { name: "vLLM-HUST", repository: "https://github.com/vLLM-HUST/vllm-hust", commit: sha, version: "0.28.1rc1.dev319", commitUrl: `https://github.com/vLLM-HUST/vllm-hust/commit/${sha}` },
    plugin: { name: "vLLM-Ascend-HUST", repository: "https://github.com/vLLM-HUST/vllm-ascend-hust", commit: sha, version: "0.25.1rc1+hust.20260902.9", commitUrl: `https://github.com/vLLM-HUST/vllm-ascend-hust/commit/${sha}` },
  },
  verification: { status: "verified", checkedAt: "2026-09-03T02:28:06Z", receiptAgeSeconds: 690, message: "Artifact provenance, not process-memory attestation.", processSource: "not-attested" },
};

function render(provenance: RuntimeProvenance) {
  const host = document.createElement("div");
  host.innerHTML = renderToStaticMarkup(createElement(RuntimeStackCard, { provenance }));
  return host;
}

describe("compact runtime card", () => {
  it("keeps raw evidence collapsed by default and only two short commit links visible", () => {
    const host = render(evidence);
    expect(host.querySelector("details")?.open).toBe(false);
    expect(host.querySelector("summary")?.textContent).toContain("版本与构建详情");
    expect(host.querySelectorAll("a")).toHaveLength(2);
    expect(host.querySelector("code")?.textContent).toBe("aaaaaaaa");
    expect(host.querySelector("details")?.textContent).toContain(evidence.components!.plugin.version);
    expect(host.querySelector("details")?.textContent).toContain(evidence.image!.digest);
    expect(host.querySelector("details")?.textContent).toContain(evidence.verification!.message);
  });
  it("formats readable dates while preserving exact timestamps", () => {
    const host = render(evidence);
    const time = host.querySelector(`time[datetime="${evidence.capturedAt}"]`);
    expect(time?.textContent).toContain("10:16");
    expect(time?.getAttribute("title")).toBe(evidence.capturedAt);
  });
  it("does not show stale commits or a verified badge when unavailable", () => {
    const host = render({ ...evidence, available: false, reason: "Receipt expired" });
    expect(host.querySelectorAll("a")).toHaveLength(0);
    expect(host.textContent).not.toContain("容器已核验");
    expect(host.querySelector("details")?.textContent).toContain("Receipt expired");
  });
});

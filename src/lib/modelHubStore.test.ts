// @vitest-environment node
import fsp from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { EventEmitter } from "node:events";
import { PassThrough } from "node:stream";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
const spawn = vi.hoisted(() => vi.fn());
vi.mock("node:child_process", () => ({ spawn }));
import { getModelHubDir } from "./modelHub";
import { cancelDownload, getCatalog, getModelStorage, hasCompleteWeights, startDownload } from "./modelHubStore";

let dir: string;
let child: EventEmitter & { stdout: PassThrough; stderr: PassThrough; kill: ReturnType<typeof vi.fn> };
beforeEach(async () => {
  dir = await fsp.mkdtemp(path.join(os.tmpdir(), "workstation-hub-test-"));
  vi.stubEnv("MODEL_HUB_DIR", dir);
  vi.stubEnv("HF_TOKEN", "");
  Object.assign(globalThis, { __vllmHustModelHubStore: { downloads: {} } });
  child = Object.assign(new EventEmitter(), { stdout: new PassThrough(), stderr: new PassThrough(), kill: vi.fn(() => true) });
  spawn.mockReset().mockReturnValue(child);
  vi.spyOn(fsp, "statfs").mockResolvedValue({ bavail: 1000000, bsize: 1024 ** 2 } as Awaited<ReturnType<typeof fsp.statfs>>);
});
afterEach(async () => {
  child.emit("close", 1, "SIGTERM");
  vi.restoreAllMocks(); vi.unstubAllEnvs();
  await fsp.rm(dir, { recursive: true, force: true });
});
async function weights(id = "Qwen3-32B") {
  const target = path.join(dir, id);
  await fsp.mkdir(target, { recursive: true });
  await fsp.writeFile(path.join(target, "config.json"), "{}");
  await fsp.writeFile(path.join(target, "model.safetensors"), "fixture-weight");
  return target;
}
describe("explicit model storage and safe downloads", () => {
  it.each(["", "/", "relative/models"])("disables missing/unsafe storage (%s), no Downloads fallback", async configured => {
    vi.stubEnv("MODEL_HUB_DIR", configured);
    expect(getModelHubDir()).toBeNull();
    expect((await startDownload("Qwen3-32B")).status).toBe(503);
    expect(spawn).not.toHaveBeenCalled();
  });
  it("reports unavailable directories without creating them", async () => {
    vi.stubEnv("MODEL_HUB_DIR", path.join(dir, "absent"));
    expect((await getModelStorage()).available).toBe(false);
  });
  it("does not expose private paths or low-level error text to public users", async () => {
    Object.assign(globalThis, { __vllmHustModelHubStore: { downloads: { "Qwen3-32B": { state: { status: "error", pct: 0, error: "private /home/operator/path", currentFile: "/data/private/file" } } } } });
    const publicData = await getCatalog();
    expect(JSON.stringify(publicData)).not.toContain(dir);
    expect(JSON.stringify(publicData)).not.toContain("/home/operator");
    expect(JSON.stringify(publicData)).not.toContain("/data/private");
    expect(publicData.permissions.canDownload).toBe(false);
    expect((await getCatalog(true)).storage.path).toBe(dir);
  });
  it("rejects unknown models, insufficient disk and gated repositories", async () => {
    expect((await startDownload("../invalid")).status).toBe(404);
    expect((await startDownload("Llama-3.1-8B-Instruct")).status).toBe(503);
    vi.mocked(fsp.statfs).mockResolvedValue({ bavail: 1, bsize: 1024 } as Awaited<ReturnType<typeof fsp.statfs>>);
    expect((await startDownload("Qwen3-32B")).status).toBe(507);
    expect(spawn).not.toHaveBeenCalled();
  });
  it("refuses a symlink target", async () => {
    await fsp.symlink(dir, path.join(dir, "Qwen3-32B"));
    expect((await startDownload("Qwen3-32B")).status).toBe(409);
    expect(spawn).not.toHaveBeenCalled();
  });
  it("does not treat a partial shard set as installed", async () => {
    const target = await weights();
    await fsp.writeFile(path.join(target, "model.safetensors.index.json"), JSON.stringify({ weight_map: { a: "first.safetensors", b: "second.safetensors" } }));
    await fsp.writeFile(path.join(target, "first.safetensors"), "fixture");
    expect(await hasCompleteWeights(target)).toBe(false);
    await fsp.writeFile(path.join(target, "second.safetensors"), "fixture");
    expect(await hasCompleteWeights(target)).toBe(true);
  });
  it("returns already downloaded without starting a process", async () => {
    await weights();
    expect((await startDownload("Qwen3-32B")).status).toBe(200);
    expect(spawn).not.toHaveBeenCalled();
    expect((await getCatalog(true)).catalog[0].installed).toBe(true);
  });
  it("serializes concurrent preflight and completes only after shard checks", async () => {
    vi.stubEnv("WORKSTATION_ADMIN_TOKEN", "never-inherit-this");
    const results = await Promise.all([startDownload("Qwen3-32B"), startDownload("Qwen2.5-7B-Instruct")]);
    expect(results.map(result => result.status).sort()).toEqual([202, 409]);
    expect(spawn).toHaveBeenCalledOnce();
    expect(spawn.mock.calls[0][2].env.WORKSTATION_ADMIN_TOKEN).toBeUndefined();
    await weights();
    child.emit("close", 0, null);
    await vi.waitFor(async () => expect((await getCatalog(true)).catalog[0].download?.status).toBe("done"));
  });
  it("cancels only a running job and preserves its files", async () => {
    expect(cancelDownload("unknown")).toBe(false);
    await startDownload("Qwen3-32B");
    expect(cancelDownload("Qwen3-32B")).toBe(true);
    expect(child.kill).toHaveBeenCalledWith("SIGTERM");
    expect(cancelDownload("Qwen3-32B")).toBe(false);
    expect((await startDownload("Qwen2.5-7B-Instruct")).status).toBe(409);
    child.emit("close", null, "SIGTERM");
    expect((await getCatalog(true)).catalog[0].download?.status).toBe("cancelled");
    expect((await fsp.stat(path.join(dir, "Qwen3-32B"))).isDirectory()).toBe(true);
  });
  it("reports downloader failure and redacts its token", async () => {
    vi.stubEnv("HF_TOKEN", "fixture-secret");
    await startDownload("Qwen3-32B");
    child.stderr.write("failed fixture-secret");
    child.emit("close", 1, null);
    const result = (await getCatalog(true)).catalog[0].download;
    expect(result?.status).toBe("error");
    expect(result?.error).not.toContain("fixture-secret");
  });
  it("reports zero-exit incomplete downloads as errors", async () => {
    await startDownload("Qwen3-32B");
    child.emit("close", 0, null);
    await vi.waitFor(async () => expect((await getCatalog(true)).catalog[0].download?.status).toBe("error"));
  });
});

// @vitest-environment node
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { chmod, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { getModRuntime, runtimeConfig, startRuntimePreparation } from "./modRuntimeStore";
import { getRuntimeProvenance, type RuntimeProvenance } from "./runtimeProvenance";
import { spawn } from "node:child_process";
import { GET, POST } from "@/app/api/mod-runtime/route";

vi.mock("./runtimeProvenance", () => ({ getRuntimeProvenance: vi.fn() }));
vi.mock("./upstream", () => ({ fetchUpstreamModels: vi.fn(async () => ({ reachable: true, ids: ["real-model-id"] })) }));
vi.mock("node:child_process", () => ({ spawn: vi.fn(() => ({ on: vi.fn(), stdin: { on: vi.fn(), end: vi.fn() }, unref: vi.fn() })) }));
let root: string;
let configuration: { schema: string; target: { id: string; label: string; ownership: string; containerName: string; pythonBin: string; upstreamUrl: string } };
let provenance: RuntimeProvenance;
const request = (body: unknown, token = "test-admin") => new Request("http://localhost/api/mod-runtime", { method: "POST", headers: { "x-workstation-admin-token": token }, body: JSON.stringify(body) });

beforeEach(async () => {
  vi.clearAllMocks();
  root = await mkdtemp(path.join(os.tmpdir(), "mod-runtime-test-"));
  await mkdir(path.join(root, "library"), { mode: 0o700 });
  await mkdir(path.join(root, "runtime"), { mode: 0o700 });
  configuration = { schema: "workstation.mod-runtime-config/v1", target: { id: "current", label: "工作站实例", ownership: "shared", containerName: "actual-container", pythonBin: "/runtime/bin/python", upstreamUrl: "http://127.0.0.1:18001" } };
  await writeFile(path.join(root, "target.json"), JSON.stringify(configuration), { mode: 0o600 });
  for (const [key, value] of Object.entries({ WORKSTATION_MOD_RUNTIME_CONFIG: path.join(root, "target.json"), WORKSTATION_MOD_RUNTIME_DIR: path.join(root, "runtime"), WORKSTATION_MOD_DIR: path.join(root, "library"), WORKSTATION_RUNTIME_CONTAINER: "actual-container", VLLM_HUST_BASE_URL: "http://localhost:18001/v1", WORKSTATION_ADMIN_TOKEN: "test-admin" })) vi.stubEnv(key, value);
  provenance = { available: true, source: "docker-inspect-receipt", container: { name: "actual-container", id: "a".repeat(64), startedAt: "2026-09-03T00:00:00Z" }, image: { id: "sha256:" + "b".repeat(64) }, components: { core: { commit: "c".repeat(40) }, plugin: { commit: "d".repeat(40) } }, verification: { status: "verified", checkedAt: "2026-09-03T00:01:00Z" } } as RuntimeProvenance;
  vi.mocked(getRuntimeProvenance).mockResolvedValue(provenance);
});
afterEach(async () => { vi.unstubAllEnvs(); await rm(root, { recursive: true, force: true }); });

it("requires explicit private enrollment matching the actual workstation upstream", async () => {
  expect((await runtimeConfig())?.target.id).toBe("current");
  await chmod(path.join(root, "target.json"), 0o644);
  await expect(runtimeConfig()).rejects.toThrow("私有管理");
  await chmod(path.join(root, "target.json"), 0o600);
  vi.stubEnv("VLLM_HUST_BASE_URL", "http://other:18001");
  await expect(runtimeConfig()).rejects.toThrow("不一致");
  vi.stubEnv("WORKSTATION_MOD_RUNTIME_CONFIG", "");
  expect((await getModRuntime(false)).target).toBeNull();
});

it("never reports a verified container or prepared image as an effective Mod", async () => {
  const data = await getModRuntime(false);
  expect(data.target?.models).toEqual(["real-model-id"]);
  expect(data.target?.identityVerified).toBe(true);
  expect(data.target?.observedMods).toBeNull();
  expect(data.applicationAvailable).toBe(false);
  expect(data.tasks).toEqual([]);
  expect(JSON.stringify(data)).not.toContain("/runtime/bin");
  expect(JSON.stringify(data)).not.toContain("actual-container");
});

it("hides stale identity and refuses preparation when provenance is not verified", async () => {
  vi.mocked(getRuntimeProvenance).mockResolvedValue({ ...provenance, available: false });
  const data = await getModRuntime(true);
  expect(data.target?.imageId).toBeUndefined();
  expect(data.preparationAvailable).toBe(false);
  await expect(startRuntimePreparation("current", "diffspec")).rejects.toThrow("身份未核验");
  expect(spawn).not.toHaveBeenCalled();
});

it("authenticates all mutations before parsing and does not accept browser launch parameters", async () => {
  for (const action of ["prepare", "apply", "disable", "rollback"]) expect((await POST(request({ targetId: "current", modId: "diffspec", action }, "wrong"))).status).toBe(401);
  expect((await GET(new Request("http://localhost/api/mod-runtime", { headers: { "x-workstation-admin-token": "wrong" } }))).status).toBe(401);
  expect((await POST(request({ action: "prepare", targetId: "current", modId: "diffspec", imageId: "evil:latest" }))).status).toBe(400);
  expect((await POST(request({ action: "apply", targetId: "current", modId: "diffspec" }))).status).toBe(409);
  expect(spawn).not.toHaveBeenCalled();
});

it("queues only reviewed source pins and deployment-owned paths without inherited secrets", async () => {
  const response = await POST(request({ action: "prepare", targetId: "current", modId: "diffspec" }));
  expect(response.status).toBe(202);
  const task = await response.json();
  expect(task.status).toBe("queued");
  const stored = JSON.parse(await readFile(path.join(root, "runtime/tasks", task.id + ".json"), "utf8"));
  expect(stored.expectedIdentity.id).toBe("a".repeat(64));
  expect(stored.sourceSha).toBe("762959978514cdd01407b58f1015a75f2ae2c936");
  const options = vi.mocked(spawn).mock.calls[0][2];
  expect(options?.env).not.toHaveProperty("WORKSTATION_ADMIN_TOKEN");
  expect(options?.env).not.toHaveProperty("VLLM_HUST_API_KEY");
  expect(JSON.stringify(task)).not.toContain("expectedIdentity");
  expect((await getModRuntime(false)).tasks).toEqual([]);
  expect((await getModRuntime(true)).tasks).toHaveLength(1);
  await expect(startRuntimePreparation("current", "diffspec")).rejects.toThrow("已有准备任务");
});

it("rejects unknown targets and external services without invoking a worker", async () => {
  await expect(startRuntimePreparation("foreign", "diffspec")).rejects.toThrow("未登记");
  await expect(startRuntimePreparation("current", "pegaflow")).rejects.toThrow("不支持");
  expect(spawn).not.toHaveBeenCalled();
});

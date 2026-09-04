// @vitest-environment node
import { afterEach, expect, it, vi } from "vitest";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { createServer, type Server } from "node:net";
import os from "node:os";
import path from "node:path";
import { describeHostTarget } from "./hostBrokerClient";

let root = "";
let server: Server | undefined;
afterEach(async () => {
  vi.unstubAllEnvs();
  if (server) await new Promise<void>(resolve => server!.close(() => resolve()));
  server = undefined;
  if (root) await rm(root, { recursive: true, force: true });
  root = "";
});

it("sends only a bounded describe request over AF_UNIX", async () => {
  root = await mkdtemp(path.join(os.tmpdir(), "workstation-broker-"));
  const socketPath = path.join(root, "broker.sock");
  let received: unknown;
  server = createServer(connection => {
    let raw = "";
    connection.setEncoding("utf8");
    connection.on("data", chunk => { raw += chunk; });
    connection.on("end", () => {
      received = JSON.parse(raw);
      connection.end(JSON.stringify({ ok: true, protocol: "vllm-hust.host-broker/v1",
        instanceId: "current", state: "running", healthy: true, policySha256: "a".repeat(64) }));
    });
  });
  await new Promise<void>((resolve, reject) => server!.listen(socketPath, resolve).once("error", reject));
  vi.stubEnv("WORKSTATION_HOST_BROKER_SOCKET", socketPath);
  await expect(describeHostTarget("current")).resolves.toMatchObject({ available: true, registered: true, state: "running", healthy: true });
  expect(received).toEqual({ schema: "vllm-hust.host-broker/v1", action: "describe", instance_id: "current" });
});

it("fails closed without spawning a host command", async () => {
  vi.stubEnv("WORKSTATION_HOST_BROKER_SOCKET", "/run/nonexistent-workstation-broker.sock");
  await expect(describeHostTarget("current")).resolves.toEqual({ available: false, registered: false, state: "unavailable", healthy: false });
  const source = await readFile(path.join(process.cwd(), "src/lib/hostBrokerClient.ts"), "utf8");
  for (const forbidden of ["child_process", "systemctl", "docker", "exec(", "spawn("]) expect(source).not.toContain(forbidden);
});

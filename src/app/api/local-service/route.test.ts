// @vitest-environment node
import { afterEach, beforeEach, expect, it, vi } from "vitest";

const child = vi.hoisted(() => ({ spawn: vi.fn(() => ({ unref: vi.fn() })) }));
vi.mock("node:child_process", () => child);
vi.mock("@/lib/server/evoscientist", () => ({ getEvoScientistIntegrationStatus: vi.fn() }));
vi.mock("@/lib/upstream", () => ({ fetchUpstreamEngineProbe: vi.fn(), fetchUpstreamModels: vi.fn() }));

import { POST } from "./route";

function request(action: string, token = "") {
  return new Request("http://localhost/api/local-service", {
    method: "POST",
    headers: { "Content-Type": "application/json", ...(token ? { "X-Workstation-Admin-Token": token } : {}) },
    body: JSON.stringify({ action }),
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv("WORKSTATION_ADMIN_TOKEN", "fixture-admin");
  vi.stubEnv("WORKSTATION_BACKEND_MODE", "local");
  vi.stubEnv("WORKSTATION_LOCAL_BACKEND_CONTROL_ENABLED", "true");
});
afterEach(() => vi.unstubAllEnvs());

it("authenticates every lifecycle mutation before launching a process", async () => {
  for (const action of ["ensure-backend", "restart-backend", "stop-local", "restart-managed-backend"]) {
    expect((await POST(request(action))).status).toBe(401);
  }
  expect(child.spawn).not.toHaveBeenCalled();
});

it("accepts explicit authorization but still applies target ownership gates", async () => {
  expect((await POST(request("authorize-admin", "fixture-admin"))).status).toBe(200);
  expect((await POST(request("ensure-backend", "fixture-admin"))).status).toBe(200);
  expect(child.spawn).toHaveBeenCalledTimes(1);
  vi.stubEnv("WORKSTATION_BACKEND_MODE", "external");
  vi.stubEnv("WORKSTATION_LOCAL_BACKEND_CONTROL_ENABLED", "false");
  expect((await POST(request("ensure-backend", "fixture-admin"))).status).toBe(403);
  expect(child.spawn).toHaveBeenCalledTimes(1);
});

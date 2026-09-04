import { createConnection } from "node:net";

const PROTOCOL = "vllm-hust.host-broker/v1";
const MAX_RESPONSE = 16_384;

export interface HostTargetStatus {
  available: boolean;
  registered: boolean;
  state: "running" | "stopped" | "unavailable" | "identity_lost";
  healthy: boolean;
  policySha256?: string;
}

export async function describeHostTarget(instanceId: string): Promise<HostTargetStatus> {
  if (!/^[a-z][a-z0-9-]{0,63}$/.test(instanceId)) return { available: false, registered: false, state: "unavailable", healthy: false };
  const socketPath = (process.env.WORKSTATION_HOST_BROKER_SOCKET || "/run/vllm-hust-host-broker/control.sock").trim();
  if (!socketPath.startsWith("/") || socketPath.includes("\0") || socketPath.split("/").includes("..")) return { available: false, registered: false, state: "unavailable", healthy: false };
  const payload = JSON.stringify({ schema: PROTOCOL, action: "describe", instance_id: instanceId });
  try {
    const raw = await new Promise<string>((resolve, reject) => {
      const client = createConnection(socketPath);
      let response = "";
      const timer = setTimeout(() => client.destroy(new Error("timeout")), 800);
      client.setEncoding("utf8");
      client.on("connect", () => client.end(payload));
      client.on("data", chunk => {
        response += chunk;
        if (Buffer.byteLength(response) > MAX_RESPONSE) client.destroy(new Error("response too large"));
      });
      client.on("error", reject);
      client.on("end", () => resolve(response));
      client.on("close", () => clearTimeout(timer));
    });
    const value = JSON.parse(raw);
    if (!value || value.protocol !== PROTOCOL || value.ok !== true || value.instanceId !== instanceId || typeof value.healthy !== "boolean" || typeof value.policySha256 !== "string") {
      return { available: true, registered: false, state: "unavailable", healthy: false };
    }
    const state = value.state === "running" ? "running" : value.state === "stopped" ? "stopped" : value.state === "identity_lost" ? "identity_lost" : "unavailable";
    return { available: true, registered: true, state, healthy: value.healthy, policySha256: value.policySha256 };
  } catch {
    return { available: false, registered: false, state: "unavailable", healthy: false };
  }
}

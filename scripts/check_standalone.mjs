import { spawn } from "node:child_process";
import { createServer } from "node:net";
import { resolve } from "node:path";
import { lstat, rm } from "node:fs/promises";

// Next copies dotenv files separately from tracing. Credentials belong to the
// trusted launcher, not the generated deployment bundle; remove only these copies.
const candidate = resolve(".next/standalone");
if (!(await lstat(candidate)).isDirectory() || !(await lstat(resolve(candidate, "server.js"))).isFile()) {
  throw new Error("Expected a generated standalone directory and server entrypoint");
}
for (const name of [".env", ".env.local", ".env.production", ".env.production.local"]) {
  await rm(resolve(candidate, name), { force: true });
}
// Boot the candidate on loopback before replacing the active Web release.
// Probe only a read-only local catalog route; never contact inference or mutate it.
const listener = createServer();
await new Promise((ready, reject) => { listener.once("error", reject); listener.listen(0, "127.0.0.1", ready); });
const port = listener.address().port;
await new Promise(resolve => listener.close(resolve));
const child = spawn(process.execPath, ["server.js"], {
  cwd: candidate,
  env: { ...process.env, NODE_ENV: "production", HOSTNAME: "127.0.0.1", PORT: String(port) },
  stdio: ["ignore", "pipe", "pipe"],
});
let output = "";
let spawnError;
child.on("error", error => { spawnError = error; });
child.stdout.on("data", data => { output = (output + data).slice(-4000); });
child.stderr.on("data", data => { output = (output + data).slice(-4000); });
try {
  let passed = false;
  for (let attempt = 0; attempt < 80; attempt++) {
    if (spawnError || child.exitCode !== null) throw new Error("Standalone failed to start: " + (spawnError?.message || output));
    try {
      const response = await fetch(`http://127.0.0.1:${port}/api/hub/catalog`, { signal: AbortSignal.timeout(1000) });
      const data = await response.json();
      if (response.ok && Array.isArray(data.catalog)) { passed = true; break; }
    } catch { /* Candidate may still be starting. */ }
    await new Promise(resolve => setTimeout(resolve, 250));
  }
  if (!passed) throw new Error("Standalone catalog probe timed out: " + output);
  console.log("Standalone startup and read-only catalog probe passed");
} finally {
  if (child.exitCode === null && !spawnError) {
    await new Promise(resolve => {
      const timeout = setTimeout(() => child.kill("SIGKILL"), 2000);
      child.once("exit", () => { clearTimeout(timeout); resolve(); });
      child.kill("SIGTERM");
    });
  }
}

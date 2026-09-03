// Opt-in real package lifecycle test. No model, device or service is started.
// Usage: node scripts/test_mod_lifecycle.mjs /absolute/empty/test-directory
import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import path from "node:path";
import ts from "typescript";
const root = process.argv[2];
if (!root || !path.isAbsolute(root) || root === "/" || !existsSync(root)) throw new Error("Supply a dedicated existing test directory");
const exports = {};
const source = ts.transpileModule(readFileSync("src/lib/modCatalog.ts", "utf8"), {compilerOptions: {module: ts.ModuleKind.CommonJS}}).outputText;
new Function("exports", source)(exports);
mkdirSync(path.join(root, "tasks"), {recursive: true});
const checks = [];
for (const mod of exports.MOD_CATALOG.filter(m => m.sha)) {
  for (const [action, expected] of [["install", "succeeded"], ["enable", "failed"], ["configure", "succeeded"], ["enable", "succeeded"], ["uninstall", "failed"], ["disable", "succeeded"], ["uninstall", "succeeded"]]) {
    const id = randomUUID();
    const file = path.join(root, "tasks", `${id}.json`);
    writeFileSync(file, JSON.stringify({id, modId: mod.id, action, status: "queued", createdAt: new Date().toISOString(), logs: []}));
    const result = spawnSync("/usr/bin/python3", ["scripts/mod_worker.py", root, id], {input: JSON.stringify({mod, managerSha: exports.MOD_MANAGER_SHA, configuration: mod.id === "diffspec" ? {launch_options: {speculative_config: {model: "/models/fixture-draft", method: "eagle3"}}} : {}}), encoding: "utf8", timeout: 960_000, env: {PATH: "/usr/bin:/bin", LANG: "C.UTF-8"}});
    const task = JSON.parse(readFileSync(file, "utf8"));
    checks.push({mod: mod.id, action, expected, actual: task.status});
    console.log(JSON.stringify(checks.at(-1)));
    if (result.status !== 0 || task.status !== expected) throw new Error(JSON.stringify({task, stderr: result.stderr}));
  }
}
console.log(JSON.stringify({passed: checks.length, root, scope: "real isolated package lifecycle; no runtime or accelerator validation"}));

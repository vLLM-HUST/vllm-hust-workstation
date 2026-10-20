// Convert ONLY an operator-owned synthetic probe to a lossless local UI import.
// No network, credentials, fixtures masquerading as new inference, or overwrites.
import { readFileSync, writeFileSync } from "node:fs";
const [source, destination] = process.argv.slice(2);
if (!source || !destination) throw new Error("Usage: node scripts/archive_chat_probe.mjs owned-probe.json session.json");
const probe = JSON.parse(readFileSync(source, "utf8"));
if (!probe.request?.metadata?.workstation_acceptance?.startsWith("ws-final-")) throw new Error("Not an owned acceptance probe");
if (!probe.content || !probe.done || probe.finishes?.join() !== "stop") throw new Error("Probe did not finish normally");
const timestamp = Date.parse(probe.at);
const input = probe.request.messages.filter(item => item.role === "user" || item.role === "assistant");
const messages = input.map((item, index) => ({ id: `archived-input-${index}`, role: item.role, content: item.content, timestamp }));
const usage = probe.events?.findLast(event => event.usage)?.usage;
messages.push({ id: "archived-answer", role: "assistant", content: probe.content, reasoning: probe.reasoning,
  timestamp: timestamp + probe.seconds * 1000, completionStatus: "completed",
  ...(usage?.completion_tokens !== undefined ? {tokensUsed:usage.completion_tokens} : {}) });
writeFileSync(destination, JSON.stringify({version:1,streaming:false,messages},null,2), { flag:"wx", mode:0o600 });
console.log(JSON.stringify({ messages:messages.length, archivedAt:probe.at, modelRequested:false }));

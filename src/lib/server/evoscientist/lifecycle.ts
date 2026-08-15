import { spawn, type ChildProcessByStdio } from "node:child_process";
import type { Readable } from "node:stream";

export type ManagedProcess = {
  child: ChildProcessByStdio<null, Readable, Readable>;
  terminate: () => void;
};

export function processGroupTarget(pid: number, platform = process.platform): number {
  return platform === "win32" ? pid : -pid;
}

export function spawnManagedProcess(options: {
  command: string[];
  cwd: string;
  env: NodeJS.ProcessEnv;
  killGraceMs?: number;
}): ManagedProcess {
  const child = spawn(options.command[0], options.command.slice(1), {
    cwd: options.cwd,
    env: options.env,
    detached: process.platform !== "win32",
    stdio: ["ignore", "pipe", "pipe"],
  });
  let terminationRequested = false;
  let killTimer: NodeJS.Timeout | null = null;

  const signalTree = (signal: NodeJS.Signals) => {
    if (!child.pid) return;
    try {
      process.kill(processGroupTarget(child.pid), signal);
    } catch {
      try {
        child.kill(signal);
      } catch {
        // The process may have exited between the state check and signal.
      }
    }
  };

  const terminate = () => {
    if (terminationRequested || child.exitCode !== null || child.signalCode !== null) {
      return;
    }
    terminationRequested = true;
    signalTree("SIGTERM");
    killTimer = setTimeout(() => signalTree("SIGKILL"), options.killGraceMs ?? 2500);
    killTimer.unref();
  };

  child.once("close", () => {
    if (killTimer) clearTimeout(killTimer);
  });

  return { child, terminate };
}

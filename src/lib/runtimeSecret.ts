import fs from "node:fs";

type CachedSecret = { fingerprint: string; value: string };
const secretCache = new Map<string, CachedSecret>();

function readWhenChanged(path: string, cacheKey: string, decode: (content: string) => string): string {
  const stat = fs.statSync(path, { bigint: true });
  const fingerprint = `${stat.dev}:${stat.ino}:${stat.size}:${stat.mtimeNs}`;
  const cached = secretCache.get(cacheKey);
  if (cached?.fingerprint === fingerprint) return cached.value;

  const value = decode(fs.readFileSync(path, "utf8"));
  secretCache.set(cacheKey, { fingerprint, value });
  return value;
}

function decodeEnvValue(raw: string): string {
  const value = raw.trim();
  if (value.length >= 2 && value.startsWith("'") && value.endsWith("'")) {
    return value.slice(1, -1);
  }
  if (value.length >= 2 && value.startsWith('"') && value.endsWith('"')) {
    return value
      .slice(1, -1)
      .replace(/\\n/g, "\n")
      .replace(/\\r/g, "\r")
      .replace(/\\"/g, '"')
      .replace(/\\\\/g, "\\");
  }
  return value.replace(/\s+#.*$/, "").trim();
}

function readNamedEnvValue(path: string, name: string): string {
  if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(name)) {
    throw new Error("Configured workstation secret env name is invalid");
  }

  return readWhenChanged(path, `env:${path}:${name}`, (content) => {
    const assignment = new RegExp(`^(?:export\\s+)?${name}\\s*=\\s*(.*)$`);
    for (const line of content.split(/\r?\n/)) {
      const match = line.match(assignment);
      if (match) return decodeEnvValue(match[1]);
    }
    return "";
  });
}

/** Resolve the current upstream key at request time so rotation needs no UI restart. */
export function getServerApiKey(): string {
  const secretFile = (process.env.VLLM_HUST_API_KEY_FILE || "").trim();
  if (secretFile) {
    const value = readWhenChanged(
      secretFile,
      `file:${secretFile}`,
      (content) => content.split(/\r?\n/, 1)[0].trim()
    );
    if (!value) throw new Error("Configured workstation API key file is empty");
    return value;
  }

  const envFile = (process.env.VLLM_HUST_API_KEY_ENV_FILE || "").trim();
  if (envFile) {
    const name = (process.env.VLLM_HUST_API_KEY_ENV_NAME || "VLLM_HUST_API_KEY").trim();
    const value = readNamedEnvValue(envFile, name);
    if (!value) throw new Error("Configured workstation API key env source is empty");
    return value;
  }

  return (process.env.VLLM_HUST_API_KEY || "not-required").trim() || "not-required";
}

import { execFile } from "node:child_process";

export const runtime = "nodejs";
export const revalidate = 0;

const PYTHON_BIN = process.env.PYTHON_BIN || "python3";

/**
 * Resolve package version from pip metadata via Python subprocess.
 * Returns the version string or "unknown" on failure.
 */
function getPipVersion(pkgName: string): Promise<string> {
  return new Promise((resolve) => {
    execFile(
      PYTHON_BIN,
      ["-c", `from importlib.metadata import version; print(version('${pkgName}'))`],
      { timeout: 5000 },
      (err, stdout) => {
        if (err) {
          resolve("unknown");
        } else {
          resolve(stdout.trim() || "unknown");
        }
      },
    );
  });
}

async function getStackVersions(): Promise<{
  vllmHust: string;
  vllmAscendHust: string;
}> {
  const [vllmHust, vllmAscendHust] = await Promise.all([
    getPipVersion("vllm-hust"),
    getPipVersion("vllm-ascend-hust"),
  ]);

  return { vllmHust, vllmAscendHust };
}

export async function GET() {
  return Response.json(await getStackVersions());
}

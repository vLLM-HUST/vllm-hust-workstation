const frameAncestors = (process.env.APP_FRAME_ANCESTORS || "").trim();

/** @type {import('next').NextConfig} */
const nextConfig = {
  output: "standalone",
  outputFileTracingIncludes: {
    "/api/mods": ["./scripts/mod_worker.py"],
    "/api/mod-runtime": ["./scripts/mod_runtime_worker.py", "./scripts/mod_worker.py", "./scripts/mod_artifact_io.py", "./scripts/instance_control_client.py", "./deploy/instance-control-source-lock.json", "./deps/vllm-hust-dev-hub/scripts/instance_control_entry.py", "./deps/vllm-hust-dev-hub/scripts/instance_control/*.py", "./deps/vllm-hust-dev-hub/config/instance-control-contract.json", "./scripts/inspect_mod_runtime.py", "./scripts/mod_launch_inventory.py", "./scripts/mod_compatibility.py", "./scripts/prepare_mod_image.py", "./scripts/build_mod_observer.py", "./scripts/runtime/workstation_mod_runtime/*.py"],
  },
  // Runtime state is read from explicit deployment paths, never bundled into
  // the next release (which would recursively copy prior releases and secrets).
  outputFileTracingExcludes: {
    "*": ["./.workstation-deploy/**/*", "./.planning/**/*", "./output/playwright/**/*", "./.git/**/*", "./.env*"],
  },
  env: {
    APP_BRAND_NAME: process.env.APP_BRAND_NAME,
    APP_BRAND_LOGO: process.env.APP_BRAND_LOGO,
    APP_ACCENT_COLOR: process.env.APP_ACCENT_COLOR,
  },
  async headers() {
    if (!frameAncestors) {
      return [];
    }

    return [
      {
        source: "/:path*",
        headers: [
          {
            key: "Content-Security-Policy",
            value: `frame-ancestors 'self' ${frameAncestors};`,
          },
        ],
      },
    ];
  },
};

export default nextConfig;

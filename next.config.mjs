const frameAncestors = (process.env.APP_FRAME_ANCESTORS || "").trim();

/** @type {import('next').NextConfig} */
const nextConfig = {
  output: "standalone",
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

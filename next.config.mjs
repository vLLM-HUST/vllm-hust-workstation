const frameAncestors = (process.env.APP_FRAME_ANCESTORS || "").trim();

/** @type {import('next').NextConfig} */
const nextConfig = {
  output: "standalone",
  env: {
    VLLM_HUST_BASE_URL: process.env.VLLM_HUST_BASE_URL,
    VLLM_HUST_API_KEY: process.env.VLLM_HUST_API_KEY,
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

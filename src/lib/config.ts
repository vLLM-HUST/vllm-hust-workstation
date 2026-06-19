import type { AppConfig } from "@/types";

export const DEFAULT_MODEL_ID = "Qwen3-32B";

export function getAppConfig(): AppConfig {
  return {
    brandName: process.env.APP_BRAND_NAME || "vLLM-HUST 工作站",
    brandLogo: process.env.APP_BRAND_LOGO || null,
    accentColor: process.env.APP_ACCENT_COLOR || "#6366f1",
    baseUrl: process.env.VLLM_HUST_BASE_URL || "http://localhost:8080",
    defaultModel: process.env.DEFAULT_MODEL || DEFAULT_MODEL_ID,
    searchEnabled: process.env.SEARCH_ENABLED !== "false",
  };
}

export const SERVER_CONFIG = {
  baseUrl: process.env.VLLM_HUST_BASE_URL || "http://localhost:8080",
  apiKey: process.env.VLLM_HUST_API_KEY || "not-required",
};

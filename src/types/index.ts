export interface Message {
  id: string;
  role: "user" | "assistant" | "system";
  content: string;
  timestamp: number;
  tokensUsed?: number;
  latencyMs?: number;
}

export interface SearchResult {
  title: string;
  url: string;
  snippet: string;
}

export interface EvoScientistSearchStatus {
  enabled: boolean;
  attempted: boolean;
  mode: "disabled" | "workstation-context";
  query: string;
  results: SearchResult[];
}

export interface EvoScientistWorkspaceOption {
  id: string;
  name: string;
  path: string;
  description: string;
}

export interface EvoScientistSessionSummary {
  threadId: string;
  updatedAt: string | null;
  workspaceDir: string;
  model: string;
  messageCount: number;
  preview: string;
}

export interface EvoScientistThreadMetadata {
  workspaceDir: string;
  model: string;
  updatedAt: string | null;
}

export interface EvoScientistConfigEntry {
  key: string;
  value: string;
  sensitive: boolean;
  hasValue: boolean;
}

export interface EvoScientistConfigSnapshot {
  path: string;
  entries: EvoScientistConfigEntry[];
}

export interface EvoScientistSkillEntry {
  name: string;
  description: string;
  path: string;
  source: "user" | "system";
  tags: string[];
}

export interface EvoScientistMcpServer {
  name: string;
  transport: string;
  command?: string;
  args?: string[];
  url?: string;
  tools: string[];
  exposeTo: string[];
  envKeys: string[];
  headerKeys: string[];
}

export interface EvoScientistChannelWorkerStatus {
  running: boolean;
  pid: number | null;
  healthPort: number | null;
  healthUrl: string | null;
  startedAt: string | null;
  workspaceDir: string | null;
  model: string | null;
  configuredChannels: string[];
  runtime?: Record<string, unknown> | null;
  logFile?: string | null;
}

export interface EvoScientistChannelsSnapshot {
  available: string[];
  configured: string[];
  sendThinking: boolean;
  sharedWebhookPort: number;
  worker: EvoScientistChannelWorkerStatus;
}

export interface EvoScientistAdminSnapshot {
  config: EvoScientistConfigSnapshot;
  skills: EvoScientistSkillEntry[];
  mcpServers: EvoScientistMcpServer[];
  channels: EvoScientistChannelsSnapshot;
}

export interface ModelHubDownloadState {
  status: "idle" | "downloading" | "done" | "error" | "cancelled";
  pct: number;
  speedMbps?: number;
  downloadedBytes?: number;
  totalBytes?: number;
  currentFile?: string;
  error?: string;
}

export interface ModelHubModel {
  id: string;
  name: string;
  repoId: string;
  params: string;
  sizeGb: number;
  vramGb: number;
  description: string;
  tags: string[];
  color: string;
  requiresAuth?: boolean;
  installed?: boolean;
  active?: boolean;
  download?: ModelHubDownloadState;
}

export interface MetricsSnapshot {
  tokensPerSecond: number;
  pendingRequests: number;
  gpuUtilPct: number;
  gpuMemUsedGb: number;
  gpuMemTotalGb: number;
  uptimeSeconds: number;
  totalRequestsServed: number;
  avgLatencyMs: number;
  modelName: string;
  backendType: string;
  gatewayAvailable?: boolean;
}

export interface AppConfig {
  brandName: string;
  brandLogo: string | null;
  accentColor: string;
  baseUrl: string;
  defaultModel: string;
  searchEnabled: boolean;
}

export interface EvoScientistIntegrationStatus {
  provider: "custom-openai";
  baseUrl: string;
  apiKeyMode: "custom" | "inherited" | "not-required";
  configuredModel: string;
  resolvedModel: string | null;
  workdir: string;
  pythonBin: string | null;
  commandMode: "binary" | "python-module" | "unavailable";
  searchEnabled: boolean;
  searchMode: "disabled" | "workstation-context";
  backendReachable: boolean;
  ready: boolean;
}

export interface LocalServiceStatus {
  baseUrl: string;
  isLocalTarget: boolean;
  gatewayReachable: boolean;
  inferenceReady: boolean;
  currentModel: string | null;
  desiredModel: string;
  recommendedAction: "none" | "start" | "restart" | "external";
  backendLogFile: string;
  frontendLogFile: string;
  evoScientist: EvoScientistIntegrationStatus;
}

"use client";

import { useEffect, useMemo, useState } from "react";
import clsx from "clsx";
import {
  Cable,
  Check,
  Cpu,
  LoaderCircle,
  Plug,
  RefreshCcw,
  Save,
  Settings2,
  Shield,
  Trash2,
  Wrench,
} from "lucide-react";
import type {
  EvoScientistAdminSnapshot,
  EvoScientistConfigEntry,
  EvoScientistMcpServer,
  EvoScientistSkillEntry,
} from "@/types";

type ControlPlaneProps = {
  open: boolean;
  currentModel: string;
  accentColor: string;
  selectedWorkspacePath: string;
};

function parseConfigEntryValue(entry: EvoScientistConfigEntry): unknown {
  if (entry.sensitive) {
    return entry.hasValue;
  }

  try {
    return JSON.parse(entry.value);
  } catch {
    return entry.value;
  }
}

function asString(value: unknown): string {
  return typeof value === "string" ? value : value == null ? "" : String(value);
}

function asBoolean(value: unknown, fallback = false): boolean {
  return typeof value === "boolean" ? value : fallback;
}

function asNumber(value: unknown, fallback = 0): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

export default function EvoScientistControlPlane({
  open,
  currentModel,
  accentColor,
  selectedWorkspacePath,
}: ControlPlaneProps) {
  const [snapshot, setSnapshot] = useState<EvoScientistAdminSnapshot | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [actionBusy, setActionBusy] = useState<string | null>(null);

  const [autoApprove, setAutoApprove] = useState(false);
  const [enableAskUser, setEnableAskUser] = useState(true);
  const [shellAllowList, setShellAllowList] = useState("");
  const [defaultWorkdir, setDefaultWorkdir] = useState("");

  const [skillSource, setSkillSource] = useState("");
  const [mcpName, setMcpName] = useState("");
  const [mcpTransport, setMcpTransport] = useState("stdio");
  const [mcpTarget, setMcpTarget] = useState("");
  const [mcpArgs, setMcpArgs] = useState("");
  const [mcpTools, setMcpTools] = useState("");
  const [mcpExposeTo, setMcpExposeTo] = useState("main");
  const [channelSelection, setChannelSelection] = useState<string[]>([]);
  const [channelSendThinking, setChannelSendThinking] = useState(true);
  const [sharedWebhookPort, setSharedWebhookPort] = useState(0);

  const configMap = useMemo(() => {
    const entries = new Map<string, unknown>();
    for (const entry of snapshot?.config.entries || []) {
      entries.set(entry.key, parseConfigEntryValue(entry));
    }
    return entries;
  }, [snapshot]);

  const sensitiveEntries = useMemo(
    () => (snapshot?.config.entries || []).filter((entry) => entry.sensitive),
    [snapshot]
  );
  const userSkills = useMemo(
    () => (snapshot?.skills || []).filter((item) => item.source === "user"),
    [snapshot]
  );
  const systemSkills = useMemo(
    () => (snapshot?.skills || []).filter((item) => item.source === "system"),
    [snapshot]
  );

  const loadSnapshot = async () => {
    setLoading(true);
    try {
      const query = selectedWorkspacePath ? `?workspaceDir=${encodeURIComponent(selectedWorkspacePath)}` : "";
      const response = await fetch(`/api/evoscientist/admin${query}`, { cache: "no-store" });
      if (!response.ok) {
        const payload = (await response.json().catch(() => null)) as { error?: string } | null;
        throw new Error(payload?.error || `HTTP ${response.status}`);
      }
      const payload = (await response.json()) as EvoScientistAdminSnapshot;
      setSnapshot(payload);
      setError("");
    } catch (loadError) {
      setError((loadError as Error)?.message || "加载 EvoScientist 控制台失败");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!open) {
      return;
    }
    void loadSnapshot();
  }, [open, selectedWorkspacePath]);

  useEffect(() => {
    if (!snapshot) {
      return;
    }
    setAutoApprove(asBoolean(configMap.get("auto_approve"), false));
    setEnableAskUser(asBoolean(configMap.get("enable_ask_user"), true));
    setShellAllowList(asString(configMap.get("shell_allow_list")));
    setDefaultWorkdir(asString(configMap.get("default_workdir")) || selectedWorkspacePath);
    setChannelSelection(snapshot.channels.configured);
    setChannelSendThinking(snapshot.channels.sendThinking);
    setSharedWebhookPort(snapshot.channels.sharedWebhookPort);
  }, [configMap, selectedWorkspacePath, snapshot]);

  const performAction = async (action: string, payload: Record<string, unknown>) => {
    setActionBusy(action);
    try {
      const response = await fetch("/api/evoscientist/admin", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, workspaceDir: selectedWorkspacePath, ...payload }),
      });
      const body = (await response.json().catch(() => null)) as EvoScientistAdminSnapshot | { error?: string } | null;
      if (!response.ok) {
        throw new Error((body as { error?: string } | null)?.error || `HTTP ${response.status}`);
      }
      setSnapshot(body as EvoScientistAdminSnapshot);
      setError("");
    } catch (actionError) {
      setError((actionError as Error)?.message || "EvoScientist 控制动作失败");
    } finally {
      setActionBusy(null);
    }
  };

  const toggleChannel = (channel: string) => {
    setChannelSelection((previous) =>
      previous.includes(channel) ? previous.filter((item) => item !== channel) : [...previous, channel]
    );
  };

  const saveConfig = async () => {
    await performAction("set-config-values", {
      values: {
        auto_approve: autoApprove,
        enable_ask_user: enableAskUser,
        shell_allow_list: shellAllowList,
        default_workdir: defaultWorkdir || selectedWorkspacePath,
      },
    });
  };

  const saveChannels = async () => {
    await performAction("channels-update", {
      channels: channelSelection,
      sendThinking: channelSendThinking,
      sharedWebhookPort,
    });
  };

  const startChannels = async () => {
    await performAction("channels-start", {
      channels: channelSelection,
      sendThinking: channelSendThinking,
      sharedWebhookPort,
      workspaceDir: selectedWorkspacePath,
      model: currentModel,
    });
  };

  const stopChannels = async () => {
    await performAction("channels-stop", {});
  };

  const upsertMcp = async () => {
    const target = mcpTarget.trim();
    if (!mcpName.trim() || !target) {
      setError("MCP 服务器名称和目标命令/URL 不能为空");
      return;
    }
    await performAction("mcp-upsert", {
      mcp: {
        name: mcpName.trim(),
        transport: mcpTransport,
        command: mcpTransport === "stdio" ? target : undefined,
        url: mcpTransport === "stdio" ? undefined : target,
        args: mcpTransport === "stdio" ? mcpArgs.split(/\s+/).filter(Boolean) : [],
        tools: mcpTools.split(",").map((item) => item.trim()).filter(Boolean),
        exposeTo: mcpExposeTo.split(",").map((item) => item.trim()).filter(Boolean),
      },
    });
    setMcpName("");
    setMcpTarget("");
    setMcpArgs("");
    setMcpTools("");
    setMcpExposeTo("main");
  };

  const worker = snapshot?.channels.worker;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="text-white text-sm font-medium">EvoScientist 控制台</p>
          <p className="text-white/45 text-xs mt-1">管理配置、skills、MCP 和消息通道常驻 worker</p>
        </div>
        <button
          type="button"
          onClick={() => void loadSnapshot()}
          disabled={loading}
          className="rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-white/70 text-sm disabled:opacity-50"
        >
          <span className="inline-flex items-center gap-2">
            {loading ? <LoaderCircle size={14} className="animate-spin" /> : <RefreshCcw size={14} />}
            刷新
          </span>
        </button>
      </div>

      {error ? <div className="rounded-xl border border-red-400/20 bg-red-400/10 p-3 text-sm text-red-200 whitespace-pre-wrap">{error}</div> : null}

      <div className="grid gap-4 xl:grid-cols-2">
        <section className="rounded-2xl border border-white/10 bg-white/5 p-4 space-y-4">
          <div className="flex items-center gap-2 text-white/80 text-sm font-medium">
            <Settings2 size={16} className="text-cyan-200" />
            配置与安全边界
          </div>
          <div className="grid gap-3 md:grid-cols-2">
            <label className="rounded-xl border border-white/10 bg-slate-950/55 px-3 py-3 text-sm text-white/80 flex items-center justify-between gap-3">
              自动审批 execute
              <input type="checkbox" checked={autoApprove} onChange={(event) => setAutoApprove(event.target.checked)} />
            </label>
            <label className="rounded-xl border border-white/10 bg-slate-950/55 px-3 py-3 text-sm text-white/80 flex items-center justify-between gap-3">
              启用 ask_user
              <input type="checkbox" checked={enableAskUser} onChange={(event) => setEnableAskUser(event.target.checked)} />
            </label>
          </div>
          <div className="space-y-2">
            <label className="block text-xs text-white/45 uppercase tracking-wider">Shell Allow List</label>
            <input
              value={shellAllowList}
              onChange={(event) => setShellAllowList(event.target.value)}
              className="w-full rounded-lg border border-white/10 bg-slate-950/65 px-3 py-2 text-sm text-white"
              placeholder="python,pip,pytest,ruff,git"
            />
          </div>
          <div className="space-y-2">
            <label className="block text-xs text-white/45 uppercase tracking-wider">Default Workdir</label>
            <input
              value={defaultWorkdir}
              onChange={(event) => setDefaultWorkdir(event.target.value)}
              className="w-full rounded-lg border border-white/10 bg-slate-950/65 px-3 py-2 text-sm text-white"
            />
          </div>
          <button
            type="button"
            onClick={() => void saveConfig()}
            disabled={actionBusy !== null}
            className="rounded-xl px-4 py-2 text-sm text-white disabled:opacity-50"
            style={{ background: accentColor }}
          >
            <span className="inline-flex items-center gap-2">
              {actionBusy === "set-config-values" ? <LoaderCircle size={14} className="animate-spin" /> : <Save size={14} />}
              保存研究配置
            </span>
          </button>

          <div className="rounded-xl border border-white/10 bg-slate-950/55 p-4 space-y-3">
            <div className="flex items-center gap-2 text-white/75 text-sm font-medium">
              <Shield size={15} className="text-amber-200" />
              敏感配置状态
            </div>
            <div className="grid gap-2 sm:grid-cols-2">
              {sensitiveEntries.map((entry) => (
                <div key={entry.key} className="rounded-lg bg-white/5 px-3 py-2 text-sm text-white/75 flex items-center justify-between gap-3">
                  <span>{entry.key}</span>
                  <span className={clsx("text-xs", entry.hasValue ? "text-emerald-200" : "text-white/30")}>
                    {entry.hasValue ? "已配置" : "未配置"}
                  </span>
                </div>
              ))}
            </div>
            <p className="text-xs text-white/35 break-all">配置文件：{snapshot?.config.path || "加载中"}</p>
          </div>
        </section>

        <section className="rounded-2xl border border-white/10 bg-white/5 p-4 space-y-4">
          <div className="flex items-center gap-2 text-white/80 text-sm font-medium">
            <Cable size={16} className="text-emerald-200" />
            Channels Worker
          </div>
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {(snapshot?.channels.available || []).map((channel) => {
              const selected = channelSelection.includes(channel);
              return (
                <button
                  key={channel}
                  type="button"
                  onClick={() => toggleChannel(channel)}
                  className={clsx(
                    "rounded-lg border px-3 py-2 text-sm text-left",
                    selected ? "border-cyan-300/30 bg-cyan-300/10 text-cyan-100" : "border-white/10 bg-slate-950/55 text-white/65"
                  )}
                >
                  {channel}
                </button>
              );
            })}
          </div>
          <div className="grid gap-3 md:grid-cols-2">
            <label className="rounded-xl border border-white/10 bg-slate-950/55 px-3 py-3 text-sm text-white/80 flex items-center justify-between gap-3">
              转发 thinking
              <input type="checkbox" checked={channelSendThinking} onChange={(event) => setChannelSendThinking(event.target.checked)} />
            </label>
            <label className="space-y-2 text-sm text-white/80">
              <span className="text-xs text-white/45 uppercase tracking-wider block">Shared Webhook Port</span>
              <input
                type="number"
                value={sharedWebhookPort}
                onChange={(event) => setSharedWebhookPort(Number(event.target.value || 0))}
                className="w-full rounded-lg border border-white/10 bg-slate-950/65 px-3 py-2 text-sm text-white"
              />
            </label>
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => void saveChannels()}
              disabled={actionBusy !== null}
              className="rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm text-white/75 disabled:opacity-50"
            >
              保存通道配置
            </button>
            <button
              type="button"
              onClick={() => void startChannels()}
              disabled={actionBusy !== null || channelSelection.length === 0}
              className="rounded-lg border border-emerald-300/25 bg-emerald-400/15 px-3 py-2 text-sm text-emerald-100 disabled:opacity-50"
            >
              启动 Worker
            </button>
            <button
              type="button"
              onClick={() => void stopChannels()}
              disabled={actionBusy !== null || !worker?.running}
              className="rounded-lg border border-red-300/20 bg-red-400/10 px-3 py-2 text-sm text-red-200 disabled:opacity-50"
            >
              停止 Worker
            </button>
          </div>
          <div className="rounded-xl border border-white/10 bg-slate-950/55 p-4 text-sm text-white/75 space-y-2">
            <p>状态：{worker?.running ? "运行中" : "未运行"}</p>
            <p>PID：{worker?.pid || "-"}</p>
            <p>工作区：{worker?.workspaceDir || selectedWorkspacePath || "-"}</p>
            <p>模型：{worker?.model || currentModel}</p>
            <p>健康检查：{worker?.healthUrl || "-"}</p>
            <p>日志：{worker?.logFile || "-"}</p>
            {worker?.runtime ? (
              <pre className="mt-3 rounded-lg bg-black/20 p-3 text-xs text-white/55 overflow-auto">{JSON.stringify(worker.runtime, null, 2)}</pre>
            ) : null}
          </div>
        </section>

        <section className="rounded-2xl border border-white/10 bg-white/5 p-4 space-y-4">
          <div className="flex items-center gap-2 text-white/80 text-sm font-medium">
            <Cpu size={16} className="text-violet-200" />
            Skills
          </div>
          <div className="flex gap-2">
            <input
              value={skillSource}
              onChange={(event) => setSkillSource(event.target.value)}
              className="flex-1 rounded-lg border border-white/10 bg-slate-950/65 px-3 py-2 text-sm text-white"
              placeholder="本地路径、GitHub URL 或 user/repo@skill"
            />
            <button
              type="button"
              onClick={() => void performAction("skills-install", { source: skillSource.trim() })}
              disabled={actionBusy !== null || !skillSource.trim()}
              className="rounded-lg border border-cyan-300/25 bg-cyan-300/15 px-3 py-2 text-sm text-cyan-100 disabled:opacity-50"
            >
              安装
            </button>
          </div>
          <div className="grid gap-3 lg:grid-cols-2">
            <div className="space-y-2">
              <p className="text-xs text-white/45 uppercase tracking-wider">User Skills</p>
              {userSkills.map((skill) => (
                <SkillCard key={`${skill.source}-${skill.name}`} skill={skill} removable onRemove={() => void performAction("skills-uninstall", { name: skill.name })} />
              ))}
              {userSkills.length === 0 ? <p className="text-sm text-white/35">暂无用户技能。</p> : null}
            </div>
            <div className="space-y-2">
              <p className="text-xs text-white/45 uppercase tracking-wider">Built-in Skills</p>
              {systemSkills.map((skill) => (
                <SkillCard key={`${skill.source}-${skill.name}`} skill={skill} />
              ))}
            </div>
          </div>
        </section>

        <section className="rounded-2xl border border-white/10 bg-white/5 p-4 space-y-4">
          <div className="flex items-center gap-2 text-white/80 text-sm font-medium">
            <Plug size={16} className="text-amber-200" />
            MCP Servers
          </div>
          <div className="grid gap-3 md:grid-cols-2">
            <input value={mcpName} onChange={(event) => setMcpName(event.target.value)} className="rounded-lg border border-white/10 bg-slate-950/65 px-3 py-2 text-sm text-white" placeholder="server name" />
            <select value={mcpTransport} onChange={(event) => setMcpTransport(event.target.value)} className="rounded-lg border border-white/10 bg-slate-950/65 px-3 py-2 text-sm text-white">
              <option value="stdio">stdio</option>
              <option value="http">http</option>
              <option value="websocket">websocket</option>
            </select>
            <input value={mcpTarget} onChange={(event) => setMcpTarget(event.target.value)} className="md:col-span-2 rounded-lg border border-white/10 bg-slate-950/65 px-3 py-2 text-sm text-white" placeholder={mcpTransport === "stdio" ? "command path" : "server url"} />
            <input value={mcpArgs} onChange={(event) => setMcpArgs(event.target.value)} className="rounded-lg border border-white/10 bg-slate-950/65 px-3 py-2 text-sm text-white" placeholder="args, only for stdio" />
            <input value={mcpTools} onChange={(event) => setMcpTools(event.target.value)} className="rounded-lg border border-white/10 bg-slate-950/65 px-3 py-2 text-sm text-white" placeholder="tools csv (optional)" />
            <input value={mcpExposeTo} onChange={(event) => setMcpExposeTo(event.target.value)} className="md:col-span-2 rounded-lg border border-white/10 bg-slate-950/65 px-3 py-2 text-sm text-white" placeholder="main,research-agent" />
          </div>
          <button type="button" onClick={() => void upsertMcp()} disabled={actionBusy !== null} className="rounded-lg border border-amber-300/25 bg-amber-300/15 px-3 py-2 text-sm text-amber-100 disabled:opacity-50">
            添加 / 更新 MCP
          </button>
          <div className="space-y-3">
            {(snapshot?.mcpServers || []).map((server) => (
              <McpCard key={server.name} server={server} onRemove={() => void performAction("mcp-remove", { name: server.name })} />
            ))}
            {(snapshot?.mcpServers || []).length === 0 ? <p className="text-sm text-white/35">暂无 MCP 服务器配置。</p> : null}
          </div>
        </section>
      </div>
    </div>
  );
}

function SkillCard({ skill, removable = false, onRemove }: { skill: EvoScientistSkillEntry; removable?: boolean; onRemove?: () => void }) {
  return (
    <div className="rounded-xl border border-white/10 bg-slate-950/55 p-3 space-y-2">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-sm text-white/85 font-medium">{skill.name}</p>
          <p className="text-xs text-white/40 mt-1 leading-5">{skill.description}</p>
        </div>
        {removable ? (
          <button type="button" onClick={onRemove} className="text-white/35 hover:text-red-200">
            <Trash2 size={14} />
          </button>
        ) : <Check size={14} className="text-emerald-200" />}
      </div>
      <p className="text-[11px] text-white/35 break-all">{skill.path}</p>
      {skill.tags.length ? <p className="text-[11px] text-cyan-100/70">{skill.tags.join(" · ")}</p> : null}
    </div>
  );
}

function McpCard({ server, onRemove }: { server: EvoScientistMcpServer; onRemove: () => void }) {
  return (
    <div className="rounded-xl border border-white/10 bg-slate-950/55 p-4 space-y-2">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-sm text-white/85 font-medium">{server.name}</p>
          <p className="text-xs text-white/40 mt-1">{server.transport}</p>
        </div>
        <button type="button" onClick={onRemove} className="text-white/35 hover:text-red-200">
          <Trash2 size={14} />
        </button>
      </div>
      {server.command ? <p className="text-xs text-white/55 break-all">command: {server.command} {(server.args || []).join(" ")}</p> : null}
      {server.url ? <p className="text-xs text-white/55 break-all">url: {server.url}</p> : null}
      <div className="flex flex-wrap gap-2 text-[11px] text-white/35">
        <span>tools: {(server.tools || []).length ? server.tools.join(", ") : "all"}</span>
        <span>exposeTo: {(server.exposeTo || []).join(", ")}</span>
        {server.envKeys.length ? <span>env: {server.envKeys.join(", ")}</span> : null}
        {server.headerKeys.length ? <span>headers: {server.headerKeys.join(", ")}</span> : null}
      </div>
    </div>
  );
}
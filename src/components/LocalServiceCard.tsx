"use client";

import { useCallback, useEffect, useState } from "react";
import { Play, RotateCcw, Square, Wrench } from "lucide-react";
import type { LocalServiceStatus } from "@/types";

const POLL_INTERVAL = 5000;

type ActionName = "ensure-backend" | "restart-backend" | "stop-local";

async function parseJsonSafe<T>(response: Response): Promise<T | null> {
  try {
    return (await response.json()) as T;
  } catch {
    return null;
  }
}

export default function LocalServiceCard() {
  const [status, setStatus] = useState<LocalServiceStatus | null>(null);
  const [pendingAction, setPendingAction] = useState<ActionName | null>(null);
  const [message, setMessage] = useState<string>("");

  const loadStatus = useCallback(async () => {
    const response = await fetch("/api/local-service", { cache: "no-store" });
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }

    const payload = await parseJsonSafe<LocalServiceStatus>(response);
    if (!payload) {
      throw new Error("status parse failed");
    }
    setStatus(payload);
  }, []);

  useEffect(() => {
    loadStatus().catch((error: unknown) => {
      setMessage((error as Error)?.message || "无法获取本地服务状态");
    });

    const timer = window.setInterval(() => {
      loadStatus().catch(() => {
        // keep last known status during transient failures
      });
    }, POLL_INTERVAL);

    return () => window.clearInterval(timer);
  }, [loadStatus]);

  const runAction = useCallback(
    async (action: ActionName) => {
      setPendingAction(action);
      setMessage("");

      try {
        const response = await fetch("/api/local-service", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action }),
        });
        const payload = await parseJsonSafe<{ error?: string; message?: string }>(response);
        if (!response.ok) {
          throw new Error(payload?.error || `HTTP ${response.status}`);
        }
        setMessage(payload?.message || "命令已发出");
        await loadStatus();
      } catch (error: unknown) {
        setMessage((error as Error)?.message || "命令执行失败");
      } finally {
        setPendingAction(null);
      }
    },
    [loadStatus]
  );

  const statusTone = !status
    ? "text-white/60"
    : status.inferenceReady
      ? "text-emerald-300"
      : status.gatewayReachable
        ? "text-amber-300"
        : "text-red-300";
  const statusText = !status
    ? "正在探测本地服务…"
    : !status.isLocalTarget
      ? "当前连接远端服务，页面不控制远端进程"
      : status.inferenceReady
        ? "本地推理服务可用"
        : status.gatewayReachable
          ? "gateway 已响应，但 engine 未就绪"
          : "本地后端未就绪";
  const mismatchHint =
    status?.inferenceReady &&
    status.currentModel &&
    status.desiredModel &&
    status.currentModel !== status.desiredModel
      ? "当前服务已运行其他模型；“一键拉起 / 修复后端”会优先复用当前健康服务，如需按配置模型切换请点击“重启本地后端”。"
      : null;
  const evoStatus = status?.evoScientist;
  const evoStatusTone = !evoStatus
    ? "text-white/55"
    : evoStatus.ready && status?.inferenceReady
      ? "text-emerald-200"
      : evoStatus.commandMode === "unavailable"
        ? "text-red-200"
        : "text-amber-200";

  return (
    <div className="bg-white/5 rounded-xl p-4 border border-white/8 space-y-3">
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="text-white/55 text-xs font-medium uppercase tracking-wider">
            演示控制台
          </p>
          <p className={`text-sm mt-1 ${statusTone}`}>{statusText}</p>
        </div>
        <div className="p-2 rounded-lg bg-cyan-400/10 text-cyan-200">
          <Wrench size={16} />
        </div>
      </div>

      <div className="text-xs text-white/45 space-y-1">
        <p>目标地址: {status?.baseUrl ?? "加载中"}</p>
        <p>期望模型: {status?.desiredModel ?? "加载中"}</p>
        <p>当前模型: {status?.currentModel ?? "未探测到"}</p>
      </div>

      <div className="rounded-xl border border-white/10 bg-white/5 p-3 text-xs leading-5 space-y-1">
        <p className={`font-medium ${evoStatusTone}`}>
          EvoScientist: {!evoStatus ? "加载中" : evoStatus.ready && status?.inferenceReady ? "已绑定本地后端" : "链路待就绪"}
        </p>
        <p className="text-white/55">后端绑定: {evoStatus?.baseUrl ?? "加载中"}</p>
        <p className="text-white/55">Evo 模型: {evoStatus?.resolvedModel ?? evoStatus?.configuredModel ?? "待探测"}</p>
        <p className="text-white/55">启动方式: {evoStatus?.commandMode === "binary" ? "EvoSci 可执行文件" : evoStatus?.commandMode === "python-module" ? "Python 模块回退" : "未找到可用命令"}</p>
        <p className="text-white/55">搜索增强: {evoStatus?.searchEnabled ? "已启用，复用 workstation 联网搜索" : "已关闭"}</p>
      </div>

      {message ? <p className="text-xs text-cyan-200/90 leading-5">{message}</p> : null}
  {mismatchHint ? <p className="text-xs text-amber-200/90 leading-5">{mismatchHint}</p> : null}

      <div className="grid grid-cols-1 gap-2">
        <button
          type="button"
          onClick={() => runAction("ensure-backend")}
          disabled={pendingAction !== null || status?.isLocalTarget === false}
          className="inline-flex items-center justify-center gap-2 rounded-lg px-3 py-2 text-sm bg-emerald-400/15 text-emerald-100 border border-emerald-300/20 hover:bg-emerald-400/25 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
        >
          <Play size={14} />
          一键拉起 / 修复后端
        </button>
        <button
          type="button"
          onClick={() => runAction("restart-backend")}
          disabled={pendingAction !== null || status?.isLocalTarget === false}
          className="inline-flex items-center justify-center gap-2 rounded-lg px-3 py-2 text-sm bg-amber-400/15 text-amber-100 border border-amber-300/20 hover:bg-amber-400/25 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
        >
          <RotateCcw size={14} />
          重启本地后端
        </button>
        <button
          type="button"
          onClick={() => runAction("stop-local")}
          disabled={pendingAction !== null || status?.isLocalTarget === false}
          className="inline-flex items-center justify-center gap-2 rounded-lg px-3 py-2 text-sm bg-white/8 text-white/75 border border-white/10 hover:bg-white/12 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
        >
          <Square size={14} />
          停止本地演示栈
        </button>
      </div>

      <p className="text-[11px] text-white/30 leading-5">
        后端日志: {status?.backendLogFile ?? "加载中"}
      </p>
    </div>
  );
}
"use client";

import { useEffect, useMemo, useState, type ChangeEvent, type FormEvent } from "react";
import clsx from "clsx";
import {
  Bot,
  ClipboardList,
  Clock3,
  FolderTree,
  History,
  LoaderCircle,
  MessageSquareReply,
  RefreshCcw,
  Search,
  ShieldAlert,
  Wrench,
} from "lucide-react";
import EvoScientistControlPlane from "@/components/EvoScientistControlPlane";
import type {
  EvoScientistSearchStatus,
  EvoScientistSessionSummary,
  EvoScientistWorkspaceOption,
  LocalServiceStatus,
} from "@/types";

type TodoItem = {
  id?: string;
  content?: string;
  title?: string;
  task?: string;
  text?: string;
  status?: string;
};

type ActivityRecord = {
  id: string;
  phase: "call" | "result";
  name: string;
  args?: Record<string, unknown>;
  content?: string;
  success?: boolean;
};

type SubagentState = {
  name: string;
  description: string;
  active: boolean;
  latestText: string;
  activities: ActivityRecord[];
};

type InterruptActionRequest = {
  name: string;
  args?: Record<string, unknown>;
};

type PendingInterrupt = {
  interruptId: string;
  actionRequests: InterruptActionRequest[];
  reviewConfigs: unknown[];
};

type AskUserQuestion = {
  question: string;
  type: "text" | "multiple_choice";
  choices?: Array<{ value: string }>;
  required?: boolean;
};

type PendingAskUser = {
  interruptId: string;
  toolCallId: string;
  questions: AskUserQuestion[];
};

type ResearchRun = {
  id: string;
  prompt: string;
  status: "running" | "interrupted" | "completed" | "failed";
  threadId: string | null;
  workspaceDir: string | null;
  startedAt: number;
  durationMs?: number;
  response: string;
  thinking: string;
  summarization: string;
  error?: string;
  integration?: LocalServiceStatus["evoScientist"];
  search?: EvoScientistSearchStatus;
  todos: TodoItem[];
  subagents: SubagentState[];
  coordinatorActivities: ActivityRecord[];
  inputTokens: number;
  outputTokens: number;
  pendingInterrupt?: PendingInterrupt;
  pendingAskUser?: PendingAskUser;
};

type EvoStreamEvent = {
  type: string;
  [key: string]: unknown;
};

type EvoScientistContextPayload = {
  selectedWorkspacePath: string;
  workspaces: EvoScientistWorkspaceOption[];
  sessions: EvoScientistSessionSummary[];
};

interface AgentLabModalProps {
  open: boolean;
  currentModel: string;
  accentColor: string;
  onClose: () => void;
}

function summarizeJson(value: unknown, maxChars = 220): string {
  if (value == null) {
    return "";
  }

  try {
    const text = JSON.stringify(value);
    return text.length > maxChars ? `${text.slice(0, maxChars)}...` : text;
  } catch {
    return String(value);
  }
}

function getTodoLabel(item: TodoItem): string {
  const raw = item.content || item.title || item.task || item.text || item.id || "未命名任务";
  return String(raw);
}

function normalizeTodoStatus(status?: string): "done" | "in_progress" | "todo" {
  const normalized = String(status || "todo").toLowerCase();
  if (["done", "completed", "complete"].includes(normalized)) {
    return "done";
  }
  if (["in_progress", "in-progress", "doing", "running"].includes(normalized)) {
    return "in_progress";
  }
  return "todo";
}

function parseSseBlock(block: string): EvoStreamEvent | null {
  const data = block
    .split("\n")
    .filter((line) => line.startsWith("data: "))
    .map((line) => line.slice(6))
    .join("\n")
    .trim();

  if (!data || data === "[DONE]") {
    return null;
  }

  try {
    return JSON.parse(data) as EvoStreamEvent;
  } catch {
    return null;
  }
}

function formatRelativeTime(value?: string | null): string {
  if (!value) {
    return "未知";
  }

  const timestamp = new Date(value).getTime();
  if (Number.isNaN(timestamp)) {
    return value;
  }

  const deltaSeconds = Math.max(0, Math.floor((Date.now() - timestamp) / 1000));
  if (deltaSeconds < 60) {
    return `${deltaSeconds}s 前`;
  }
  if (deltaSeconds < 3600) {
    return `${Math.floor(deltaSeconds / 60)}m 前`;
  }
  if (deltaSeconds < 86400) {
    return `${Math.floor(deltaSeconds / 3600)}h 前`;
  }
  return `${Math.floor(deltaSeconds / 86400)}d 前`;
}

function getWorkspaceName(path: string, workspaces: EvoScientistWorkspaceOption[]): string {
  return workspaces.find((item) => item.path === path)?.name || path.split("/").filter(Boolean).pop() || path;
}

function toInterruptActions(value: unknown): InterruptActionRequest[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.map((item, index) => {
    if (typeof item === "object" && item) {
      const payload = item as { name?: unknown; args?: unknown };
      return {
        name: typeof payload.name === "string" && payload.name ? payload.name : `action-${index + 1}`,
        args: typeof payload.args === "object" && payload.args ? (payload.args as Record<string, unknown>) : undefined,
      };
    }

    return {
      name: `action-${index + 1}`,
      args: undefined,
    };
  });
}

function toAskUserQuestions(value: unknown): AskUserQuestion[] {
  if (!Array.isArray(value)) {
    return [];
  }

  const questions: Array<AskUserQuestion | null> = value.map((item) => {
      if (typeof item !== "object" || !item) {
        return null;
      }
      const payload = item as {
        question?: unknown;
        type?: unknown;
        choices?: unknown;
        required?: unknown;
      };

      const question = typeof payload.question === "string" ? payload.question : "";
      const type = payload.type === "multiple_choice" ? "multiple_choice" : "text";
      const choices = Array.isArray(payload.choices)
        ? payload.choices
            .map((choice) => {
              if (typeof choice === "object" && choice && typeof (choice as { value?: unknown }).value === "string") {
                return { value: (choice as { value: string }).value };
              }
              return null;
            })
            .filter((choice): choice is { value: string } => Boolean(choice))
        : undefined;

      return {
        question,
        type,
        choices,
        required: payload.required === false ? false : true,
      };
    });

  return questions.filter((item): item is AskUserQuestion => Boolean(item && item.question));
}

function updateSubagent(
  subagents: SubagentState[],
  name: string,
  updater: (subagent: SubagentState) => SubagentState
): SubagentState[] {
  let index = subagents.findIndex((item) => item.name === name);

  if (index === -1 && name !== "sub-agent") {
    index = subagents.findIndex((item) => item.name === "sub-agent" && item.active);
  }

  if (index === -1 && name === "sub-agent") {
    const activeNamed = subagents.filter((item) => item.active && item.name !== "sub-agent");
    if (activeNamed.length === 1) {
      index = subagents.findIndex((item) => item.name === activeNamed[0].name);
    }
  }

  if (index === -1) {
    return [
      ...subagents,
      updater({
        name,
        description: "",
        active: true,
        latestText: "",
        activities: [],
      }),
    ];
  }

  const next = [...subagents];
  next[index] = updater({
    ...next[index],
    name: name === "sub-agent" ? next[index].name : name,
    activities: [...next[index].activities],
  });
  return next;
}

function applyStreamEvent(run: ResearchRun, event: EvoStreamEvent): ResearchRun {
  switch (event.type) {
    case "run_started":
      return {
        ...run,
        threadId: typeof event.threadId === "string" ? event.threadId : run.threadId,
        workspaceDir: typeof event.workspaceDir === "string" ? event.workspaceDir : run.workspaceDir,
        integration:
          typeof event.integration === "object" && event.integration
            ? (event.integration as LocalServiceStatus["evoScientist"])
            : run.integration,
        search:
          typeof event.search === "object" && event.search
            ? (event.search as EvoScientistSearchStatus)
            : run.search,
      };
    case "tool_call": {
      const args = typeof event.args === "object" && event.args ? (event.args as Record<string, unknown>) : undefined;
      const todos = event.name === "write_todos" && Array.isArray(args?.todos) ? (args.todos as TodoItem[]) : run.todos;
      return {
        ...run,
        todos,
        coordinatorActivities: [
          ...run.coordinatorActivities,
          {
            id: `${run.id}-coord-call-${run.coordinatorActivities.length}`,
            phase: "call",
            name: typeof event.name === "string" ? event.name : "unknown",
            args,
          },
        ],
      };
    }
    case "tool_result":
      return {
        ...run,
        coordinatorActivities: [
          ...run.coordinatorActivities,
          {
            id: `${run.id}-coord-result-${run.coordinatorActivities.length}`,
            phase: "result",
            name: typeof event.name === "string" ? event.name : "unknown",
            content: typeof event.content === "string" ? event.content : "",
            success: Boolean(event.success),
          },
        ],
      };
    case "subagent_start": {
      const name = typeof event.name === "string" ? event.name : "sub-agent";
      return {
        ...run,
        subagents: updateSubagent(run.subagents, name, (subagent) => ({
          ...subagent,
          active: true,
          description:
            typeof event.description === "string" && event.description.trim()
              ? event.description
              : subagent.description,
        })),
      };
    }
    case "subagent_tool_call": {
      const name = typeof event.subagent === "string" ? event.subagent : "sub-agent";
      const args = typeof event.args === "object" && event.args ? (event.args as Record<string, unknown>) : undefined;
      return {
        ...run,
        subagents: updateSubagent(run.subagents, name, (subagent) => ({
          ...subagent,
          activities: [
            ...subagent.activities,
            {
              id: `${run.id}-${name}-call-${subagent.activities.length}`,
              phase: "call",
              name: typeof event.name === "string" ? event.name : "unknown",
              args,
            },
          ],
        })),
      };
    }
    case "subagent_tool_result": {
      const name = typeof event.subagent === "string" ? event.subagent : "sub-agent";
      return {
        ...run,
        subagents: updateSubagent(run.subagents, name, (subagent) => ({
          ...subagent,
          activities: [
            ...subagent.activities,
            {
              id: `${run.id}-${name}-result-${subagent.activities.length}`,
              phase: "result",
              name: typeof event.name === "string" ? event.name : "unknown",
              content: typeof event.content === "string" ? event.content : "",
              success: Boolean(event.success),
            },
          ],
        })),
      };
    }
    case "subagent_text": {
      const name = typeof event.subagent === "string" ? event.subagent : "sub-agent";
      const nextText = typeof event.content === "string" ? event.content : "";
      return {
        ...run,
        subagents: updateSubagent(run.subagents, name, (subagent) => ({
          ...subagent,
          latestText: `${subagent.latestText}${nextText}`.slice(-600),
        })),
      };
    }
    case "subagent_end": {
      const name = typeof event.name === "string" ? event.name : "sub-agent";
      return {
        ...run,
        subagents: updateSubagent(run.subagents, name, (subagent) => ({
          ...subagent,
          active: false,
        })),
      };
    }
    case "text":
      return {
        ...run,
        response: `${run.response}${typeof event.content === "string" ? event.content : ""}`,
      };
    case "thinking":
      return {
        ...run,
        thinking: `${run.thinking}${typeof event.content === "string" ? event.content : ""}`.slice(-2000),
      };
    case "summarization":
      return {
        ...run,
        summarization: `${run.summarization}${typeof event.content === "string" ? event.content : ""}`.slice(-2000),
      };
    case "done":
      return {
        ...run,
        response:
          run.response
            ? run.response
            : typeof event.response === "string"
              ? event.response
              : run.response,
      };
    case "usage_stats":
      return {
        ...run,
        inputTokens: typeof event.input_tokens === "number" ? event.input_tokens : run.inputTokens,
        outputTokens: typeof event.output_tokens === "number" ? event.output_tokens : run.outputTokens,
      };
    case "interrupt":
      return {
        ...run,
        status: "interrupted",
        pendingInterrupt: {
          interruptId: typeof event.interrupt_id === "string" ? event.interrupt_id : "default",
          actionRequests: toInterruptActions(event.action_requests),
          reviewConfigs: Array.isArray(event.review_configs) ? event.review_configs : [],
        },
        pendingAskUser: undefined,
      };
    case "ask_user":
      return {
        ...run,
        status: "interrupted",
        pendingAskUser: {
          interruptId: typeof event.interrupt_id === "string" ? event.interrupt_id : "default",
          toolCallId: typeof event.tool_call_id === "string" ? event.tool_call_id : "",
          questions: toAskUserQuestions(event.questions),
        },
        pendingInterrupt: undefined,
      };
    case "error":
      return {
        ...run,
        error: typeof event.message === "string" ? event.message : run.error,
      };
    case "run_finished": {
      const rawStatus = event.status === "completed" || event.status === "interrupted" ? event.status : "failed";
      return {
        ...run,
        status: rawStatus,
        durationMs: typeof event.durationMs === "number" ? event.durationMs : run.durationMs,
        pendingInterrupt: rawStatus === "interrupted" ? run.pendingInterrupt : undefined,
        pendingAskUser: rawStatus === "interrupted" ? run.pendingAskUser : undefined,
        error:
          rawStatus === "failed" && !run.error
            ? event.timedOut
              ? "EvoScientist 执行超时。"
              : "EvoScientist 执行失败。"
            : run.error,
      };
    }
    default:
      return run;
  }
}

function StatusChip({ status }: { status: ResearchRun["status"] }) {
  const label =
    status === "running"
      ? "执行中"
      : status === "completed"
        ? "已完成"
        : status === "interrupted"
          ? "待确认"
          : "失败";
  const tone =
    status === "running"
      ? "border-sky-300/30 bg-sky-300/12 text-sky-100"
      : status === "completed"
        ? "border-emerald-300/30 bg-emerald-300/12 text-emerald-100"
        : status === "interrupted"
          ? "border-amber-300/30 bg-amber-300/12 text-amber-100"
          : "border-red-300/30 bg-red-300/12 text-red-100";

  return <span className={`rounded-full border px-2.5 py-1 text-[11px] font-medium ${tone}`}>{label}</span>;
}

function ActivityList({ activities }: { activities: ActivityRecord[] }) {
  return (
    <div className="space-y-2">
      {activities.map((activity) => (
        <div key={activity.id} className="rounded-lg border border-white/10 bg-slate-950/55 px-3 py-2">
          <div className="flex items-center justify-between gap-3">
            <p className="text-sm text-white/85">
              {activity.phase === "call" ? `调用 ${activity.name}` : `返回 ${activity.name}`}
            </p>
            {activity.phase === "result" ? (
              <span className={clsx("text-[11px]", activity.success === false ? "text-red-200" : "text-emerald-200")}>
                {activity.success === false ? "失败" : "成功"}
              </span>
            ) : null}
          </div>
          {activity.args ? <p className="mt-2 text-xs text-white/45 break-all">{summarizeJson(activity.args)}</p> : null}
          {activity.content ? <p className="mt-2 text-xs text-white/55 whitespace-pre-wrap leading-5">{activity.content}</p> : null}
        </div>
      ))}
    </div>
  );
}

function TodoPanel({ todos }: { todos: TodoItem[] }) {
  return (
    <div className="rounded-xl border border-white/10 bg-white/5 p-4">
      <div className="flex items-center gap-2 mb-3">
        <ClipboardList size={15} className="text-cyan-200" />
        <p className="text-white/80 text-sm font-medium">任务清单</p>
      </div>
      <div className="space-y-2">
        {todos.map((item, index) => {
          const status = normalizeTodoStatus(item.status);
          return (
            <div key={`${getTodoLabel(item)}-${index}`} className="flex items-start gap-3 rounded-lg bg-slate-950/55 px-3 py-2">
              <span
                className={clsx(
                  "mt-0.5 h-2.5 w-2.5 rounded-full",
                  status === "done" ? "bg-emerald-300" : status === "in_progress" ? "bg-sky-300" : "bg-white/25"
                )}
              />
              <div>
                <p className="text-sm text-white/85">{getTodoLabel(item)}</p>
                <p className="text-[11px] uppercase tracking-wider text-white/35 mt-1">
                  {status === "done" ? "done" : status === "in_progress" ? "in progress" : "todo"}
                </p>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function InterruptPanel({
  pending,
  onApprove,
  onStop,
  busy,
}: {
  pending: PendingInterrupt;
  onApprove: () => void;
  onStop: () => void;
  busy: boolean;
}) {
  return (
    <div className="rounded-xl border border-amber-300/25 bg-amber-300/10 p-4 space-y-3">
      <div className="flex items-center gap-2 text-amber-100 text-sm font-medium">
        <ShieldAlert size={16} />
        等待命令审批
      </div>
      <div className="space-y-2">
        {pending.actionRequests.map((request, index) => (
          <div key={`${pending.interruptId}-${index}`} className="rounded-lg bg-slate-950/55 px-3 py-2">
            <p className="text-sm text-white/85">{request.name}</p>
            {request.args ? <p className="mt-2 text-xs text-white/45 break-all">{summarizeJson(request.args)}</p> : null}
          </div>
        ))}
      </div>
      <div className="flex gap-2">
        <button
          type="button"
          onClick={onApprove}
          disabled={busy}
          className="rounded-lg bg-emerald-400/20 border border-emerald-300/25 text-emerald-100 px-3 py-2 text-sm disabled:opacity-50"
        >
          批准继续
        </button>
        <button
          type="button"
          onClick={onStop}
          disabled={busy}
          className="rounded-lg bg-white/10 border border-white/10 text-white/70 px-3 py-2 text-sm disabled:opacity-50"
        >
          终止本次任务
        </button>
      </div>
    </div>
  );
}

function AskUserPanel({
  pending,
  onSubmit,
  busy,
}: {
  pending: PendingAskUser;
  onSubmit: (payload: { answers?: string[]; status: "answered" | "cancelled" }) => void;
  busy: boolean;
}) {
  const [answers, setAnswers] = useState<string[]>([]);

  useEffect(() => {
    setAnswers(
      pending.questions.map((question) =>
        question.type === "multiple_choice" && question.choices?.[0]
          ? question.choices[0].value
          : ""
      )
    );
  }, [pending.interruptId, pending.questions]);

  return (
    <div className="rounded-xl border border-cyan-300/25 bg-cyan-300/10 p-4 space-y-3">
      <div className="flex items-center gap-2 text-cyan-100 text-sm font-medium">
        <MessageSquareReply size={16} />
        EvoScientist 需要你的补充信息
      </div>
      <div className="space-y-3">
        {pending.questions.map((question, index) => (
          <div key={`${pending.interruptId}-${index}`} className="rounded-lg bg-slate-950/55 px-3 py-3 space-y-2">
            <p className="text-sm text-white/85">
              {index + 1}. {question.question}
              {question.required === false ? <span className="text-white/35 ml-1">(可选)</span> : null}
            </p>
            {question.type === "multiple_choice" ? (
              <select
                value={answers[index] || ""}
                onChange={(event) => {
                  const next = [...answers];
                  next[index] = event.target.value;
                  setAnswers(next);
                }}
                disabled={busy}
                className="w-full appearance-none bg-slate-950/70 border border-white/10 text-white text-sm px-3 py-2 rounded-lg"
              >
                {(question.choices || []).map((choice) => (
                  <option key={choice.value} value={choice.value} className="bg-slate-900">
                    {choice.value}
                  </option>
                ))}
              </select>
            ) : (
              <input
                value={answers[index] || ""}
                onChange={(event) => {
                  const next = [...answers];
                  next[index] = event.target.value;
                  setAnswers(next);
                }}
                disabled={busy}
                className="w-full rounded-lg border border-white/10 bg-slate-950/70 text-white/90 text-sm px-3 py-2 focus:outline-none focus:border-white/25"
                placeholder="输入你的回答"
              />
            )}
          </div>
        ))}
      </div>
      <div className="flex gap-2">
        <button
          type="button"
          onClick={() => onSubmit({ answers, status: "answered" })}
          disabled={busy}
          className="rounded-lg bg-cyan-400/20 border border-cyan-300/25 text-cyan-100 px-3 py-2 text-sm disabled:opacity-50"
        >
          提交回答
        </button>
        <button
          type="button"
          onClick={() => onSubmit({ status: "cancelled" })}
          disabled={busy}
          className="rounded-lg bg-white/10 border border-white/10 text-white/70 px-3 py-2 text-sm disabled:opacity-50"
        >
          取消
        </button>
      </div>
    </div>
  );
}

function ResearchRunCard({
  run,
  accentColor,
  active,
  workspaces,
  busy,
  onActivate,
  onApproveInterrupt,
  onStopInterrupted,
  onSubmitAskUser,
}: {
  run: ResearchRun;
  accentColor: string;
  active: boolean;
  workspaces: EvoScientistWorkspaceOption[];
  busy: boolean;
  onActivate: () => void;
  onApproveInterrupt: () => void;
  onStopInterrupted: () => void;
  onSubmitAskUser: (payload: { answers?: string[]; status: "answered" | "cancelled" }) => void;
}) {
  return (
    <article
      className={clsx(
        "rounded-2xl border p-4 space-y-4 cursor-pointer",
        active ? "bg-white/7 border-white/16" : "bg-white/[0.04] border-white/10"
      )}
      style={active ? { boxShadow: `inset 0 0 0 1px ${accentColor}33` } : undefined}
      onClick={onActivate}
    >
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-xs uppercase tracking-[0.24em] text-white/35">Research Run</p>
          <p className="text-white text-sm leading-6 mt-2 whitespace-pre-wrap">{run.prompt}</p>
        </div>
        <StatusChip status={run.status} />
      </div>

      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        <div className="rounded-xl border border-white/10 bg-slate-950/55 px-3 py-3">
          <p className="text-[11px] uppercase tracking-wider text-white/35">Thread</p>
          <p className="text-sm text-white/80 mt-1">{run.threadId || "待分配"}</p>
        </div>
        <div className="rounded-xl border border-white/10 bg-slate-950/55 px-3 py-3">
          <p className="text-[11px] uppercase tracking-wider text-white/35">Workspace</p>
          <p className="text-sm text-white/80 mt-1">{run.workspaceDir ? getWorkspaceName(run.workspaceDir, workspaces) : "待选择"}</p>
        </div>
        <div className="rounded-xl border border-white/10 bg-slate-950/55 px-3 py-3">
          <p className="text-[11px] uppercase tracking-wider text-white/35">耗时</p>
          <p className="text-sm text-white/80 mt-1">{run.durationMs ? `${(run.durationMs / 1000).toFixed(1)}s` : "执行中"}</p>
        </div>
        <div className="rounded-xl border border-white/10 bg-slate-950/55 px-3 py-3">
          <p className="text-[11px] uppercase tracking-wider text-white/35">Token</p>
          <p className="text-sm text-white/80 mt-1">{run.outputTokens ? `${run.inputTokens} / ${run.outputTokens}` : "采集中"}</p>
        </div>
      </div>

      {run.search?.attempted ? (
        <div className="rounded-xl border border-cyan-300/15 bg-cyan-300/8 px-4 py-3 text-sm text-cyan-100/90">
          <div className="flex items-center gap-2">
            <Search size={15} />
            <span>已复用 workstation 联网搜索</span>
          </div>
          <p className="mt-2 text-xs text-cyan-100/75 leading-5">
            查询：{run.search.query || "无"}。
            {run.search.results.length ? `命中 ${run.search.results.length} 条结果。` : "未命中可注入结果。"}
          </p>
        </div>
      ) : null}

      {run.todos.length ? <TodoPanel todos={run.todos} /> : null}

      {run.pendingInterrupt ? <InterruptPanel pending={run.pendingInterrupt} onApprove={onApproveInterrupt} onStop={onStopInterrupted} busy={busy} /> : null}
      {run.pendingAskUser ? <AskUserPanel pending={run.pendingAskUser} onSubmit={onSubmitAskUser} busy={busy} /> : null}

      {run.coordinatorActivities.length ? (
        <section className="space-y-3">
          <div className="flex items-center gap-2 text-white/75 text-sm font-medium">
            <Wrench size={15} className="text-amber-200" />
            协调器动作
          </div>
          <ActivityList activities={run.coordinatorActivities} />
        </section>
      ) : null}

      {run.thinking ? (
        <section className="rounded-xl border border-fuchsia-300/15 bg-fuchsia-300/8 p-4">
          <p className="text-xs uppercase tracking-wider text-fuchsia-100/70 mb-2">Reasoning</p>
          <p className="text-xs text-fuchsia-50/85 whitespace-pre-wrap leading-5">{run.thinking}</p>
        </section>
      ) : null}

      {run.summarization ? (
        <section className="rounded-xl border border-cyan-300/15 bg-cyan-300/8 p-4">
          <p className="text-xs uppercase tracking-wider text-cyan-100/70 mb-2">Context Summary</p>
          <p className="text-xs text-cyan-50/85 whitespace-pre-wrap leading-5">{run.summarization}</p>
        </section>
      ) : null}

      {run.subagents.length ? (
        <section className="space-y-3">
          <div className="flex items-center gap-2 text-white/75 text-sm font-medium">
            <Bot size={15} className="text-violet-200" />
            子代理执行
          </div>
          <div className="space-y-3">
            {run.subagents.map((subagent) => (
              <div key={subagent.name} className="rounded-xl border border-white/10 bg-white/5 p-4 space-y-3">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className="text-white/85 text-sm font-medium">{subagent.name}</p>
                    {subagent.description ? <p className="text-xs text-white/40 mt-1 leading-5">{subagent.description}</p> : null}
                  </div>
                  <span className={clsx("text-[11px] uppercase tracking-wider", subagent.active ? "text-sky-200" : "text-emerald-200")}>
                    {subagent.active ? "active" : "done"}
                  </span>
                </div>
                {subagent.activities.length ? <ActivityList activities={subagent.activities} /> : null}
                {subagent.latestText ? <p className="text-xs text-white/50 leading-5 whitespace-pre-wrap">{subagent.latestText}</p> : null}
              </div>
            ))}
          </div>
        </section>
      ) : null}

      <section className="rounded-xl border border-white/10 bg-slate-950/60 p-4">
        <div className="flex items-center gap-2 mb-3 text-white/75 text-sm font-medium">
          <Clock3 size={15} className="text-emerald-200" />
          研究结论
        </div>
        {run.response ? (
          <p className="text-sm text-white/90 whitespace-pre-wrap leading-6">{run.response}</p>
        ) : run.status === "running" ? (
          <div className="flex items-center gap-2 text-sm text-sky-200">
            <LoaderCircle size={16} className="animate-spin" />
            EvoScientist 正在产出结论...
          </div>
        ) : run.status === "interrupted" ? (
          <p className="text-sm text-amber-100/85">本轮执行已暂停，等待你的输入或审批。</p>
        ) : (
          <p className="text-sm text-white/35">尚未生成可展示的最终内容。</p>
        )}
      </section>

      {run.error ? <div className="rounded-xl border border-red-400/20 bg-red-400/10 px-4 py-3 text-sm text-red-200 whitespace-pre-wrap leading-6">{run.error}</div> : null}
    </article>
  );
}

export default function AgentLabModal({ open, currentModel, accentColor, onClose }: AgentLabModalProps) {
  const [prompt, setPrompt] = useState("请设计一个用于评估 vllm-hust 在自动科研场景稳定性的实验计划，给出步骤、指标与判定标准。");
  const [runs, setRuns] = useState<ResearchRun[]>([]);
  const [runningRunId, setRunningRunId] = useState<string | null>(null);
  const [activeRunId, setActiveRunId] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [serviceStatus, setServiceStatus] = useState<LocalServiceStatus | null>(null);
  const [statusError, setStatusError] = useState("");
  const [contextError, setContextError] = useState("");
  const [webSearchEnabled, setWebSearchEnabled] = useState(true);
  const [workspaces, setWorkspaces] = useState<EvoScientistWorkspaceOption[]>([]);
  const [sessions, setSessions] = useState<EvoScientistSessionSummary[]>([]);
  const [selectedWorkspacePath, setSelectedWorkspacePath] = useState("");
  const [selectedSession, setSelectedSession] = useState<EvoScientistSessionSummary | null>(null);
  const [viewMode, setViewMode] = useState<"runs" | "control">("runs");

  const running = runningRunId !== null;
  const activeRun = useMemo(() => runs.find((item) => item.id === activeRunId) || runs[0] || null, [activeRunId, runs]);
  const completedRuns = useMemo(() => runs.filter((item) => item.status === "completed").length, [runs]);

  const updateRun = (runId: string, updater: (run: ResearchRun) => ResearchRun) => {
    setRuns((previous) => previous.map((run) => (run.id === runId ? updater(run) : run)));
  };

  const loadStatus = async () => {
    const res = await fetch("/api/local-service", { cache: "no-store" });
    if (!res.ok) {
      throw new Error(`HTTP ${res.status}`);
    }
    const payload = (await res.json()) as LocalServiceStatus;
    setServiceStatus(payload);
    if (!payload.evoScientist.searchEnabled) {
      setWebSearchEnabled(false);
    }
  };

  const loadContext = async () => {
    const response = await fetch("/api/evoscientist/context", { cache: "no-store" });
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }
    const payload = (await response.json()) as EvoScientistContextPayload;
    setWorkspaces(payload.workspaces);
    setSessions(payload.sessions);

    const savedWorkspace = typeof window !== "undefined" ? window.localStorage.getItem("agentlab.workspacePath") : null;
    const nextWorkspace = [savedWorkspace, selectedSession?.workspaceDir, selectedWorkspacePath, payload.selectedWorkspacePath]
      .filter((value): value is string => Boolean(value))
      .find((value) => payload.workspaces.some((workspace) => workspace.path === value));

    if (nextWorkspace) {
      setSelectedWorkspacePath(nextWorkspace);
    } else if (payload.workspaces[0]) {
      setSelectedWorkspacePath(payload.workspaces[0].path);
    }

    setSelectedSession((previous) => {
      if (!previous) {
        return null;
      }
      return payload.sessions.find((item) => item.threadId === previous.threadId) || previous;
    });
  };

  useEffect(() => {
    if (!open) {
      return;
    }

    let cancelled = false;
    const bootstrap = async () => {
      try {
        await Promise.all([loadStatus(), loadContext()]);
        if (!cancelled) {
          setStatusError("");
          setContextError("");
        }
      } catch (loadError: unknown) {
        if (!cancelled) {
          const message = (loadError as Error)?.message || "加载 EvoScientist 状态失败";
          setStatusError(message);
          setContextError(message);
        }
      }
    };

    bootstrap();
    const timer = window.setInterval(() => {
      loadStatus().catch(() => {
        // Keep last known status on transient failure.
      });
    }, 15000);

    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [open]);

  useEffect(() => {
    if (!selectedWorkspacePath || typeof window === "undefined") {
      return;
    }
    window.localStorage.setItem("agentlab.workspacePath", selectedWorkspacePath);
  }, [selectedWorkspacePath]);

  if (!open) {
    return null;
  }

  const evoStatus = serviceStatus?.evoScientist ?? null;
  const backendReady = Boolean(serviceStatus?.inferenceReady);
  const integrationReady = Boolean(evoStatus?.ready && backendReady);
  const searchToggleDisabled = !(evoStatus?.searchEnabled ?? true);
  const continuationThread = activeRun?.status === "interrupted" && activeRun.threadId ? activeRun.threadId : selectedSession?.threadId || null;
  const continuationWorkspace = activeRun?.workspaceDir || selectedSession?.workspaceDir || selectedWorkspacePath;

  const streamRun = async (runId: string, requestBody: Record<string, unknown>) => {
    setRunningRunId(runId);
    const res = await fetch("/api/evoscientist/stream", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(requestBody),
    });

    if (!res.ok || !res.body) {
      const payload = (await res.json().catch(() => null)) as { error?: string; detail?: string } | null;
      const detail = payload?.detail ? `${payload?.error || "请求失败"}\n${payload.detail}` : payload?.error || `HTTP ${res.status}`;
      throw new Error(detail);
    }

    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";

    while (true) {
      const { done, value } = await reader.read();
      if (done) {
        break;
      }

      buffer += decoder.decode(value, { stream: true });
      const blocks = buffer.split("\n\n");
      buffer = blocks.pop() ?? "";

      for (const block of blocks) {
        const eventPayload = parseSseBlock(block);
        if (!eventPayload) {
          continue;
        }

        updateRun(runId, (run) => applyStreamEvent(run, eventPayload));

        if (eventPayload.type === "run_started") {
          const integration = eventPayload.integration as LocalServiceStatus["evoScientist"] | undefined;
          const threadId = typeof eventPayload.threadId === "string" ? eventPayload.threadId : null;
          const workspaceDir = typeof eventPayload.workspaceDir === "string" ? eventPayload.workspaceDir : continuationWorkspace;

          if (integration) {
            setServiceStatus((previous) => (previous ? { ...previous, evoScientist: integration } : previous));
          }
          if (threadId) {
            setSelectedSession((previous) => ({
              threadId,
              updatedAt: previous?.updatedAt || null,
              workspaceDir: workspaceDir || previous?.workspaceDir || "",
              model: currentModel,
              messageCount: previous?.messageCount || 0,
              preview: previous?.preview || prompt.trim(),
            }));
          }
        }
      }
    }

    const trailingEvent = parseSseBlock(buffer);
    if (trailingEvent) {
      updateRun(runId, (run) => applyStreamEvent(run, trailingEvent));
    }

    await loadContext().catch(() => {
      // Non-fatal refresh failure.
    });
  };

  const runAgents = async (event?: FormEvent) => {
    event?.preventDefault();
    const text = prompt.trim();
    if (!text || running) {
      return;
    }

    setError("");
    const runId = crypto.randomUUID();
    const nextRun: ResearchRun = {
      id: runId,
      prompt: text,
      status: "running",
      threadId: continuationThread,
      workspaceDir: continuationWorkspace || null,
      startedAt: Date.now(),
      response: "",
      thinking: "",
      summarization: "",
      todos: [],
      subagents: [],
      coordinatorActivities: [],
      inputTokens: 0,
      outputTokens: 0,
    };

    setRuns((previous) => [nextRun, ...previous]);
    setRunningRunId(runId);
    setActiveRunId(runId);
    setPrompt("");

    try {
      await streamRun(runId, {
        prompt: text,
        model: currentModel,
        webSearch: webSearchEnabled,
        threadId: continuationThread,
        workspaceDir: continuationWorkspace,
      });
    } catch (runError: unknown) {
      const detail = (runError as Error)?.message || "EvoScientist 调用失败";
      setError(detail);
      updateRun(runId, (run) => ({
        ...run,
        status: "failed",
        error: detail,
        pendingInterrupt: undefined,
        pendingAskUser: undefined,
      }));
    } finally {
      setRunningRunId((previous) => (previous === runId ? null : previous));
    }
  };

  const resumeRun = async (runId: string, resumePayload: unknown) => {
    const targetRun = runs.find((run) => run.id === runId);
    if (!targetRun?.threadId || running) {
      return;
    }

    setError("");
    updateRun(runId, (run) => ({
      ...run,
      status: "running",
      error: undefined,
      pendingInterrupt: undefined,
      pendingAskUser: undefined,
    }));
    setActiveRunId(runId);

    try {
      await streamRun(runId, {
        model: currentModel,
        threadId: targetRun.threadId,
        workspaceDir: targetRun.workspaceDir || selectedWorkspacePath,
        resume: resumePayload,
        webSearch: false,
      });
    } catch (resumeError: unknown) {
      const detail = (resumeError as Error)?.message || "恢复 EvoScientist 执行失败";
      setError(detail);
      updateRun(runId, (run) => ({
        ...run,
        status: "failed",
        error: detail,
      }));
    } finally {
      setRunningRunId((previous) => (previous === runId ? null : previous));
    }
  };

  const stopInterruptedRun = (runId: string) => {
    updateRun(runId, (run) => ({
      ...run,
      status: "failed",
      error: "用户终止了等待确认的任务。",
      pendingInterrupt: undefined,
      pendingAskUser: undefined,
    }));
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/55 backdrop-blur-[2px] flex items-center justify-center p-4">
      <div className="w-full max-w-7xl max-h-[92vh] overflow-hidden rounded-2xl border border-white/10 bg-slate-950 shadow-[0_20px_60px_rgba(0,0,0,0.5)] flex flex-col">
        <div
          className="px-5 py-4 border-b border-white/10 flex items-center justify-between"
          style={{ background: `linear-gradient(135deg, ${accentColor}24 0%, rgba(15,23,42,1) 100%)` }}
        >
          <div>
            <p className="text-white text-base font-semibold">EvoScientist 研究任务流</p>
            <p className="text-white/50 text-xs mt-1">直接呈现任务清单、会话恢复、用户交互与子代理执行过程</p>
          </div>
          <div className="flex items-center gap-2">
            <div className="rounded-xl border border-white/10 bg-black/15 p-1 flex items-center gap-1">
              <button
                type="button"
                onClick={() => setViewMode("runs")}
                className={clsx(
                  "rounded-lg px-3 py-1.5 text-xs transition-colors",
                  viewMode === "runs" ? "bg-white/15 text-white" : "text-white/50"
                )}
              >
                研究流
              </button>
              <button
                type="button"
                onClick={() => setViewMode("control")}
                className={clsx(
                  "rounded-lg px-3 py-1.5 text-xs transition-colors",
                  viewMode === "control" ? "bg-white/15 text-white" : "text-white/50"
                )}
              >
                控制台
              </button>
            </div>
            <button type="button" onClick={onClose} className="text-white/50 hover:text-white/90 transition-colors text-sm">
              关闭
            </button>
          </div>
        </div>

        {viewMode === "control" ? (
          <div className="min-h-0 flex-1 overflow-y-auto p-5">
            <EvoScientistControlPlane
              open={open}
              currentModel={currentModel}
              accentColor={accentColor}
              selectedWorkspacePath={selectedWorkspacePath}
            />
          </div>
        ) : (
        <div className="grid grid-cols-12 gap-0 min-h-0 flex-1">
          <section className="col-span-4 border-r border-white/10 p-5 space-y-4 overflow-y-auto">
            <div className="rounded-xl border border-white/10 bg-white/5 p-3 text-xs text-white/60 leading-5">
              <p>当前模型：{currentModel}</p>
              <p>调用方式：workstation → EvoScientist 事件桥 → vllm-hust OpenAI 接口</p>
              <p>本地后端：{integrationReady ? "已绑定并可用" : backendReady ? "EvoScientist 已配置，等待链路稳定" : "本地后端未就绪"}</p>
              <p>后端地址：{evoStatus?.baseUrl ?? "加载中"}</p>
              <p>实际模型：{evoStatus?.resolvedModel ?? "待探测"}</p>
              <p>累计任务：{runs.length}</p>
              <p>已完成：{completedRuns}</p>
            </div>

            <div className="rounded-xl border border-white/10 bg-white/5 p-4 space-y-3">
              <div className="flex items-center gap-2 text-white/80 text-sm font-medium">
                <FolderTree size={15} className="text-cyan-200" />
                研究工作区
              </div>
              <select
                value={selectedWorkspacePath}
                onChange={(event) => {
                  setSelectedWorkspacePath(event.target.value);
                  setSelectedSession(null);
                }}
                disabled={running}
                className="w-full appearance-none bg-slate-950/60 border border-white/10 text-white text-sm px-3 py-2 rounded-lg"
              >
                {workspaces.map((workspace) => (
                  <option key={workspace.path} value={workspace.path} className="bg-slate-900">
                    {workspace.name}
                  </option>
                ))}
              </select>
              <p className="text-xs text-white/45 leading-5 break-all">{selectedWorkspacePath || "暂无可用工作区"}</p>
            </div>

            <div className="rounded-xl border border-white/10 bg-white/5 p-4 space-y-3">
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2 text-white/80 text-sm font-medium">
                  <History size={15} className="text-violet-200" />
                  会话恢复
                </div>
                <button
                  type="button"
                  onClick={() => {
                    loadContext().then(() => setContextError("")).catch((loadError: unknown) => {
                      setContextError((loadError as Error)?.message || "刷新会话失败");
                    });
                  }}
                  className="text-white/45 hover:text-white/80"
                  title="刷新会话列表"
                >
                  <RefreshCcw size={14} />
                </button>
              </div>
              <div className="rounded-lg bg-slate-950/55 px-3 py-3 text-xs text-white/55 leading-5">
                <p>继续线程：{continuationThread || "新线程"}</p>
                <p>目标目录：{continuationWorkspace ? getWorkspaceName(continuationWorkspace, workspaces) : "未选择"}</p>
              </div>
              {selectedSession ? (
                <button
                  type="button"
                  onClick={() => setSelectedSession(null)}
                  disabled={running}
                  className="w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm text-white/70 disabled:opacity-50"
                >
                  切换回新线程
                </button>
              ) : null}
              <div className="space-y-2 max-h-56 overflow-y-auto pr-1">
                {sessions.map((session) => {
                  const selected = session.threadId === selectedSession?.threadId || session.threadId === activeRun?.threadId;
                  return (
                    <button
                      key={session.threadId}
                      type="button"
                      onClick={() => {
                        setSelectedSession(session);
                        setSelectedWorkspacePath(session.workspaceDir || selectedWorkspacePath);
                        const existingRun = runs.find((run) => run.threadId === session.threadId);
                        if (existingRun) {
                          setActiveRunId(existingRun.id);
                        }
                      }}
                      disabled={running}
                      className={clsx(
                        "w-full text-left rounded-lg border px-3 py-3 transition-colors disabled:opacity-50",
                        selected ? "border-cyan-300/25 bg-cyan-300/10" : "border-white/10 bg-slate-950/55 hover:bg-white/5"
                      )}
                    >
                      <div className="flex items-center justify-between gap-3">
                        <p className="text-sm text-white/85 font-medium">{session.threadId}</p>
                        <span className="text-[11px] text-white/35">{formatRelativeTime(session.updatedAt)}</span>
                      </div>
                      <p className="mt-2 text-xs text-white/45 line-clamp-2 leading-5">{session.preview || "暂无摘要"}</p>
                      <p className="mt-2 text-[11px] text-white/35">
                        {session.messageCount} 条消息 · {getWorkspaceName(session.workspaceDir, workspaces)}
                      </p>
                    </button>
                  );
                })}
                {sessions.length === 0 ? <p className="text-xs text-white/35">暂无可恢复会话。</p> : null}
              </div>
            </div>

            <form className="space-y-4" onSubmit={runAgents}>
              <div>
                <label className="block text-white/70 text-xs mb-2 uppercase tracking-wider">研究问题</label>
                <textarea
                  value={prompt}
                  onChange={(e: ChangeEvent<HTMLTextAreaElement>) => setPrompt(e.target.value)}
                  rows={8}
                  className="w-full resize-none rounded-xl border border-white/10 bg-white/5 text-white/90 text-sm p-3 focus:outline-none focus:border-white/30"
                  placeholder="输入一个科研任务，例如：比较不同并发配置下 TTFT 与吞吐折中点"
                />
              </div>

              <div className="rounded-xl border border-white/10 bg-white/5 p-3 text-xs text-white/65 leading-5 space-y-2">
                <div className="flex items-center justify-between gap-3">
                  <span>联网搜索增强</span>
                  <label className="inline-flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={webSearchEnabled && !searchToggleDisabled}
                      disabled={running || searchToggleDisabled}
                      onChange={(event) => setWebSearchEnabled(event.target.checked)}
                      className="h-4 w-4 rounded border-white/20 bg-white/5 text-cyan-400"
                    />
                    <span className="text-white/50">复用 workstation 搜索结果</span>
                  </label>
                </div>
                <p>CLI 模式：{evoStatus?.commandMode === "binary" ? "EvoSci 可执行文件" : evoStatus?.commandMode === "python-module" ? "Python 模块回退" : "未找到可用启动方式"}</p>
                <p>API Key：{evoStatus?.apiKeyMode === "custom" ? "自定义" : evoStatus?.apiKeyMode === "inherited" ? "继承工作站配置" : "not-required / dummy"}</p>
                <p>继续线程：{continuationThread || "新线程"}</p>
                <p>执行目录：{continuationWorkspace ? getWorkspaceName(continuationWorkspace, workspaces) : "未选择"}</p>
                {activeRun?.search?.attempted ? (
                  <p>
                    最近一次搜索：{activeRun.search.query || "无"}
                    {activeRun.search.results.length ? `，命中 ${activeRun.search.results.length} 条结果` : "，未命中结果"}
                  </p>
                ) : null}
              </div>

              {statusError ? <div className="rounded-xl border border-amber-300/20 bg-amber-400/10 p-3 text-xs text-amber-100 whitespace-pre-wrap">{statusError}</div> : null}
              {contextError ? <div className="rounded-xl border border-amber-300/20 bg-amber-400/10 p-3 text-xs text-amber-100 whitespace-pre-wrap">{contextError}</div> : null}
              {error ? <div className="rounded-xl border border-red-400/20 bg-red-400/10 p-3 text-sm text-red-200 whitespace-pre-wrap">{error}</div> : null}

              <button
                type="submit"
                disabled={running || !prompt.trim() || !continuationWorkspace}
                className={clsx(
                  "w-full rounded-xl px-4 py-2.5 text-sm font-medium transition-colors",
                  running || !prompt.trim() || !continuationWorkspace ? "bg-white/10 text-white/40" : "text-white"
                )}
                style={!running && prompt.trim() && continuationWorkspace ? { background: accentColor } : undefined}
              >
                {running ? "EvoScientist 执行中..." : continuationThread ? "继续当前研究线程" : "启动研究任务"}
              </button>
            </form>
          </section>

          <section className="col-span-8 p-5 overflow-y-auto space-y-4">
            {runs.length === 0 && !running ? (
              <div className="h-full min-h-[360px] flex items-center justify-center text-center text-white/40 text-sm leading-7">
                在左侧选择研究工作区或历史线程后输入任务，右侧会实时展示 todo、子代理执行流、审批/问答交互和最终研究结论
              </div>
            ) : null}

            {runs.map((run) => (
              <ResearchRunCard
                key={run.id}
                run={run}
                accentColor={accentColor}
                active={run.id === activeRun?.id}
                workspaces={workspaces}
                busy={runningRunId === run.id}
                onActivate={() => setActiveRunId(run.id)}
                onApproveInterrupt={() => {
                  const target = run.pendingInterrupt;
                  if (!target) {
                    return;
                  }
                  void resumeRun(run.id, {
                    decisions: Array.from({ length: Math.max(1, target.actionRequests.length) }, () => ({ type: "approve" })),
                  });
                }}
                onStopInterrupted={() => stopInterruptedRun(run.id)}
                onSubmitAskUser={(payload) => {
                  void resumeRun(run.id, payload);
                }}
              />
            ))}

            {running ? (
              <div className="rounded-xl border border-sky-400/25 bg-sky-400/10 px-4 py-3 text-sky-200 text-sm flex items-center gap-2">
                <LoaderCircle size={16} className="animate-spin" />
                EvoScientist 正在分解任务并调度子代理，请稍候...
              </div>
            ) : null}

            {activeRun?.status === "interrupted" ? (
              <div className="rounded-xl border border-amber-300/20 bg-amber-300/10 px-4 py-3 text-amber-100 text-sm flex items-center gap-2">
                <ShieldAlert size={16} />
                当前线程已暂停，等待你的补充信息或审批后可继续执行。
              </div>
            ) : null}
          </section>
        </div>
        )}
      </div>
    </div>
  );
}
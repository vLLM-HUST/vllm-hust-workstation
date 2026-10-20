import type { Message } from "@/types";

export const CHAT_SESSION_KEY = "vllm_hust_chat_session_v1";
const statuses = new Set(["completed", "truncated", "empty", "interrupted", "failed", "cancelled", "filtered"]);

export function encodeChatSession(messages: Message[], streaming = false): string {
  return JSON.stringify({ version: 1, streaming, messages });
}

export function decodeChatSession(text: string): { messages: Message[]; streaming: boolean } {
  const data = JSON.parse(text);
  if (data?.version !== 1 || !Array.isArray(data.messages) || data.messages.length > 10000) {
    throw new Error("不是受支持的工作台会话文件");
  }
  const seen = new Set<string>();
  const messages = data.messages.map((item: Message) => {
    if (!item || !["user", "assistant"].includes(item.role) || typeof item.id !== "string" ||
      !item.id || seen.has(item.id) || typeof item.content !== "string" ||
      typeof item.timestamp !== "number" || !Number.isFinite(item.timestamp)) {
      throw new Error("会话消息格式无效，未导入或截断任何记录");
    }
    seen.add(item.id);
    const message: Message = { id: item.id, role: item.role, content: item.content, timestamp: item.timestamp };
    for (const key of ["reasoning", "completionNotice"] as const) {
      if (item[key] !== undefined && typeof item[key] !== "string") throw new Error("会话文字字段无效");
      if (item[key] !== undefined) message[key] = item[key];
    }
    for (const key of ["tokensUsed", "latencyMs"] as const) {
      if (item[key] !== undefined && (typeof item[key] !== "number" || !Number.isFinite(item[key]) || item[key]! < 0)) {
        throw new Error("会话统计字段无效");
      }
      if (item[key] !== undefined) message[key] = item[key];
    }
    if (item.completionStatus !== undefined) {
      if (!statuses.has(item.completionStatus)) throw new Error("会话完成状态无效");
      message.completionStatus = item.completionStatus;
    }
    return message;
  });
  if (data.streaming && messages.at(-1)?.role === "assistant") {
    messages[messages.length - 1] = { ...messages.at(-1)!, completionStatus: "interrupted",
      completionNotice: "上次生成因页面关闭或刷新而中断；已保留收到的内容，未自动重新请求。" };
  }
  return { messages, streaming: false };
}

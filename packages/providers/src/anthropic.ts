import {
  type AppError,
  appError,
  type ChatMessage,
  type ChatRequest,
  type ChatResponse,
  err,
  ok,
  type ProviderConfig,
  type Result,
} from "@prompt-forge/core";
import type { ProviderClient } from "./client.js";
import { type FetchImpl, requestJson } from "./http.js";

type AnthropicContentBlock = { type?: string; text?: string };

type AnthropicResponse = {
  content?: AnthropicContentBlock[];
  stop_reason?: string;
  usage?: { input_tokens?: number; output_tokens?: number };
};

const DEFAULT_MAX_TOKENS = 4096;

const finishMap = (raw: string | undefined): ChatResponse["finishReason"] => {
  if (raw === "end_turn") return "stop";
  if (raw === "max_tokens") return "length";
  if (raw === "tool_use") return "tool_use";
  return "other";
};

const splitMessages = (
  messages: ChatMessage[],
): { system: string | undefined; rest: ChatMessage[] } => {
  const systems: string[] = [];
  const rest: ChatMessage[] = [];
  for (const m of messages) {
    if (m.role === "system") systems.push(m.content);
    else rest.push(m);
  }
  return { system: systems.length > 0 ? systems.join("\n\n") : undefined, rest };
};

export const createAnthropicClient = (
  config: ProviderConfig,
  fetchImpl: FetchImpl = globalThis.fetch,
): ProviderClient => {
  const apiKey = config.apiKey;
  if (!apiKey) {
    return {
      chat: async (): Promise<Result<ChatResponse, AppError>> =>
        err(appError("CONFIG_MISSING", "anthropic requires an apiKey")),
    };
  }
  return {
    async chat(req: ChatRequest): Promise<Result<ChatResponse, AppError>> {
      const { system, rest } = splitMessages(req.messages);
      const body = {
        model: config.model,
        max_tokens: req.maxTokens ?? DEFAULT_MAX_TOKENS,
        ...(system !== undefined ? { system } : {}),
        messages: rest,
        ...(req.temperature !== undefined ? { temperature: req.temperature } : {}),
      };
      const r = await requestJson<AnthropicResponse>(
        {
          url: `${config.baseUrl.replace(/\/$/, "")}/v1/messages`,
          body,
          headers: {
            "x-api-key": apiKey,
            "anthropic-version": "2023-06-01",
          },
          timeoutMs: config.timeoutMs,
        },
        fetchImpl,
      );
      if (!r.ok) return r;
      const blocks = r.value.content;
      const first = blocks?.[0];
      if (!blocks || blocks.length === 0 || !first) {
        return err(appError("PROVIDER_BAD_RESPONSE", "empty content from anthropic"));
      }
      if (first.type !== "text" || typeof first.text !== "string") {
        return err(appError("PROVIDER_BAD_RESPONSE", "non-text content block from anthropic"));
      }
      const firstText: string = first.text;
      const usage = r.value.usage
        ? {
            ...(r.value.usage.input_tokens !== undefined
              ? { promptTokens: r.value.usage.input_tokens }
              : {}),
            ...(r.value.usage.output_tokens !== undefined
              ? { completionTokens: r.value.usage.output_tokens }
              : {}),
          }
        : undefined;
      return ok({
        content: firstText,
        finishReason: finishMap(r.value.stop_reason),
        ...(usage ? { usage } : {}),
      });
    },
  };
};

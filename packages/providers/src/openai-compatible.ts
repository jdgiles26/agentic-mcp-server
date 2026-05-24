import {
  type AppError,
  appError,
  type ChatRequest,
  type ChatResponse,
  err,
  ok,
  type ProviderConfig,
  type Result,
} from "@prompt-forge/core";
import type { ProviderClient } from "./client.js";
import { type FetchImpl, requestJson } from "./http.js";

type OpenAIResponse = {
  choices?: Array<{
    message?: { content?: string; role?: string };
    finish_reason?: string;
  }>;
  usage?: { prompt_tokens?: number; completion_tokens?: number };
};

const finishMap = (raw: string | undefined): ChatResponse["finishReason"] => {
  if (raw === "stop") return "stop";
  if (raw === "length") return "length";
  if (raw === "tool_calls" || raw === "tool_use") return "tool_use";
  return "other";
};

const authHeader = (config: ProviderConfig): Record<string, string> => {
  if (config.apiKey) return { authorization: `Bearer ${config.apiKey}` };
  if (config.kind === "lemonade") return { authorization: "Bearer lemonade" };
  return {};
};

export type OpenAICompatibleOptions = { fetchImpl?: FetchImpl };

export const createOpenAICompatibleClient = (
  config: ProviderConfig,
  opts: OpenAICompatibleOptions = {},
): ProviderClient => {
  const fetchImpl = opts.fetchImpl ?? globalThis.fetch;
  if ((config.kind === "openai" || config.kind === "anthropic") && !config.apiKey) {
    return {
      chat: async (): Promise<Result<ChatResponse, AppError>> =>
        err(appError("CONFIG_MISSING", `${config.kind} requires an apiKey`)),
    };
  }
  return {
    async chat(req: ChatRequest): Promise<Result<ChatResponse, AppError>> {
      const body = {
        model: config.model,
        messages: req.messages,
        ...(req.temperature !== undefined ? { temperature: req.temperature } : {}),
        ...(req.maxTokens !== undefined ? { max_tokens: req.maxTokens } : {}),
        stream: false,
      };
      const r = await requestJson<OpenAIResponse>(
        {
          url: `${config.baseUrl.replace(/\/$/, "")}/chat/completions`,
          body,
          headers: authHeader(config),
          timeoutMs: config.timeoutMs,
        },
        fetchImpl,
      );
      if (!r.ok) return r;
      const choice = r.value.choices?.[0];
      const content = choice?.message?.content;
      if (!content) {
        return err(appError("PROVIDER_BAD_RESPONSE", "empty or missing choices"));
      }
      const usage = r.value.usage
        ? {
            ...(r.value.usage.prompt_tokens !== undefined
              ? { promptTokens: r.value.usage.prompt_tokens }
              : {}),
            ...(r.value.usage.completion_tokens !== undefined
              ? { completionTokens: r.value.usage.completion_tokens }
              : {}),
          }
        : undefined;
      return ok({
        content,
        finishReason: finishMap(choice?.finish_reason),
        ...(usage ? { usage } : {}),
      });
    },
  };
};

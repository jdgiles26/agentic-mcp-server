import {
  appError,
  type ChatRequest,
  type ChatResponse,
  err,
  ok,
  type ProviderConfig,
  type Result,
  type AppError,
} from "@prompt-forge/core";
import type { ProviderClient } from "./client.js";
import { type FetchImpl, requestJson } from "./http.js";

type OllamaResponse = {
  message?: { role?: string; content?: string };
  done?: boolean;
  done_reason?: string;
  prompt_eval_count?: number;
  eval_count?: number;
};

export const createOllamaClient = (
  config: ProviderConfig,
  fetchImpl: FetchImpl = globalThis.fetch,
): ProviderClient => ({
  async chat(req: ChatRequest): Promise<Result<ChatResponse, AppError>> {
    const body = {
      model: config.model,
      messages: req.messages,
      stream: false,
      ...(req.temperature !== undefined ? { options: { temperature: req.temperature } } : {}),
    };
    const r = await requestJson<OllamaResponse>(
      {
        url: `${config.baseUrl.replace(/\/$/, "")}/api/chat`,
        body,
        timeoutMs: config.timeoutMs,
      },
      fetchImpl,
    );
    if (!r.ok) return r;
    const content = r.value.message?.content;
    if (!content) {
      return err(appError("PROVIDER_BAD_RESPONSE", "empty content from ollama"));
    }
    const usage =
      r.value.prompt_eval_count !== undefined || r.value.eval_count !== undefined
        ? {
            ...(r.value.prompt_eval_count !== undefined
              ? { promptTokens: r.value.prompt_eval_count }
              : {}),
            ...(r.value.eval_count !== undefined
              ? { completionTokens: r.value.eval_count }
              : {}),
          }
        : undefined;
    return ok({
      content,
      finishReason: r.value.done_reason === "length" ? "length" : "stop",
      ...(usage ? { usage } : {}),
    });
  },
});

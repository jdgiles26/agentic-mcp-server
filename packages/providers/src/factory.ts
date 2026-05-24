import type { ProviderConfig, ProviderKind } from "@prompt-forge/core";
import { createAnthropicClient } from "./anthropic.js";
import type { ProviderClient } from "./client.js";
import { type FetchImpl } from "./http.js";
import { createOllamaClient } from "./ollama.js";
import { createOpenAICompatibleClient } from "./openai-compatible.js";

export const DEFAULT_BASE_URLS: Record<ProviderKind, string> = {
  ollama: "http://localhost:11434",
  lemonade: "http://localhost:13305/api/v1",
  llamacpp: "http://localhost:8080/v1",
  openai: "https://api.openai.com/v1",
  anthropic: "https://api.anthropic.com",
};

export type FactoryOptions = { fetchImpl?: FetchImpl };

export const createProviderClient = (
  config: ProviderConfig,
  opts: FactoryOptions = {},
): ProviderClient => {
  switch (config.kind) {
    case "ollama":
      return createOllamaClient(config, opts.fetchImpl);
    case "lemonade":
    case "llamacpp":
    case "openai":
      return createOpenAICompatibleClient(config, opts);
    case "anthropic":
      return createAnthropicClient(config, opts.fetchImpl);
  }
};

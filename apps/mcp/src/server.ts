import { z } from "zod";
import {
  ProviderConfigSchema,
  EnhancementRequestSchema,
  type ProviderConfig,
} from "@prompt-forge/core";
import type { ProviderClient } from "@prompt-forge/providers";
import { createProviderClient } from "@prompt-forge/providers";
import { enhance } from "@prompt-forge/enhancer";

export type ProviderClientFactory = (config: ProviderConfig) => ProviderClient;

export type ServerDeps = {
  providerClientFactory?: ProviderClientFactory;
};

export type JsonRpcRequest = {
  jsonrpc: "2.0";
  id?: number | string | null;
  method: string;
  params?: unknown;
};

export type JsonRpcResponse = {
  jsonrpc: "2.0";
  id: number | string | null;
  result?: unknown;
  error?: { code: number; message: string; data?: unknown };
};

const ParseError = -32700;
const InvalidRequest = -32600;
const MethodNotFound = -32601;
const InvalidParams = -32602;
const InternalError = -32603;

const SERVER_INFO = { name: "promptforge", version: "0.0.0" };
const PROTOCOL_VERSION = "2024-11-05";

const EnhanceArgsSchema = EnhancementRequestSchema.extend({
  provider: ProviderConfigSchema,
});

const TOOLS = [
  {
    name: "enhance_prompt",
    description:
      "Rewrites a raw coding-assistant prompt into a sharper, pattern-driven version. Provider config is supplied per-call.",
    inputSchema: {
      type: "object",
      properties: {
        rawPrompt: { type: "string", minLength: 10 },
        taskKind: {
          type: "string",
          enum: ["feature", "bug", "refactor", "test", "docs", "review", "unknown"],
        },
        maxPatterns: { type: "integer", minimum: 1, maximum: 10 },
        pinnedSlugs: { type: "array", items: { type: "string" } },
        excludedSlugs: { type: "array", items: { type: "string" } },
        reflect: { type: "boolean" },
        provider: {
          type: "object",
          properties: {
            kind: {
              type: "string",
              enum: ["ollama", "lemonade", "llamacpp", "openai", "anthropic"],
            },
            baseUrl: { type: "string", format: "uri" },
            model: { type: "string" },
            apiKey: { type: "string" },
            timeoutMs: { type: "integer" },
          },
          required: ["kind", "baseUrl", "model"],
        },
      },
      required: ["rawPrompt", "provider"],
    },
  },
];

const makeError = (id: JsonRpcRequest["id"], code: number, message: string, data?: unknown): JsonRpcResponse => ({
  jsonrpc: "2.0",
  id: id ?? null,
  error: { code, message, ...(data !== undefined ? { data } : {}) },
});

const makeResult = (id: JsonRpcRequest["id"], result: unknown): JsonRpcResponse => ({
  jsonrpc: "2.0",
  id: id ?? null,
  result,
});

const isJsonRpc = (x: unknown): x is JsonRpcRequest => {
  if (!x || typeof x !== "object") return false;
  const r = x as Record<string, unknown>;
  return r.jsonrpc === "2.0" && typeof r.method === "string";
};

export const handleMcpRequest = async (
  payload: unknown,
  deps: ServerDeps = {},
): Promise<JsonRpcResponse | undefined> => {
  if (!isJsonRpc(payload)) {
    return makeError(null, InvalidRequest, "Invalid Request");
  }
  const req = payload;
  const isNotification = req.id === undefined;

  try {
    if (req.method === "initialize") {
      if (isNotification) return undefined;
      return makeResult(req.id, {
        protocolVersion: PROTOCOL_VERSION,
        capabilities: { tools: {} },
        serverInfo: SERVER_INFO,
      });
    }

    if (req.method === "notifications/initialized" || req.method === "initialized") {
      return undefined;
    }

    if (req.method === "tools/list") {
      if (isNotification) return undefined;
      return makeResult(req.id, { tools: TOOLS });
    }

    if (req.method === "tools/call") {
      if (isNotification) return undefined;
      const callParams = z
        .object({ name: z.string(), arguments: z.unknown().optional() })
        .safeParse(req.params);
      if (!callParams.success) {
        return makeError(req.id, InvalidParams, "Invalid tool call params");
      }
      if (callParams.data.name !== "enhance_prompt") {
        return makeError(req.id, MethodNotFound, `Unknown tool: ${callParams.data.name}`);
      }
      const parsed = EnhanceArgsSchema.safeParse(callParams.data.arguments ?? {});
      if (!parsed.success) {
        return makeError(req.id, InvalidParams, "Invalid arguments", {
          issues: parsed.error.issues,
        });
      }
      const { provider, ...enhanceReq } = parsed.data;
      const factory = deps.providerClientFactory ?? ((c) => createProviderClient(c));
      const client = factory(provider);
      const result = await enhance(client, enhanceReq);
      if (!result.ok) {
        return makeError(req.id, InternalError, `${result.error.code}: ${result.error.message}`);
      }
      const r = result.value;
      const text = [
        `**Rewritten prompt** (taskKind: ${r.taskKind}, patterns: ${r.selectedPatterns.join(", ")}, reflected: ${r.reflected})`,
        "",
        r.rewrittenPrompt,
      ].join("\n");
      return makeResult(req.id, {
        content: [{ type: "text", text }],
        isError: false,
      });
    }

    if (isNotification) return undefined;
    return makeError(req.id, MethodNotFound, `Method not found: ${req.method}`);
  } catch (e) {
    if (isNotification) return undefined;
    return makeError(req.id ?? null, InternalError, e instanceof Error ? e.message : "Internal error");
  }
};

export { ParseError, InvalidRequest, MethodNotFound, InvalidParams, InternalError };

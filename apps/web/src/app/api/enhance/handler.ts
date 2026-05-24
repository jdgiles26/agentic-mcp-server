import { z } from "zod";
import {
  EnhancementRequestSchema,
  ProviderConfigSchema,
  type ProviderConfig,
} from "@prompt-forge/core";
import { createProviderClient, type ProviderClient } from "@prompt-forge/providers";
import { enhance } from "@prompt-forge/enhancer";

const BodySchema = EnhancementRequestSchema.extend({ provider: ProviderConfigSchema });

export type ProviderFactory = (config: ProviderConfig) => ProviderClient;

const json = (status: number, body: unknown): Response =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });

export const handleEnhanceRequest = async (
  req: Request,
  factory: ProviderFactory = (c) => createProviderClient(c),
): Promise<Response> => {
  let payload: unknown;
  try {
    payload = await req.json();
  } catch {
    return json(400, { error: { code: "VALIDATION", message: "invalid json" } });
  }
  const parsed = BodySchema.safeParse(payload);
  if (!parsed.success) {
    return json(400, {
      error: { code: "VALIDATION", message: "invalid request", issues: parsed.error.issues },
    });
  }
  const { provider, ...enhanceReq } = parsed.data;
  const client = factory(provider);
  const result = await enhance(client, enhanceReq);
  if (!result.ok) {
    const status =
      result.error.code === "PROVIDER_UNREACHABLE" || result.error.code === "PROVIDER_TIMEOUT"
        ? 502
        : result.error.code === "VALIDATION"
          ? 400
          : 500;
    const { code, message } = result.error;
    return json(status, { error: { code, message } });
  }
  return json(200, result.value);
};

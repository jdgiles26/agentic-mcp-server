import {
  type AppError,
  appError,
  type EnhancementRequest,
  EnhancementRequestSchema,
  type EnhancementResponse,
  err,
  ok,
  type Result,
} from "@prompt-forge/core";
import { classifyTask, selectPatterns } from "@prompt-forge/patterns";
import type { ProviderClient } from "@prompt-forge/providers";
import {
  buildEnhancementMessages,
  buildReflectionMessages,
  extractRewrittenPrompt,
} from "./prompt-builder.js";

export const enhance = async (
  client: ProviderClient,
  request: EnhancementRequest,
): Promise<Result<EnhancementResponse, AppError>> => {
  const parsed = EnhancementRequestSchema.safeParse(request);
  if (!parsed.success) {
    return err(appError("VALIDATION", parsed.error.issues[0]?.message ?? "invalid request"));
  }
  const req = parsed.data;
  const taskKind = req.taskKind ?? classifyTask(req.rawPrompt);
  const patterns = selectPatterns(req.rawPrompt, taskKind, {
    maxPatterns: req.maxPatterns ?? 3,
    pinned: req.pinnedSlugs,
    excluded: req.excludedSlugs,
  });

  const draftRes = await client.chat({
    messages: buildEnhancementMessages({
      rawPrompt: req.rawPrompt,
      taskKind,
      patterns,
    }),
    ...(req.temperature !== undefined ? { temperature: req.temperature } : {}),
  });
  if (!draftRes.ok) return draftRes;
  const draft = extractRewrittenPrompt(draftRes.value.content);

  let rewrittenPrompt = draft;
  let reflected = false;

  if (req.reflect) {
    const reflectRes = await client.chat({
      messages: buildReflectionMessages({
        rawPrompt: req.rawPrompt,
        draft,
        taskKind,
      }),
      ...(req.temperature !== undefined ? { temperature: req.temperature } : {}),
    });
    if (reflectRes.ok) {
      const revised = extractRewrittenPrompt(reflectRes.value.content);
      if (revised && revised.length > 0) {
        rewrittenPrompt = revised;
        reflected = true;
      }
    }
  }

  return ok({
    rewrittenPrompt,
    taskKind,
    selectedPatterns: patterns.map((p) => p.slug),
    draft,
    reflected,
  });
};

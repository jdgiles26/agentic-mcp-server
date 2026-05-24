import type { Pattern, TaskKind } from "@prompt-forge/core";
import { PATTERN_CATALOG, findPatternBySlug } from "./catalog.js";

export type SelectOptions = {
  maxPatterns?: number;
  pinned?: readonly string[];
  excluded?: readonly string[];
};

const DEFAULT_MAX = 3;

const wordRe = (kw: string) => new RegExp(`\\b${kw.replace(/[.*+?^${}()|[\\\\]\\\\]/g, "\\\\$&")}\\b`, "i");

const scorePattern = (p: Pattern, text: string, taskKind: TaskKind): number => {
  let score = 0;
  if (p.taskKinds.includes(taskKind)) score += 5;
  let triggerHits = 0;
  for (const t of p.triggers) {
    if (wordRe(t).test(text)) triggerHits += 1;
  }
  score += triggerHits;
  if (triggerHits > 0 && p.taskKinds.includes(taskKind)) score += 0.5;
  return score;
};

export const selectPatterns = (
  rawPrompt: string,
  taskKind: TaskKind,
  opts: SelectOptions = {},
): readonly Pattern[] => {
  const max = opts.maxPatterns ?? DEFAULT_MAX;
  const excluded = new Set(opts.excluded ?? []);
  const pinned = (opts.pinned ?? [])
    .map((s) => findPatternBySlug(s))
    .filter((p): p is Pattern => !!p && !excluded.has(p.slug));

  const seen = new Set<string>(pinned.map((p) => p.slug));
  const candidates = PATTERN_CATALOG.filter(
    (p) => !excluded.has(p.slug) && !seen.has(p.slug),
  );

  const scored = candidates
    .map((p, idx) => ({ p, score: scorePattern(p, rawPrompt, taskKind), idx }))
    .filter((c) => c.score > 0)
    .sort((a, b) => b.score - a.score || a.idx - b.idx)
    .map((c) => c.p);

  let result: Pattern[] = [...pinned, ...scored];

  if (result.length === 0) {
    const fallback = PATTERN_CATALOG.filter(
      (p) => !excluded.has(p.slug) && p.taskKinds.includes(taskKind),
    );
    result = fallback.slice(0, max);
  }

  return result.slice(0, max);
};

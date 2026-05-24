import type { TaskKind } from "@prompt-forge/core";

type Rule = { kind: TaskKind; weight: number; keywords: readonly string[] };

const RULES: readonly Rule[] = [
  {
    kind: "refactor",
    weight: 3,
    keywords: ["refactor", "rewrite", "restructure", "clean up", "extract"],
  },
  { kind: "bug", weight: 3, keywords: ["fix", "bug", "regression", "crash", "broken", "issue"] },
  { kind: "test", weight: 3, keywords: ["test", "tests", "spec", "tdd", "coverage"] },
  { kind: "docs", weight: 3, keywords: ["document", "documentation", "readme", "docs", "comment"] },
  { kind: "review", weight: 3, keywords: ["review", "audit", "critique", "feedback"] },
  {
    kind: "feature",
    weight: 2,
    keywords: ["add", "build", "create", "implement", "support", "new", "introduce"],
  },
];

const wordRe = (kw: string) =>
  new RegExp(`\\b${kw.replace(/[.*+?^${}()|[\\\\]\\\\]/g, "\\\\$&")}\\b`, "i");

export const classifyTask = (rawPrompt: string): TaskKind => {
  const text = rawPrompt.trim();
  if (text.length === 0) return "unknown";

  const scores = new Map<TaskKind, number>();
  for (const rule of RULES) {
    let hits = 0;
    for (const kw of rule.keywords) {
      if (wordRe(kw).test(text)) hits += 1;
    }
    if (hits > 0) {
      scores.set(rule.kind, (scores.get(rule.kind) ?? 0) + rule.weight + (hits - 1) * 0.1);
    }
  }

  if (scores.size === 0) return "unknown";

  let best: TaskKind = "unknown";
  let bestScore = -1;
  const order: readonly TaskKind[] = ["refactor", "bug", "test", "docs", "review", "feature"];
  for (const k of order) {
    const s = scores.get(k) ?? 0;
    if (s > bestScore) {
      best = k;
      bestScore = s;
    }
  }
  return best;
};

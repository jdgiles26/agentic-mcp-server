import { describe, expect, it } from "vitest";
import { selectPatterns } from "./select.js";

describe("selectPatterns", () => {
  it("returns at most maxPatterns entries", () => {
    const r = selectPatterns("write tests for the parser", "test", { maxPatterns: 2 });
    expect(r.length).toBeLessThanOrEqual(2);
  });

  it("respects pinned slugs (always included first)", () => {
    const r = selectPatterns("anything", "feature", {
      maxPatterns: 3,
      pinned: ["dual-llm"],
    });
    expect(r[0]?.slug).toBe("dual-llm");
  });

  it("drops excluded slugs", () => {
    const r = selectPatterns("plan and implement a parser", "feature", {
      maxPatterns: 5,
      excluded: ["plan-then-execute"],
    });
    expect(r.find((p) => p.slug === "plan-then-execute")).toBeUndefined();
  });

  it("matches trigger keywords (plan -> plan-then-execute)", () => {
    const r = selectPatterns("we need a plan for the migration", "feature", { maxPatterns: 2 });
    expect(r.map((p) => p.slug)).toContain("plan-then-execute");
  });

  it("falls back to taskKind-matching patterns when no triggers hit", () => {
    const r = selectPatterns("zzzzz xxxxx", "test", { maxPatterns: 2 });
    expect(r.length).toBeGreaterThan(0);
    expect(r.some((p) => p.taskKinds.includes("test"))).toBe(true);
  });

  it("is deterministic", () => {
    const r1 = selectPatterns("plan a refactor", "refactor", { maxPatterns: 3 });
    const r2 = selectPatterns("plan a refactor", "refactor", { maxPatterns: 3 });
    expect(r1.map((p) => p.slug)).toEqual(r2.map((p) => p.slug));
  });

  it("deduplicates pinned + score-selected", () => {
    const r = selectPatterns("we need a plan", "feature", {
      maxPatterns: 5,
      pinned: ["plan-then-execute"],
    });
    const slugs = r.map((p) => p.slug);
    expect(new Set(slugs).size).toBe(slugs.length);
  });
});

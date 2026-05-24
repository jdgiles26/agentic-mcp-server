import { describe, expect, it } from "vitest";
import { allPatterns, findPatternBySlug, PATTERN_CATALOG } from "./index.js";

describe("PATTERN_CATALOG invariants", () => {
  it("has at least 22 entries (full catalog)", () => {
    expect(PATTERN_CATALOG.length).toBeGreaterThanOrEqual(22);
  });

  it("every one of the 7 categories appears at least once", () => {
    const categories = new Set(PATTERN_CATALOG.map((p) => p.category));
    for (const c of [
      "orchestration",
      "feedback",
      "context",
      "reliability",
      "security",
      "ux",
      "learning",
    ]) {
      expect(categories).toContain(c);
    }
  });

  it("no two patterns share the same name", () => {
    const names = PATTERN_CATALOG.map((p) => p.name);
    expect(new Set(names).size).toBe(names.length);
  });

  it("every slug is unique", () => {
    const slugs = PATTERN_CATALOG.map((p) => p.slug);
    expect(new Set(slugs).size).toBe(slugs.length);
  });

  it("every entry has required non-empty fields", () => {
    for (const p of PATTERN_CATALOG) {
      expect(p.slug).toMatch(/^[a-z0-9-]+$/);
      expect(p.name.length).toBeGreaterThan(0);
      expect(p.triggers.length).toBeGreaterThanOrEqual(3);
      expect(p.taskKinds.length).toBeGreaterThanOrEqual(1);
      expect(p.directive.startsWith("## ")).toBe(true);
      expect(p.sourceUrl).toMatch(/^https?:\/\//);
    }
  });

  it("contains canonical patterns", () => {
    const slugs = PATTERN_CATALOG.map((p) => p.slug);
    for (const s of ["plan-then-execute", "spec-as-test", "reflection-loop"]) {
      expect(slugs).toContain(s);
    }
  });

  it("findPatternBySlug returns the entry or undefined", () => {
    expect(findPatternBySlug("plan-then-execute")?.slug).toBe("plan-then-execute");
    expect(findPatternBySlug("nonexistent")).toBeUndefined();
  });

  it("allPatterns returns the readonly catalog", () => {
    expect(allPatterns()).toEqual(PATTERN_CATALOG);
  });
});

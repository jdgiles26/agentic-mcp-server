import { describe, expect, it } from "vitest";
import { PATTERN_CATALOG, findPatternBySlug, allPatterns } from "./index.js";

describe("PATTERN_CATALOG invariants", () => {
  it("has at least 5 entries (vertical slice)", () => {
    expect(PATTERN_CATALOG.length).toBeGreaterThanOrEqual(5);
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

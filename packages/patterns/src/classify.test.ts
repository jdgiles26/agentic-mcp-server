import { describe, expect, it } from "vitest";
import { classifyTask } from "./classify.js";

describe("classifyTask", () => {
  it("detects bug from 'fix' / 'bug' keywords", () => {
    expect(classifyTask("fix the null pointer bug in login")).toBe("bug");
  });

  it("detects refactor from 'refactor'", () => {
    expect(classifyTask("refactor the auth module to use hooks")).toBe("refactor");
  });

  it("detects test from 'tests' / 'test'", () => {
    expect(classifyTask("add unit tests for the parser")).toBe("test");
  });

  it("detects docs from 'document' / 'readme'", () => {
    expect(classifyTask("update the README with install steps")).toBe("docs");
  });

  it("detects review from 'review' / 'audit'", () => {
    expect(classifyTask("review this PR for security issues")).toBe("review");
  });

  it("defaults to feature for new functionality language", () => {
    expect(classifyTask("build a settings page with provider configs")).toBe("feature");
  });

  it("returns unknown for empty input", () => {
    expect(classifyTask("")).toBe("unknown");
  });

  it("prefers refactor over feature when both signals are present", () => {
    expect(classifyTask("refactor and also add a new flag")).toBe("refactor");
  });

  it("is deterministic", () => {
    const r1 = classifyTask("rewrite the parser for clarity");
    const r2 = classifyTask("rewrite the parser for clarity");
    expect(r1).toBe(r2);
  });
});

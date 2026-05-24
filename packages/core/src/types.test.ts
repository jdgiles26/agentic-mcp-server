import { describe, expect, it } from "vitest";
import {
  ChatRequestSchema,
  ChatResponseSchema,
  EnhancementRequestSchema,
  PatternSchema,
  ProviderConfigSchema,
  TaskKindSchema,
} from "./types.js";

describe("ProviderConfigSchema", () => {
  it("accepts a valid ollama config", () => {
    const r = ProviderConfigSchema.safeParse({
      kind: "ollama",
      baseUrl: "http://localhost:11434",
      model: "llama3.1:8b",
    });
    expect(r.success).toBe(true);
  });

  it("requires apiKey for openai", () => {
    const r = ProviderConfigSchema.safeParse({
      kind: "openai",
      baseUrl: "https://api.openai.com/v1",
      model: "gpt-4o-mini",
    });
    expect(r.success).toBe(false);
  });

  it("accepts openai with apiKey", () => {
    const r = ProviderConfigSchema.safeParse({
      kind: "openai",
      baseUrl: "https://api.openai.com/v1",
      model: "gpt-4o-mini",
      apiKey: "sk-test",
    });
    expect(r.success).toBe(true);
  });

  it("rejects unknown provider kind", () => {
    const r = ProviderConfigSchema.safeParse({
      kind: "cohere",
      baseUrl: "https://x",
      model: "x",
    });
    expect(r.success).toBe(false);
  });
});

describe("ChatRequestSchema", () => {
  it("accepts an array of role+content messages", () => {
    const r = ChatRequestSchema.safeParse({
      messages: [
        { role: "system", content: "be terse" },
        { role: "user", content: "hello" },
      ],
    });
    expect(r.success).toBe(true);
  });

  it("rejects empty messages", () => {
    const r = ChatRequestSchema.safeParse({ messages: [] });
    expect(r.success).toBe(false);
  });

  it("rejects invalid role", () => {
    const r = ChatRequestSchema.safeParse({
      messages: [{ role: "robot", content: "hi" }],
    });
    expect(r.success).toBe(false);
  });
});

describe("EnhancementRequestSchema", () => {
  it("accepts a rawPrompt over the min length", () => {
    const r = EnhancementRequestSchema.safeParse({
      rawPrompt: "make my login form better, add a forgot password flow",
    });
    expect(r.success).toBe(true);
  });

  it("rejects rawPrompt shorter than 10 chars", () => {
    const r = EnhancementRequestSchema.safeParse({ rawPrompt: "hi" });
    expect(r.success).toBe(false);
  });

  it("accepts an optional taskKind hint", () => {
    const r = EnhancementRequestSchema.safeParse({
      rawPrompt: "rewrite this please",
      taskKind: "refactor",
    });
    expect(r.success).toBe(true);
  });
});

describe("ChatResponseSchema", () => {
  it("rejects when content is missing", () => {
    const r = ChatResponseSchema.safeParse({ finishReason: "stop" });
    expect(r.success).toBe(false);
  });
});

describe("PatternSchema", () => {
  const valid = {
    slug: "x-pattern",
    name: "X Pattern",
    category: "orchestration",
    triggers: ["a", "b", "c"],
    taskKinds: ["feature"],
    directive: "## X Pattern\nDo the thing.",
    sourceUrl: "https://agentic-patterns.com/patterns/x-pattern",
  };

  it("rejects when triggers is an empty array", () => {
    const r = PatternSchema.safeParse({ ...valid, triggers: [] });
    expect(r.success).toBe(false);
  });

  it("rejects when sourceUrl is not a URL", () => {
    const r = PatternSchema.safeParse({ ...valid, sourceUrl: "not-a-url" });
    expect(r.success).toBe(false);
  });

  it("rejects unknown category", () => {
    const r = PatternSchema.safeParse({ ...valid, category: "frobnication" });
    expect(r.success).toBe(false);
  });
});

describe("TaskKindSchema", () => {
  it("accepts canonical task kinds", () => {
    for (const k of ["feature", "bug", "refactor", "test", "docs", "review", "unknown"]) {
      expect(TaskKindSchema.safeParse(k).success).toBe(true);
    }
  });

  it("rejects garbage", () => {
    expect(TaskKindSchema.safeParse("frobnicate").success).toBe(false);
  });
});

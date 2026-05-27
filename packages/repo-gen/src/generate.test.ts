import { err, ok } from "@prompt-forge/core";
import type { ProviderClient } from "@prompt-forge/providers";
import { describe, expect, it, vi } from "vitest";
import {
  buildContentPrompt,
  buildFileTreePrompt,
  buildRepoPrompt,
  generateRepo,
  parseFileContents,
  parseFileTree,
} from "./generate.js";

describe("parseFileTree", () => {
  it("parses valid JSON array", () => {
    const output = '[{"path":"src/index.ts","description":"entry"}]';
    expect(parseFileTree(output)).toEqual([{ path: "src/index.ts", description: "entry" }]);
  });

  it("returns null for malformed JSON", () => {
    expect(parseFileTree("not json")).toBeNull();
  });

  it("returns null for empty string", () => {
    expect(parseFileTree("")).toBeNull();
  });

  it("returns null when parsed value is not an array", () => {
    expect(parseFileTree('{"path":"x"}')).toBeNull();
  });

  it("strips markdown json fences before parsing", () => {
    const output = "```json\n[{\"path\":\"a.ts\",\"description\":\"b\"}]\n```";
    expect(parseFileTree(output)).toEqual([{ path: "a.ts", description: "b" }]);
  });

  it("strips plain markdown fences before parsing", () => {
    const output = "```\n[{\"path\":\"a.ts\",\"description\":\"b\"}]\n```";
    expect(parseFileTree(output)).toEqual([{ path: "a.ts", description: "b" }]);
  });

  it("extracts JSON array embedded in surrounding text", () => {
    const output = 'Here is the file list:\n[{"path":"a.ts","description":"b"}]\nDone.';
    expect(parseFileTree(output)).toEqual([{ path: "a.ts", description: "b" }]);
  });

  it("strips <think>...</think> block before parsing", () => {
    const output =
      "<think>\nLet me plan this.\n</think>\n\n[{\"path\":\"a.ts\",\"description\":\"b\"}]";
    expect(parseFileTree(output)).toEqual([{ path: "a.ts", description: "b" }]);
  });
});

describe("parseFileContents", () => {
  it("extracts files with correct delimiters", () => {
    const output =
      '<<<FILE:src/index.ts>>>\nconsole.log("hi");\n<<<ENDFILE>>>\n<<<FILE:README.md>>>\n# Hello\n<<<ENDFILE>>>';
    const result = parseFileContents(output);
    expect(result).toHaveLength(2);
    expect(result[0]).toEqual({ path: "src/index.ts", content: 'console.log("hi");' });
    expect(result[1]).toEqual({ path: "README.md", content: "# Hello" });
  });

  it("returns empty array for no matches", () => {
    expect(parseFileContents("no files here")).toEqual([]);
  });

  it("trims leading and trailing whitespace from content", () => {
    const output = "<<<FILE:a.ts>>>\n  code  \n<<<ENDFILE>>>";
    expect(parseFileContents(output)[0]?.content).toBe("code");
  });

  it("trims leading and trailing whitespace from path", () => {
    const output = "<<<FILE: a.ts >>>\ncode\n<<<ENDFILE>>>";
    expect(parseFileContents(output)[0]?.path).toBe("a.ts");
  });

  it("strips <think>...</think> block before parsing", () => {
    const output =
      "<think>\nLet me plan the files.\n</think>\n<<<FILE:src/index.ts>>>\ncode\n<<<ENDFILE>>>";
    const result = parseFileContents(output);
    expect(result).toHaveLength(1);
    expect(result[0]?.path).toBe("src/index.ts");
    expect(result[0]?.content).toBe("code");
  });

  it("handles prose before the first FILE block", () => {
    const output =
      "Here are the generated files:\n\n<<<FILE:a.ts>>>\ncode\n<<<ENDFILE>>>";
    const result = parseFileContents(output);
    expect(result).toHaveLength(1);
    expect(result[0]?.path).toBe("a.ts");
  });

  it("falls back to === FILE: === format", () => {
    const output = "=== FILE: src/index.ts ===\ncode here\n=== END FILE ===";
    const result = parseFileContents(output);
    expect(result).toHaveLength(1);
    expect(result[0]?.path).toBe("src/index.ts");
    expect(result[0]?.content).toBe("code here");
  });

  it("falls back to === FILE: === format (case-insensitive END)", () => {
    const output =
      "=== FILE: a.ts ===\nfoo\n=== END FILE ===\n=== FILE: b.ts ===\nbar\n=== END FILE ===";
    const result = parseFileContents(output);
    expect(result).toHaveLength(2);
  });
});

describe("buildFileTreePrompt", () => {
  it("includes the objective", () => {
    const prompt = buildFileTreePrompt("Build a todo REST API");
    expect(prompt).toContain("Build a todo REST API");
  });

  it("requests JSON output", () => {
    const prompt = buildFileTreePrompt("x");
    expect(prompt).toContain("JSON");
  });
});

describe("buildContentPrompt", () => {
  it("includes the file path from the tree", () => {
    const tree = [{ path: "src/index.ts", description: "entry" }];
    expect(buildContentPrompt("todo API", tree)).toContain("src/index.ts");
  });

  it("includes the objective", () => {
    const tree = [{ path: "src/index.ts", description: "entry" }];
    expect(buildContentPrompt("todo API", tree)).toContain("todo API");
  });

  it("includes the FILE delimiter instruction", () => {
    const tree = [{ path: "src/index.ts", description: "entry" }];
    expect(buildContentPrompt("todo API", tree)).toContain("<<<FILE:");
  });
});

describe("buildRepoPrompt", () => {
  it("includes the objective", () => {
    expect(buildRepoPrompt("Build a todo REST API")).toContain("Build a todo REST API");
  });

  it("includes the FILE delimiter example", () => {
    expect(buildRepoPrompt("x")).toContain("<<<FILE:");
  });

  it("includes the ENDFILE delimiter example", () => {
    expect(buildRepoPrompt("x")).toContain("<<<ENDFILE>>>");
  });
});

describe("generateRepo", () => {
  const makeClient = (responses: string[]): ProviderClient => {
    let call = 0;
    return {
      chat: vi.fn(async () =>
        ok({ content: responses[call++] ?? "", finishReason: "stop" as const }),
      ),
    };
  };

  const contentOutput =
    '<<<FILE:src/index.ts>>>\nconsole.log("hi");\n<<<ENDFILE>>>\n<<<FILE:README.md>>>\n# Repo\n<<<ENDFILE>>>';

  it("makes exactly 1 chat call", async () => {
    const client = makeClient([contentOutput]);
    await generateRepo(client, { objective: "simple express todo API with TypeScript" });
    expect((client.chat as ReturnType<typeof vi.fn>).mock.calls).toHaveLength(1);
  });

  it("returns files on happy path", async () => {
    const client = makeClient([contentOutput]);
    const result = await generateRepo(client, {
      objective: "simple express todo API with TypeScript",
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.fileCount).toBe(2);
      expect(result.value.files).toHaveLength(2);
    }
  });

  it("handles response with <think> block prefix", async () => {
    const withThinking = `<think>
Let me plan the files...
</think>
${contentOutput}`;
    const client = makeClient([withThinking]);
    const result = await generateRepo(client, {
      objective: "simple express todo API with TypeScript",
    });
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value.fileCount).toBe(2);
  });

  it("propagates LLM error", async () => {
    const client: ProviderClient = {
      chat: vi.fn(async () => err({ code: "PROVIDER_UNREACHABLE" as const, message: "down" })),
    };
    const result = await generateRepo(client, {
      objective: "simple express todo API with TypeScript",
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe("PROVIDER_UNREACHABLE");
  });

  it("returns PROVIDER_BAD_RESPONSE when output has no file blocks", async () => {
    const client = makeClient(["here is some text with no file markers"]);
    const result = await generateRepo(client, {
      objective: "simple express todo API with TypeScript",
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe("PROVIDER_BAD_RESPONSE");
  });

  it("returns PROVIDER_BAD_RESPONSE and includes LLM output snippet in details", async () => {
    const client = makeClient(["no markers here"]);
    const result = await generateRepo(client, {
      objective: "simple express todo API with TypeScript",
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.details?.output).toBeDefined();
    }
  });
});

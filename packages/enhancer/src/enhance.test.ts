import { type ChatRequest, ok } from "@prompt-forge/core";
import type { ProviderClient } from "@prompt-forge/providers";
import { describe, expect, it } from "vitest";
import { enhance } from "./enhance.js";

const scriptedClient = (
  responder: (req: ChatRequest, callIndex: number) => string,
): ProviderClient & { calls: ChatRequest[] } => {
  const calls: ChatRequest[] = [];
  return {
    calls,
    async chat(req) {
      calls.push(req);
      return ok({ content: responder(req, calls.length - 1) });
    },
  };
};

describe("enhance", () => {
  it("happy path returns a rewritten prompt and selected patterns", async () => {
    const client = scriptedClient(() => "```prompt\nrewritten\n```");
    const r = await enhance(client, {
      rawPrompt: "build a settings page for provider configs",
    });
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.value.rewrittenPrompt).toBe("rewritten");
      expect(r.value.taskKind).toBe("feature");
      expect(r.value.selectedPatterns.length).toBeGreaterThan(0);
      expect(r.value.reflected).toBe(false);
    }
    expect(client.calls).toHaveLength(1);
  });

  it("rejects rawPrompt shorter than 10 chars with VALIDATION", async () => {
    const client = scriptedClient(() => "```prompt\nx\n```");
    const r = await enhance(client, { rawPrompt: "hi" });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.code).toBe("VALIDATION");
  });

  it("respects explicit taskKind override", async () => {
    const client = scriptedClient(() => "```prompt\nx\n```");
    const r = await enhance(client, {
      rawPrompt: "build a settings page for provider configs",
      taskKind: "bug",
    });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.value.taskKind).toBe("bug");
  });

  it("runs a second chat call when reflect=true", async () => {
    const client = scriptedClient((_req, idx) =>
      idx === 0 ? "```prompt\nfirst\n```" : "```prompt\nrevised\n```",
    );
    const r = await enhance(client, {
      rawPrompt: "build a settings page for provider configs",
      reflect: true,
    });
    expect(client.calls).toHaveLength(2);
    if (r.ok) {
      expect(r.value.rewrittenPrompt).toBe("revised");
      expect(r.value.reflected).toBe(true);
    }
  });

  it("falls back to draft when reflection returns nothing useful", async () => {
    let call = 0;
    const client: ProviderClient = {
      async chat() {
        call += 1;
        if (call === 1) return ok({ content: "```prompt\ndraft\n```" });
        return {
          ok: false as const,
          error: { code: "PROVIDER_UNREACHABLE" as const, message: "x" },
        };
      },
    };
    const r = await enhance(client, {
      rawPrompt: "build a settings page",
      reflect: true,
    });
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.value.rewrittenPrompt).toBe("draft");
      expect(r.value.reflected).toBe(false);
    }
  });

  it("propagates a draft provider error", async () => {
    const client: ProviderClient = {
      async chat() {
        return { ok: false as const, error: { code: "PROVIDER_AUTH" as const, message: "401" } };
      },
    };
    const r = await enhance(client, { rawPrompt: "build a thing" });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.code).toBe("PROVIDER_AUTH");
  });
});

import { describe, expect, it } from "vitest";
import { createOllamaClient } from "./ollama.js";
import { scriptedFetch, jsonResponse } from "./test-fixtures.js";

describe("Ollama client", () => {
  it("POSTs to /api/chat with stream:false and maps eval_count", async () => {
    let seenReq: Request | undefined;
    const fetchImpl = scriptedFetch(async (req) => {
      seenReq = req;
      return jsonResponse({
        message: { role: "assistant", content: "hello" },
        done: true,
        done_reason: "stop",
        prompt_eval_count: 7,
        eval_count: 3,
      });
    });
    const client = createOllamaClient(
      { kind: "ollama", baseUrl: "http://localhost:11434", model: "llama3.1:8b" },
      fetchImpl,
    );
    const r = await client.chat({
      messages: [{ role: "user", content: "hi" }],
    });
    expect(seenReq?.url).toBe("http://localhost:11434/api/chat");
    const body = (await seenReq!.json()) as { model: string; stream: boolean };
    expect(body.model).toBe("llama3.1:8b");
    expect(body.stream).toBe(false);
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.value.content).toBe("hello");
      expect(r.value.usage?.promptTokens).toBe(7);
      expect(r.value.usage?.completionTokens).toBe(3);
    }
  });

  it("rejects empty content as PROVIDER_BAD_RESPONSE", async () => {
    const fetchImpl = scriptedFetch(async () =>
      jsonResponse({ message: { role: "assistant", content: "" }, done: true }),
    );
    const client = createOllamaClient(
      { kind: "ollama", baseUrl: "http://localhost:11434", model: "x" },
      fetchImpl,
    );
    const r = await client.chat({ messages: [{ role: "user", content: "hi" }] });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.code).toBe("PROVIDER_BAD_RESPONSE");
  });
});

"use client";

import { useState, type FormEvent } from "react";

type EnhanceResult = {
  rewrittenPrompt: string;
  taskKind: string;
  selectedPatterns: string[];
  reflected: boolean;
};

export function EnhanceForm() {
  const [rawPrompt, setRawPrompt] = useState("");
  const [kind, setKind] = useState<"ollama" | "openai" | "anthropic" | "lemonade" | "llamacpp">("ollama");
  const [baseUrl, setBaseUrl] = useState("http://localhost:11434");
  const [model, setModel] = useState("llama3.1:8b");
  const [apiKey, setApiKey] = useState("");
  const [reflect, setReflect] = useState(false);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<EnhanceResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    setResult(null);
    try {
      const res = await fetch("/api/enhance", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          rawPrompt,
          reflect,
          provider: {
            kind,
            baseUrl,
            model,
            ...(apiKey ? { apiKey } : {}),
          },
        }),
      });
      const body = await res.json();
      if (!res.ok) {
        setError(body?.error?.message ?? `HTTP ${res.status}`);
      } else {
        setResult(body);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "request failed");
    } finally {
      setLoading(false);
    }
  };

  const needsKey = kind === "openai" || kind === "anthropic";

  return (
    <form onSubmit={submit}>
      <label htmlFor="prompt">Raw prompt</label>
      <textarea
        id="prompt"
        value={rawPrompt}
        onChange={(e) => setRawPrompt(e.target.value)}
        placeholder="Paste the prompt you'd normally send to a coding agent."
        required
        minLength={10}
      />

      <div className="section">
        <div className="row">
          <div>
            <label htmlFor="kind">Provider</label>
            <select id="kind" value={kind} onChange={(e) => setKind(e.target.value as any)}>
              <option value="ollama">ollama</option>
              <option value="lemonade">lemonade</option>
              <option value="llamacpp">llamacpp</option>
              <option value="openai">openai</option>
              <option value="anthropic">anthropic</option>
            </select>
          </div>
          <div>
            <label htmlFor="model">Model</label>
            <input id="model" value={model} onChange={(e) => setModel(e.target.value)} />
          </div>
        </div>
        <label htmlFor="baseUrl">Base URL</label>
        <input id="baseUrl" value={baseUrl} onChange={(e) => setBaseUrl(e.target.value)} />
        {needsKey && (
          <>
            <label htmlFor="apiKey">API key</label>
            <input
              id="apiKey"
              type="password"
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
              autoComplete="off"
            />
          </>
        )}
        <label>
          <input type="checkbox" checked={reflect} onChange={(e) => setReflect(e.target.checked)} />{" "}
          Run reflection pass (second LLM call)
        </label>
      </div>

      <div className="section">
        <button type="submit" disabled={loading || rawPrompt.trim().length < 10}>
          {loading ? "Rewriting..." : "Rewrite prompt"}
        </button>
      </div>

      {error && (
        <div className="section error">
          <strong>Error:</strong> {error}
        </div>
      )}

      {result && (
        <div className="section">
          <div className="tags">
            taskKind: {result.taskKind} · patterns: {result.selectedPatterns.join(", ")} · reflected:{" "}
            {String(result.reflected)}
          </div>
          <pre>{result.rewrittenPrompt}</pre>
        </div>
      )}
    </form>
  );
}

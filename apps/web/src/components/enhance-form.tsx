"use client";

import {
  type AppConfig,
  createLocalStorageStore,
  getActiveProviderConfig,
} from "@prompt-forge/config";
import type { ProviderConfig } from "@prompt-forge/core";
import { type FormEvent, useEffect, useState } from "react";

type EnhanceResult = {
  rewrittenPrompt: string;
  taskKind: string;
  selectedPatterns: string[];
  reflected: boolean;
};

export function EnhanceForm() {
  const [rawPrompt, setRawPrompt] = useState("");
  const [reflect, setReflect] = useState(false);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<EnhanceResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [activeProvider, setActiveProvider] = useState<ProviderConfig | null>(null);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const store = createLocalStorageStore(window.localStorage);
    const loaded = store.load();
    if (loaded.ok) {
      setActiveProvider(getActiveProviderConfig(loaded.value as AppConfig));
    } else {
      setActiveProvider(null);
    }
    setHydrated(true);
  }, []);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    // Re-read active provider from localStorage at submit time so that
    // changes made in another tab are picked up without a refresh.
    const store = createLocalStorageStore(window.localStorage);
    const loaded = store.load();
    const provider = loaded.ok ? getActiveProviderConfig(loaded.value as AppConfig) : null;
    if (!provider) {
      setActiveProvider(null);
      return;
    }
    setActiveProvider(provider);
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
          provider,
        }),
      });
      const body = await res.json();
      if (!res.ok) {
        setError(body?.error?.message ?? `HTTP ${res.status}`);
      } else {
        setResult(body as EnhanceResult);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "request failed");
    } finally {
      setLoading(false);
    }
  };

  if (!hydrated) {
    return <form aria-busy="true" />;
  }

  if (!activeProvider) {
    return (
      <div className="section">
        <p>
          Configure a provider in /settings first. <a href="/settings">Open settings</a>.
        </p>
      </div>
    );
  }

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
        <div className="tags">
          Provider: {activeProvider.kind} · {activeProvider.model} · base {activeProvider.baseUrl} ·{" "}
          <a href="/settings">Change in Settings</a>
        </div>
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
            taskKind: {result.taskKind} · patterns: {result.selectedPatterns.join(", ")} ·
            reflected: {String(result.reflected)}
          </div>
          <pre>{result.rewrittenPrompt}</pre>
        </div>
      )}
    </form>
  );
}

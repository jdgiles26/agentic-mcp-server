"use client";

import {
  type AppConfig,
  createLocalStorageStore,
  getActiveProviderConfig,
} from "@prompt-forge/config";
import type { ProviderConfig, RepoFile } from "@prompt-forge/core";
import { type FormEvent, useEffect, useState } from "react";

type RepoResult = {
  files: RepoFile[];
  fileCount: number;
};

export function RepoForm() {
  const [objective, setObjective] = useState("");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<RepoResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [activeProvider, setActiveProvider] = useState<ProviderConfig | null>(null);
  const [hydrated, setHydrated] = useState(false);
  const [expandedFiles, setExpandedFiles] = useState<Set<string>>(new Set());

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
    setExpandedFiles(new Set());
    try {
      const res = await fetch("/api/repo", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ objective, provider }),
      });
      const body = await res.json();
      if (!res.ok) {
        setError(body?.error?.message ?? `HTTP ${res.status}`);
      } else {
        setResult(body as RepoResult);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "request failed");
    } finally {
      setLoading(false);
    }
  };

  const toggleFile = (path: string) => {
    setExpandedFiles((prev) => {
      const next = new Set(prev);
      if (next.has(path)) next.delete(path);
      else next.add(path);
      return next;
    });
  };

  const downloadZip = async () => {
    if (!result) return;
    const { default: JSZip } = await import("jszip");
    const zip = new JSZip();
    for (const file of result.files) {
      zip.file(file.path, file.content);
    }
    const blob = await zip.generateAsync({ type: "blob" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "project.zip";
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  if (!hydrated) return <form aria-busy="true" />;

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
      <label htmlFor="objective">Project objective</label>
      <textarea
        id="objective"
        value={objective}
        onChange={(e) => setObjective(e.target.value)}
        placeholder="Describe the project you want to generate. E.g. 'A TypeScript Express REST API for a todo app with PostgreSQL, including tests and Docker config.'"
        required
        minLength={20}
        rows={5}
      />

      <div className="section">
        <div className="tags">
          Provider: {activeProvider.kind} · {activeProvider.model} · base {activeProvider.baseUrl}{" "}
          · <a href="/settings">Change in Settings</a>
        </div>
        <p style={{ fontSize: "0.85em", color: "#888" }}>
          Generates in 2 LLM passes: file tree then file contents. May take 1–3 minutes.
        </p>
      </div>

      <div className="section">
        <button type="submit" disabled={loading || objective.trim().length < 20}>
          {loading ? "Generating..." : "Generate repository"}
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
            {result.fileCount} files generated ·{" "}
            <button type="button" onClick={downloadZip} style={{ background: "none", border: "none", cursor: "pointer", padding: 0, color: "inherit", textDecoration: "underline" }}>
              Download .zip
            </button>
          </div>
          <div style={{ marginTop: "0.75rem" }}>
            {result.files.map((file) => (
              <div key={file.path} style={{ marginBottom: "0.25rem" }}>
                <button
                  type="button"
                  onClick={() => toggleFile(file.path)}
                  style={{
                    background: "none",
                    border: "none",
                    cursor: "pointer",
                    padding: "2px 0",
                    fontFamily: "monospace",
                    fontSize: "0.9em",
                    color: "inherit",
                    textAlign: "left",
                  }}
                >
                  {expandedFiles.has(file.path) ? "▾" : "▸"} {file.path}
                </button>
                {expandedFiles.has(file.path) && (
                  <pre
                    style={{
                      marginTop: "0.25rem",
                      padding: "0.75rem",
                      background: "#1a1a1a",
                      borderRadius: "4px",
                      overflow: "auto",
                      fontSize: "0.8em",
                      maxHeight: "400px",
                    }}
                  >
                    {file.content}
                  </pre>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </form>
  );
}

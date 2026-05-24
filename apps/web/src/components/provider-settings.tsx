"use client";

import {
  type AppConfig,
  createLocalStorageStore,
  emptyAppConfig,
  removeProvider,
  setActiveProvider,
  upsertProvider,
} from "@prompt-forge/config";
import { ProviderConfigSchema, type ProviderKind } from "@prompt-forge/core";
import { DEFAULT_BASE_URLS } from "@prompt-forge/providers";
import { useEffect, useMemo, useState } from "react";

const PROVIDER_KINDS: ProviderKind[] = ["ollama", "lemonade", "llamacpp", "openai", "anthropic"];

const DEFAULT_MODELS: Record<ProviderKind, string> = {
  ollama: "llama3.1:8b",
  lemonade: "llama3.1:8b",
  llamacpp: "llama3.1:8b",
  openai: "gpt-4o-mini",
  anthropic: "claude-3-5-sonnet-latest",
};

type DraftMap = Record<ProviderKind, { baseUrl: string; model: string; apiKey: string }>;

const emptyDrafts = (): DraftMap =>
  Object.fromEntries(
    PROVIDER_KINDS.map((k) => [
      k,
      { baseUrl: DEFAULT_BASE_URLS[k], model: DEFAULT_MODELS[k], apiKey: "" },
    ]),
  ) as DraftMap;

const draftsFromConfig = (cfg: AppConfig): DraftMap => {
  const base = emptyDrafts();
  for (const k of PROVIDER_KINDS) {
    const existing = cfg.providers[k];
    if (existing) {
      base[k] = {
        baseUrl: existing.baseUrl,
        model: existing.model,
        apiKey: existing.apiKey ?? "",
      };
    }
  }
  return base;
};

type TestResult = { ok: boolean; message: string };

export function ProviderSettings() {
  const [config, setConfig] = useState<AppConfig>(emptyAppConfig());
  const [drafts, setDrafts] = useState<DraftMap>(emptyDrafts());
  const [hydrated, setHydrated] = useState(false);
  const [corruptBanner, setCorruptBanner] = useState(false);
  const [saveErrors, setSaveErrors] = useState<Partial<Record<ProviderKind, string>>>({});
  const [testResults, setTestResults] = useState<Partial<Record<ProviderKind, TestResult>>>({});

  const store = useMemo(() => {
    if (typeof window === "undefined") return null;
    return createLocalStorageStore(window.localStorage);
  }, []);

  useEffect(() => {
    if (!store) return;
    const loaded = store.load();
    if (loaded.ok) {
      setConfig(loaded.value);
      setDrafts(draftsFromConfig(loaded.value));
    } else if (loaded.error.code === "CONFIG_INVALID") {
      setCorruptBanner(true);
    }
    setHydrated(true);
  }, [store]);

  if (!hydrated) {
    return <div aria-busy="true" />;
  }

  const resetCorrupt = () => {
    if (!store) return;
    const empty = emptyAppConfig();
    store.save(empty);
    setConfig(empty);
    setDrafts(emptyDrafts());
    setCorruptBanner(false);
  };

  const persist = (next: AppConfig) => {
    if (!store) return;
    store.save(next);
    setConfig(next);
    setDrafts(draftsFromConfig(next));
  };

  const updateDraft = (
    kind: ProviderKind,
    field: "baseUrl" | "model" | "apiKey",
    value: string,
  ) => {
    setDrafts((d) => ({ ...d, [kind]: { ...d[kind], [field]: value } }));
  };

  const onSave = (kind: ProviderKind) => {
    const d = drafts[kind];
    const candidate: Record<string, unknown> = {
      kind,
      baseUrl: d.baseUrl,
      model: d.model,
    };
    if (d.apiKey) candidate.apiKey = d.apiKey;
    const parsed = ProviderConfigSchema.safeParse(candidate);
    if (!parsed.success) {
      setSaveErrors((e) => ({
        ...e,
        [kind]: parsed.error.issues.map((i) => i.message).join("; "),
      }));
      return;
    }
    setSaveErrors((e) => ({ ...e, [kind]: undefined }));
    const next = upsertProvider(config, parsed.data);
    persist(next);
  };

  const onRemove = (kind: ProviderKind) => {
    const next = removeProvider(config, kind);
    persist(next);
  };

  const onSetActive = (kind: ProviderKind) => {
    const next = setActiveProvider(config, kind);
    persist(next);
  };

  const onTest = async (kind: ProviderKind) => {
    const provider = config.providers[kind];
    if (!provider) return;
    setTestResults((r) => ({ ...r, [kind]: { ok: false, message: "Testing..." } }));
    try {
      const res = await fetch("/api/providers/test", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ provider }),
      });
      const body = (await res.json()) as
        | { ok: true; model: string; tokens: number | null }
        | { ok: false; error: { code: string; message: string } };
      if (res.ok && body.ok) {
        setTestResults((r) => ({
          ...r,
          [kind]: { ok: true, message: `OK · ${body.model}` },
        }));
      } else {
        const msg = !body.ok ? `${body.error.code}: ${body.error.message}` : "fail";
        setTestResults((r) => ({ ...r, [kind]: { ok: false, message: msg } }));
      }
    } catch (e) {
      setTestResults((r) => ({
        ...r,
        [kind]: {
          ok: false,
          message: e instanceof Error ? e.message : "request failed",
        },
      }));
    }
  };

  const configuredKinds = Object.keys(config.providers) as ProviderKind[];

  return (
    <div>
      {corruptBanner && (
        <div className="section error">
          <strong>Existing config was corrupt; reset to empty.</strong>{" "}
          <button type="button" onClick={resetCorrupt}>
            Reset
          </button>
        </div>
      )}

      {configuredKinds.length > 0 && (
        <div className="section">
          <h2>Active provider</h2>
          {configuredKinds.map((k) => (
            <label key={k} style={{ display: "inline-block", marginRight: 16 }}>
              <input
                type="radio"
                name="active-provider"
                checked={config.activeProvider === k}
                onChange={() => onSetActive(k)}
              />{" "}
              {k}
            </label>
          ))}
        </div>
      )}

      {PROVIDER_KINDS.map((kind) => {
        const isConfigured = Boolean(config.providers[kind]);
        const needsKey = kind === "openai" || kind === "anthropic";
        const d = drafts[kind];
        const tr = testResults[kind];
        const saveErr = saveErrors[kind];
        return (
          <section key={kind} className="section">
            <h2>
              {kind} {isConfigured ? "(configured)" : ""}
            </h2>
            <label htmlFor={`${kind}-baseUrl`}>Base URL</label>
            <input
              id={`${kind}-baseUrl`}
              value={d.baseUrl}
              onChange={(e) => updateDraft(kind, "baseUrl", e.target.value)}
            />
            <label htmlFor={`${kind}-model`}>Model</label>
            <input
              id={`${kind}-model`}
              value={d.model}
              onChange={(e) => updateDraft(kind, "model", e.target.value)}
            />
            {needsKey && (
              <>
                <label htmlFor={`${kind}-apiKey`}>API key</label>
                <input
                  id={`${kind}-apiKey`}
                  type="password"
                  value={d.apiKey}
                  onChange={(e) => updateDraft(kind, "apiKey", e.target.value)}
                  autoComplete="off"
                />
              </>
            )}
            <div className="section" style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              <button type="button" onClick={() => onSave(kind)}>
                Save
              </button>
              {isConfigured && (
                <>
                  <button
                    type="button"
                    onClick={() => onRemove(kind)}
                    style={{ background: "#7a2e2e" }}
                  >
                    Remove
                  </button>
                  <button type="button" onClick={() => onTest(kind)}>
                    Test connection
                  </button>
                </>
              )}
            </div>
            {saveErr && <div className="error">{saveErr}</div>}
            {tr && <div className={tr.ok ? "tags" : "error"}>{tr.message}</div>}
          </section>
        );
      })}
    </div>
  );
}

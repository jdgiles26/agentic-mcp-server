import type { ProviderConfig } from "@prompt-forge/core";
import { describe, expect, it } from "vitest";
import {
  AppConfigSchema,
  createLocalStorageStore,
  createMemoryStore,
  emptyAppConfig,
  getActiveProviderConfig,
  removeProvider,
  setActiveProvider,
  upsertProvider,
} from "./store.js";

const ollama: ProviderConfig = {
  kind: "ollama",
  baseUrl: "http://localhost:11434",
  model: "llama3",
};

const openai: ProviderConfig = {
  kind: "openai",
  baseUrl: "https://api.openai.com/v1",
  model: "gpt-4o-mini",
  apiKey: "sk-test",
};

const anthropic: ProviderConfig = {
  kind: "anthropic",
  baseUrl: "https://api.anthropic.com",
  model: "claude-sonnet-4-5",
  apiKey: "sk-ant-test",
};

const deepFreeze = <T>(obj: T): T => {
  if (obj && typeof obj === "object") {
    for (const key of Object.keys(obj as Record<string, unknown>)) {
      deepFreeze((obj as Record<string, unknown>)[key]);
    }
    Object.freeze(obj);
  }
  return obj;
};

const fakeStorage = (): Storage => {
  const map = new Map<string, string>();
  const s: Storage = {
    get length() {
      return map.size;
    },
    clear: () => map.clear(),
    getItem: (k: string) => (map.has(k) ? (map.get(k) as string) : null),
    key: (_i: number) => null,
    removeItem: (k: string) => {
      map.delete(k);
    },
    setItem: (k: string, v: string) => {
      map.set(k, String(v));
    },
  };
  return s;
};

describe("AppConfigSchema / emptyAppConfig", () => {
  it("emptyAppConfig() round-trips through AppConfigSchema", () => {
    const empty = emptyAppConfig();
    const parsed = AppConfigSchema.parse(empty);
    expect(parsed).toEqual({ providers: {}, activeProvider: null });
  });

  it("rejects unknown activeProvider value", () => {
    const bad = { providers: {}, activeProvider: "foobar" };
    expect(() => AppConfigSchema.parse(bad)).toThrow();
  });
});

describe("upsertProvider", () => {
  it("does not mutate the input config (deep-frozen)", () => {
    const input = deepFreeze({ providers: {}, activeProvider: null });
    expect(() => upsertProvider(input, ollama)).not.toThrow();
    const next = upsertProvider(input, ollama);
    expect(next).not.toBe(input);
    expect(next).not.toEqual(input);
  });

  it("auto-sets activeProvider when starting from empty", () => {
    const next = upsertProvider(emptyAppConfig(), ollama);
    expect(next.activeProvider).toBe("ollama");
    expect(next.providers.ollama).toEqual(ollama);
  });

  it("does NOT change activeProvider if another is already active", () => {
    const after1 = upsertProvider(emptyAppConfig(), ollama);
    const after2 = upsertProvider(after1, openai);
    expect(after2.activeProvider).toBe("ollama");
    expect(after2.providers.openai).toEqual(openai);
  });

  it("replaces an existing provider by kind", () => {
    const after1 = upsertProvider(emptyAppConfig(), ollama);
    const replaced: ProviderConfig = { ...ollama, model: "llama3.2" };
    const after2 = upsertProvider(after1, replaced);
    expect(after2.providers.ollama).toEqual(replaced);
  });
});

describe("removeProvider", () => {
  it("falls back to a remaining provider when the active is removed", () => {
    const c1 = upsertProvider(emptyAppConfig(), ollama);
    const c2 = upsertProvider(c1, openai);
    expect(c2.activeProvider).toBe("ollama");
    const c3 = removeProvider(c2, "ollama");
    expect(c3.providers.ollama).toBeUndefined();
    expect(c3.activeProvider).toBe("openai");
  });

  it("sets activeProvider to null when no providers remain", () => {
    const c1 = upsertProvider(emptyAppConfig(), ollama);
    const c2 = removeProvider(c1, "ollama");
    expect(c2.providers).toEqual({});
    expect(c2.activeProvider).toBeNull();
  });

  it("does not mutate the input", () => {
    const c1 = upsertProvider(emptyAppConfig(), ollama);
    const frozen = deepFreeze(c1);
    expect(() => removeProvider(frozen, "ollama")).not.toThrow();
  });
});

describe("setActiveProvider", () => {
  it("is a no-op for an unknown kind", () => {
    const c1 = upsertProvider(emptyAppConfig(), ollama);
    const c2 = setActiveProvider(c1, "openai");
    expect(c2.activeProvider).toBe("ollama");
  });

  it("switches active provider when kind is present", () => {
    const c1 = upsertProvider(emptyAppConfig(), ollama);
    const c2 = upsertProvider(c1, openai);
    const c3 = setActiveProvider(c2, "openai");
    expect(c3.activeProvider).toBe("openai");
  });
});

describe("getActiveProviderConfig", () => {
  it("returns null when none active", () => {
    expect(getActiveProviderConfig(emptyAppConfig())).toBeNull();
  });

  it("returns the matching ProviderConfig when active", () => {
    const c1 = upsertProvider(emptyAppConfig(), anthropic);
    expect(getActiveProviderConfig(c1)).toEqual(anthropic);
  });
});

describe("createMemoryStore", () => {
  it("round-trips: save then load gives back equal config", () => {
    const store = createMemoryStore();
    const c1 = upsertProvider(emptyAppConfig(), ollama);
    const saved = store.save(c1);
    expect(saved.ok).toBe(true);
    const loaded = store.load();
    expect(loaded.ok).toBe(true);
    if (loaded.ok) expect(loaded.value).toEqual(c1);
  });

  it("accepts an initial config", () => {
    const initial = upsertProvider(emptyAppConfig(), openai);
    const store = createMemoryStore(initial);
    const loaded = store.load();
    expect(loaded.ok).toBe(true);
    if (loaded.ok) expect(loaded.value).toEqual(initial);
  });
});

describe("createLocalStorageStore", () => {
  it("round-trips through a fake Storage", () => {
    const storage = fakeStorage();
    const store = createLocalStorageStore(storage);
    const c1 = upsertProvider(emptyAppConfig(), openai);
    const saved = store.save(c1);
    expect(saved.ok).toBe(true);
    const loaded = store.load();
    expect(loaded.ok).toBe(true);
    if (loaded.ok) expect(loaded.value).toEqual(c1);
  });

  it("load() returns ok(emptyAppConfig()) when key is missing", () => {
    const storage = fakeStorage();
    const store = createLocalStorageStore(storage);
    const loaded = store.load();
    expect(loaded.ok).toBe(true);
    if (loaded.ok) expect(loaded.value).toEqual(emptyAppConfig());
  });

  it("load() returns err CONFIG_INVALID when storage holds corrupt JSON", () => {
    const storage = fakeStorage();
    storage.setItem("promptforge:config", "{not valid json");
    const store = createLocalStorageStore(storage);
    const loaded = store.load();
    expect(loaded.ok).toBe(false);
    if (!loaded.ok) expect(loaded.error.code).toBe("CONFIG_INVALID");
  });

  it("load() returns err CONFIG_INVALID when JSON parses but schema rejects", () => {
    const storage = fakeStorage();
    storage.setItem(
      "promptforge:config",
      JSON.stringify({ providers: {}, activeProvider: "foobar" }),
    );
    const store = createLocalStorageStore(storage);
    const loaded = store.load();
    expect(loaded.ok).toBe(false);
    if (!loaded.ok) expect(loaded.error.code).toBe("CONFIG_INVALID");
  });

  it("supports a custom key", () => {
    const storage = fakeStorage();
    const store = createLocalStorageStore(storage, "custom:key");
    const c1 = upsertProvider(emptyAppConfig(), openai);
    store.save(c1);
    expect(storage.getItem("custom:key")).not.toBeNull();
    expect(storage.getItem("promptforge:config")).toBeNull();
  });
});

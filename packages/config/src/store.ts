import {
  type AppError,
  appError,
  err,
  ok,
  type ProviderConfig,
  ProviderConfigSchema,
  type ProviderKind,
  ProviderKindSchema,
  type Result,
} from "@prompt-forge/core";
import { z } from "zod";

export const AppConfigSchema = z.object({
  providers: z.record(ProviderKindSchema, ProviderConfigSchema),
  activeProvider: ProviderKindSchema.nullable(),
});

export type AppConfig = z.infer<typeof AppConfigSchema>;

export const emptyAppConfig = (): AppConfig =>
  AppConfigSchema.parse({ providers: {}, activeProvider: null });

export type ConfigStore = {
  load(): Result<AppConfig, AppError>;
  save(c: AppConfig): Result<void, AppError>;
};

const cloneConfig = (c: AppConfig): AppConfig => ({
  providers: { ...c.providers },
  activeProvider: c.activeProvider,
});

export const upsertProvider = (c: AppConfig, p: ProviderConfig): AppConfig => {
  const next = cloneConfig(c);
  next.providers[p.kind] = p;
  if (next.activeProvider === null) {
    next.activeProvider = p.kind;
  }
  return next;
};

export const removeProvider = (c: AppConfig, kind: ProviderKind): AppConfig => {
  const next = cloneConfig(c);
  delete next.providers[kind];
  if (next.activeProvider === kind) {
    const remaining = Object.keys(next.providers) as ProviderKind[];
    next.activeProvider = remaining.length > 0 ? (remaining[0] as ProviderKind) : null;
  }
  return next;
};

export const setActiveProvider = (c: AppConfig, kind: ProviderKind): AppConfig => {
  if (!(kind in c.providers)) return c;
  const next = cloneConfig(c);
  next.activeProvider = kind;
  return next;
};

export const getActiveProviderConfig = (c: AppConfig): ProviderConfig | null => {
  if (c.activeProvider === null) return null;
  const found = c.providers[c.activeProvider];
  return found ?? null;
};

export const createMemoryStore = (initial?: AppConfig): ConfigStore => {
  let state: AppConfig = initial ? cloneConfig(initial) : emptyAppConfig();
  return {
    load: () => ok(cloneConfig(state)),
    save: (c) => {
      state = cloneConfig(c);
      return ok(undefined);
    },
  };
};

const DEFAULT_STORAGE_KEY = "promptforge:config";

export const createLocalStorageStore = (
  storage: Storage,
  key: string = DEFAULT_STORAGE_KEY,
): ConfigStore => ({
  load: () => {
    const raw = storage.getItem(key);
    if (raw === null) return ok(emptyAppConfig());
    let parsed: unknown;
    try {
      parsed = JSON.parse(raw);
    } catch (e) {
      return err(
        appError("CONFIG_INVALID", "Failed to parse stored config JSON", {
          cause: e,
        }),
      );
    }
    const result = AppConfigSchema.safeParse(parsed);
    if (!result.success) {
      return err(
        appError("CONFIG_INVALID", "Stored config does not match schema", {
          details: { issues: result.error.issues },
        }),
      );
    }
    return ok(result.data);
  },
  save: (c) => {
    try {
      storage.setItem(key, JSON.stringify(c));
      return ok(undefined);
    } catch (e) {
      return err(
        appError("CONFIG_INVALID", "Failed to write config to storage", {
          cause: e,
        }),
      );
    }
  },
});

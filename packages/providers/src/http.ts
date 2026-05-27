import { type AppError, appError, err, ok, type Result } from "@prompt-forge/core";

const DEFAULT_TIMEOUT_MS = 300_000;

export type FetchImpl = typeof fetch;

const statusToCode = (status: number): AppError["code"] => {
  if (status === 401 || status === 403) return "PROVIDER_AUTH";
  if (status === 408 || status === 504) return "PROVIDER_TIMEOUT";
  if (status === 429) return "PROVIDER_RATE_LIMIT";
  if (status >= 500) return "PROVIDER_UNREACHABLE";
  return "PROVIDER_BAD_RESPONSE";
};

export type JsonRequest = {
  url: string;
  body: unknown;
  headers?: Record<string, string>;
  timeoutMs?: number;
};

export const requestJson = async <T = unknown>(
  req: JsonRequest,
  fetchImpl: FetchImpl,
): Promise<Result<T, AppError>> => {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), req.timeoutMs ?? DEFAULT_TIMEOUT_MS);
  try {
    const res = await fetchImpl(req.url, {
      method: "POST",
      headers: { "content-type": "application/json", ...(req.headers ?? {}) },
      body: JSON.stringify(req.body),
      signal: controller.signal,
    });
    if (!res.ok) {
      return err(
        appError(statusToCode(res.status), `HTTP ${res.status}`, {
          details: { status: res.status },
        }),
      );
    }
    const ct = res.headers.get("content-type") ?? "";
    if (!ct.includes("application/json")) {
      return err(appError("PROVIDER_BAD_RESPONSE", `non-json content-type: ${ct}`));
    }
    const data = (await res.json()) as T;
    return ok(data);
  } catch (e) {
    if (e instanceof DOMException && e.name === "AbortError") {
      return err(appError("PROVIDER_TIMEOUT", "request aborted (timeout)"));
    }
    if (e instanceof TypeError) {
      return err(appError("PROVIDER_UNREACHABLE", e.message, { cause: e }));
    }
    return err(
      appError("PROVIDER_BAD_RESPONSE", e instanceof Error ? e.message : "unknown error", {
        cause: e,
      }),
    );
  } finally {
    clearTimeout(timeout);
  }
};

import { describe, expect, it } from "vitest";
import { appError, AppErrorCode } from "./error.js";

describe("appError", () => {
  it("constructs with code and message", () => {
    const e = appError("VALIDATION", "missing field");
    expect(e.code).toBe("VALIDATION");
    expect(e.message).toBe("missing field");
  });

  it("attaches optional cause and details", () => {
    const cause = new Error("upstream");
    const e = appError("PROVIDER_UNREACHABLE", "fetch failed", { cause, details: { url: "x" } });
    expect(e.cause).toBe(cause);
    expect(e.details).toEqual({ url: "x" });
  });

  it("exposes the canonical code set", () => {
    const codes: AppErrorCode[] = [
      "VALIDATION",
      "CONFIG_MISSING",
      "CONFIG_INVALID",
      "PROVIDER_AUTH",
      "PROVIDER_RATE_LIMIT",
      "PROVIDER_TIMEOUT",
      "PROVIDER_UNREACHABLE",
      "PROVIDER_BAD_RESPONSE",
      "INTERNAL",
    ];
    for (const c of codes) {
      expect(appError(c, "x").code).toBe(c);
    }
  });
});

import { afterEach, describe, expect, it, vi } from "vitest";
import { createLogger } from "./logger.js";

type Captured = { stream: "stdout" | "stderr"; line: string };

const setupCapture = (): {
  captured: Captured[];
  restore: () => void;
} => {
  const captured: Captured[] = [];
  const stdoutSpy = vi
    .spyOn(process.stdout, "write")
    .mockImplementation((chunk: unknown) => {
      captured.push({ stream: "stdout", line: String(chunk) });
      return true;
    });
  const stderrSpy = vi
    .spyOn(process.stderr, "write")
    .mockImplementation((chunk: unknown) => {
      captured.push({ stream: "stderr", line: String(chunk) });
      return true;
    });
  return {
    captured,
    restore: () => {
      stdoutSpy.mockRestore();
      stderrSpy.mockRestore();
    },
  };
};

const parseOnly = (line: string): Record<string, unknown> => {
  // strip trailing newline
  expect(line.endsWith("\n")).toBe(true);
  return JSON.parse(line.slice(0, -1)) as Record<string, unknown>;
};

describe("createLogger", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("info writes JSON on stdout with level/scope/msg and ISO ts", () => {
    const cap = setupCapture();
    try {
      const log = createLogger("svc");
      log.info("hello");
      expect(cap.captured).toHaveLength(1);
      const entry = cap.captured[0]!;
      expect(entry.stream).toBe("stdout");
      const obj = parseOnly(entry.line);
      expect(obj.level).toBe("info");
      expect(obj.scope).toBe("svc");
      expect(obj.msg).toBe("hello");
      expect(typeof obj.ts).toBe("string");
      // ISO 8601 e.g. 2024-01-01T00:00:00.000Z
      expect(() => new Date(obj.ts as string).toISOString()).not.toThrow();
      expect(new Date(obj.ts as string).toISOString()).toBe(obj.ts);
    } finally {
      cap.restore();
    }
  });

  it("warn writes to stderr, not stdout", () => {
    const cap = setupCapture();
    try {
      const log = createLogger("svc");
      log.warn("careful");
      expect(cap.captured).toHaveLength(1);
      const entry = cap.captured[0]!;
      expect(entry.stream).toBe("stderr");
      const obj = parseOnly(entry.line);
      expect(obj.level).toBe("warn");
    } finally {
      cap.restore();
    }
  });

  it("error writes to stderr; debug writes to stdout", () => {
    const cap = setupCapture();
    try {
      const log = createLogger("svc");
      log.error("oops");
      log.debug("dbg");
      expect(cap.captured).toHaveLength(2);
      const [errEntry, dbgEntry] = cap.captured;
      expect(errEntry!.stream).toBe("stderr");
      expect(parseOnly(errEntry!.line).level).toBe("error");
      expect(dbgEntry!.stream).toBe("stdout");
      expect(parseOnly(dbgEntry!.line).level).toBe("debug");
    } finally {
      cap.restore();
    }
  });

  it("merges fields into the JSON output", () => {
    const cap = setupCapture();
    try {
      const log = createLogger("svc");
      log.info("hello", { a: 1, b: "two" });
      const obj = parseOnly(cap.captured[0]!.line);
      expect(obj.a).toBe(1);
      expect(obj.b).toBe("two");
    } finally {
      cap.restore();
    }
  });

  it("redacts apiKey case-insensitively (apiKey, ApiKey, APIKEY)", () => {
    const cap = setupCapture();
    try {
      const log = createLogger("svc");
      log.info("m", { apiKey: "sk-1", ApiKey: "sk-2", APIKEY: "sk-3" });
      const obj = parseOnly(cap.captured[0]!.line);
      expect(obj.apiKey).toBe("[redacted]");
      expect(obj.ApiKey).toBe("[redacted]");
      expect(obj.APIKEY).toBe("[redacted]");
    } finally {
      cap.restore();
    }
  });

  it("redacts nested Authorization header at depth", () => {
    const cap = setupCapture();
    try {
      const log = createLogger("svc");
      log.info("req", { headers: { Authorization: "Bearer xyz" } });
      const obj = parseOnly(cap.captured[0]!.line);
      const headers = obj.headers as Record<string, unknown>;
      expect(headers.Authorization).toBe("[redacted]");
    } finally {
      cap.restore();
    }
  });

  it("redacts password and token keys", () => {
    const cap = setupCapture();
    try {
      const log = createLogger("svc");
      log.info("m", { password: "p", token: "t" });
      const obj = parseOnly(cap.captured[0]!.line);
      expect(obj.password).toBe("[redacted]");
      expect(obj.token).toBe("[redacted]");
    } finally {
      cap.restore();
    }
  });

  it("redacts inside arrays of objects", () => {
    const cap = setupCapture();
    try {
      const log = createLogger("svc");
      log.info("m", { creds: [{ token: "x" }, { token: "y" }] });
      const obj = parseOnly(cap.captured[0]!.line);
      const arr = obj.creds as Array<Record<string, unknown>>;
      expect(arr[0]!.token).toBe("[redacted]");
      expect(arr[1]!.token).toBe("[redacted]");
    } finally {
      cap.restore();
    }
  });

  it("child(bindings) propagates bindings into subsequent logs", () => {
    const cap = setupCapture();
    try {
      const log = createLogger("svc", { app: "x" });
      const child = log.child({ requestId: "abc" });
      child.info("m");
      const obj = parseOnly(cap.captured[0]!.line);
      expect(obj.app).toBe("x");
      expect(obj.requestId).toBe("abc");
      expect(obj.scope).toBe("svc");
    } finally {
      cap.restore();
    }
  });

  it("does not mutate the caller's input object during redaction", () => {
    const cap = setupCapture();
    try {
      const log = createLogger("svc");
      const input = {
        apiKey: "sk-secret",
        headers: { Authorization: "Bearer x" },
        creds: [{ token: "t" }],
      };
      const snapshot = JSON.parse(JSON.stringify(input)) as typeof input;
      log.info("m", input);
      expect(input).toEqual(snapshot);
    } finally {
      cap.restore();
    }
  });
});

export type LogLevel = "info" | "warn" | "error" | "debug";

export type Logger = {
  info(msg: string, fields?: Record<string, unknown>): void;
  warn(msg: string, fields?: Record<string, unknown>): void;
  error(msg: string, fields?: Record<string, unknown>): void;
  debug(msg: string, fields?: Record<string, unknown>): void;
  child(extraBindings: Record<string, unknown>): Logger;
};

const SECRET_KEY_PATTERN = /^(apiKey|Authorization|token|password)$/i;
const REDACTED = "[redacted]";

const redact = (value: unknown): unknown => {
  if (Array.isArray(value)) {
    return value.map((item) => redact(item));
  }
  if (value !== null && typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      if (SECRET_KEY_PATTERN.test(k)) {
        out[k] = REDACTED;
      } else {
        out[k] = redact(v);
      }
    }
    return out;
  }
  return value;
};

const redactRecord = (
  record: Record<string, unknown>,
): Record<string, unknown> => redact(record) as Record<string, unknown>;

const streamFor = (level: LogLevel): NodeJS.WriteStream =>
  level === "warn" || level === "error" ? process.stderr : process.stdout;

const emit = (
  level: LogLevel,
  scope: string,
  bindings: Record<string, unknown>,
  msg: string,
  fields: Record<string, unknown> | undefined,
): void => {
  const safeBindings = redactRecord(bindings);
  const safeFields = fields ? redactRecord(fields) : {};
  const entry: Record<string, unknown> = {
    ts: new Date().toISOString(),
    level,
    scope,
    msg,
    ...safeBindings,
    ...safeFields,
  };
  streamFor(level).write(`${JSON.stringify(entry)}\n`);
};

export const createLogger = (
  scope: string,
  bindings: Record<string, unknown> = {},
): Logger => {
  const make = (currentBindings: Record<string, unknown>): Logger => ({
    info: (msg, fields) => emit("info", scope, currentBindings, msg, fields),
    warn: (msg, fields) => emit("warn", scope, currentBindings, msg, fields),
    error: (msg, fields) => emit("error", scope, currentBindings, msg, fields),
    debug: (msg, fields) => emit("debug", scope, currentBindings, msg, fields),
    child: (extra) => make({ ...currentBindings, ...extra }),
  });
  return make(bindings);
};

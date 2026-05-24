export type AppErrorCode =
  | "VALIDATION"
  | "CONFIG_MISSING"
  | "CONFIG_INVALID"
  | "PROVIDER_AUTH"
  | "PROVIDER_RATE_LIMIT"
  | "PROVIDER_TIMEOUT"
  | "PROVIDER_UNREACHABLE"
  | "PROVIDER_BAD_RESPONSE"
  | "INTERNAL";

export type AppError = {
  readonly code: AppErrorCode;
  readonly message: string;
  readonly cause?: unknown;
  readonly details?: Record<string, unknown>;
};

export const appError = (
  code: AppErrorCode,
  message: string,
  opts?: { cause?: unknown; details?: Record<string, unknown> },
): AppError => ({
  code,
  message,
  ...(opts?.cause !== undefined ? { cause: opts.cause } : {}),
  ...(opts?.details !== undefined ? { details: opts.details } : {}),
});

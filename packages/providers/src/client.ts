import type { AppError, ChatRequest, ChatResponse, Result } from "@prompt-forge/core";

export type ProviderClient = {
  chat: (req: ChatRequest) => Promise<Result<ChatResponse, AppError>>;
};

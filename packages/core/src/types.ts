import { z } from "zod";

export const ProviderKindSchema = z.enum(["ollama", "lemonade", "llamacpp", "openai", "anthropic"]);
export type ProviderKind = z.infer<typeof ProviderKindSchema>;

const BaseProviderConfig = z.object({
  baseUrl: z.string().url(),
  model: z.string().min(1),
  apiKey: z.string().min(1).optional(),
  timeoutMs: z.number().int().positive().optional(),
});

export const ProviderConfigSchema = z.discriminatedUnion("kind", [
  BaseProviderConfig.extend({ kind: z.literal("ollama") }),
  BaseProviderConfig.extend({ kind: z.literal("lemonade") }),
  BaseProviderConfig.extend({ kind: z.literal("llamacpp") }),
  BaseProviderConfig.extend({
    kind: z.literal("openai"),
    apiKey: z.string().min(1),
  }),
  BaseProviderConfig.extend({
    kind: z.literal("anthropic"),
    apiKey: z.string().min(1),
  }),
]);
export type ProviderConfig = z.infer<typeof ProviderConfigSchema>;

export const ChatRoleSchema = z.enum(["system", "user", "assistant"]);
export type ChatRole = z.infer<typeof ChatRoleSchema>;

export const ChatMessageSchema = z.object({
  role: ChatRoleSchema,
  content: z.string(),
});
export type ChatMessage = z.infer<typeof ChatMessageSchema>;

export const ChatRequestSchema = z.object({
  messages: z.array(ChatMessageSchema).min(1),
  temperature: z.number().min(0).max(2).optional(),
  maxTokens: z.number().int().positive().optional(),
});
export type ChatRequest = z.infer<typeof ChatRequestSchema>;

export const ChatResponseSchema = z.object({
  content: z.string(),
  finishReason: z.enum(["stop", "length", "tool_use", "other"]).optional(),
  usage: z
    .object({
      promptTokens: z.number().int().nonnegative().optional(),
      completionTokens: z.number().int().nonnegative().optional(),
    })
    .optional(),
});
export type ChatResponse = z.infer<typeof ChatResponseSchema>;

export const TaskKindSchema = z.enum([
  "feature",
  "bug",
  "refactor",
  "test",
  "docs",
  "review",
  "unknown",
]);
export type TaskKind = z.infer<typeof TaskKindSchema>;

export const PatternCategorySchema = z.enum([
  "orchestration",
  "feedback",
  "context",
  "reliability",
  "security",
  "ux",
  "learning",
]);
export type PatternCategory = z.infer<typeof PatternCategorySchema>;

export const PatternSchema = z.object({
  slug: z.string().min(1),
  name: z.string().min(1),
  category: PatternCategorySchema,
  triggers: z.array(z.string().min(1)).min(1),
  taskKinds: z.array(TaskKindSchema).min(1),
  directive: z.string().min(1),
  sourceUrl: z.string().url(),
});
export type Pattern = z.infer<typeof PatternSchema>;

export const EnhancementRequestSchema = z.object({
  rawPrompt: z.string().min(10),
  taskKind: TaskKindSchema.optional(),
  maxPatterns: z.number().int().positive().max(10).optional(),
  pinnedSlugs: z.array(z.string()).optional(),
  excludedSlugs: z.array(z.string()).optional(),
  reflect: z.boolean().optional(),
  temperature: z.number().min(0).max(2).optional(),
});
export type EnhancementRequest = z.infer<typeof EnhancementRequestSchema>;

export const EnhancementResponseSchema = z.object({
  rewrittenPrompt: z.string(),
  taskKind: TaskKindSchema,
  selectedPatterns: z.array(z.string()),
  draft: z.string().optional(),
  reflected: z.boolean(),
});
export type EnhancementResponse = z.infer<typeof EnhancementResponseSchema>;

import { type AppError, appError, err, ok, type Result } from "@prompt-forge/core";
import type { ProviderClient } from "@prompt-forge/providers";

export type RepoFile = { path: string; content: string };
export type RepoGenRequest = { objective: string };
export type RepoGenResponse = { files: RepoFile[]; fileCount: number };

type FileTreeEntry = { path: string; description: string };

const stripThinking = (text: string): string =>
  text.replace(/<think>[\s\S]*?<\/think>/gi, "").trim();

export const parseFileTree = (output: string): FileTreeEntry[] | null => {
  const base = stripThinking(output);

  // Strategy 1: strip markdown fence then parse whole string
  // Strategy 2: extract JSON array from within surrounding text
  const candidates: string[] = [
    base.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "").trim(),
    (() => {
      const first = base.indexOf("[");
      const last = base.lastIndexOf("]");
      return first !== -1 && last > first ? base.slice(first, last + 1) : "";
    })(),
    base,
  ];

  for (const candidate of candidates) {
    if (!candidate) continue;
    try {
      const parsed = JSON.parse(candidate);
      if (Array.isArray(parsed) && parsed.length > 0 && typeof parsed[0]?.path === "string") {
        return parsed as FileTreeEntry[];
      }
    } catch {
      // try next candidate
    }
  }
  return null;
};

const extractWithRegex = (text: string, regex: RegExp): RepoFile[] => {
  const files: RepoFile[] = [];
  let match: RegExpExecArray | null;
  while ((match = regex.exec(text)) !== null) {
    const path = match[1];
    const content = match[2];
    if (path !== undefined && content !== undefined) {
      files.push({ path: path.trim(), content: content.trim() });
    }
  }
  return files;
};

export const parseFileContents = (output: string): RepoFile[] => {
  const cleaned = stripThinking(output);

  // Primary: <<<FILE:path>>>...<<<ENDFILE>>>
  const primary = extractWithRegex(cleaned, /<<<FILE:([^>]+)>>>([\s\S]*?)<<<ENDFILE>>>/g);
  if (primary.length > 0) return primary;

  // Fallback: === FILE: path === ... === END FILE ===
  const alt = extractWithRegex(
    cleaned,
    /===\s*FILE:\s*([^\n=]+?)\s*===([\s\S]*?)===\s*END\s*FILE\s*===/gi,
  );
  if (alt.length > 0) return alt;

  return [];
};

export const buildFileTreePrompt = (objective: string): string =>
  `You are a software architect. Given the objective below, output ONLY a JSON array of files to generate for the project. No explanation, no markdown fences, no extra text — only the raw JSON array.

Format: [{"path":"src/index.ts","description":"entry point"},...]

Rules:
- Include all files needed for a complete, runnable project
- Include README.md, configuration files, and infrastructure files
- Paths must be relative to the project root
- Maximum 20 files

Objective: ${objective}`;

export const buildContentPrompt = (objective: string, tree: FileTreeEntry[]): string => {
  const fileList = tree.map((f) => `- ${f.path}: ${f.description}`).join("\n");
  return `You are a senior software engineer. Generate complete, production-ready content for each file listed below.

Use EXACTLY this format for each file — no other text between files:
<<<FILE:path/to/file>>>
[full file content here]
<<<ENDFILE>>>

Files to generate:
${fileList}

Project objective: ${objective}

Generate all files now:`;
};

export const buildRepoPrompt = (objective: string): string =>
  `Generate a complete project for the objective below. Output file contents using ONLY this exact format:

<<<FILE:path/to/file>>>
file content here
<<<ENDFILE>>>

Example:
<<<FILE:src/index.ts>>>
console.log("hello");
<<<ENDFILE>>>

Rules:
- 5 to 10 files maximum
- Always include README.md
- Include entry point, package/config files, and essential source files
- Files must be complete and functional — no stubs or placeholders
- No text outside of FILE blocks

Objective: ${objective}`;

export const generateRepo = async (
  client: ProviderClient,
  request: RepoGenRequest,
): Promise<Result<RepoGenResponse, AppError>> => {
  const result = await client.chat({
    messages: [
      {
        role: "system",
        content:
          "You are a senior software engineer. Output only file blocks in the requested format. No prose, no explanations.",
      },
      { role: "user", content: buildRepoPrompt(request.objective) },
    ],
    temperature: 0.2,
  });
  if (!result.ok) return result;

  const files = parseFileContents(result.value.content);
  if (files.length === 0) {
    return err(
      appError(
        "PROVIDER_BAD_RESPONSE",
        "LLM did not return any file blocks. Expected <<<FILE:path>>> content <<<ENDFILE>>> format.",
        { details: { output: result.value.content.slice(0, 300) } },
      ),
    );
  }

  return ok({ files, fileCount: files.length });
};

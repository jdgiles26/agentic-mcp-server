# Patterns

PromptForge ships with 22 patterns adapted from [`awesome-agentic-patterns`](https://github.com/nibzard/awesome-agentic-patterns). Each carries a `directive` field — a prompt-ready, markdown-headed instruction the enhancer composes into the rewrite.

## Catalog (by category)

### Orchestration & Control
- **Plan-Then-Execute** — fixed plan before any tool call.
- **Specification-Driven Agent Development** — pin behavior to a testable spec.
- **Discrete Phase Separation** — INVESTIGATE → DESIGN → IMPLEMENT → VERIFY.
- **Tool Capability Compartmentalization** — one step, one tool, one effect.
- **Subject Hygiene for Task Delegation** — one subject, one verb per subtask.
- **Tree-of-Thought Reasoning** — branch on uncertainty, score, prune.
- **Action-Selector Pattern** — declare action class (READ/WRITE/EXECUTE/ASK_USER).

### Feedback Loops
- **Spec-As-Test Feedback Loop** — failing test first.
- **Self-Discover** — task-specific reasoning structure, not generic CoT.
- **Reflection Loop** — re-read requirement, list failure modes, revise.
- **Self-Critique Evaluator Loop** — rubric-scored regenerate up to 3 times.
- **Rich Feedback Loops > Perfect Prompts** — wire a deterministic check.
- **Iterative Prompt & Skill Refinement** — refine prompt itself on bad output.

### Context & Memory
- **Context Minimization** — load only what's needed, declare it explicitly.
- **Curated Code Context Window** — symbol-level slices, cited line ranges.
- **Working Memory via TodoWrite** — externalized checked todo list.
- **Progressive Disclosure for Large Files** — read by ranged slice.

### Reliability & Eval
- **Structured Output Specification** — exact output shape required.

### Security & Safety
- **Dual LLM Pattern** — privileged planner + quarantined extractor.
- **Hook-Based Safety Guard Rails** — explicit confirmation for irreversible ops.

### UX & Collaboration
- **Verbose Reasoning Transparency** — surface tradeoffs and discarded options.

### Learning & Adaptation
- **Compounding Engineering** — codify learnings into reusable instructions.

## How selection works

`selectPatterns(rawPrompt, taskKind, opts)` is a deterministic, pure function:

```text
score(pattern) =
    +5     if taskKind ∈ pattern.taskKinds
    +1     for each unique trigger keyword present in rawPrompt (word-boundary match)
    +0.5   ambient bonus when taskKind matches (so ties resolve in favor of relevance)
```

Top-N by score, ties broken by catalog order. `pinned` slugs are inserted first regardless of score; `excluded` slugs are dropped before scoring.

If nothing scores above zero, the selector falls back to the first N catalog entries that include the request's `taskKind` in their `taskKinds`. This guarantees the enhancer always produces a prompt that has *some* structure applied.

## How the rewrite works

1. The classifier infers a `TaskKind` from the raw prompt (or uses the user's hint).
2. The selector picks the top-N patterns.
3. `buildEnhancementMessages` composes the meta-prompt: a strict system message that tells the LLM "you are PromptForge, you do not solve the task, you rewrite the prompt", and a user message that contains the patterns' directives plus the verbatim raw prompt fenced as data.
4. The provider returns a draft.
5. If `reflect: true`, `buildReflectionMessages` runs the Reflection Loop pattern *on the rewrite itself*, producing the final version.
6. `extractRewrittenPrompt` strips the enclosing ` ```prompt ` fence and returns the rewrite.

## Adding a new pattern

1. Find a published source on `agentic-patterns.com` and copy the canonical link.
2. Add an entry to `PATTERN_CATALOG` in `packages/patterns/src/catalog.ts`.
3. The directive is the only field the LLM ever sees — make it a self-contained markdown block that starts with `## <Name>`.
4. Add at least 3 trigger keywords that would plausibly appear in user prompts.
5. List the `taskKinds` it materially helps with.
6. Run `pnpm test --filter @prompt-forge/patterns` — the catalog invariant tests will catch missing fields.

import { EnhanceForm } from "@/components/enhance-form";

export default function Home() {
  return (
    <main>
      <h1>PromptForge</h1>
      <p className="tagline">
        Paste a coding-assistant prompt. PromptForge classifies it, selects agentic patterns,
        and asks your configured LLM to rewrite it.
      </p>
      <EnhanceForm />
    </main>
  );
}

import { RepoForm } from "@/components/repo-form";

export const metadata = {
  title: "Repo Generator — PromptForge",
  description: "Generate a complete project repository from an objective",
};

export default function RepoPage() {
  return (
    <main>
      <h1>Repository Generator</h1>
      <p className="tags">
        Describe your project and PromptForge will generate a complete, production-ready file
        structure as a downloadable .zip.
      </p>
      <RepoForm />
    </main>
  );
}

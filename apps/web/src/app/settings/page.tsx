import { ProviderSettings } from "@/components/provider-settings";

export default function SettingsPage() {
  return (
    <main>
      <h1>Settings</h1>
      <p className="tagline">
        Configure LLM providers. Settings are stored locally in your browser.
      </p>
      <ProviderSettings />
    </main>
  );
}

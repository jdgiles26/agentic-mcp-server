import type { ReactNode } from "react";
import "./globals.css";

export const metadata = { title: "PromptForge", description: "Rewrite prompts with agentic patterns" };

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}

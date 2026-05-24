// @vitest-environment happy-dom

import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { EnhanceForm } from "./enhance-form.js";

const STORAGE_KEY = "promptforge:config";

const seedConfig = (cfg: unknown) => {
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(cfg));
};

const validOllamaConfig = {
  providers: {
    ollama: {
      kind: "ollama",
      baseUrl: "http://localhost:11434",
      model: "llama3.1:8b",
    },
  },
  activeProvider: "ollama",
};

describe("<EnhanceForm />", () => {
  beforeEach(() => {
    window.localStorage.clear();
    (global as any).fetch = vi.fn();
  });
  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it("renders 'Configure a provider in /settings first' when localStorage is empty", async () => {
    render(<EnhanceForm />);
    await waitFor(() => {
      expect(screen.getByText(/Configure a provider in \/settings first/i)).toBeTruthy();
    });
    // Should link to settings
    const link = screen.getByRole("link", { name: /settings/i });
    expect(link.getAttribute("href")).toBe("/settings");
  });

  it("disables the rewrite button when prompt < 10 chars and enables at >= 10", async () => {
    seedConfig(validOllamaConfig);
    render(<EnhanceForm />);
    const textarea = (await screen.findByLabelText(/Raw prompt/i)) as HTMLTextAreaElement;
    const button = screen.getByRole("button", { name: /Rewrite prompt/i }) as HTMLButtonElement;
    expect(button.disabled).toBe(true);
    fireEvent.change(textarea, { target: { value: "short" } });
    expect(button.disabled).toBe(true);
    fireEvent.change(textarea, { target: { value: "this is a long enough prompt" } });
    expect(button.disabled).toBe(false);
  });

  it("shows a read-only summary line with kind + model when activeProvider is configured", async () => {
    seedConfig(validOllamaConfig);
    render(<EnhanceForm />);
    await waitFor(() => {
      const summary = screen.getByText(/Provider:/i);
      expect(summary.textContent).toContain("ollama");
      expect(summary.textContent).toContain("llama3.1:8b");
    });
  });

  it("submits to /api/enhance and renders the rewritten prompt in a <pre> on 200", async () => {
    seedConfig(validOllamaConfig);
    (global as any).fetch = vi.fn(async () => ({
      ok: true,
      status: 200,
      json: async () => ({
        rewrittenPrompt: "rewritten body",
        taskKind: "feature",
        selectedPatterns: ["a", "b"],
        reflected: false,
      }),
    }));
    render(<EnhanceForm />);
    const textarea = (await screen.findByLabelText(/Raw prompt/i)) as HTMLTextAreaElement;
    fireEvent.change(textarea, { target: { value: "this is a long enough prompt" } });
    const button = screen.getByRole("button", { name: /Rewrite prompt/i });
    fireEvent.click(button);

    await waitFor(() => {
      const pre = document.querySelector("pre");
      expect(pre?.textContent).toBe("rewritten body");
    });

    const fetchMock = (global as any).fetch as ReturnType<typeof vi.fn>;
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const call = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(call[0]).toBe("/api/enhance");
    const body = JSON.parse(call[1].body as string);
    expect(body.provider.kind).toBe("ollama");
    expect(body.provider.model).toBe("llama3.1:8b");
  });

  it("renders the error message and no <pre> on 502 response", async () => {
    seedConfig(validOllamaConfig);
    (global as any).fetch = vi.fn(async () => ({
      ok: false,
      status: 502,
      json: async () => ({
        error: { code: "PROVIDER_UNREACHABLE", message: "fetch failed" },
      }),
    }));
    render(<EnhanceForm />);
    const textarea = (await screen.findByLabelText(/Raw prompt/i)) as HTMLTextAreaElement;
    fireEvent.change(textarea, { target: { value: "this is a long enough prompt" } });
    fireEvent.click(screen.getByRole("button", { name: /Rewrite prompt/i }));

    await waitFor(() => {
      expect(screen.getByText(/fetch failed/i)).toBeTruthy();
    });
    expect(document.querySelector("pre")).toBeNull();
  });
});

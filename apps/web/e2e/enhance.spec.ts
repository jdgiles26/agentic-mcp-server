import { expect, test } from "@playwright/test";

const PROVIDER = {
  kind: "ollama",
  baseUrl: "http://127.0.0.1:11434",
  model: "llama3.1:8b",
};

test.beforeEach(async ({ page }) => {
  // Seed an active provider in localStorage so the form is usable without
  // a real server-side LLM. The enhance request below is intercepted.
  await page.addInitScript((p) => {
    window.localStorage.setItem(
      "promptforge:config",
      JSON.stringify({ providers: { ollama: p }, activeProvider: "ollama" }),
    );
  }, PROVIDER);
});

test("home renders nav and form", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("link", { name: "Home" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Settings", exact: true })).toBeVisible();
  await expect(page.getByLabel("Raw prompt")).toBeVisible();
  await expect(page.getByRole("button", { name: /rewrite prompt/i })).toBeDisabled();
});

test("submit short prompt remains disabled, long prompt enables", async ({ page }) => {
  await page.goto("/");
  const textarea = page.getByLabel("Raw prompt");
  await textarea.fill("hi");
  await expect(page.getByRole("button", { name: /rewrite prompt/i })).toBeDisabled();
  await textarea.fill("refactor the auth module to use hooks and add tests");
  await expect(page.getByRole("button", { name: /rewrite prompt/i })).toBeEnabled();
});

test("end-to-end rewrite via mocked /api/enhance", async ({ page }) => {
  await page.route("**/api/enhance", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        rewrittenPrompt: "MOCKED REWRITE FROM E2E",
        taskKind: "refactor",
        selectedPatterns: ["plan-then-execute", "reflection-loop"],
        draft: "MOCKED REWRITE FROM E2E",
        reflected: false,
      }),
    });
  });
  await page.goto("/");
  await page.getByLabel("Raw prompt").fill("refactor the auth module to use hooks and add tests");
  await page.getByRole("button", { name: /rewrite prompt/i }).click();
  await expect(page.getByText("MOCKED REWRITE FROM E2E")).toBeVisible({ timeout: 10_000 });
  await expect(page.getByText(/taskKind: refactor/)).toBeVisible();
});

test("settings page renders provider form for the active kind", async ({ page }) => {
  await page.goto("/settings");
  await expect(page.getByRole("heading", { name: /settings/i, level: 1 })).toBeVisible();
  // Wait for the client component to hydrate
  await expect(page.getByText(/ollama/i).first()).toBeVisible({ timeout: 10_000 });
});

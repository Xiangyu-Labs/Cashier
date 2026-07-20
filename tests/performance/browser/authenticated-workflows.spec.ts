import { expect, test } from "@playwright/test";
import {
  collectExposedTransferSizes,
  observeResources,
  recordUrl,
  type BrowserWorkflowObservation,
  type BrowserResourceObservation,
  writeBrowserObservations,
} from "./helpers";

const workflows: BrowserWorkflowObservation[] = [];
const resources: BrowserResourceObservation[] = [];

async function observe(name: string, action: () => Promise<void>): Promise<void> {
  const startedAt = performance.now();
  await action();
  workflows.push({ name, durationMs: Math.round(performance.now() - startedAt), result: "passed" });
}

test.afterAll(async () => {
  await writeBrowserObservations(workflows, resources);
});

test("records authenticated local workflow evidence without sensitive request data", async ({ page }) => {
  test.setTimeout(120_000);
  resources.push(...observeResources(page));

  await observe("visible dev authentication", async () => {
    await page.goto("/en/login");
    const devSignIn = page.getByRole("button", { name: "Continue as dev" });
    await expect(devSignIn).toBeEnabled({ timeout: 30_000 });
    await devSignIn.click();
    await expect(page).toHaveURL(/\/en(?:\?|$)/, { timeout: 30_000 });
    await expect(page.getByRole("tab", { name: "Stream" })).toBeVisible({ timeout: 30_000 });
  });

  await observe("home stream", async () => {
    await expect(page.getByRole("tab", { name: "Stream" })).toHaveAttribute("data-state", "active");
  });

  await observe("tab intent and navigation", async () => {
    const settings = page.getByRole("tab", { name: "Settings" });
    await settings.hover();
    await settings.click();
    await expect(settings).toHaveAttribute("data-state", "active");
  });

  await observe("filter action", async () => {
    await page.getByRole("tab", { name: "Stream" }).click();
    await page.getByRole("button", { name: "More Filters" }).click();
    const pastSevenDays = page.getByRole("button", { name: "Past 7 Days", exact: true });
    await expect(pastSevenDays).toBeVisible();
    await pastSevenDays.click();
    await page.getByRole("button", { name: "Apply Filters" }).click();
    await expect(page).toHaveURL(
      (url) =>
        url.searchParams.get("tab") === "stream" &&
        url.searchParams.get("period") === "custom" &&
        url.searchParams.has("startDate") &&
        url.searchParams.has("endDate")
    );
  });

  await observe("deferred entry feature opening", async () => {
    await page.getByRole("button", { name: "New Record" }).click();
    await expect(page.getByRole("dialog")).toBeVisible();
    await page.keyboard.press("Escape");
  });

  await observe("upload and stored-file route access", async () => {
    const upload = await page.request.get("/api/uploads/browser-performance-route-check");
    const storedFile = await page.request.get("/api/stored-files/00000000-0000-0000-0000-000000000000");
    recordUrl(upload.url(), "fetch", upload.status(), resources);
    recordUrl(storedFile.url(), "fetch", storedFile.status(), resources);
    expect(upload.status()).toBe(404);
    expect(storedFile.status()).toBe(404);
  });

  await observe("logout", async () => {
    await page.getByRole("tab", { name: "Settings" }).click();
    await page.getByRole("button", { name: "Sign Out" }).click();
    await expect(page).toHaveURL(/\/en\/login/);
  });

  await collectExposedTransferSizes(page, resources);
});

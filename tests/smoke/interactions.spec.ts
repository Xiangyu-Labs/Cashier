import { expect, test, type Locator } from "@playwright/test";

test("selection alignment, discard confirmation and one-tap split navigation", async ({
  page,
  isMobile,
}, testInfo) => {
  const activate = (locator: Locator) => (isMobile ? locator.tap() : locator.click());
  const name = `Interaction ${testInfo.project.name}`;
  await page.goto("/en/login");
  await page.getByLabel("Email Address", { exact: true }).fill(process.env.SMOKE_EMAIL!);
  await page.getByLabel("Password", { exact: true }).fill(process.env.SMOKE_PASSWORD!);
  await page.getByRole("button", { name: "Sign In", exact: true }).click();
  await expect(page).not.toHaveURL(/\/login/);
  await page.getByRole("button", { name: "New Record", exact: true }).click();
  let dialog = page.getByRole("dialog");
  await dialog.getByRole("button", { name: "Quick Entry", exact: true }).click();
  await dialog.getByRole("textbox", { name: "Item name (optional)", exact: true }).fill(name);
  await dialog.getByRole("group").getByRole("button").first().click();
  await dialog.getByRole("textbox", { name: "Amount", exact: true }).fill("12.34");
  await dialog.getByRole("button", { name: "Record", exact: true }).click();
  await expect(dialog).toHaveCount(0);
  const initialCard = page.getByTestId("source-document-card-root").filter({ hasText: name });
  await expect(initialCard).toBeVisible();
  const id = await initialCard.getAttribute("data-source-document-id");
  const card = page.locator(`[data-source-document-id="${id}"]`);
  await activate(page.getByRole("button", { name: "Select", exact: true }));
  const surface = page.locator('[data-selection-mode="true"]').filter({ has: card });
  const expand = surface.getByRole("button", { name: "Collapse", exact: true });
  await expect(expand).toHaveCount(1);
  const marker = surface.getByRole("checkbox").locator("span");
  const markerBox = await marker.boundingBox();
  const expandBox = await expand.boundingBox();
  expect(
    Math.abs(markerBox!.y + markerBox!.height / 2 - expandBox!.y - expandBox!.height / 2)
  ).toBeLessThan(1.5);
  expect(expandBox!.width + 0.001).toBeGreaterThanOrEqual(44);
  expect(expandBox!.height + 0.001).toBeGreaterThanOrEqual(44);
  await activate(surface.getByRole("checkbox"));
  await activate(expand);
  await expect(surface.getByRole("checkbox")).toBeChecked();
  await page.screenshot({ path: testInfo.outputPath("stream-selection.png"), fullPage: true });
  await page.emulateMedia({ colorScheme: "dark" });
  await expect(page.locator("html")).toHaveClass(/dark/);
  await page.screenshot({ path: testInfo.outputPath("stream-selection-dark.png"), fullPage: true });
  await page.emulateMedia({ colorScheme: "light" });
  await activate(page.getByRole("button", { name: "Cancel", exact: true }));
  await card.getByRole("button", { name: /Quick Entry$/ }).click();
  dialog = page.getByRole("dialog");
  await dialog.getByRole("button", { name: "Select", exact: true }).click();
  const row = dialog.getByRole("checkbox", { name: `Select ${name}`, exact: true });
  const rowBox = await row.boundingBox();
  const rowMarker = await row.locator("span").boundingBox();
  expect(
    Math.abs(rowBox!.y + rowBox!.height / 2 - rowMarker!.y - rowMarker!.height / 2)
  ).toBeLessThan(1.5);
  await activate(row);
  await expect(dialog.getByRole("button", { name: "Delete", exact: true }).first()).toHaveCSS(
    "color",
    "rgb(255, 255, 255)"
  );
  await page.screenshot({ path: testInfo.outputPath("detail-selection.png"), fullPage: true });
  await dialog.getByRole("button", { name: "Cancel", exact: true }).click();
  await dialog.getByRole("button", { name: "Edit", exact: true }).click();
  await dialog.getByRole("button", { name: "Dining", exact: true }).first().click();
  await dialog.getByRole("textbox").first().fill("Discard this title");
  await dialog.getByRole("textbox").first().press("Enter");
  await dialog.getByRole("button", { name: "Cancel editing", exact: true }).click();
  await expect(page.getByRole("dialog").last()).toContainText("You have unsaved changes");
  await page
    .getByRole("dialog")
    .last()
    .getByRole("button", { name: "Continue editing", exact: true })
    .click();
  await dialog.getByRole("button", { name: "Cancel editing", exact: true }).click();
  await page
    .getByRole("dialog")
    .last()
    .getByRole("button", { name: "Discard", exact: true })
    .click();
  await expect(dialog.getByText("Discard this title", { exact: true })).toHaveCount(0);
  await dialog.getByRole("button", { name: "Edit", exact: true }).click();
  await dialog.getByRole("button", { name: "Add entry", exact: true }).click();
  const add = page.getByRole("dialog").last();
  await add.getByLabel("Name", { exact: true }).fill("Second item");
  await add.getByLabel("Amount", { exact: true }).fill("2.00");
  await add.getByRole("button", { name: "Add entry", exact: true }).click();
  await expect(page.getByRole("dialog")).toHaveCount(1);
  await expect(dialog.getByRole("button", { name: "Select", exact: true })).toBeEnabled();
  await dialog.getByRole("button", { name: "Add entry", exact: true }).click();
  await add.getByLabel("Name", { exact: true }).fill("Third item");
  await add.getByLabel("Amount", { exact: true }).fill("3.00");
  await add.getByRole("button", { name: "Add entry", exact: true }).click();
  await expect(page.getByRole("dialog")).toHaveCount(1);
  await expect(dialog.getByRole("button", { name: "Select", exact: true })).toBeEnabled();
  await expect(dialog.getByText("Third item", { exact: true })).toBeVisible();
  let releaseRefresh!: () => void;
  let heldReads = 0;
  const refreshGate = new Promise<void>((resolve) => {
    releaseRefresh = resolve;
  });
  await page.route("**/api/ledger-queries", async (route) => {
    const query = route.request().postDataJSON().query;
    if (["detail", "stream", "total", "summary", "stats"].includes(query)) {
      heldReads++;
      await refreshGate;
    }
    await route.continue();
  });
  await dialog.getByRole("button", { name: "Select", exact: true }).click();
  await dialog.getByRole("checkbox", { name: "Select Second item", exact: true }).click();
  await dialog.getByRole("button", { name: "Split", exact: true }).click();
  const firstSplitStarted = Date.now();
  await page
    .getByRole("dialog")
    .last()
    .getByRole("button", { name: "Split bill", exact: true })
    .click();
  await expect(dialog.getByRole("checkbox", { name: `Select ${name}`, exact: true })).toBeEnabled({
    timeout: 5_000,
  });
  const firstSplitMs = Date.now() - firstSplitStarted;
  await expect(
    dialog.getByRole("checkbox", { name: "Select Second item", exact: true })
  ).toHaveCount(0);
  await expect.poll(() => heldReads).toBeGreaterThan(0);
  // The next split must not wait for any list, stats, or detail read to finish.
  await dialog.getByRole("checkbox", { name: "Select Third item", exact: true }).click();
  await dialog.getByRole("button", { name: "Split", exact: true }).click();
  const secondSplitStarted = Date.now();
  await page
    .getByRole("dialog")
    .last()
    .getByRole("button", { name: "Split bill", exact: true })
    .click();
  await expect(dialog.getByRole("checkbox", { name: `Select ${name}`, exact: true })).toBeEnabled({
    timeout: 5_000,
  });
  await expect(
    dialog.getByRole("checkbox", { name: "Select Third item", exact: true })
  ).toHaveCount(0);
  await page.screenshot({ path: testInfo.outputPath("continuous-split.png"), fullPage: true });
  await testInfo.attach("split-timing", {
    body: JSON.stringify({
      firstSplitMs,
      secondSplitMs: Date.now() - secondSplitStarted,
      heldReads,
    }),
    contentType: "application/json",
  });
  releaseRefresh();
  const originalUrl = page.url();
  await expect(page.getByRole("button", { name: "View new bill", exact: true })).toHaveCount(1);
  const jump = page.getByRole("button", { name: "View new bill", exact: true }).first();
  await expect(jump).toBeVisible();
  const jumpBox = await jump.boundingBox();
  expect(jumpBox!.height + 0.001).toBeGreaterThanOrEqual(44);
  await activate(jump);
  await expect(page).not.toHaveURL(originalUrl);
  await expect(page.getByRole("dialog")).toContainText("Third item");
  await page.screenshot({ path: testInfo.outputPath("split-navigation.png"), fullPage: true });
  await page.reload();
  await expect(page.getByRole("dialog")).toContainText("Third item");
});

import { expect, test } from "@playwright/test";

test("@demo opens a populated workspace with evidence and statistics", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));

  await page.goto("/en");
  await expect(page).toHaveURL(/\/login/);
  await page.getByRole("button", { name: "Continue as dev", exact: true }).click();
  await expect(page).not.toHaveURL(/\/login/);

  const coffee = page.getByTestId("source-document-card-root").filter({ hasText: "Harbor Coffee" });
  await expect(coffee).toBeVisible();
  await coffee.getByRole("button", { name: /Harbor Coffee/ }).click();
  const detail = page.getByRole("dialog").first();
  await expect(detail.getByText("Flat White", { exact: true })).toBeVisible();
  await expect(detail.getByText("Chicken Sandwich", { exact: true })).toBeVisible();
  if ((page.viewportSize()?.width ?? 0) < 1024) {
    await detail.getByRole("button", { name: "Evidence", exact: true }).click();
  }
  await expect(detail.getByRole("img", { name: "Image 1" })).toBeVisible();
  if ((page.viewportSize()?.width ?? 0) < 1024) {
    await detail.getByRole("button", { name: "Back to details", exact: true }).click();
  }
  await detail.getByRole("button", { name: "Close", exact: true }).click();

  await expect(page.getByText("Regional Rail and Cafe", { exact: true })).toBeVisible();
  await expect(page.getByText("Blurry Parking Receipt", { exact: true })).toBeVisible();
  await expect(page.getByText("Missing Currency Receipt", { exact: true })).toBeVisible();

  // A document the AI could not turn into expenses shows one status plus the
  // reason the AI wrote for the ledger owner, not a generic diagnostic code.
  const blurry = page
    .getByTestId("source-document-card-root")
    .filter({ hasText: "Blurry Parking Receipt" });
  await expect(blurry.getByTestId("status-label")).toHaveText("Couldn't Parse");
  await blurry.getByRole("button", { name: /Blurry Parking Receipt/ }).click();
  const blurryDetail = page.getByRole("dialog").first();
  await expect(blurryDetail.getByText("Couldn't Parse", { exact: true })).toBeVisible();
  await expect(
    blurryDetail.getByText("The receipt photo is too blurry to read the merchant and the total.", {
      exact: true,
    })
  ).toBeVisible();
  await blurryDetail.getByRole("button", { name: "Close", exact: true }).click();

  await page
    .getByRole("navigation", { name: "Ledger navigation" })
    .getByRole("button", { name: "Stats", exact: true })
    .click();
  await expect(page.getByText("Dining", { exact: true }).first()).toBeVisible();
  await expect(page.getByText("Household", { exact: true }).first()).toBeVisible();
  expect(errors).toEqual([]);
});

import { expect, test } from "@playwright/test";

test("serves the v0.2 application shell", async ({ page }) => {
  await page.goto(".");

  await expect(page).toHaveTitle(/Somewhere/);
  await expect(page.getByRole("heading", { level: 1, name: "Somewhere" })).toBeVisible();
  await expect(page.locator("main[data-app-version='v0.2']")).toBeVisible();
});

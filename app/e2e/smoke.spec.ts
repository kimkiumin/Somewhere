import { expect, test } from "@playwright/test";

test("serves the V2 Korean phone journey shell", async ({ page }) => {
  await page.goto(".");
  await expect(page).toHaveTitle(/Somewhere/);
  await expect(page.locator("html")).toHaveAttribute("lang", "ko");
  await expect(page.getByRole("heading", { name: "어딘가로 떠나볼까요?" })).toBeVisible();
  await expect(page.locator("main.app-shell")).toHaveCount(1);
  await expect(page.getByText(/diagnostic|provider|pool|mock|build/i)).toHaveCount(0);
  await page.goto("showcase.html");
  await expect(page.locator("html")).toHaveAttribute("lang", "ko");
});

import { expect, test } from "@playwright/test";
import { harnessCommand, harnessSnapshot } from "./harness";

test("removes stale guidance while keeping every safety control", async ({ page }) => {
  await page.goto(".");
  await page.getByRole("button", { name: "Start adventure" }).click();
  await page.getByRole("button", { name: "Begin walk" }).click();
  await harnessCommand(page, "emitDistance", 250, 10);
  await expect(page.locator("[data-compass-needle]")).toBeVisible();

  await harnessCommand(page, "emitDistance", 240, 90);
  await expect(page.getByText("Direction paused.")).toBeVisible();
  await expect(page.locator("[data-compass-needle]")).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Retry signals" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Reveal", exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Give up", exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Reroll" })).toBeVisible();
});

test("does not reuse pre-background samples after returning visible", async ({ page }) => {
  await page.goto(".");
  await page.getByRole("button", { name: "Start adventure" }).click();
  await page.getByRole("button", { name: "Begin walk" }).click();
  await harnessCommand(page, "emitDistance", 250, 10);
  await expect(page.locator("[data-compass-needle]")).toBeVisible();

  await harnessCommand(page, "setVisibility", "hidden");
  await expect(page.getByText("Direction paused.")).toBeVisible();
  await harnessCommand(page, "setVisibility", "visible");
  await expect(page.getByText("Finding your direction…")).toBeVisible();
  await expect(page.locator("[data-compass-needle]")).toHaveCount(0);

  await harnessCommand(page, "emitLocationOnly", 220, 10);
  await expect(page.locator("[data-compass-needle]")).toHaveCount(0);
  await harnessCommand(page, "emitHeadingOnly", 180, 8);
  await expect(page.locator("[data-compass-needle]")).toBeVisible();
});

test("permission denial remains a safe reveal path", async ({ page }) => {
  await page.goto(".");
  await harnessCommand(page, "setHeadingPermission", "denied");
  await page.getByRole("button", { name: "Start adventure" }).click();
  await page.getByRole("button", { name: "Begin walk" }).click();

  await expect(page.getByText("Compass access was not allowed.")).toBeVisible();
  await page.getByRole("button", { name: "Reveal", exact: true }).click();
  await expect(page.getByRole("heading", { name: "가족마당" })).toBeVisible();
});

test("expires silent guidance and reacquires a system-released Wake Lock", async ({ page }) => {
  await page.goto(".");
  await page.getByRole("button", { name: "Start adventure" }).click();
  await page.getByRole("button", { name: "Begin walk" }).click();
  await harnessCommand(page, "emitDistance", 250, 10);
  await expect(page.locator("[data-compass-needle]")).toBeVisible();

  await harnessCommand(page, "advanceMs", 10_000);
  await expect(page.locator("[data-compass-needle]")).toBeVisible();
  await harnessCommand(page, "advanceMs", 1);
  await expect(page.locator("[data-compass-needle]")).toHaveCount(0);
  await expect(page.getByText("Location has not refreshed yet.")).toBeVisible();

  await harnessCommand(page, "releaseWakeLock");
  await expect
    .poll(async () => (await harnessSnapshot(page)).sensors.wakeLock.status)
    .toBe("active");
  const snapshot = await harnessSnapshot(page);
  expect(snapshot.sensors.subscriptionCounts).toMatchObject({
    location: 1,
    heading: 1,
  });
});

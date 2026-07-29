import { expect, test } from "@playwright/test";
import { harnessCommand, harnessSnapshot } from "./harness";

test("completes a hidden destination journey without leaking identity", async ({ page }) => {
  await page.goto(".");
  await page.getByRole("button", { name: "Start adventure" }).click();

  await expect(page.getByRole("heading", { name: "Your destination is hidden." })).toBeVisible();
  await expect(page.getByText("가족마당")).toHaveCount(0);
  await page.getByRole("button", { name: "Begin walk" }).click();

  await harnessCommand(page, "emitDistance", 300, 10);
  await expect(page.getByText("300 m")).toBeVisible();
  await expect(page.getByText("Keep following the quiet signal.")).toBeVisible();

  await harnessCommand(page, "emitDistance", 100, 10);
  await expect(page.getByRole("heading", { name: "You are getting closer." })).toBeVisible();

  await harnessCommand(page, "emitDistance", 20, 10);
  await harnessCommand(page, "emitDistance", 22, 10);
  await expect(page.getByText("Arrived.")).toHaveCount(0);
  await harnessCommand(page, "emitDistance", 18, 10);
  await expect(page.getByRole("heading", { name: "Arrived." })).toBeVisible();

  await expect(page.getByText("가족마당")).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Reveal destination" })).toHaveCount(1);
  await expect(page.getByRole("button", { name: "Reveal", exact: true })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Give up", exact: true })).toBeVisible();
  const arrived = await harnessSnapshot(page);
  expect(arrived.guidance.status).toBe("inactive");
  expect(arrived.sensors.subscriptionCounts).toMatchObject({ location: 0, heading: 0 });
  const terminalEventCount = arrived.diagnosticEventCount;
  await harnessCommand(page, "emitDistance", 5, 5);
  expect((await harnessSnapshot(page)).diagnosticEventCount).toBe(terminalEventCount);
  await page.getByRole("button", { name: "Reveal destination" }).click();
  const revealedName = page.getByRole("heading", { name: "가족마당" });
  await expect(revealedName).toBeVisible();
  await expect(revealedName).toHaveAttribute("lang", "ko");
});

test("keeps Reveal and Give Up in the first viewport on target phones", async ({ page }) => {
  for (const viewport of [
    { width: 375, height: 812 },
    { width: 430, height: 932 },
    { width: 390, height: 844 },
  ]) {
    await page.setViewportSize(viewport);
    await page.goto(".");
    await page.getByRole("button", { name: "Start adventure" }).click();
    await page.getByRole("button", { name: "Begin walk" }).click();
    await harnessCommand(page, "emitDistance", 180, 10);

    for (const name of ["Reveal", "Give up"] as const) {
      const box = await page.getByRole("button", { name, exact: true }).boundingBox();
      expect(box).not.toBeNull();
      expect((box?.y ?? 10_000) + (box?.height ?? 0)).toBeLessThanOrEqual(viewport.height);
    }
  }
});

test("rerolls without leaking and gives up with a neutral reveal", async ({ page }) => {
  await page.goto(".");
  await page.getByRole("button", { name: "Start adventure" }).click();
  await expect(
    page.getByRole("heading", { name: "An open place where the park breathes." }),
  ).toBeVisible();

  await page.getByRole("button", { name: "Reroll" }).click();
  await expect(
    page.getByRole("heading", { name: "A quieter garden waits between textures." }),
  ).toBeVisible();
  await expect(page.getByText("갤러리정원")).toHaveCount(0);

  await page.getByRole("button", { name: "Give up", exact: true }).click();
  await expect(page.getByText("Walk ended safely")).toBeVisible();
  await expect(page.getByRole("heading", { name: "갤러리정원" })).toBeVisible();
});

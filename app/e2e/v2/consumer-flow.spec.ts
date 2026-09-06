import { expect, test } from "@playwright/test";
import { harnessCalls, harnessCommand } from "../harness";

async function ready(page: Parameters<typeof harnessCommand>[0]): Promise<void> {
  await page.goto(".");
  await page.getByRole("button", { name: "시작하기" }).click();
  await expect(page.getByRole("heading", { name: "포기할 수 없는 것만 정해요." })).toBeVisible();
  await page.getByRole("button", { name: "한 곳 찾기" }).click();
  await expect(
    page.getByRole("heading", { name: "조건에 맞는 곳을 살펴보고 있어요." }),
  ).toBeVisible();
  await harnessCommand(page, "emitOrigin");
  await expect(page.getByRole("heading", { name: "목적지는 아직 비밀이에요." })).toBeVisible();
}

test("TASK17_V2_CONSUMER completes Stop, Continue, reason, and guarded recovery", async ({
  page,
}) => {
  await ready(page);
  await expect(page.getByText("조용한 정원")).toHaveCount(0);
  await expect(page.getByText("서울 성동구의 한 골목")).toHaveCount(0);
  await page.getByRole("button", { name: "이곳으로 출발" }).click();
  await harnessCommand(page, "emitDistance", 300, 10);
  await expect(page.locator("[data-compass-needle]")).toBeVisible();
  await expect(page.getByRole("button", { name: "목적지 확인", exact: true })).toHaveCount(0);

  await page.getByRole("button", { name: "중단", exact: true }).click();
  await expect(page.locator("[data-compass-needle]")).toHaveCount(0);
  await expect(page.getByRole("heading", { name: "정말 중단할까요?" })).toBeVisible();
  expect((await harnessCalls(page)).at(-1)).toMatchObject({
    kind: "mutate",
    mutation: { action: "stop-request" },
  });

  await page.getByRole("button", { name: "계속하기" }).click();
  expect((await harnessCalls(page)).at(-1)).toMatchObject({
    kind: "mutate",
    mutation: { action: "continue" },
  });
  await expect(page.locator("[data-compass-needle]")).toHaveCount(0);
  await harnessCommand(page, "emitDistance", 260, 10);
  await expect(page.locator("[data-compass-needle]")).toBeVisible();

  await page.getByRole("button", { name: "중단", exact: true }).click();
  await page.getByRole("button", { name: "중단 확정" }).click();
  await expect(page.getByRole("heading", { name: "중단한 이유가 있나요?" })).toBeVisible();
  expect((await harnessCalls(page)).at(-1)).toMatchObject({
    kind: "mutate",
    mutation: { action: "confirm-stop" },
  });
  await page.getByRole("button", { name: "길 안내가 불안정해요" }).click();
  await expect(page.getByRole("heading", { name: "안전하게 마쳤어요." })).toBeVisible();
  expect((await harnessCalls(page)).at(-1)).toMatchObject({
    kind: "mutate",
    mutation: { action: "stop-reason", body: { reason: "route-or-sensor" } },
  });

  await page.getByRole("button", { name: "목적지 확인", exact: true }).click();
  await expect(page.getByRole("heading", { name: "조용한 정원" })).toBeVisible();
  await page.getByRole("button", { name: "새 장소 찾기" }).click();
  await expect(page.getByRole("heading", { name: "바꿀 조건을 확인해요." })).toBeVisible();
  await page.getByRole("button", { name: "확인하고 다시 찾기" }).click();
  await harnessCommand(page, "emitOrigin");
  await expect(page.getByRole("heading", { name: "목적지는 아직 비밀이에요." })).toBeVisible();
  expect((await harnessCalls(page)).some((call) => call.kind === "confirm-recovery")).toBe(true);
});

test("TASK17_V2_CONSUMER handles degraded recovery, Near, and Arrived", async ({ page }) => {
  await ready(page);
  await page.getByRole("button", { name: "이곳으로 출발" }).click();
  await harnessCommand(page, "emitDistance", 300, 10);
  await harnessCommand(page, "emitDistance", 280, 90);
  await expect(page.getByRole("heading", { name: "방향을 다시 확인하고 있어요." })).toBeVisible();
  await page.getByRole("button", { name: "안내 복구 살펴보기" }).click();
  await page.getByRole("button", { name: "나침반 다시 맞추기" }).click();
  expect((await harnessCalls(page)).at(-1)).toMatchObject({
    kind: "mutate",
    mutation: { action: "route-recover", body: { choice: "recalibrate" } },
  });

  await harnessCommand(page, "emitDistance", 210, 10);
  await harnessCommand(page, "emitDistance", 120, 10);
  await harnessCommand(page, "emitDistance", 100, 10);
  await expect(page.getByRole("heading", { name: "거의 다 왔어요." })).toBeVisible();
  for (const distance of [20, 22, 18]) {
    await harnessCommand(page, "emitDistance", distance, 10);
  }
  await harnessCommand(page, "advanceMs", 3_000);
  await harnessCommand(page, "emitDistance", 19, 10);
  await expect(page.getByRole("heading", { name: "도착했어요." })).toBeVisible();
  await expect(page.getByText("장소 평가는 60분 뒤 한 번만 여쭤볼게요.")).toBeVisible();
  await expect(page.getByRole("heading", { name: "이 장소는 어땠나요?" })).toBeVisible();
  await page.getByRole("button", { name: "좋아요", exact: true }).click();
  expect((await harnessCalls(page)).at(-1)).toMatchObject({ kind: "reaction" });
});

test("TASK17_V2_CONSUMER renders hostile disclosure only as text", async ({ page }) => {
  await ready(page);
  await harnessCommand(page, "injectMaliciousDisclosure");
  await expect(page.getByText("<img src=x onerror=alert(1)>")).toBeVisible();
  await expect(page.locator("img")).toHaveCount(0);
});

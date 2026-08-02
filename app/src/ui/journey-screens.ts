import type { JourneyApplicationSnapshot } from "../application/journey-application";
import { actionButton, compass, element, infoRows, safetyControls } from "./dom-primitives";

function heading(eyebrow: string, title: string, copy?: string): HTMLElement {
  const section = element("section", "state-heading");
  section.append(element("p", "eyebrow", eyebrow), element("h1", undefined, title));
  if (copy !== undefined) {
    section.append(element("p", "body-copy muted", copy));
  }
  return section;
}

export function startScreen(main: HTMLElement): void {
  main.append(
    heading(
      "숨겨진 목적지",
      "어딘가로 떠나볼까요?",
      "꼭 필요한 조건만 정하면 비교 목록 없이 한\u00a0곳을 골라드려요.",
    ),
    compass("idle", "?", "목적지는 출발 뒤에도 숨겨져요"),
    actionButton("시작하기", "open-constraints", "button--primary button--wide"),
    element("p", "small-copy muted centered", "직접 확인하기 전에는 이름과 정확한 주소를 숨겨요."),
  );
}

export function constraintsScreen(main: HTMLElement): void {
  const form = element("form", "constraints");
  form.id = "constraints-form";
  const category = element("fieldset", "choice-group");
  category.append(element("legend", undefined, "어디로 갈까요?"));
  for (const [value, label] of [
    ["restaurant", "식당"],
    ["cafe", "카페"],
  ] as const) {
    const item = element("label", "choice");
    const input = element("input");
    input.type = "radio";
    input.name = "category";
    input.value = value;
    input.checked = value === "cafe";
    item.append(input, element("span", undefined, label));
    category.append(item);
  }
  const walk = element("label", "stack");
  walk.append(element("span", "label", "최대 걷는 시간"));
  const walkSelect = element("select", "select");
  walkSelect.name = "maxWalkMinutes";
  for (const minutes of [15, 30, 45]) {
    const option = element("option", undefined, `${minutes}분`);
    option.value = String(minutes);
    option.selected = minutes === 30;
    walkSelect.append(option);
  }
  walk.append(walkSelect);
  const budget = element("label", "stack");
  budget.append(element("span", "label", "예산"));
  const budgetSelect = element("select", "select");
  budgetSelect.name = "budgetBand";
  for (const [value, label] of [
    ["low", "가볍게"],
    ["medium", "보통"],
    ["high", "넉넉하게"],
  ] as const) {
    const option = element("option", undefined, label);
    option.value = value;
    option.selected = value === "medium";
    budgetSelect.append(option);
  }
  budget.append(budgetSelect);
  form.append(
    category,
    walk,
    budget,
    actionButton("한 곳 찾기", "find", "button--primary button--wide"),
  );
  main.append(
    heading(
      "최소 조건",
      "포기할 수 없는 것만 정해요.",
      "장소 이름, 사진, 평점은 보여드리지 않아요.",
    ),
    form,
  );
}

export function findingScreen(main: HTMLElement): void {
  const indicator = element("div", "finding-mark");
  indicator.setAttribute("aria-hidden", "true");
  main.append(
    heading(
      "한 곳을 찾는 중",
      "조건에 맞는 곳을 살펴보고 있어요.",
      "후보를 나열하지 않고 한 곳만 준비할게요.",
    ),
    indicator,
  );
}

function disclosure(snapshot: JourneyApplicationSnapshot): readonly [string, string, string] {
  const projection = snapshot.projection;
  if (projection !== null && projection.phase !== "finding" && projection.phase !== "expired") {
    const price = { high: "₩₩₩", low: "₩", medium: "₩₩", unknown: "확인 필요" }[
      projection.disclosure.priceBand
    ];
    return [
      `${Math.round(projection.disclosure.routeDistanceM)}m · 약 ${Math.ceil(projection.disclosure.routeDurationMinutes)}분`,
      projection.disclosure.representativeCategories.join(" · "),
      price,
    ];
  }
  return [
    `약 ${snapshot.hiddenDestination?.estimatedMinutes ?? 0}분`,
    snapshot.hiddenDestination?.hint ?? "카페",
    "₩₩",
  ];
}

export function readyScreen(main: HTMLElement, snapshot: JourneyApplicationSnapshot): void {
  const values = disclosure(snapshot);
  const panel = element("section", "hidden-place");
  panel.append(element("span", "hidden-mark", "?"), infoRows(...values));
  main.append(
    heading(
      "한 곳이 준비됐어요",
      "목적지는 아직 비밀이에요.",
      "조건에 맞는 한 곳을 골랐어요. 출발하면 바로 확정돼요.",
    ),
    panel,
    actionButton("이곳으로 출발", "commit", "button--primary button--wide"),
    safetyControls(snapshot.revealedDestination !== null),
  );
}

export function guidanceScreen(main: HTMLElement, snapshot: JourneyApplicationSnapshot): void {
  const phase = snapshot.projection?.phase;
  const arrived = phase === "arrived" || snapshot.journey.phase === "arrived";
  const near = phase === "near" || snapshot.journey.phase === "near";
  const live = snapshot.guidance.status === "live";
  const title = arrived
    ? "도착했어요."
    : near
      ? "거의 다 왔어요."
      : live
        ? "화살표를 따라가세요."
        : "방향을 다시 확인하고 있어요.";
  main.append(heading(arrived ? "도착" : near ? "가까워지는 중" : "길 안내", title));
  if (arrived) {
    main.append(compass("arrived", "도착", "주변을 천천히 살펴보세요"));
  } else if (live) {
    main.append(
      compass(
        "live",
        `${Math.max(0, Math.round(snapshot.guidance.distanceM))}m`,
        near ? "천천히 이동하세요" : "공공 보행로를 이용하세요",
      ),
    );
  } else {
    main.append(compass("paused", "잠시 멈춤", "신뢰할 수 있는 방향이 돌아오면 안내할게요"));
  }
  if (snapshot.revealedDestination !== null) {
    const reveal = element("aside", "reveal-inline");
    const name = element("h2", undefined, snapshot.revealedDestination.name);
    name.lang = snapshot.revealedDestination.language;
    reveal.append(
      element("p", "eyebrow", "확인한 목적지"),
      name,
      element("p", "body-copy", snapshot.revealedDestination.description),
    );
    main.append(reveal);
  }
  if (!arrived && !live) {
    main.append(
      actionButton("안내 복구 살펴보기", "open-route-recovery", "button--secondary button--wide"),
    );
  }
  main.append(safetyControls(snapshot.revealedDestination !== null));
  if (arrived) {
    main.append(
      element("p", "small-copy muted centered", "장소 평가는 60분 뒤 한 번만 여쭤볼게요."),
    );
  }
}

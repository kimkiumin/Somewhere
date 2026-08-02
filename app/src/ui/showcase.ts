import { actionButton, compass, element, infoRows, safetyControls } from "./dom-primitives";
import "./styles.css";

const root = document.querySelector<HTMLElement>("#showcase");
if (root === null) {
  throw new Error("Showcase root is missing.");
}

const main = element("main", "showcase");
const header = element("header", "showcase-section");
header.append(
  element("p", "eyebrow", "Somewhere V2"),
  element("h1", undefined, "여정 프리미티브"),
  element("p", "lead muted", "한 곳만 조용히 고르고, 신뢰할 수 있을 때만 방향을 보여줍니다."),
);

const controls = element("section", "showcase-section");
controls.append(element("h2", undefined, "행동과 상태"));
const controlGrid = element("div", "showcase-grid");
const buttons = element("div", "panel stack");
buttons.append(
  element("h3", undefined, "버튼"),
  actionButton("시작하기", "showcase-start", "button--primary"),
  actionButton("목적지 확인", "showcase-reveal"),
  actionButton("중단", "showcase-stop", "button--caution"),
);
const statuses = element("div", "panel stack");
statuses.append(element("h3", undefined, "안내 상태"));
for (const [label, variant] of [
  ["안내 준비", ""],
  ["방향 확인 중", " status-pill--acquiring"],
  ["안내 멈춤", " status-pill--paused"],
  ["도착", " status-pill--arrived"],
] as const) {
  statuses.append(element("span", `status-pill${variant}`, label));
}
controlGrid.append(buttons, statuses);
controls.append(controlGrid);

const instruments = element("section", "showcase-section");
instruments.append(element("h2", undefined, "나침반 상태"));
const compassGrid = element("div", "showcase-grid");
compassGrid.append(
  compass("live", "184m", "공공 보행로를 이용하세요"),
  compass("paused", "잠시 멈춤", "신뢰할 수 있는 방향을 확인 중이에요"),
  compass("arrived", "도착", "주변을 천천히 살펴보세요"),
);
instruments.append(compassGrid);

const hidden = element("section", "showcase-section");
hidden.append(element("h2", undefined, "숨겨진 한 곳"));
const panel = element("article", "hidden-place");
panel.append(element("span", "hidden-mark", "?"), infoRows("700m · 약 10분", "카페", "₩₩"));
panel.append(safetyControls(false));
hidden.append(panel);
main.append(header, controls, instruments, hidden);
root.append(main);

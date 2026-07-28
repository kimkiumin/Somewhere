import "./ui/styles.css";

const root = document.querySelector<HTMLElement>("#app");

if (root === null) {
  throw new Error("Somewhere app root is missing.");
}

const main = document.createElement("main");
main.className = "app-shell";
main.dataset.appVersion = "v0.2";

const eyebrow = document.createElement("p");
eyebrow.className = "eyebrow";
eyebrow.textContent = "A quiet field instrument";

const heading = document.createElement("h1");
heading.textContent = "Somewhere";

const lead = document.createElement("p");
lead.className = "lead";
lead.textContent =
  "Follow the unknown. Your destination stays hidden until you choose to reveal it.";

main.append(eyebrow, heading, lead);
root.append(main);

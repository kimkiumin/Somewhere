import { mainBoundary, parseArguments } from "./lib/release-core.mjs";

const specification = { required: ["--origin"] };

function validate(options) {
  let parsed;
  try {
    parsed = new URL(options.origin);
  } catch (error) {
    if (error instanceof TypeError) throw new TypeError("STAGING_BASE_URL_INVALID");
    throw error;
  }
  if (
    parsed.protocol !== "https:"
    || parsed.username !== ""
    || parsed.password !== ""
    || parsed.pathname !== "/"
    || parsed.search !== ""
    || parsed.hash !== ""
    || parsed.origin !== options.origin
  ) {
    throw new TypeError("STAGING_BASE_URL_INVALID");
  }
  console.log("PASS: approved HTTPS origin validated");
}

const parsed = parseArguments(process.argv.slice(2), specification);
await mainBoundary(() => validate(parsed));

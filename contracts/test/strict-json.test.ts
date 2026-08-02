import { expect, test } from "bun:test";
import { parseStrictJsonV1 } from "../src/index";

test("rejects duplicate object keys before schema parsing", () => {
  expect(parseStrictJsonV1('{"contractVersion":1,"contractVersion":1}').ok).toBe(false);
});

test("rejects non-finite numeric JSON extensions", () => {
  expect(parseStrictJsonV1('{"contractVersion":1,"value":NaN}').ok).toBe(false);
});

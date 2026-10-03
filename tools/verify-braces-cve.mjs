import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const braces = require("braces");

const ordinary = braces("training/{boxing,mma}/slot");
if (ordinary.length !== 1 || ordinary[0] !== "training/(boxing|mma)/slot") {
  throw new Error("braces regression probe failed for an ordinary pattern");
}

const nested = `${"{".repeat(101)}x${"}".repeat(101)}`;
for (const operation of [
  () => braces(nested),
  () => braces.expand(nested),
]) {
  let rejected = false;
  try {
    operation();
  } catch (error) {
    rejected = error instanceof SyntaxError && /max brace depth/.test(error.message);
  }
  if (!rejected) {
    throw new Error("deeply nested braces input was not rejected by the local CVE backport");
  }
}

console.log("braces CVE-2026-93687 regression probe passed");

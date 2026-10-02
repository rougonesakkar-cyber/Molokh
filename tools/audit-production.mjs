import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const EXCEPTION = Object.freeze({
  advisoryId: "GHSA-86w9-cpqp-85rv",
  moduleName: "node-forge",
  patchedVersion: "1.4.1",
  expiresOn: "2026-10-16",
});

const pnpmCli = process.env.npm_execpath;

if (!pnpmCli) {
  console.error("Production audit must be run through pnpm.");
  process.exit(1);
}

function runPnpm(args) {
  return spawnSync(process.execPath, [pnpmCli, ...args], {
    cwd: process.cwd(),
    encoding: "utf8",
    windowsHide: true,
  });
}

function fail(message, details = "") {
  console.error(`Production dependency gate failed: ${message}`);
  if (details) {
    console.error(details);
  }
  process.exit(1);
}

function parseJson(output, label) {
  try {
    return JSON.parse(output);
  } catch (error) {
    fail(`could not parse ${label} JSON.`, String(error));
  }
}

function verifyForgeBackport() {
  const probe = spawnSync(
    process.execPath,
    [fileURLToPath(new URL("./verify-node-forge-cve.mjs", import.meta.url))],
    { cwd: process.cwd(), encoding: "utf8", windowsHide: true },
  );

  if (probe.status !== 0) {
    fail("the local node-forge CVE backport regression probe failed.", probe.stderr || probe.stdout);
  }
}

const audit = runPnpm(["audit", "--prod", "--json"]);
if (audit.error) {
  fail("pnpm audit could not start.", String(audit.error));
}

const report = parseJson(audit.stdout, "pnpm audit");
const blocking = Object.values(report.advisories ?? {}).filter(
  (advisory) => advisory.severity === "high" || advisory.severity === "critical",
);

if (blocking.length === 0) {
  console.log("Production dependency gate passed: no high or critical advisories.");
  process.exit(0);
}

const unexpected = blocking.filter((advisory) => {
  if (
    advisory.github_advisory_id !== EXCEPTION.advisoryId ||
    advisory.module_name !== EXCEPTION.moduleName
  ) {
    return true;
  }

  const findings = advisory.findings ?? [];
  return (
    findings.length === 0 ||
    findings.some(
      (finding) =>
        finding.version !== "1.4.0" ||
        finding.dev !== false ||
        (finding.paths ?? []).some(
          (path) =>
            !path.startsWith("apps__client>") ||
            !path.includes(">@expo/cli>") ||
            !path.endsWith(">node-forge"),
        ),
    )
  );
});

if (unexpected.length > 0 || blocking.length !== 1) {
  fail(
    "an unapproved high or critical advisory is present.",
    JSON.stringify(unexpected.length > 0 ? unexpected : blocking, null, 2),
  );
}

const today = new Date().toISOString().slice(0, 10);
if (today > EXCEPTION.expiresOn) {
  fail(`the ${EXCEPTION.advisoryId} backport exception expired on ${EXCEPTION.expiresOn}.`);
}

const published = runPnpm(["view", EXCEPTION.moduleName, "versions", "--json"]);
if (published.status !== 0) {
  fail("could not verify whether the upstream patched package was published.", published.stderr);
}

const publishedVersions = parseJson(published.stdout, "registry versions");
if (publishedVersions.includes(EXCEPTION.patchedVersion)) {
  fail(
    `${EXCEPTION.moduleName}@${EXCEPTION.patchedVersion} is available; remove the local backport and upgrade.`,
  );
}

verifyForgeBackport();
console.warn(
  `Production dependency gate passed with a narrow, tested ${EXCEPTION.advisoryId} backport exception through ${EXCEPTION.expiresOn}; no other high or critical advisories are allowed.`,
);

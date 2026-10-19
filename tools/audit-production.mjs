import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const EXCEPTIONS = Object.freeze([
  Object.freeze({
    advisoryId: "GHSA-86w9-cpqp-85rv",
    moduleName: "node-forge",
    installedVersion: "1.4.0",
    patchedVersion: "1.4.1",
    expiresOn: "2026-11-16",
    probe: "./verify-node-forge-cve.mjs",
    pathAllowed: (path) =>
      path.startsWith("apps__client>") &&
      path.includes(">@expo/cli>") &&
      path.endsWith(">node-forge"),
  }),
  Object.freeze({
    advisoryId: "GHSA-vfj7-8cjw-p6xm",
    moduleName: "braces",
    installedVersion: "3.0.3",
    patchedVersion: "3.0.4",
    expiresOn: "2026-11-16",
    probe: "./verify-braces-cve.mjs",
    pathAllowed: (path) =>
      path.startsWith("apps__client>") && path.includes(">braces"),
  }),
]);

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

function verifyBackport(exception) {
  const probe = spawnSync(
    process.execPath,
    [fileURLToPath(new URL(exception.probe, import.meta.url))],
    { cwd: process.cwd(), encoding: "utf8", windowsHide: true },
  );

  if (probe.status !== 0) {
    fail(
      `the local ${exception.moduleName} CVE backport regression probe failed.`,
      probe.stderr || probe.stdout,
    );
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
  const exception = EXCEPTIONS.find(
    (candidate) =>
      candidate.advisoryId === advisory.github_advisory_id &&
      candidate.moduleName === advisory.module_name,
  );
  if (!exception) return true;

  const findings = advisory.findings ?? [];
  return (
    findings.length === 0 ||
    findings.some(
      (finding) =>
        finding.version !== exception.installedVersion ||
        finding.dev !== false ||
        (finding.paths ?? []).some((path) => !exception.pathAllowed(path)),
    )
  );
});

if (unexpected.length > 0) {
  fail(
    "an unapproved high or critical advisory is present.",
    JSON.stringify(unexpected.length > 0 ? unexpected : blocking, null, 2),
  );
}

const today = new Date().toISOString().slice(0, 10);
const activeExceptions = EXCEPTIONS.filter((exception) =>
  blocking.some((advisory) => advisory.github_advisory_id === exception.advisoryId),
);
for (const exception of activeExceptions) {
  if (today > exception.expiresOn) {
    fail(`the ${exception.advisoryId} backport exception expired on ${exception.expiresOn}.`);
  }

  const published = runPnpm(["view", exception.moduleName, "versions", "--json"]);
  if (published.status !== 0) {
    fail("could not verify whether the upstream patched package was published.", published.stderr);
  }

  const publishedVersions = parseJson(published.stdout, `${exception.moduleName} registry versions`);
  if (publishedVersions.includes(exception.patchedVersion)) {
    fail(
      `${exception.moduleName}@${exception.patchedVersion} is available; remove the local backport and upgrade.`,
    );
  }

  verifyBackport(exception);
}

console.warn(
  `Production dependency gate passed with ${activeExceptions.length} narrow, tested, time-bounded local backport exception(s); no other high or critical advisories are allowed.`,
);

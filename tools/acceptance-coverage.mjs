import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const projectRoot = process.argv[2]
  ? resolve(process.argv[2])
  : resolve(dirname(fileURLToPath(import.meta.url)), '..');
const acceptancePath = join(projectRoot, 'core-engine-spec', 'ACCEPTANCE_SCENARIOS.md');
const outputPath = join(projectRoot, 'tmp', 'acceptance-coverage.md');

async function testFiles(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    if (entry.name === 'dist' || entry.name === 'node_modules') continue;
    const path = join(directory, entry.name);
    if (entry.isDirectory()) files.push(...(await testFiles(path)));
    else if (/\.(test|spec)\.(ts|tsx)$/.test(entry.name)) files.push(path);
  }
  return files;
}

const acceptanceLines = (await readFile(acceptancePath, 'utf8')).split(/\r?\n/);
const scenarios = new Map();
for (const line of acceptanceLines) {
  const match = line.match(/^\| (AC-\d{3}) \| (P[0-2]) \| (.*?) \| (.*?) \|$/);
  if (!match) continue;
  const [, id, priority, givenWhen, then] = match;
  scenarios.set(id, { givenWhen, priority, then });
}

const references = new Map([...scenarios.keys()].map((id) => [id, []]));
const unknown = [];
for (const file of [
  ...(await testFiles(join(projectRoot, 'apps'))),
  ...(await testFiles(join(projectRoot, 'packages'))),
]) {
  const lines = (await readFile(file, 'utf8')).split(/\r?\n/);
  lines.forEach((line, index) => {
    for (const match of line.matchAll(/\bAC-\d{3}\b/g)) {
      const id = match[0];
      const reference = `${relative(projectRoot, file).replaceAll('\\', '/')}:${index + 1}`;
      const knownReferences = references.get(id);
      if (knownReferences) knownReferences.push(reference);
      else unknown.push(`${id} at ${reference}`);
    }
  });
}

const counts = { P0: 0, P1: 0, P2: 0 };
const mappedCounts = { P0: 0, P1: 0, P2: 0 };
for (const [id, scenario] of scenarios) {
  counts[scenario.priority] += 1;
  if ((references.get(id)?.length ?? 0) > 0) mappedCounts[scenario.priority] += 1;
}

const rows = [...scenarios].map(([id, scenario]) => {
  const mapped = [...new Set(references.get(id) ?? [])];
  return `| ${id} | ${scenario.priority} | ${mapped.length > 0 ? 'MAPPED' : 'UNMAPPED'} | ${mapped.join('<br>') || '—'} |`;
});
const report = `# MOLOKH acceptance coverage\n\n` +
  `Generated from the canonical acceptance catalogue and executable test tags. ` +
  `\`MAPPED\` means traceable to at least one test; it does not by itself prove that the full scenario is covered at the required layer.\n\n` +
  `| Priority | Mapped | Total |\n|---|---:|---:|\n` +
  `| P0 | ${mappedCounts.P0} | ${counts.P0} |\n` +
  `| P1 | ${mappedCounts.P1} | ${counts.P1} |\n` +
  `| P2 | ${mappedCounts.P2} | ${counts.P2} |\n\n` +
  `| AC | Priority | Traceability | Test references |\n|---|---:|---|---|\n` +
  `${rows.join('\n')}\n`;

await mkdir(dirname(outputPath), { recursive: true });
await writeFile(outputPath, report, 'utf8');

console.log(`Acceptance scenarios: ${scenarios.size}`);
console.log(`Mapped: ${mappedCounts.P0 + mappedCounts.P1 + mappedCounts.P2}`);
console.log(`P0 mapped: ${mappedCounts.P0}/${counts.P0}`);
console.log(`P1 mapped: ${mappedCounts.P1}/${counts.P1}`);
console.log(`P2 mapped: ${mappedCounts.P2}/${counts.P2}`);
console.log(`Report: ${relative(projectRoot, outputPath).replaceAll('\\', '/')}`);

if (unknown.length > 0) {
  throw new Error(`Unknown acceptance tags:\n${unknown.join('\n')}`);
}

import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { gzipSync } from 'node:zlib';

const clientRoot = path.resolve('apps/client');
const distRoot = path.join(clientRoot, 'dist');
const baseline = JSON.parse(fs.readFileSync(
  path.join(clientRoot, 'performance-baseline.json'),
  'utf8',
));

function filesUnder(directory) {
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const target = path.join(directory, entry.name);
    return entry.isDirectory() ? filesUnder(target) : [target];
  });
}

if (!fs.existsSync(distRoot)) {
  console.error('Client dist is missing. Run the production Web build first.');
  process.exit(1);
}

const files = filesUnder(distRoot);
const JavaScriptFiles = files.filter((file) => file.endsWith('.js'));
const entry = JavaScriptFiles
  .map((file) => ({ file, bytes: fs.readFileSync(file) }))
  .sort((left, right) => right.bytes.length - left.bytes.length)[0];
if (!entry) throw new Error('Production Web entry bundle was not found.');

const result = {
  entry: path.relative(distRoot, entry.file).replaceAll('\\', '/'),
  entryRawBytes: entry.bytes.length,
  entryGzipBytes: gzipSync(entry.bytes).length,
  distBytes: files.reduce((total, file) => total + fs.statSync(file).size, 0),
  fileCount: files.length,
};
const gzipDeltaPercent = Number(
  (((result.entryGzipBytes / baseline.entryGzipBytes) - 1) * 100).toFixed(2),
);

console.log(JSON.stringify({ baseline, result, gzipDeltaPercent }, null, 2));
if (gzipDeltaPercent > 5) {
  console.error(`Initial Web entry gzip grew ${gzipDeltaPercent}%, above the 5% budget.`);
  process.exit(1);
}

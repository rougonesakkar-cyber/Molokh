import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import ts from 'typescript';

const root = path.resolve('apps/client/src');
const findings = [];
const primaryInteractionFiles = new Set([
  'app/chat.tsx',
  'app/index.tsx',
  'features/auth/LocalPhoneAuthPanel.tsx',
  'features/discovery/DiscoverySection.tsx',
  'features/navigation/HomeSection.tsx',
  'features/public-profile/PublicAthleteProfileCard.tsx',
]);

function filesUnder(directory) {
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const target = path.join(directory, entry.name);
    if (entry.isDirectory()) return filesUnder(target);
    return entry.isFile() && target.endsWith('.tsx') ? [target] : [];
  });
}

function tagName(node) {
  return ts.isIdentifier(node.tagName) ? node.tagName.text : node.tagName.getText();
}

function attributes(node) {
  return new Map(node.attributes.properties
    .filter(ts.isJsxAttribute)
    .map((attribute) => [attribute.name.getText(), attribute]));
}

function literalAttribute(attribute) {
  if (!attribute?.initializer || !ts.isStringLiteral(attribute.initializer)) return null;
  return attribute.initializer.text;
}

function report(source, node, message) {
  const position = source.getLineAndCharacterOfPosition(node.getStart(source));
  findings.push(`${path.relative(process.cwd(), source.fileName)}:${position.line + 1} ${message}`);
}

for (const file of filesUnder(root)) {
  const text = fs.readFileSync(file, 'utf8');
  const source = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const clientRelativePath = path.relative(root, file).replaceAll('\\', '/');
  if (primaryInteractionFiles.has(clientRelativePath) && /minHeight:\s*(?:44|46)\b/.test(text)) {
    findings.push(`${path.relative(process.cwd(), file)} uses a sub-48 primary touch target.`);
  }
  const visit = (node) => {
    if (ts.isJsxExpression(node) && ts.isPropertyAccessExpression(node.expression)
      && ['renderKey', 'resourceType', 'stateVersion'].includes(node.expression.name.text)) {
      report(source, node, 'Internal render/resource/version keys must use human-readable presentation copy.');
    }
    if (ts.isJsxOpeningElement(node) || ts.isJsxSelfClosingElement(node)) {
      const tag = tagName(node);
      const props = attributes(node);
      const role = literalAttribute(props.get('accessibilityRole'));

      if (tag === 'Pressable' && !props.has('accessibilityRole')) {
        report(source, node, 'Pressable requires an explicit accessibilityRole.');
      }
      if (tag === 'TextInput' && !props.has('accessibilityLabel')) {
        report(source, node, 'TextInput requires an explicit accessibilityLabel.');
      }
      if (role === 'header' && !props.has('aria-level')) {
        report(source, node, 'Header requires an explicit aria-level for Web hierarchy.');
      }
      if (role === 'tab' && !props.has('aria-selected') && !props.has('accessibilityState')) {
        report(source, node, 'Tab requires a selected-state projection.');
      }
      if ((role === 'checkbox' || role === 'radio') && !props.has('accessibilityState')) {
        report(source, node, `${role} requires a checked-state projection.`);
      }
      if (tag === 'Pressable' && props.has('disabled') && !props.has('accessibilityState')) {
        report(source, node, 'Disabled Pressable requires accessibilityState.');
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(source);
}

if (findings.length > 0) {
  console.error(`Client accessibility gate failed with ${findings.length} finding(s):`);
  findings.forEach((finding) => console.error(`- ${finding}`));
  process.exit(1);
}

console.log('Client accessibility gate passed.');

const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
if (!process.argv[2]) throw new Error('Usage: npm run import:scripts -- /absolute/path/to/source/scripts');
const source = path.resolve(process.argv[2]);
const excluded = new Set(['Test.js', 'EvalJavascript.js', 'FormatSQL.js']);
const adapted = new Set(['ASCIIToHex.js', 'HexToASCII.js', 'AndroidIOSStrings.js', 'IOSAndroidStrings.js', 'Collapse.js']);
// Adapt copies only; the original source files are never changed.
for (const name of fs.readdirSync(source).filter(n => n.endsWith('.js') && !excluded.has(n))) {
  let code = fs.readFileSync(path.join(source, name), 'utf8');
  if (adapted.has(name)) code = code.replace(/\b(state|input)\.fullText\b/g, '$1.text');
  code = code.replace(/require\((['"])@[^/]+\//g, 'require($1@sk/')
    .replace(/(@sk\/lodash)[^'"]*/g, '$1');
  fs.writeFileSync(path.join(root, 'scripts', name), code);
}
for (const name of fs.readdirSync(path.join(source, 'lib')).filter(n => n.endsWith('.js'))) {
  const destination = /^lodash\./.test(name) ? 'lodash.js' : name;
  if (destination === 'sqlFormatter.js') continue; // Locally generated helper.
  const code = fs.readFileSync(path.join(source, 'lib', name), 'utf8')
    .replace(/Adapted for \w+ from/g, 'Adapted from');
  fs.writeFileSync(path.join(root, 'scripts/lib', destination), code);
}
fs.copyFileSync(path.resolve(source, '../../../LICENSE'), path.join(root, 'vendor/THIRD-PARTY-LICENSE'));
console.log('Imported upstream utilities; preserved the local SQL formatter.');

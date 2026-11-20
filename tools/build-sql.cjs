const fs = require('node:fs');
const path = require('node:path');
const { buildSync } = require('esbuild');
const root = path.resolve(__dirname, '..');
const bundle = buildSync({
  entryPoints: [path.join(root, 'src/sqlFormatter.ts')],
  outfile: path.join(root, 'scripts/lib/sqlFormatter.js'),
  bundle: true, platform: 'neutral', mainFields: ['module', 'main'],
  format: 'cjs', target: 'es2022', legalComments: 'inline', minify: true, metafile: true
});
if (Object.values(bundle.metafile.outputs).some(output => output.imports.some(entry => entry.external))) {
  throw new Error('SQL helper must not contain external runtime imports.');
}
for (const name of ['sql-formatter', 'nearley']) {
  const directory = path.dirname(require.resolve(name + '/package.json'));
  const license = ['LICENSE', 'LICENSE.txt'].find(file => fs.existsSync(path.join(directory, file)));
  fs.copyFileSync(path.join(directory, license), path.join(root, 'vendor', `${name}-LICENSE`));
}
console.log('Bundled SQL formatter and dependency licenses.');

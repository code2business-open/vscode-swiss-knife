const fs = require('node:fs');
const path = require('node:path');
const { parse, printParseErrorCode } = require('jsonc-parser');
const root = path.resolve(__dirname, '..');
const groups = {
  Hash: 'MD5 SHA1 SHA256 SHA512',
  Convert: 'ASCIIToHex HexToASCII BinaryToDecimal DecimalToBinary DecimalToHex HexToDecimal hex2rgb RGBToHex AndroidIOSStrings IOSAndroidStrings CSVtoJSON JSONtoCSV JSONtoYAML YAMLtoJSON JsonToQuery QueryToJson DateToTimestamp DateToUTC FishHexPathConverter',
  Format: 'FormatCSS FormatJSON FormatSQL FormatXML',
  Minify: 'MinifyCSS MinifyJSON MinifySQL MinifyXML',
  Encode: 'Base64Encode HTMLEncode HTMLEncodeAll URLEncode URLEntitiesEncode AddSlashes URLDefang Rot13',
  Decode: 'Base64Decode HTMLDecode URLDecode URLEntitiesDecode RemoveSlashes URLRefang JWTDecode PhpUnserialize',
  Text: 'CamelCase Collapse CountCharacters CountLines CountWords Deburr Downcase KebabCase MarkdownQuote NatSort RemoveDuplicates ReplaceSmartQuotes ReverseLines ReverseString ShuffleLines SnakeCase Sort SortJSON SpongeCase StartCase Trim Upcase',
  Generate: 'LoremIpsum', Calculate: 'SumAll'
};
const overrides = { MD5: 'MD5', SHA1: 'SHA1', SHA256: 'SHA256', SHA512: 'SHA512', Downcase: 'Lower Case', Upcase: 'Upper Case' };
const catalog = [];
for (const [category, names] of Object.entries(groups)) {
  for (const stem of names.split(' ')) {
    const file = `${stem}.js`;
    const source = fs.readFileSync(path.join(root, 'scripts', file), 'utf8');
    const match = source.match(/\/\*\*([\s\S]*?)\*\*\//);
    if (!match) throw new Error(`Missing metadata: ${file}`);
    const errors = [];
    const metadata = parse(match[1], errors, { allowTrailingComma: true });
    if (errors.length) throw new Error(`${file}: ${errors.map(e => printParseErrorCode(e.error)).join(', ')}`);
    if (!metadata.name || !metadata.description) throw new Error(`Invalid metadata: ${file}`);
    catalog.push({ id: `swissKnife.${category.toLowerCase()}.${stem.toLowerCase()}`, file, category, title: overrides[stem] || metadata.name, metadata });
  }
}
const actual = fs.readdirSync(path.join(root, 'scripts')).filter(n => n.endsWith('.js')).sort();
if (catalog.length !== 71 || new Set(catalog.map(c => c.id)).size !== 71 || JSON.stringify(actual) !== JSON.stringify(catalog.map(c => c.file).sort())) throw new Error('Catalog must cover exactly 71 unique scripts');
fs.writeFileSync(path.join(root, 'src/catalog.json'), JSON.stringify(catalog, null, 2) + '\n');
const manifestPath = path.join(root, 'package.json');
const manifestSource = fs.readFileSync(manifestPath, 'utf8');
const manifestIndent = manifestSource.match(/\n([ \t]+)"/)?.[1] ?? '  ';
const manifest = JSON.parse(manifestSource);
manifest.contributes.commands = catalog.map(c => ({ command: c.id, category: `SK: ${c.category}`, title: c.title }));
fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, manifestIndent) + '\n');
console.log('Generated 71 command contributions.');

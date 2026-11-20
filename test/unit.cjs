const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { ScriptRuntime } = require('../dist/runtime');
const { transform } = require('../dist/transform');
const catalog = require('../dist/catalog.json');
const scripts = path.resolve(__dirname, '../scripts');
const runtime = new ScriptRuntime(scripts);
const run = (file, text) => runtime.run(`${file}.js`, { text });

test('catalog exactly covers 71 scripts and manifest commands', () => {
  const manifest = require('../package.json');
  assert.equal(catalog.length, 71);
  assert.equal(new Set(catalog.map(c => c.id)).size, 71);
  assert.deepEqual(catalog.map(c => c.id), manifest.contributes.commands.map(c => c.command));
  assert.deepEqual(catalog.map(c => c.file).sort(), fs.readdirSync(scripts).filter(f => f.endsWith('.js')).sort());
  assert.ok(!catalog.some(c => /^(Test|EvalJavascript)\.js$/.test(c.file)));
  assert.equal(fs.readdirSync(path.join(scripts, 'lib')).length, 8);
  assert.equal(catalog.find(c => c.file === 'Trim.js').title, 'Trim');
});

test('every command runs with valid representative input', () => {
  const overrides = {
    ASCIIToHex: 'ABC', HexToASCII: '414243', BinaryToDecimal: '101', DecimalToBinary: '5', DecimalToHex: '255', HexToDecimal: 'ff',
    hex2rgb: '#FF0080', RGBToHex: 'rgb(255, 0, 128)',
    AndroidIOSStrings: '<string name="hello">world</string>', IOSAndroidStrings: '"hello" = "world";',
    CSVtoJSON: 'name,value\nhello,1', JSONtoCSV: '[{"name":"hello","value":1}]',
    JSONtoYAML: '{"a":1}', YAMLtoJSON: 'a: 1', JsonToQuery: '{"a":"b"}', QueryToJson: 'a=b',
    DateToTimestamp: '2020-01-01T00:00:00Z', DateToUTC: '1577836800',
    FormatJSON: '{"a":1}', MinifyJSON: '{"a":1}', SortJSON: '{"b":2,"a":1}',
    FormatXML: '<root><a>1</a></root>', MinifyXML: '<root> <a>1</a> </root>',
    FormatCSS: 'a { color: red; }', MinifyCSS: 'a { color: red; }',
    FormatSQL: 'select * from items where id=1', MinifySQL: 'select * from items where id=1',
    Base64Decode: 'aGVsbG8=', JWTDecode: 'eyJhbGciOiJub25lIn0.eyJzdWIiOiIxIn0.', PhpUnserialize: 's:5:"hello";', SumAll: '1\n2\n3',
    FishHexPathConverter: '/hello/world', URLDecode: 'hello%20world', URLEntitiesDecode: 'hello%20world'
  };
  for (const command of catalog) {
    const stem = command.file.slice(0, -3);
    const result = run(stem, overrides[stem] ?? 'Hello world\nSecond line');
    assert.equal(typeof result.text, 'string', stem);
  }
});

test('bundled libraries produce expected results', () => {
  assert.equal(run('Base64Encode', 'Olá 👋').text, Buffer.from('Olá 👋').toString('base64'));
  assert.equal(run('Base64Decode', run('Base64Encode', 'Olá 👋').text).text, 'Olá 👋');
  assert.equal(run('MD5', 'hello').text, '5d41402abc4b2a76b9719d911017c592');
  for (const [script, algorithm] of [['SHA1', 'sha1'], ['SHA256', 'sha256'], ['SHA512', 'sha512']]) assert.equal(run(script, 'hello').text, require('node:crypto').createHash(algorithm).update('hello').digest('hex'));
  assert.equal(run('CamelCase', 'hello world').text, 'helloWorld');
  assert.equal(run('HTMLDecode', '&lt;a&gt;').text, '<a>');
  assert.deepEqual(JSON.parse(run('YAMLtoJSON', run('JSONtoYAML', '{"a":1}').text).text), { a: 1 });
  assert.deepEqual(JSON.parse(run('CSVtoJSON', 'name,value\nhello,1').text), [{ name: 'hello', value: '1' }]);
  assert.match(run('FormatXML', '<root><a>1</a></root>').text, /\n/);
});

test('RGB parser accepts defined forms and rejects malformed colors', () => {
  for (const input of ['rgb(255, 0, 128)', '255,0,128', '255 0 128', ' 255\t0\t128 ']) assert.equal(run('RGBToHex', input).text, '#FF0080');
  assert.equal(run('RGBToHex', '0,0,0').text, '#000000');
  assert.equal(run('RGBToHex', '255,255,255').text, '#FFFFFF');
  for (const input of ['256,0,0', '-1,0,0', '1.5,0,0', 'rgba(1,2,3,1)', 'rgb(1 2 3)', '1,2', '1,2,3,4', '', 'red', '1 2,3']) assert.throws(() => run('RGBToHex', input), /RGB integers/);
});

test('selections, full document, mixed cursors, information, CRLF', () => {
  assert.deepEqual(transform(runtime, 'Upcase.js', 'abc def', [{ start: 0, end: 3 }, { start: 4, end: 7 }, { start: 2, end: 2 }], '\n').replacements, [{ start: 0, end: 3, text: 'ABC' }, { start: 4, end: 7, text: 'DEF' }]);
  assert.equal(transform(runtime, 'Upcase.js', 'abc def', [{ start: 2, end: 2 }], '\n').replacements[0].text, 'ABC DEF');
  assert.equal(transform(runtime, 'ASCIIToHex.js', 'A B', [{ start: 2, end: 3 }], '\n').replacements[0].text, '42');
  assert.equal(transform(runtime, 'Collapse.js', 'a\nb\nuntouched', [{ start: 0, end: 3 }], '\n').replacements[0].text, 'a,b');
  assert.equal(transform(runtime, 'FormatJSON.js', '{"a":1}', [], '\r\n').replacements[0].text, '{\r\n  "a": 1\r\n}');
  assert.deepEqual(transform(runtime, 'CountWords.js', 'one two\nthree\r\nfour', [], '\r\n').replacements, []);
  assert.match(run('CountCharacters', '👋').info[0], /1 characters/);
  assert.throws(() => transform(runtime, 'FormatJSON.js', '{} bad', [{ start: 0, end: 2 }, { start: 3, end: 6 }], '\n'), /Invalid JSON/);
  assert.deepEqual(transform(runtime, 'Upcase.js', 'ABC', [], '\n').replacements, []);
});

test('randomized generators preserve their invariants', () => {
  assert.equal(run('LoremIpsum', '').text.split(/\s+/).length, 100);
  assert.deepEqual(run('ShuffleLines', 'a\nb\nc').text.split('\n').sort(), ['a', 'b', 'c']);
  assert.equal(run('SpongeCase', 'Hello World').text.toLowerCase(), 'hello world');
});

test('adapter coercion, insertion, isolation, restrictions, and timeout', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'swiss-knife-test-'));
  try {
    const fixture = (name, code) => fs.writeFileSync(path.join(dir, name + '.js'), code);
    fixture('Number', 'function main(s) { s.text = 42; }');
    fixture('Null', 'function main(s) { s.text = null; }');
    fixture('Insert', 'function main(s) { s.insert("1"); s.insert("2"); }');
    fixture('State', 'var count = 0; function main(s) { s.text = ++count; }');
    fixture('Loop', 'function main(s) { while(true) {} }');
    fixture('Denied', 'function main(s) { require("node:fs"); }');
    fixture('Globals', 'function main(s) { s.text = typeof process + ":" + typeof Buffer; }');
    fixture('Error', 'function main(s) { s.text = "changed"; s.postError(""); }');
    const rt = new ScriptRuntime(dir, 30);
    assert.equal(rt.run('Number.js', { text: '' }).text, '42');
    assert.equal(rt.run('Null.js', { text: '' }).text, '');
    assert.equal(rt.run('Insert.js', { text: 'ab', insertIndex: 1 }).text, 'a12b');
    assert.equal(rt.run('Insert.js', { text: 'ab', isSelection: true }).text, '2');
    assert.equal(rt.run('State.js', { text: '' }).text, '1');
    assert.equal(rt.run('State.js', { text: '' }).text, '2');
    assert.equal(new ScriptRuntime(dir).run('State.js', { text: '' }).text, '1');
    assert.throws(() => rt.run('Loop.js', { text: '' }), /timed out/);
    assert.throws(() => rt.run('Denied.js', { text: '' }), /Unsupported module/);
    assert.throws(() => rt.run('Error.js', { text: '' }), /could not process/);
    assert.equal(rt.run('Globals.js', { text: '' }).text, 'undefined:undefined');
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

const vscode = require('vscode');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const catalog = require('../dist/catalog.json');
const manifest = require('../package.json');
exports.run = async function () {
  const extension = vscode.extensions.getExtension(`${manifest.publisher}.${manifest.name}`);
  assert.ok(extension, 'Extension must be discovered');
  await extension.activate();
  const registered = (await vscode.commands.getCommands(true)).filter(c => c.startsWith('swissKnife.')).sort();
  assert.deepEqual(registered, catalog.map(c => c.id).sort());
  const doc = await vscode.workspace.openTextDocument({ content: 'one two three', language: 'plaintext' });
  const editor = await vscode.window.showTextDocument(doc);
  editor.selections = [new vscode.Selection(0, 0, 0, 3), new vscode.Selection(0, 4, 0, 7), new vscode.Selection(0, 10, 0, 10)];
  await vscode.commands.executeCommand('swissKnife.text.upcase');
  assert.equal(doc.getText(), 'ONE TWO three');
  await vscode.commands.executeCommand('undo');
  await waitForText(doc, 'one two three');
  editor.selections = [new vscode.Selection(0, 1, 0, 1), new vscode.Selection(0, 5, 0, 5)];
  await vscode.commands.executeCommand('swissKnife.text.upcase');
  assert.equal(doc.getText(), 'ONE TWO THREE');
  const countVersion = doc.version;
  await vscode.commands.executeCommand('swissKnife.text.countwords');
  assert.equal(doc.version, countVersion, 'Informational commands do not edit');
  const invalid = await vscode.workspace.openTextDocument({ content: '{"a":1} bad' });
  const invalidEditor = await vscode.window.showTextDocument(invalid);
  invalidEditor.selections = [new vscode.Selection(0, 0, 0, 7), new vscode.Selection(0, 8, 0, 11)];
  await vscode.commands.executeCommand('swissKnife.format.formatjson');
  assert.equal(invalid.getText(), '{"a":1} bad', 'Errors prevent partial edits');
  const crlf = await vscode.workspace.openTextDocument({ content: '{"a":1}\r\n' });
  const crlfEditor = await vscode.window.showTextDocument(crlf);
  crlfEditor.selection = new vscode.Selection(0, 0, 0, 0);
  await vscode.commands.executeCommand('swissKnife.format.formatjson');
  assert.equal(crlf.getText(), '{\r\n  "a": 1\r\n}');
  const unicode = await vscode.workspace.openTextDocument({ content: '👋 ab cd' });
  const unicodeEditor = await vscode.window.showTextDocument(unicode);
  unicodeEditor.selections = [new vscode.Selection(0, 3, 0, 5), new vscode.Selection(0, 6, 0, 8)];
  await vscode.commands.executeCommand('swissKnife.text.upcase');
  assert.equal(unicode.getText(), '👋 AB CD');
  const settings = vscode.workspace.getConfiguration('swissKnife');
  const originalDialect = settings.inspect('sqlDialect')?.globalValue;
  const originalQuoting = settings.inspect('sqlQuoteIdentifiers')?.globalValue;
  try {
    await settings.update('sqlDialect', 'mysql', vscode.ConfigurationTarget.Global);
    await settings.update('sqlQuoteIdentifiers', true, vscode.ConfigurationTarget.Global);
    const sql = await vscode.workspace.openTextDocument({ content: 'select a; select b;', language: 'sql' });
    const sqlEditor = await vscode.window.showTextDocument(sql);
    sqlEditor.selections = [new vscode.Selection(0, 0, 0, 9), new vscode.Selection(0, 10, 0, 19)];
    await vscode.commands.executeCommand('swissKnife.format.formatsql');
    assert.equal(sql.getText(), 'SELECT\n\t`a`\n; SELECT\n\t`b`\n;');
    await vscode.commands.executeCommand('undo');
    await waitForText(sql, 'select a; select b;');

    const monthlyInput = fs.readFileSync(path.join(__dirname, 'fixtures/monthly-lines.sql'), 'utf8').trimEnd();
    const monthlyExpected = fs.readFileSync(path.join(__dirname, 'fixtures/monthly-lines-wrapped.sql'), 'utf8').trimEnd();
    const monthly = await vscode.workspace.openTextDocument({ content: monthlyInput, language: 'sql' });
    await vscode.window.showTextDocument(monthly);
    await vscode.commands.executeCommand('swissKnife.format.formatsql');
    assert.equal(monthly.getText(), monthlyExpected);
    for (const line of monthly.getText().split('\n')) assert.ok(Array.from(line).length <= 120, line);
    await vscode.commands.executeCommand('undo');
    await waitForText(monthly, monthlyInput);

    await settings.update('sqlDialect', 'postgresql', vscode.ConfigurationTarget.Global);
    const pg = await vscode.workspace.openTextDocument({ content: 'select UserID from public.Users;\r\n', language: 'sql' });
    await vscode.window.showTextDocument(pg);
    await vscode.commands.executeCommand('swissKnife.format.formatsql');
    assert.equal(pg.getText(), 'SELECT\r\n\t"userid"\r\nFROM\r\n\t"public"."users"\r\n;');

    await settings.update('sqlQuoteIdentifiers', false, vscode.ConfigurationTarget.Global);
    const plain = await vscode.workspace.openTextDocument({ content: 'select UserID from public.Users;', language: 'sql' });
    await vscode.window.showTextDocument(plain);
    await vscode.commands.executeCommand('swissKnife.format.formatsql');
    assert.equal(plain.getText(), 'SELECT\n\tUserID\nFROM\n\tpublic.Users\n;');

    const broken = await vscode.workspace.openTextDocument({ content: "select a; select '", language: 'sql' });
    const brokenEditor = await vscode.window.showTextDocument(broken);
    brokenEditor.selections = [new vscode.Selection(0, 0, 0, 9), new vscode.Selection(0, 10, 0, broken.getText().length)];
    await vscode.commands.executeCommand('swissKnife.format.formatsql');
    assert.equal(broken.getText(), "select a; select '", 'SQL errors must prevent partial edits');
  } finally {
    await settings.update('sqlDialect', originalDialect, vscode.ConfigurationTarget.Global);
    await settings.update('sqlQuoteIdentifiers', originalQuoting, vscode.ConfigurationTarget.Global);
  }
  console.log('Swiss Knife: 71 registrations and editor integration checks passed.');
};

async function waitForText(document, expected) {
  const deadline = Date.now() + 5000;
  while (document.getText() !== expected && Date.now() < deadline) {
    await new Promise(resolve => setTimeout(resolve, 20));
  }
  assert.equal(document.getText(), expected, 'One undo restores all selections');
}

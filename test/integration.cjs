const vscode = require('vscode');
const assert = require('node:assert/strict');
const catalog = require('../dist/catalog.json');
exports.run = async function () {
  const extension = vscode.extensions.getExtension('swiss-knife-local.swiss-knife');
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
  console.log('Swiss Knife: 71 registrations and editor integration checks passed.');
};

async function waitForText(document, expected) {
  const deadline = Date.now() + 5000;
  while (document.getText() !== expected && Date.now() < deadline) {
    await new Promise(resolve => setTimeout(resolve, 20));
  }
  assert.equal(document.getText(), expected, 'One undo restores all selections');
}

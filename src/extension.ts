import * as vscode from 'vscode';
import * as path from 'node:path';
import catalog from './catalog.json';
import { ScriptRuntime } from './runtime';
import { transform } from './transform';
import type { SqlOptions } from './sqlOptions';

export function activate(context: vscode.ExtensionContext): void {
  const runtime = new ScriptRuntime(path.join(context.extensionPath, 'scripts'));
  for (const command of catalog) {
    context.subscriptions.push(vscode.commands.registerCommand(command.id, async () => {
      const label = `SK: ${command.category}: ${command.title}`;
      const editor = vscode.window.activeTextEditor;
      if (!editor) { void vscode.window.showErrorMessage(`${label}: Open a text editor first.`); return; }
      try {
        const document = editor.document;
        const version = document.version;
        const config = vscode.workspace.getConfiguration('swissKnife', document.uri);
        const options: SqlOptions | undefined = command.file === 'FormatSQL.js' ? {
          sqlDialect: config.get<SqlOptions['sqlDialect']>('sqlDialect', 'mysql'),
          sqlQuoteIdentifiers: config.get<boolean>('sqlQuoteIdentifiers', true)
        } : undefined;
        const result = transform(runtime, command.file, document.getText(), editor.selections.map(s => ({ start: document.offsetAt(s.start), end: document.offsetAt(s.end) })), document.eol === vscode.EndOfLine.CRLF ? '\r\n' : '\n', options);
        if (result.replacements.length) {
          if (document.version !== version || document.isClosed) throw new Error('The document changed. Run the command again.');
          const applied = await editor.edit(builder => {
            for (const replacement of result.replacements) builder.replace(new vscode.Range(document.positionAt(replacement.start), document.positionAt(replacement.end)), replacement.text);
          }, { undoStopBefore: true, undoStopAfter: true });
          if (!applied) throw new Error('The editor rejected the edit. Check that the document is writable and try again.');
        }
        if (result.info.length) void vscode.window.showInformationMessage(`${label}: ${result.info.join('; ')}`);
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        void vscode.window.showErrorMessage(`${label}: ${message}`);
      }
    }));
  }
}

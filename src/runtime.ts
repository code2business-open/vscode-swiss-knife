import * as fs from 'node:fs';
import * as path from 'node:path';
import * as vm from 'node:vm';

export interface ScriptInput { text: string; fullText?: string; isSelection?: boolean; insertIndex?: number }
export interface ScriptResult { text: string; info: string[] }

export class ScriptRuntime {
  private contexts = new Map<string, vm.Context>();
  constructor(private readonly scriptsDirectory: string, private readonly timeout = 1000) {}

  private context(file: string): vm.Context {
    const existing = this.contexts.get(file);
    if (existing) return existing;
    if (path.basename(file) !== file || !file.endsWith('.js')) throw new Error('Invalid script filename');
    const context = vm.createContext(Object.create(null));
    const modules = new Map<string, unknown>();
    const loadModule = (request: string): unknown => {
      if (!/^@sk\/[a-zA-Z0-9.-]+(?:\.js)?$/.test(request)) throw new Error(`Unsupported module: ${request}`);
      const name = request.slice(4).replace(/\.js$/, '');
      if (name === '.' || name === '..') throw new Error('Invalid module name');
      if (modules.has(name)) return modules.get(name);
      const source = fs.readFileSync(path.join(this.scriptsDirectory, 'lib', `${name}.js`), 'utf8');
      const module = { exports: {} as unknown };
      modules.set(name, module.exports);
      context.__module = module;
      try {
        new vm.Script(`(function(exports, module) {\n${source}\n}).call(__module.exports, __module.exports, __module)`, { filename: `${name}.js` }).runInContext(context, { timeout: this.timeout });
        modules.set(name, module.exports);
        return module.exports;
      } finally { delete context.__module; }
    };
    context.require = loadModule;
    new vm.Script(fs.readFileSync(path.join(this.scriptsDirectory, file), 'utf8'), { filename: file }).runInContext(context, { timeout: this.timeout });
    if (typeof context.main !== 'function') throw new Error(`Missing main function: ${file}`);
    this.contexts.set(file, context);
    return context;
  }

  run(file: string, input: ScriptInput): ScriptResult {
    const info: string[] = [];
    const errors: string[] = [];
    let text = input.text;
    let fullText = input.fullText ?? text;
    let insertOffset = 0;
    const isSelection = input.isSelection ?? false;
    const asText = (value: unknown): string => value == null ? '' : String(value);
    const state = {
      get text() { return text; }, set text(value: unknown) { text = asText(value); if (!isSelection) fullText = text; },
      get selection() { return isSelection ? text : null; }, set selection(value: unknown) { if (isSelection) text = asText(value); },
      get fullText() { return fullText; }, set fullText(value: unknown) { fullText = asText(value); if (!isSelection) text = fullText; },
      isSelection,
      insert(value: unknown) {
        const added = asText(value);
        if (isSelection) { text = added; return; }
        const at = Math.min(input.insertIndex ?? 0, text.length) + insertOffset;
        text = text.slice(0, at) + added + text.slice(at);
        fullText = text;
        insertOffset += added.length;
      },
      postInfo(value: unknown) { info.push(asText(value)); },
      postError(value: unknown) { errors.push(asText(value) || 'The script could not process this input.'); }
    };
    let context: vm.Context | undefined;
    try {
      context = this.context(file);
      context.__state = state;
      new vm.Script('main(__state)').runInContext(context, { timeout: this.timeout });
      if (errors.length) throw new Error(errors.join('\n'));
      return { text, info };
    } catch (error) {
      this.contexts.delete(file);
      throw error;
    } finally { if (context) delete context.__state; }
  }
}

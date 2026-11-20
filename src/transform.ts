import { ScriptRuntime } from './runtime';
import type { SqlOptions } from './sqlOptions';
export interface OffsetSelection { start: number; end: number }
export interface Replacement extends OffsetSelection { text: string }
export interface Transformation { replacements: Replacement[]; info: string[] }
export function transform(runtime: ScriptRuntime, file: string, document: string, selections: OffsetSelection[], eol: string, options?: SqlOptions): Transformation {
  const selected = selections.filter(s => s.start !== s.end).sort((a, b) => a.start - b.start);
  for (let i = 1; i < selected.length; i++) {
    if (selected[i].start < selected[i - 1].end) throw new Error('Overlapping selections cannot be transformed.');
  }
  const targets = selected.length ? selected : [{ start: 0, end: document.length }];
  const replacements: Replacement[] = [];
  const info: string[] = [];
  for (const target of targets) {
    const before = document.slice(target.start, target.end);
    const result = runtime.run(file, { text: before, fullText: document, isSelection: selected.length > 0, insertIndex: selections[0]?.start ?? 0, options });
    // Information-only scripts must leave even mixed line endings untouched.
    if (result.text !== before) {
      const text = result.text.replace(/\r\n|\r|\n/g, eol);
      if (text !== before) replacements.push({ ...target, text });
    }
    info.push(...result.info);
  }
  return { replacements, info: [...new Set(info)] };
}

import { formatDialect, mysql, mariadb, postgresql, transactsql, sqlite } from 'sql-formatter';
import type { SqlOptions } from './sqlOptions';

type Dialect = Parameters<typeof formatDialect>[1]['dialect'];
type Token = Parameters<NonNullable<Dialect['tokenizerOptions']['postProcess']>>[0][number] & { sqlCall?: boolean };
interface Node { token: Token; children?: Node[]; close?: Token; query?: boolean; call?: boolean }
const dialects = { mysql, mariadb, postgresql, transactsql, sqlite };
const clause = (node: Node) => ['RESERVED_SELECT', 'RESERVED_CLAUSE', 'LIMIT', 'RESERVED_SET_OPERATION'].includes(node.token.type);
const comment = (node: Node) => ['LINE_COMMENT', 'BLOCK_COMMENT', 'DISABLE_COMMENT'].includes(node.token.type);
const width = (text: string) => Array.from(text).length;
const lastLine = (text: string) => text.slice(text.lastIndexOf('\n') + 1);
const exceedsLimit = (text: string) => text.split('\n').some(line => width(line) > 120);
const tabs = (level: number) => '\t'.repeat(level);
let captured: Token[] = [];

function quote(name: string, dialect: string): string {
  // PostgreSQL's UTF-8 scanner folds ASCII letters, not Unicode code points.
  if (dialect === 'postgresql') name = name.replace(/[A-Z]/g, letter => letter.toLowerCase());
  if (dialect === 'mysql' || dialect === 'mariadb') return '`' + name.replace(/`/g, '``') + '`';
  if (dialect === 'transactsql') return '[' + name.replace(/]/g, ']]') + ']';
  return '"' + name.replace(/"/g, '""') + '"';
}

// Reuse dialect objects: the library caches tokenizers by object identity.
const adapters = Object.fromEntries(Object.entries(dialects).map(([name, base]) => [name,
  [false, true].map(quoting => ({
    ...base,
    tokenizerOptions: {
      ...base.tokenizerOptions,
      postProcess(input: Token[]) {
        const tokens = base.tokenizerOptions.postProcess?.(input) ?? input;
        const ignored = (token: Token) => ['LINE_COMMENT', 'BLOCK_COMMENT', 'DISABLE_COMMENT'].includes(token.type);
        const before: (Token | undefined)[] = [];
        const after: (Token | undefined)[] = [];
        let significant: Token | undefined;
        for (let i = 0; i < tokens.length; i++) {
          before[i] = significant;
          if (!ignored(tokens[i])) significant = tokens[i];
        }
        significant = undefined;
        for (let i = tokens.length - 1; i >= 0; i--) {
          after[i] = significant;
          if (!ignored(tokens[i])) significant = tokens[i];
        }
        let heading = '';
        const stack: string[] = [];
        const functionStack: string[] = [];
        const rewritten = tokens.map((token, index) => {
          const previousHeading = heading;
          if (['RESERVED_SELECT', 'RESERVED_CLAUSE', 'RESERVED_JOIN'].includes(token.type)) heading = token.text;
          const previous = before[index];
          const next = after[index];
          const qualified = previous?.type === 'PROPERTY_ACCESS_OPERATOR' || next?.type === 'PROPERTY_ACCESS_OPERATOR';
          const declaration = /^(WITH|INSERT|REPLACE|CREATE|ALTER)\b/.test(heading);
          const call = next?.text === '(' && !declaration;
          const bareBuiltin = /^(CURRENT_DATE|CURRENT_TIME|CURRENT_TIMESTAMP|LOCALTIME|LOCALTIMESTAMP|CURRENT_USER|SESSION_USER|SYSTEM_USER|CURRENT_SCHEMA|CURRENT_ROLE|CURRENT_CATALOG|USER)$/.test(token.text);
          const functionAsName = token.type === 'RESERVED_FUNCTION_NAME' && next?.text !== '('
            && !/\s/.test(token.text) && (!bareBuiltin || previous?.text === 'AS');
          const identifier = token.type === 'IDENTIFIER' || token.type === 'ARRAY_IDENTIFIER' || functionAsName
            || (qualified && /^(RESERVED_|ARRAY_KEYWORD)/.test(token.type));
          let result: Token = functionAsName ? { ...token, type: 'IDENTIFIER' as Token['type'], text: token.raw } : token;
          const dataType = previous?.text === '::' || (previous?.text === 'AS' && /^(CAST|TRY_CAST|SAFE_CAST)$/.test(functionStack[functionStack.length - 1] ?? ''));
          if (name === 'transactsql' && token.text === 'USER' && /^SELECT\b/.test(previousHeading)) {
            result = { ...token, type: 'RESERVED_FUNCTION_NAME' as Token['type'] };
            heading = previousHeading;
          }
          if (identifier && call) result = { ...result, sqlCall: true };
          if (quoting && identifier && !call && !dataType) {
            const text = quote(token.raw, name);
            result = { ...token, type: 'QUOTED_IDENTIFIER' as Token['type'], text, raw: text };
          }
          if (token.type === 'OPEN_PAREN') { stack.push(heading); functionStack.push(previous?.text.toUpperCase() ?? ''); heading = ''; }
          if (token.type === 'CLOSE_PAREN') { heading = stack.pop() ?? ''; functionStack.pop(); }
          return result;
        });
        captured = rewritten;
        return rewritten;
      }
    }
  })) as [Dialect, Dialect]
]));

function tree(tokens: Token[]): Node[] {
  let index = 0;
  const read = (closing?: string): Node[] => {
    const nodes: Node[] = [];
    while (index < tokens.length) {
      const token = tokens[index++];
      if (token.type === 'CLOSE_PAREN') {
        if (!closing || token.text !== closing) throw new Error('Unbalanced SQL parentheses.');
        index--;
        return nodes;
      }
      const node: Node = { token };
      if (token.type === 'OPEN_PAREN') {
        node.children = read(({ '(': ')', '[': ']', '{': '}' } as Record<string, string>)[token.text]);
        node.close = tokens[index++];
        if (!node.close) throw new Error('Unbalanced SQL parentheses.');
        node.query = node.children.some(clause);
        let previous: Token | undefined;
        for (let i = nodes.length - 1; i >= 0; i--) {
          if (!comment(nodes[i])) { previous = nodes[i].token; break; }
        }
        node.call = previous?.sqlCall || previous?.type === 'RESERVED_FUNCTION_NAME'
          || ((previous?.type === 'IDENTIFIER' || previous?.type === 'QUOTED_IDENTIFIER') && !token.precedingWhitespace);
      }
      nodes.push(node);
    }
    if (closing) throw new Error('Unbalanced SQL parentheses.');
    return nodes;
  };
  return read();
}

function tokenText(token: Token): string {
  // Some dialects classify predicates such as IS NOT NULL as function keywords.
  return /^(RESERVED_|AND$|OR$|XOR$|BETWEEN$|CASE$|WHEN$|THEN$|ELSE$|END$|LIMIT$)/.test(token.type)
    ? token.text.toUpperCase() : token.raw;
}

function logicalParts(nodes: Node[]): Node[][] {
  const result: Node[][] = [[]];
  let between = false;
  let cases = 0;
  for (const node of nodes) {
    const kind = node.token.type;
    if (kind === 'CASE') cases++;
    if (kind === 'END') cases--;
    if (!cases && kind === 'BETWEEN') between = true;
    if (!cases && (kind === 'AND' || kind === 'OR' || kind === 'XOR')) {
      if (between && kind === 'AND') between = false;
      else result.push([]);
    }
    result[result.length - 1].push(node);
  }
  return result;
}

// A comma belongs to the preceding item; nested lists are already grouped by tree().
function commaParts(nodes: Node[]): Node[][] {
  const parts: Node[][] = [[]];
  for (const node of nodes) {
    parts[parts.length - 1].push(node);
    if (node.token.type === 'COMMA') parts.push([]);
  }
  return parts.filter(part => part.length);
}

function expression(nodes: Node[], level: number, prefix = '', boolean = false, trailingCommentNewline = true, wrap = true): string {
  const flat = renderExpression(nodes, level, prefix, boolean, trailingCommentNewline, false);
  if (!wrap || !exceedsLimit(lastLine(prefix) + flat)) return flat;
  const parts = commaParts(nodes);
  if (parts.length > 1) {
    return parts.map((part, index) => expression(part, level, index ? tabs(level) : prefix, boolean, false))
      .join('\n' + tabs(level));
  }
  return renderExpression(nodes, level, prefix, boolean, trailingCommentNewline, true);
}

function renderExpression(nodes: Node[], level: number, prefix: string, boolean: boolean, trailingCommentNewline: boolean, wrap: boolean): string {
  let output = '';
  let requiredBreak = false;
  for (const [index, node] of nodes.entries()) {
    const token = node.token;
    const gap = node.call ? '' : token.precedingWhitespace ? ' ' : '';
    if (output && (requiredBreak || (comment(node) && /\n/.test(token.precedingWhitespace ?? '')))) {
      if (output && !output.endsWith('\n')) output += '\n';
      output += tabs(level);
    } else if (output) output += gap;
    requiredBreak = false;
    if (node.children) {
      if (node.query) {
        output += token.raw + '\n' + query(node.children, level + 1) + '\n' + tabs(level) + node.close!.raw;
      } else if (wrap && boolean && !node.call) {
        const start = lastLine(prefix + output) + token.raw;
        const flat = expression(node.children, level + 1, '', false, true, false);
        const multiline = exceedsLimit(start + flat + node.close!.raw);
        if (multiline && logicalParts(node.children).length > 1) {
          output += token.raw + '\n' + tabs(level + 1)
            + condition(node.children, level + 1, tabs(level + 1)) + '\n' + tabs(level) + node.close!.raw;
        } else {
          output += token.raw + expression(node.children, level, start, true) + node.close!.raw;
        }
      } else {
        const start = lastLine(prefix + output) + token.raw;
        const flat = expression(node.children, level, start, false, true, false);
        // Include aliases, casts and trailing operators when deciding whether a call fits.
        const following = nodes.slice(index + 1);
        const comma = following.findIndex(next => next.token.type === 'COMMA');
        const tail = following.slice(0, comma < 0 ? following.length : comma + 1);
        const suffix = wrap && tail.length ? (tail[0].token.precedingWhitespace ? ' ' : '')
          + expression(tail, level, '', false, false, false) : '';
        if (wrap && exceedsLimit(start + flat + node.close!.raw + suffix)) {
          const body = commaParts(node.children).map(part => expression(part, level + 1, tabs(level + 1), false, false))
            .join('\n' + tabs(level + 1));
          output += token.raw + '\n' + tabs(level + 1) + body + '\n' + tabs(level) + node.close!.raw;
        } else {
          output += token.raw + flat + node.close!.raw;
        }
      }
    } else {
      output += tokenText(token);
      requiredBreak = token.type === 'LINE_COMMENT';
    }
  }
  // Keep a final line comment from swallowing a following closing parenthesis.
  if (requiredBreak && trailingCommentNewline) output += '\n' + tabs(Math.max(0, level - 1));
  return output;
}

function condition(nodes: Node[], level: number, prefix: string): string {
  const flat = expression(nodes, level, '', false, false, false);
  const split = exceedsLimit(lastLine(prefix) + flat);
  const parts = split ? logicalParts(nodes) : [nodes];
  return parts.map((part, index) => expression(part, level, index ? tabs(level) : prefix, true, false))
    .join('\n' + tabs(level));
}

function query(nodes: Node[], level: number): string {
  let output = '';
  let bodyLevel = level;
  const newline = (indent: number, blank = false) => {
    if (output && !output.endsWith('\n')) output += '\n';
    if (blank) output += '\n';
    output += tabs(indent);
  };
  let index = 0;
  while (index < nodes.length) {
    const node = nodes[index];
    const kind = node.token.type;
    if (kind === 'DELIMITER') {
      newline(level);
      output += ';';
      index++;
      if (index < nodes.length) { output += '\n\n'; }
      bodyLevel = level;
      continue;
    }
    if (clause(node)) {
      newline(level);
      output += tokenText(node.token);
      newline(level + 1);
      bodyLevel = level + 1;
      index++;
      continue;
    }
    if (kind === 'RESERVED_JOIN') {
      newline(level);
      output += tokenText(node.token) + ' ';
      bodyLevel = level;
      index++;
    }
    const start = index;
    while (index < nodes.length && !clause(nodes[index]) && !['RESERVED_JOIN', 'DELIMITER'].includes(nodes[index].token.type)) index++;
    const body = nodes.slice(start, index);
    const on = body.findIndex(n => n.token.type === 'RESERVED_KEYWORD' && n.token.text.toUpperCase() === 'ON');
    const previousHeading = nodes[start - 1]?.token.text.toUpperCase();
    if (on >= 0) {
      output += expression(body.slice(0, on + 1), bodyLevel);
      output += ' ' + condition(body.slice(on + 1), level + 1, lastLine(output) + ' ');
    } else if (previousHeading === 'WHERE' || previousHeading === 'HAVING') {
      output += condition(body, bodyLevel, lastLine(output));
    } else {
      output += expression(body, bodyLevel, lastLine(output), false, false);
    }
  }
  return output;
}

export function formatSql(source: string, options: SqlOptions = {}): string {
  const language = options.sqlDialect ?? 'mysql';
  if (!Object.hasOwn(dialects, language)) throw new Error(`Unsupported SQL dialect: ${language}. Check Swiss Knife SQL Dialect in Settings.`);
  if (options.sqlQuoteIdentifiers !== undefined && typeof options.sqlQuoteIdentifiers !== 'boolean') throw new Error('SQL identifier quoting must be true or false.');
  if (!source.trim()) return source;
  try {
    const dialect = adapters[language][options.sqlQuoteIdentifiers === false ? 0 : 1];
    const paramTypes = { named: [...new Set([...(dialects[language].tokenizerOptions.paramTypes?.named ?? []), ':' as const])] };
    const config = { paramTypes, useTabs: true, keywordCase: 'upper' as const, functionCase: 'upper' as const, expressionWidth: 1000000000, newlineBeforeSemicolon: true };
    const formatted = formatDialect(source, { ...config, dialect });
    const protectedTokens = captured.filter(t => ['STRING', 'LINE_COMMENT', 'BLOCK_COMMENT', 'DISABLE_COMMENT'].includes(t.type));
    formatDialect(formatted, { ...config, dialect: adapters[language][0] });
    let protectedIndex = 0;
    const tokens = captured.map(token => {
      if (['STRING', 'LINE_COMMENT', 'BLOCK_COMMENT', 'DISABLE_COMMENT'].includes(token.type)) {
        const original = protectedTokens[protectedIndex++];
        if (!original || token.type !== original.type) throw new Error('SQL protected text changed during formatting.');
        return { ...token, raw: original.raw, text: original.text };
      }
      return token;
    });
    if (protectedIndex !== protectedTokens.length) throw new Error('SQL protected text changed during formatting.');
    return query(tree(tokens), 0);
  } catch (error) {
    throw new Error(`SQL formatting failed (${language}): ${error instanceof Error ? error.message : String(error)}. Check the query and Swiss Knife SQL Dialect setting.`);
  } finally { captured = []; }
}

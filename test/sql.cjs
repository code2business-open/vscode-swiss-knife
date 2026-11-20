const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { execFileSync } = require('node:child_process');
const { formatSql } = require('../dist/sqlFormatter');
const { ScriptRuntime } = require('../dist/runtime');
const { transform } = require('../dist/transform');
const runtime = new ScriptRuntime(path.resolve(__dirname, '../scripts'));
const fixture = name => fs.readFileSync(path.join(__dirname, 'fixtures', name), 'utf8').trimEnd();
const run = (text, options) => runtime.run('FormatSQL.js', { text, options }).text;
const noQuotes = { sqlQuoteIdentifiers: false };
const stable = (input, options) => {
  const output = formatSql(input, options);
  assert.equal(formatSql(output, options), output, `Formatting must be idempotent: ${input}`);
  assert.equal(run(input, options), output, 'Bundled VM helper must match source implementation');
  return output;
};

test('SQL golden fixtures exactly match the requested layout with and without quoting', () => {
  const input = fixture('network.sql');
  const expected = fixture('network-wrapped.sql');
  assert.equal(stable(input, noQuotes), expected);
  assert.equal(stable(input), fixture('network-quoted.sql'));
  const compact = input.replace(/\s+/g, ' ');
  assert.equal(stable(compact, noQuotes), expected);
  const lowercaseKeywords = compact.replace(/\b(UPDATE|LEFT JOIN|SELECT|SUM|IF|FROM|WHERE|GROUP BY|SET|IFNULL|ON|IS NOT NULL)\b/g, s => s.toLowerCase());
  assert.equal(stable(lowercaseKeywords, noQuotes), expected);
});

test('long SELECT and nested JSON function arguments wrap within 120 characters without changing SQL tokens', () => {
  const input = fixture('monthly-lines.sql');
  const expected = fixture('monthly-lines-wrapped.sql');
  for (const sqlQuoteIdentifiers of [false, true]) {
    const output = stable(input, { sqlQuoteIdentifiers });
    assert.equal(output, expected);
    for (const line of output.split('\n')) assert.ok(Array.from(line).length <= 120, line);
    assert.match(output, /SELECT\n\t`w`\.\*,\n\tJSON_ARRAY_APPEND\(/);
  }
  const { formatDialect, mysql } = require('sql-formatter');
  const signature = source => {
    let tokens;
    formatDialect(source, { dialect: { ...mysql, tokenizerOptions: { ...mysql.tokenizerOptions, postProcess(input) {
      tokens = mysql.tokenizerOptions.postProcess?.(input) ?? input;
      return tokens;
    } } } });
    return tokens.map(token => [token.type, token.text]);
  };
  assert.deepEqual(signature(expected), signature(input), 'Only layout may change; SQL tokens and literals must be identical');
});

test('comma lists stay inline through 120 characters and wrap one item per line above the limit', () => {
  for (const length of [119, 120, 121]) {
    const body = 'a'.repeat(length - 4) + ', b';
    assert.equal(('\t' + body).length, length);
    for (const sql of [`select ${body} from t;`, `select a from t group by ${body};`]) {
      const output = stable(sql, noQuotes);
      if (length <= 120) assert.ok(output.includes('\t' + body + '\n'));
      else assert.ok(output.includes('\t' + 'a'.repeat(length - 4) + ',\n\tb\n'));
    }
  }
  const assignments = 'first_column = ' + "'" + 'x'.repeat(90) + "'" + ', second_column = 2';
  assert.match(stable('update t set ' + assignments + ';', noQuotes), /SET\n\tfirst_column = 'x+',\n\tsecond_column = 2/);
});

test('function wrapping includes indentation, aliases and nested calls in the line width', () => {
  const overhead = "\tCOALESCE('', 0) result".length;
  for (const length of [119, 120, 121]) {
    const body = `COALESCE('${'x'.repeat(length - overhead)}', 0) result`;
    assert.equal(('\t' + body).length, length);
    const output = stable('select ' + body + ';', noQuotes);
    if (length <= 120) assert.equal(output, 'SELECT\n\t' + body + '\n;');
    else assert.match(output, /COALESCE\(\n\t\t'x+',\n\t\t0\n\t\) result/);
    for (const line of output.split('\n')) assert.ok(line.length <= 120, line);
  }
  const output = stable(`select coalesce(concat('${'x'.repeat(65)}', '${'y'.repeat(65)}'), 0) result;`, noQuotes);
  assert.match(output, /COALESCE\(\n\t\tCONCAT\(\n/);
  for (const line of output.split('\n')) assert.ok(line.length <= 120, line);
  const literal = "'a,b,AND,c'";
  const commented = stable(`select ${literal}, /* keep, this */ coalesce('${'x'.repeat(75)}', '${'y'.repeat(75)}') result;`, noQuotes);
  assert.ok(commented.includes(literal));
  assert.ok(commented.includes('/* keep, this */'));
});

test('lists and recursive function arguments wrap for every supported dialect', () => {
  const sql = `select coalesce(nullif('${'x'.repeat(65)}', '${'y'.repeat(65)}'), 0) result, id from entries;`;
  for (const sqlDialect of ['mysql', 'mariadb', 'postgresql', 'transactsql', 'sqlite']) {
    const output = stable(sql, { sqlDialect, sqlQuoteIdentifiers: false });
    assert.match(output, /COALESCE\(\n\t\tNULLIF\(\n/);
    for (const line of output.split('\n')) assert.ok(line.length <= 120, `${sqlDialect}: ${line}`);
  }
});

test('dialect quoting, aliases, schema names, wildcards and placeholders', () => {
  for (const sqlDialect of ['mysql', 'mariadb']) {
    assert.equal(stable('select wc.sumLeft, wc.* from db.network wc where wc.id=?;', { sqlDialect }), 'SELECT\n\t`wc`.`sumLeft`, `wc`.*\nFROM\n\t`db`.`network` `wc`\nWHERE\n\t`wc`.`id` = ?\n;');
  }
  assert.equal(stable('select UserID, "MixedCase" from public.Users AS U where U.UserID=$1;', { sqlDialect: 'postgresql' }), 'SELECT\n\t"userid", "MixedCase"\nFROM\n\t"public"."users" AS "u"\nWHERE\n\t"u"."userid" = $1\n;');
  assert.equal(stable('select [A]]B], t.name from dbo.people t where t.id=@id;', { sqlDialect: 'transactsql' }), 'SELECT\n\t[A]]B], [t].[name]\nFROM\n\t[dbo].[people] [t]\nWHERE\n\t[t].[id] = @id\n;');
  assert.equal(stable('select t.name from main.people t where t.id=:id;', { sqlDialect: 'sqlite' }), 'SELECT\n\t"t"."name"\nFROM\n\t"main"."people" "t"\nWHERE\n\t"t"."id" = :id\n;');
  assert.match(stable('select user, current_schema, current_role from t;', { sqlDialect: 'postgresql' }), /USER, CURRENT_SCHEMA, CURRENT_ROLE/);
  assert.match(stable('select user from t;', { sqlDialect: 'transactsql' }), /SELECT\n\tUSER\nFROM/);
  assert.match(stable('select ÜPPER from People;', { sqlDialect: 'postgresql' }), /"Üpper"/);
  assert.match(stable('select a from t where a=:id;'), /`a` = :id/);
  assert.match(stable('select cast(a as customtype), a::customtype from t;', { sqlDialect: 'postgresql' }), /CAST\("a" AS customtype\), "a"::customtype/);
  assert.match(stable('select count(*) as total, sum as amount from users;'), /COUNT\(\*\) AS `total`, `sum` AS `amount`/);
});

test('existing quotes and escaping are preserved; disabling quoting never removes quotes', () => {
  for (const [sqlDialect, name] of [['mysql', '`a``b`'], ['mariadb', '`a``b`'], ['postgresql', '"a""b"'], ['sqlite', '"a""b"'], ['transactsql', '[a]]b]']]) {
    assert.equal(stable(`select ${name} from t;`, { sqlDialect }).split('\n')[1], '\t' + name);
  }
  assert.equal(stable('select `t`.a, `AlreadyQuoted` from `table` t;', noQuotes), 'SELECT\n\t`t`.a, `AlreadyQuoted`\nFROM\n\t`table` t\n;');
  assert.match(stable('select "MixedCase" from "MyTable";', { sqlDialect: 'postgresql' }), /"MixedCase"\nFROM\n\t"MyTable"/);
});

test('conditions stay inline at 119 and 120 characters, split every condition at 121', () => {
  for (const length of [119, 120, 121]) {
    const body = `a = '${'x'.repeat(length - 26)}' AND b = 2 OR c = 3`;
    assert.equal(('\t' + body).length, length);
    const result = stable('select a from t where ' + body + ';', noQuotes);
    if (length <= 120) assert.ok(result.includes('\t' + body + '\n;'));
    else assert.match(result, /\n\tAND b = 2\n\tOR c = 3\n;/);
  }
});

test('quoting and ON prefixes count toward conditional width; HAVING wraps too', () => {
  const input = `select a from t where a = '${'x'.repeat(93)}' and b=2 or c=3;`;
  assert.ok(!stable(input, noQuotes).includes('\n\tAND'));
  assert.ok(stable(input).includes('\n\tAND `b` = 2\n\tOR `c` = 3'));
  const on = `select a from t left join (select a from u) wc on wc.a='${'x'.repeat(82)}' and t.a=wc.a or t.b=wc.b;`;
  const joined = stable(on, noQuotes);
  assert.match(joined, /\) wc ON wc.a = '[x]+'\n\tAND t.a = wc.a\n\tOR t.b = wc.b/);
  const having = stable(`select a from t group by a having sum(a)>${'1'.repeat(115)} and count(*)>1;`, noQuotes);
  assert.match(having, /\nHAVING\n\tSUM\(\n\t\ta\n\t\) > 1+\n\tAND COUNT\(\*\) > 1/);
  for (const line of having.split('\n')) assert.ok(line.length <= 120, line);
});

test('nested boolean groups wrap without changing grouping, BETWEEN or function arguments', () => {
  const output = stable(`select a from t where (a='${'x'.repeat(80)}' and b='${'y'.repeat(60)}') or c between 1 and 2 and d=coalesce(a,b,c);`, noQuotes);
  assert.match(output, /WHERE\n\t\(\n\t\ta = 'x+'\n\t\tAND b = 'y+'\n\t\)\n\tOR c BETWEEN 1 AND 2\n\tAND d = COALESCE\(a, b, c\)/);
  const call = stable(`select a from t where custom_fn(a='${'x'.repeat(121)}' and b=2,c)=1 and d=2;`, noQuotes);
  assert.match(call, /custom_fn\(\n\t\ta = 'x+' AND b = 2,\n\t\tc\n\t\) = 1\n\tAND d = 2/);
  const leaf = stable(`select a from t where a='${'x'.repeat(180)}';`, noQuotes);
  assert.ok(leaf.includes('x'.repeat(180)));
  assert.equal(leaf.split('\n').length, 7);
});

test('strings, dollar quotes, comments and comment-safe line breaks are preserved', () => {
  const literal = "'  FROM a AND b; \\'x\\'\n\t  SELECT '";
  const mysql = stable(`select ${literal}, a -- AND fake=1\nfrom t where a=1 /* OR fake=2 */ and b=2;`, noQuotes);
  assert.ok(mysql.includes(literal));
  assert.match(mysql, /-- AND fake=1\n/);
  assert.ok(mysql.includes('/* OR fake=2 */'));
  const wrapped = stable(`select a from t where (a='${'x'.repeat(121)}' -- condition\nand b=2) or c=3;`);
  assert.doesNotMatch(wrapped, /\n[\t ]*\n/);
  const pg = stable('select $$ WHERE A AND B;\n  SELECT $$, a::text from t where a=$1;', { sqlDialect: 'postgresql' });
  assert.ok(pg.includes('$$ WHERE A AND B;\n  SELECT $$'));
  assert.ok(pg.includes('"a"::TEXT'));
  const annotatedCall = stable('select sum /* function */ (a) as total from t;');
  assert.match(annotatedCall, /SUM\s*\/\* function \*\//);
  assert.ok(!annotatedCall.includes('`sum`'));
  const block = '/* original\n   exact body */';
  assert.ok(stable(`select ${block} a from t;`).includes(block));
  stable('select a from t where exists (select b from u where u.b=t.b -- trailing\n) and a=1;');
});

test('CTEs, INSERT, DELETE, CASE, nested SELECTs, statements and no added semicolons', () => {
  assert.match(stable('with cte(id) as (select id from users) select cte.id from cte;'), /WITH\n\t`cte` \(`id`\) AS \(/);
  assert.match(stable("insert into users (name, value) values ('joe', 1);"), /`users` \(`name`, `value`\)\nVALUES\n\t\('joe', 1\)/);
  assert.match(stable('delete from users where id=1;'), /DELETE FROM\n\t`users`\nWHERE/);
  assert.match(stable('select case when a=1 and b=2 then c else d end as output from t;'), /CASE WHEN `a` = 1 AND `b` = 2 THEN `c` ELSE `d` END AS `output`/);
  assert.equal(stable('select a from t; select b from t;').split(';\n\n').length, 2);
  assert.ok(!stable('select a from t').endsWith(';'));
  assert.equal(run('   '), '   ');
});

test('settings pass through transformations, preserve CRLF and keep multi-selection errors atomic', () => {
  const document = 'select a; select b;';
  const result = transform(runtime, 'FormatSQL.js', document, [{ start: 0, end: 9 }, { start: 10, end: 19 }], '\r\n', { sqlDialect: 'postgresql' });
  assert.deepEqual(result.replacements.map(r => r.text), ['SELECT\r\n\t"a"\r\n;', 'SELECT\r\n\t"b"\r\n;']);
  assert.throws(() => transform(runtime, 'FormatSQL.js', "select a; select '", [{ start: 0, end: 9 }, { start: 10, end: 18 }], '\n'), /SQL formatting failed/);
  assert.throws(() => run('select (a from t;'), /SQL formatting failed/);
  assert.throws(() => run('select a;', { sqlDialect: 'no-such-dialect' }), /Unsupported SQL dialect/);
});

test('upstream imports preserve the local SQL command and bundled helper', () => {
  const temporary = fs.mkdtempSync(path.join(os.tmpdir(), 'sk-sql-import-'));
  try {
    const destination = path.join(temporary, 'extension');
    const upstream = path.join(temporary, 'upstream');
    const source = path.join(upstream, 'project/App/scripts');
    for (const directory of [path.join(destination, 'tools'), path.join(destination, 'scripts/lib'), path.join(destination, 'vendor'), path.join(source, 'lib')]) fs.mkdirSync(directory, { recursive: true });
    fs.copyFileSync(path.resolve(__dirname, '../tools/import-scripts.cjs'), path.join(destination, 'tools/import-scripts.cjs'));
    fs.writeFileSync(path.join(destination, 'scripts/FormatSQL.js'), 'local command');
    fs.writeFileSync(path.join(destination, 'scripts/lib/sqlFormatter.js'), 'local helper');
    fs.writeFileSync(path.join(source, 'FormatSQL.js'), 'upstream command');
    fs.writeFileSync(path.join(source, 'Upcase.js'), 'upstream utility');
    fs.writeFileSync(path.join(source, 'lib/helper.js'), 'upstream helper');
    fs.writeFileSync(path.join(source, 'lib/sqlFormatter.js'), 'conflicting upstream helper');
    fs.writeFileSync(path.join(upstream, 'LICENSE'), 'upstream license');
    execFileSync(process.execPath, [path.join(destination, 'tools/import-scripts.cjs'), source]);
    assert.equal(fs.readFileSync(path.join(destination, 'scripts/FormatSQL.js'), 'utf8'), 'local command');
    assert.equal(fs.readFileSync(path.join(destination, 'scripts/lib/sqlFormatter.js'), 'utf8'), 'local helper');
    assert.equal(fs.readFileSync(path.join(destination, 'scripts/Upcase.js'), 'utf8'), 'upstream utility');
  } finally { fs.rmSync(temporary, { recursive: true, force: true }); }
});

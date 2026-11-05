// src/fixtures-test.mjs — 对 golden.json 逐条比对（与 selftest 分开，便于 CI 单独跑）
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadDictionary } from './load.mjs';
import { resolveError } from './resolve.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const { dict } = loadDictionary(ROOT);
const cases = JSON.parse(readFileSync(join(ROOT, 'catalog', 'fixtures', 'golden.json'), 'utf8'));
let ok = 0, bad = 0;
for (const c of cases) {
  const a = resolveError(c.input, {}, dict);
  const good = a.id === c.expect.id && a.causeAssertion === c.expect.assertion
    && (c.expect.showRaw === undefined || a.showRawMessage === c.expect.showRaw);
  if (good) { ok++; console.log(`  PASS  ${c.id} → ${a.id} [${a.causeAssertion}]`); }
  else { bad++; console.log(`  FAIL  ${c.id}: got ${a.id} [${a.causeAssertion}], want ${c.expect.id} [${c.expect.assertion}]`); }
}
console.log(`\ngolden: ${ok} passed, ${bad} failed / ${cases.length} cases`);
if (bad) process.exitCode = 1;

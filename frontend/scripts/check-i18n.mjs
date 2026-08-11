// Verifies the two dictionaries stay in step. A missing English key silently
// falls back to Hebrew at runtime, which looks like "translation done" until a
// user switches language and hits a wall of Hebrew.
//
//   node frontend/scripts/check-i18n.mjs
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const i18nDir = join(dirname(fileURLToPath(import.meta.url)), '..', 'src', 'i18n');

const keysOf = (file) => {
  const src = readFileSync(join(i18nDir, file), 'utf8');
  const keys = [...src.matchAll(/^\s{2}'([^']+)':/gm)].map((m) => m[1]);
  const dupes = keys.filter((k, i) => keys.indexOf(k) !== i);
  return { keys: new Set(keys), dupes, count: keys.length };
};

const he = keysOf('he.js');
const en = keysOf('en.js');

const missingInEn = [...he.keys].filter((k) => !en.keys.has(k));
const missingInHe = [...en.keys].filter((k) => !he.keys.has(k));

// Placeholders must match too — {used} in one language and {count} in the other
// renders the literal brace text to the user.
const placeholders = (file) => {
  const src = readFileSync(join(i18nDir, file), 'utf8');
  const map = new Map();
  for (const m of src.matchAll(/^\s{2}'([^']+)':\s*(['"])((?:\\.|(?!\2).)*)\2/gm)) {
    map.set(m[1], [...m[3].matchAll(/\{(\w+)\}/g)].map((p) => p[1]).sort().join(','));
  }
  return map;
};
const hePh = placeholders('he.js');
const enPh = placeholders('en.js');
const mismatched = [...hePh.entries()]
  .filter(([k, v]) => enPh.has(k) && enPh.get(k) !== v)
  .map(([k]) => `${k} (he: {${hePh.get(k)}} vs en: {${enPh.get(k)}})`);

const problems = [];
if (he.dupes.length) problems.push(`duplicate keys in he.js: ${he.dupes.join(', ')}`);
if (en.dupes.length) problems.push(`duplicate keys in en.js: ${en.dupes.join(', ')}`);
if (missingInEn.length) problems.push(`missing in en.js: ${missingInEn.join(', ')}`);
if (missingInHe.length) problems.push(`missing in he.js: ${missingInHe.join(', ')}`);
if (mismatched.length) problems.push(`placeholder mismatch: ${mismatched.join('; ')}`);

console.log(`he.js: ${he.count} keys, en.js: ${en.count} keys`);
if (problems.length) {
  for (const p of problems) console.error(`  ✗ ${p}`);
  process.exit(1);
}
console.log('  ✓ dictionaries are in sync');

// Every icon-only button and every form field needs a name a screen reader
// can announce. This scans the source so a new unlabeled control fails CI.
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync, readdirSync} from 'node:fs';

const folder = new URL('../', import.meta.url);
const files = readdirSync(folder).filter(f => f.endsWith('.jsx'));
const lineOf = (source, index) => source.slice(0, index).split('\n').length;

test('icon-only buttons have an aria-label or title', () => {
  const problems = [];
  for (const file of files) {
    const source = readFileSync(new URL(file, folder), 'utf8');
    // <button ...attributes...> followed only by one or more <i .../> icons.
    for (const m of source.matchAll(/<button\b([^>]*)>\s*(?:<i\b[^>]*\/>\s*)+<\/button>/g)) {
      if (!/aria-label=|title=/.test(m[1])) problems.push(`${file}:${lineOf(source, m.index)}`);
    }
  }
  assert.deepEqual(problems, [], 'Icon-only buttons without a name: ' + problems.join(', '));
});

test('a visible <label> next to a field is also the field\'s name', () => {
  const problems = [];
  for (const file of files) {
    const source = readFileSync(new URL(file, folder), 'utf8');
    for (const m of source.matchAll(/<label>[^<{]*<\/label>\s*<(input|select|textarea)\b([^>]*)/g)) {
      if (!/aria-label=|id=/.test(m[2])) problems.push(`${file}:${lineOf(source, m.index)}`);
    }
  }
  assert.deepEqual(problems, [], 'Fields whose label is not linked: ' + problems.join(', '));
});

import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const pages = {
  'help': ['support','privacy','legal'],
  'privacy': ['privacy','support'],
  'refunds': ['billing','support'],
  'terms': ['support','billing','legal'],
  'license': ['billing','support'],
};
const recognized = new Set(['support','billing','privacy','legal']);
const root = new URL('../website/', import.meta.url);

for (const [slug, required] of Object.entries(pages)) {
  test(slug+' contact links use active Humperdinck email aliases', () => {
    const html = readFileSync(new URL(slug+'/index.html',root),'utf8');
    const links = [...html.matchAll(/href=["']mailto:([^"'?]+)(?:\?[^"']*)?["']/gi)]
      .map(m=>m[1].toLowerCase());
    for (const alias of required)
      assert.ok(links.includes(alias+'@humperdinck.studio'),
        'Missing mailto link '+alias+'@humperdinck.studio in '+slug);
    for (const address of links.filter(a=>a.endsWith('@humperdinck.studio')))
      assert.ok(recognized.has(address.slice(0,address.indexOf('@'))),
        'Unexpected published Humperdinck alias '+address+' in '+slug);
    // Fail CI if a visible support contact points at a stale email or typo.
    for (const value of html.matchAll(/(?:support|billing|privacy|legal)@humperdinck\.studio/gi))
      assert.ok(links.includes(value[0].toLowerCase()),
        'Address appears on page without corresponding mailto: '+value[0]);
  });
}
test('operational ownership and delivery gates remain documented', () => {
  const runbook=readFileSync(new URL('../docs/SUPPORT_AND_RELEASE_OPERATIONS.md',import.meta.url),'utf8');
  for (const alias of recognized) assert.ok(runbook.includes(alias+'@humperdinck.studio'));
  for(const term of ['independent','Inbox','reply-from','NOT TESTED'])
    assert.ok(runbook.toLowerCase().includes(term.toLowerCase()), 'Missing '+term);
});

import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

test('all three desktop download cards use a mobile grid',()=>{
  const css=readFileSync(new URL('../website/styles.css',import.meta.url),'utf8');
  // The card defaults have platform-specific selectors with higher
  // specificity than .download-card. Regressions made macOS/Linux remain
  // display:flex while Windows used the intended mobile two-column grid.
  const editorial=css.indexOf('/* Download experience v2:');
  assert.ok(editorial>=0,'editorial download cards must exist');
  const mobile=css.indexOf('@media(max-width:680px){',editorial);
  assert.ok(mobile>editorial,'editorial mobile breakpoint must exist');
  const mobileCss=css.slice(mobile,css.indexOf('@media(max-width:360px){',mobile));
  assert.match(mobileCss,/\.download-card\{display:grid;grid-template-columns:108px minmax\(0,1fr\)/);
  assert.match(mobileCss,/\.download-card\[data-platform="macos"\],\.download-card\[data-platform="linux"\]\{display:grid\}/);
  assert.match(mobileCss,/\.download-card-bottom\{grid-column:1\/-1;grid-row:2/);
  assert.match(mobileCss,/\.download-card-visual\{\s*grid-row:1;grid-column:1/);
  assert.match(mobileCss,/\.download-card-copy\{grid-row:1;grid-column:2/);
  const tiny=css.slice(css.indexOf('@media(max-width:360px){',mobile));
  assert.match(tiny,/\.download-card\{grid-template-columns:90px minmax\(0,1fr\)/);
});

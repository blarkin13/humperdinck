import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const css=readFileSync(new URL('../website/mail/mail.css',import.meta.url),'utf8');
const html=readFileSync(new URL('../website/mail/index.html',import.meta.url),'utf8');
const js=readFileSync(new URL('../website/mail/mail.js',import.meta.url),'utf8');

test('author styles must honor the hidden attribute for mailbox and placeholder',()=>{
  assert.match(css,/\[hidden\]\s*\{\s*display\s*:\s*none\s*!important\s*\}/,
    'CSS display:grid on .workspace and .empty otherwise overrides browser hidden behavior');
  assert.match(html,/id="mail-workspace"[^>]*hidden/);
  assert.match(html,/id="thread-view"[^>]*hidden/);
});

test('clicking a conversation replaces the empty state and scrolls selected pane to top',()=>{
  assert.match(js,/\$\('empty'\)\.hidden=true;\$\('thread-view'\)\.hidden=false/);
  assert.match(js,/querySelector\('\.conversation'\)\.scrollTop=0/);
});

test('failed conversation loading reports an inline error instead of silently doing nothing',()=>{
  assert.match(js,/\$\('empty'\)\.textContent='Unable to open this conversation: '/);
  assert.match(js,/\$\('empty'\)\.setAttribute\('role','alert'\)/);
});

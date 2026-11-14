import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const read=path=>readFileSync(new URL('../'+path,import.meta.url),'utf8');
test('public third-party licenses page uses customer-facing compliance wording',()=>{
 const html=read('website/licenses/index.html');
 assert.match(html,/<h2>Third-Party License Compliance<\/h2>/);
 assert.match(html,/Required copyright notices, license terms, and attribution information are provided/);
 assert.match(html,/href="\/THIRD_PARTY_NOTICES\.txt"/);
 assert.doesNotMatch(html,/<h2>Before distributing builds<\/h2>/);
});
test('master license notices are valid UTF-8 and retain copyright names',()=>{
 const raw=readFileSync(new URL('../website/THIRD_PARTY_NOTICES.txt',import.meta.url));
 const text=new TextDecoder('utf-8',{fatal:true}).decode(raw);
 assert.match(text,/Florian Körner/);
 assert.match(text,/Inter — @fontsource\/inter/);
 assert.match(text,/DM Serif Display — @fontsource\/dm-serif-display/);
 assert.match(text,/2014–2018 Adobe/);
 assert.doesNotMatch(text,/KÃ¶rner|â€”|â€“/);
});
test('Cloudflare assets declare UTF-8 for plain-text notices',()=>{
 const headers=read('website/_headers');
 for(const url of ['/THIRD_PARTY_NOTICES.txt','/studio/THIRD_PARTY_NOTICES.txt','/studio/font-licenses/*']){
  assert.ok(headers.includes(url+'\n  Content-Type: text/plain; charset=utf-8'),url+' missing charset');
 }
});

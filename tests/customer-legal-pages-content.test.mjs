import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const read=(path)=>readFileSync(new URL('../'+path,import.meta.url),'utf8');
test('cookies page explains current visitor-facing practices without launch instructions',()=>{
 const s=read('website/cookies/index.html');
 for(const heading of ['Essential account cookies','Studio storage','Website analytics','Managing cookies and storage','Changes to this notice'])assert.ok(s.includes(heading));
 for(const forbidden of ['Review before publication','Before paid launch','prelaunch testing','No unnecessary consent banner by default'])assert.ok(!s.includes(forbidden),forbidden);
});
test('copyright page has no community publishing or invented DMCA procedures',()=>{
 const s=read('website/copyright/index.html');
 assert.ok(s.includes('It does not operate a community service'));
 assert.ok(s.includes('legal@humperdinck.studio'));
 for(const forbidden of ['future community uploads','If community publishing launches','DMCA agent — not registered','Every new voice submission','Community uploads remain unavailable'])assert.ok(!s.includes(forbidden),forbidden);
});
test('privacy, terms and refunds do not disclose personal name or outdated prelaunch payment claims',()=>{
 for(const path of ['website/privacy/index.html','website/terms/index.html','website/refunds/index.html','website/license/index.html']){
  const s=read(path);
  assert.ok(!s.includes('Brian Larkin'),path+' personal name');
  assert.ok(!s.includes('before payments are accepted'),path+' precheckout statement');
 }
});

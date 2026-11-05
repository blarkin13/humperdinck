import test from 'node:test';
import assert from 'node:assert/strict';
import {splitNarration,replaceSectionText,insertSection} from '../frontend/narrationSections.js';

test('splits long prose at sentence boundaries, each section under 500 characters',()=>{
 const script=('The moon rose over the old recording studio. ').repeat(42);
 const chunks=splitNarration(script);
 assert.ok(chunks.length>1);
 assert.ok(chunks.every(s=>Array.from(s).length<=500));
 assert.equal(chunks.join(' '),script.trim());
});
test('preserves speaker and subsequent sections when pasting long text',()=>{
 const original=[{id:1,text:'',voice_key:'af_heart'},{id:2,text:'Later.',voice_key:'am_michael'}];
 const result=replaceSectionText(original,1,'An evening story. '.repeat(70));
 assert.ok(result.length>2);
 assert.equal(result.at(-1).id,2);
 assert.ok(result.slice(0,-1).every(b=>b.voice_key==='af_heart'));
});
test('insert between existing sections inherits previous speaker',()=>{
 const current=[{id:1,text:'First',voice_key:'af_heart'},{id:2,text:'Third',voice_key:'bm_daniel'}];
 const result=insertSection(current,0);
 assert.equal(result.length,3);
 assert.equal(result[1].text,'');
 assert.equal(result[1].voice_key,'af_heart');
 assert.equal(result[2].text,'Third');
});
test('Unicode codepoints are the character limit',()=>{
 const result=splitNarration('🌟'.repeat(1100));
 assert.equal(result.length,3);
 assert.ok(result.every(part=>Array.from(part).length<=500));
});

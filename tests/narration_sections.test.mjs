import test from 'node:test';
import assert from 'node:assert/strict';
import {splitNarration,replaceSectionText,insertSection,assignSectionSpeaker,moveSection,sectionDelay} from '../frontend/narrationSections.js';

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

test('choosing first narrator fills auto-split sections without a narrator',()=>{
 const split=replaceSectionText([{id:1,text:'',voice_key:''}],1,'The voyage began at dawn. '.repeat(80));
 assert.ok(split.length>2);
 assert.ok(split.every(b=>b.voice_key===''));
 const assigned=assignSectionSpeaker(split,1,'af_heart');
 assert.ok(assigned.every(b=>b.voice_key==='af_heart'));
});
test('changing a narrator respects later explicitly chosen speakers',()=>{
 const blocks=[
  {id:1,text:'One',voice_key:''},
  {id:2,text:'Two',voice_key:''},
  {id:3,text:'Three',voice_key:'bm_daniel'},
  {id:4,text:'Four',voice_key:''}
 ];
 const updated=assignSectionSpeaker(blocks,1,'af_heart');
 assert.deepEqual(updated.map(b=>b.voice_key),['af_heart','af_heart','bm_daniel','']);
});
test('manual insert between voiced sections adopts preceding narrator',()=>{
 const blocks=[{id:1,text:'One',voice_key:'af_heart'},{id:2,text:'Two',voice_key:'bm_daniel'}];
 const inserted=insertSection(blocks,0);
 assert.equal(inserted[1].voice_key,'af_heart');
 assert.equal(inserted[2].voice_key,'bm_daniel');
});

test('drag reordering keeps text, narrator and timing attached to section',()=>{
 const items=[
  {id:1,text:'First',voice_key:'af_heart',delay_after:1.2},
  {id:2,text:'Second',voice_key:'am_michael',delay_after:0},
  {id:3,text:'Third',voice_key:'bf_emma',delay_after:3}
 ];
 const moved=moveSection(items,3,1);
 assert.deepEqual(moved.map(x=>x.id),[3,1,2]);
 assert.deepEqual(moved.map(x=>x.delay_after),[3,1.2,0]);
 assert.equal(moved[0].voice_key,'bf_emma');
 assert.equal(items[0].id,1);
});
test('section pauses are bounded and valid',()=>{
 assert.equal(sectionDelay('1.5'),1.5);
 assert.equal(sectionDelay('-1'),0);
 assert.equal(sectionDelay('999'),30);
 assert.equal(sectionDelay('nope'),0);
});
test('new sections have zero delay by default',()=>{
 const result=insertSection([{id:1,text:'First',voice_key:'af_heart',delay_after:2}],0);
 assert.equal(result[1].delay_after,0);
});

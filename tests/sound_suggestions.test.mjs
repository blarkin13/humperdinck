import test from 'node:test';
import assert from 'node:assert/strict';
import {suggestSoundEffects} from '../frontend/soundSuggestions.js';

const library=[
 {id:'rain',name:'Gentle Rain',category:'Weather'},
 {id:'sea',name:'Ocean Waves',category:'Nature'},
 {id:'door',name:'Creaking Door',category:'Other'},
];
test('matches scripts to library sounds and never invents IDs',()=>{
 const result=suggestSoundEffects('The ship crossed the sea as rain fell.',library);
 assert.deepEqual(result.map(s=>s.id),['rain','sea']);
 assert.ok(result.every(s=>library.some(item=>item.id===s.id)));
});
test('unknown content returns no suggestions',()=>{
 assert.deepEqual(suggestSoundEffects('Hello there.',library),[]);
});
test('duplicates and limits are respected',()=>{
 const found=suggestSoundEffects('The sea and ship crossed the ocean.',library,1);
 assert.equal(found.length,1);
 assert.equal(found[0].id,'sea');
});

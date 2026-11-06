import test from 'node:test';
import assert from 'node:assert/strict';
import {formatUpdateFiles} from '../updateFiles.js';

test('native unavailable response without changed_files is safe',()=>{
 assert.deepEqual(formatUpdateFiles({available:false,reason:'Native binary updates unavailable'}),[]);
});
test('missing update result is safe',()=>{
 assert.deepEqual(formatUpdateFiles(null),[]);
 assert.deepEqual(formatUpdateFiles(undefined),[]);
});
test('null and absent lists are safe even when an update exists',()=>{
 assert.deepEqual(formatUpdateFiles({available:true,changed_files:null,removed_files:null}),[]);
 assert.deepEqual(formatUpdateFiles({available:true}),[]);
});
test('source update lists retain changed files and annotate removals',()=>{
 assert.deepEqual(
  formatUpdateFiles({available:true,changed_files:['frontend/a.jsx'],removed_files:['frontend/b.jsx']}),
  ['frontend/a.jsx','frontend/b.jsx (removed)']
 );
});

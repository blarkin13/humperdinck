import assert from 'node:assert/strict';
import {test, afterEach} from 'node:test';
import {publicRelease} from '../src/public-releases.js';

const originalFetch=globalThis.fetch;
afterEach(()=>{globalThis.fetch=originalFetch});
const request=(path)=>new Request('https://humperdinck.example'+path);
const env={ASSETS:{fetch:async()=>new Response('{"windows":{"published":false}}',{headers:{'Content-Type':'application/json'}})}};
const prefix='https://github.com/blarkin13/humperdinck-downloads/releases/download/v1.2.3/';
const release=(assets=[])=>({tag_name:'v1.2.3',draft:false,prerelease:false,assets});

test('public installers become website choices only with exact release names and URLs',async()=>{
 const name='humperdinck-windows-x64-1.2.3.exe';
 globalThis.fetch=async()=>Response.json(release([
  {name,browser_download_url:prefix+name,size:150000,state:'uploaded'},
  {name:'humperdinck-macos-arm64-1.2.3.dmg',browser_download_url:'https://attacker.example/bad',size:5000,state:'uploaded'}
 ]));
 const response=await publicRelease(request('/downloads.json'),env);
 const json=await response.json();
 assert.equal(json.windows.published,true);
 assert.equal(json.windows.version,'1.2.3');
 assert.equal(json.macos.published,false);
 assert.equal(json.linux.published,false);
});
test('signed update manifest is unavailable before signed artifact publication',async()=>{
 globalThis.fetch=async()=>Response.json(release([]));
 const r=await publicRelease(request('/updates/latest.json'),env);
 assert.equal(r.status,404);
});
test('no public release preserves inactive website fallback',async()=>{
 globalThis.fetch=async()=>new Response('not found',{status:404});
 const r=await publicRelease(request('/downloads.json'),env);
 assert.equal((await r.json()).windows.published,false);
});
test('older or preview release rejected',async()=>{
 globalThis.fetch=async()=>Response.json({...release(),prerelease:true});
 const r=await publicRelease(request('/updates/latest.json'),env);
 assert.equal(r.status,404);
});

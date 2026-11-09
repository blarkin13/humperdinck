import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import worker from '../src/model-proxy-worker.js';
import {WORKER_SOURCE_GIT_SHA} from '../src/deployment-provenance.js';
const path='/.well-known/humperdinck-deployment.json';
const base='https://humperdinck.studio';
test('deployment identity routes to Worker first',()=>{
 const w=JSON.parse(readFileSync(new URL('../wrangler.jsonc',import.meta.url),'utf8'));
 assert.ok(w.assets.run_worker_first.includes(path));
});
test('deployed Git provenance returns SHA or an explicit 503 sentinel, no secrets',async()=>{
 const env={AUTH_DB:{prepare(){throw Error('DB access forbidden')}},
  ASSETS:{fetch(){throw Error('Asset access forbidden')}}};
 const valid=/^[0-9a-f]{40}$/.test(WORKER_SOURCE_GIT_SHA);
 for(const method of ['GET','HEAD']){
  const r=await worker.fetch(new Request(base+path,{method}),env,{});
  assert.equal(r.status,valid?200:503);
  assert.equal(r.headers.get('Cache-Control'),'no-store');
  assert.equal(r.headers.get('X-Content-Type-Options'),'nosniff');
  if(method==='GET')assert.deepEqual(await r.json(),{
   source_git_sha:valid?WORKER_SOURCE_GIT_SHA:null,
   provenance_verified:valid,build_provenance_version:1
  }); else assert.equal(await r.text(),'');
 }
 for(const method of ['POST','OPTIONS']){
  const r=await worker.fetch(new Request(base+path,{method}),env,{});
  assert.equal(r.status,405);
 }
});
test('build requires full commit SHA without timestamp-based identity',()=>{
 const s=readFileSync(new URL('../scripts/build-public-studio.sh',import.meta.url),'utf8');
 assert.match(s,/git rev-parse --verify HEAD/);
 assert.match(s,/SOURCE_SHA/);
 assert.match(s,/WORKER_SOURCE_GIT_SHA/);
 assert.doesNotMatch(s,/date -u \+%Y%m%d%H%M%S/);
});

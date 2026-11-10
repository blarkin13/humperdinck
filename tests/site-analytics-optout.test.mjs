import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const source=fs.readFileSync(new URL('../website/script.js',import.meta.url),'utf8');
const start=source.indexOf('(function trackSiteEvents(){');
assert.ok(start>=0,'first-party analytics handler must exist');
const script=source.slice(start);

function run(flag){
 const listeners=new Map(),sent=[];
 const link={hostname:'github.com',origin:'https://github.com',closest(selector){
  return selector==='a.download-action'?this:selector==='[data-platform]'?{getAttribute:()=> 'windows'}:null;
 }};
 const sandbox={
  Blob:class Blob { constructor(body){this.value=body.join('')} },
  localStorage:{getItem:(key)=>key==='humperdinck_analytics_exclude'?flag:null},
  navigator:{sendBeacon:(url,body)=>{sent.push({url,body:body.value});return true}},
  location:{origin:'https://humperdinck.studio'},
  document:{addEventListener:(name,cb)=>listeners.set(name,cb)},
  fetch:()=>Promise.resolve()
 };
 vm.runInNewContext(script,sandbox);
 listeners.get('click')({target:{closest:(selector)=>selector==='a.download-action'?link:null}});
 return sent;
}
test('first-party owner opt-out suppresses both page view and download click',()=>{
 assert.equal(run('1').length,0);
});
test('ordinary visitor still receives both anonymous aggregate events',()=>{
 const sent=run(null);
 assert.equal(sent.length,2);
 assert.deepEqual(sent.map(e=>JSON.parse(e.body).type),['page_view','download_click']);
});

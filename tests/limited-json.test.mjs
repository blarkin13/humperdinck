import test from 'node:test';
import assert from 'node:assert/strict';
import {limitedJson} from '../src/limited-json.js';

const url='https://humperdinck.studio/api/account/me';
const make=(text,headers={})=>new Request(url,{method:'POST',
 headers:{'Content-Type':'application/json',...headers},body:text});

test('small JSON objects are accepted',async()=>{
 assert.deepEqual(await limitedJson(make('{"ok":true,"count":2}')),{ok:true,count:2});
 assert.deepEqual(await limitedJson(make('{"ok":true}',{'Content-Type':'application/json; charset=UTF-8'})),{ok:true});
});

test('invalid JSON and untrusted content types are rejected',async()=>{
 assert.deepEqual(await limitedJson(make('{not json}')),{});
 assert.deepEqual(await limitedJson(make('["never","accept","arrays"]')),{});
 assert.deepEqual(await limitedJson(make('{"ok":1}',{'Content-Type':'text/plain'})),{});
 assert.deepEqual(await limitedJson(make('{"ok":1}',{'Content-Type':'application/json; profile=unsupported'})),{});
});

test('body larger than 4 KB is rejected with or without Content-Length',async()=>{
 const large=JSON.stringify({data:'a'.repeat(5000)});
 const result=await limitedJson(make(large));
 assert.deepEqual(result,{});
 assert.deepEqual(await limitedJson(make('{"ok":true}',{'Content-Length':'9000'})),{});
});

test('invalid UTF8 is rejected and exactly 4 KB is accepted',async()=>{
 const payload=new TextEncoder().encode(JSON.stringify({v:'x'.repeat(4088)}));
 assert.equal(payload.length,4096);
 assert.deepEqual(await limitedJson(new Request(url,{method:'POST',
  headers:{'Content-Type':'application/json'},body:payload})),{v:'x'.repeat(4088)});
 const invalid=new Uint8Array([123,34,120,34,58,34,255,34,125]);
 assert.deepEqual(await limitedJson(new Request(url,{method:'POST',
  headers:{'Content-Type':'application/json'},body:invalid})),{});
});

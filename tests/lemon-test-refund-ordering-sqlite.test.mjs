/* SQL-backed sandbox regression: full refunds must remain final when delayed
 * partial, paid, or duplicate provider webhooks arrive. No external calls. */
import test from 'node:test';
import assert from 'node:assert/strict';
import {createHmac,webcrypto} from 'node:crypto';
import {DatabaseSync} from 'node:sqlite';
import {readFileSync,readdirSync} from 'node:fs';
import {handleLemonTest} from '../src/lemon-test-commerce.js';
globalThis.crypto ||= webcrypto;
const root='https://humperdinck.studio';
const account='69fe2546-f0cf-46b8-a8fa-645c79fb3c1a';
const intent='d4f3a929-0c1f-47d8-8bf7-5c62b9ba4d8d';
function fixture(){
 const sqlite=new DatabaseSync(':memory:');
 sqlite.exec('PRAGMA foreign_keys=ON');
 for(const file of readdirSync(new URL('../migrations/',import.meta.url)).filter(x=>x.endsWith('.sql')).sort())
  sqlite.exec(readFileSync(new URL('../migrations/'+file,import.meta.url),'utf8'));
 sqlite.prepare('INSERT INTO auth_users(id,display_name,email,created_at) VALUES (?,?,?,?)')
  .run(account,'Test','sandbox@example.invalid',1000);
 sqlite.prepare('INSERT INTO commerce_test_intents(id,user_id,created_at,expires_at,status) VALUES (?,?,?,?,?)')
  .run(intent,account,1000,9999999999,'started');
 const prepare=(sql,args=[])=>({
  bind:(...v)=>prepare(sql,v),
  first:async()=>sqlite.prepare(sql).get(...args)||null,
  all:async()=>({results:sqlite.prepare(sql).all(...args)}),
  run:async()=>({meta:{changes:Number(sqlite.prepare(sql).run(...args).changes)}})
 });
 const env={AUTH_DB:{
  prepare:sql=>prepare(sql),
  async batch(statements){
   sqlite.exec('BEGIN');
   try{
    const results=[];
    for(const statement of statements)results.push(await statement.run());
    sqlite.exec('COMMIT');
    return results;
   }catch(e){sqlite.exec('ROLLBACK');throw e}
  }
 },LS_TEST_API_KEY:'fake-api',LS_TEST_WEBHOOK_SECRET:'synthetic-signature-only',
 LS_TEST_STORE_ID:'45',LS_TEST_VARIANT_ID:'789',LS_TEST_GRANT_EMAILS:''};
 return {sqlite,env};
}
async function deliver(env,status){
 const kind=status==='paid'?'order_created':'order_refunded';
 const attributes={test_mode:true,store_id:45,first_order_item:{variant_id:789},
  status,currency:'USD',total:4900,order_number:56,
  refunded:status==='refunded'};
 const payload={meta:{event_name:kind,custom_data:{account_id:account,intent_id:intent}},
  data:{type:'orders',id:'12345',attributes}};
 const raw=JSON.stringify(payload);
 const signature=createHmac('sha256',env.LS_TEST_WEBHOOK_SECRET).update(raw).digest('hex');
 const r=await handleLemonTest(new Request(root+'/api/commerce/test/webhook',{
  method:'POST',body:raw,headers:{'X-Signature':signature,'X-Event-Name':kind}
 }),env,{session:async()=>null});
 assert.equal(r.status,200);
 return r.json();
}
test('full test refund remains final despite late partial, paid and replay deliveries',async()=>{
 const {sqlite,env}=fixture();
 await deliver(env,'paid');
 await deliver(env,'refunded');
 await deliver(env,'partially_refunded');
 await deliver(env,'paid');
 await deliver(env,'refunded');
 assert.equal(sqlite.prepare('SELECT status FROM commerce_test_orders WHERE provider_order_id=?')
  .get('12345').status,'refunded');
 assert.equal(sqlite.prepare('SELECT status FROM commerce_test_intents WHERE id=?').get(intent).status,'refunded');
 assert.equal(sqlite.prepare('SELECT COUNT(*) AS n FROM pro_licenses').get().n,0);
 assert.equal(sqlite.prepare('SELECT COUNT(*) AS n FROM commerce_test_webhook_events').get().n,3);
});
test('a partial test refund can progress to a full refund, but not regress',async()=>{
 const {sqlite,env}=fixture();
 await deliver(env,'paid');
 await deliver(env,'partially_refunded');
 assert.equal(sqlite.prepare('SELECT status FROM commerce_test_orders').get().status,'partially_refunded');
 await deliver(env,'refunded');
 await deliver(env,'partially_refunded');
 assert.equal(sqlite.prepare('SELECT status FROM commerce_test_orders').get().status,'refunded');
 assert.equal(sqlite.prepare('SELECT COUNT(*) AS n FROM pro_licenses').get().n,0);
});

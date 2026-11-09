import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {DatabaseSync} from 'node:sqlite';
import {webcrypto} from 'node:crypto';
import {settleLivePaidOrder} from '../src/lemon-live-settlement.js';
globalThis.crypto ||= webcrypto;
const user='63a4cf69-678f-4788-a61d-8401cc309b72';
const intent='b64bfb57-8b55-46a4-a6e6-d26c9c9781cc';
const order={provider:'lemonsqueezy',event:'order_created',status:'paid',orderId:'12345',
 accountId:user,intentId:intent,storeId:'45',variantId:'789',amountCents:4900,
 currency:'USD',paidAtSecs:150,requiresPurchaseIntentVerification:true,entitlementMutationAllowed:false};
const opts={bodySha256:'a'.repeat(64),now:200,licenseId:'license-1'};
const base=new URL('../',import.meta.url);
function fixture(){
 const sqlite=new DatabaseSync(':memory:');
 sqlite.exec('PRAGMA foreign_keys=ON');
 for(const n of ['0001_accounts.sql','0002_pro_licenses.sql','0006_lemon_live_ledger.sql'])
   sqlite.exec(readFileSync(new URL('migrations/'+n,base),'utf8'));
 sqlite.prepare('INSERT INTO auth_users(id,created_at) VALUES (?,?)').run(user,1);
 sqlite.prepare(`INSERT INTO commerce_live_intents
  (id,user_id,store_id,variant_id,amount_cents,currency,created_at,expires_at,status)
  VALUES (?,?,?,?,?,?,?,?,'started')`).run(intent,user,'45','789',4900,'USD',100,300);
 const wrap=(sql,values=[])=>({
   bind(...args){return wrap(sql,args)},
   async first(){return sqlite.prepare(sql).get(...values)||null},
   async run(){return {meta:{changes:Number(sqlite.prepare(sql).run(...values).changes)}}},
   perform(){return {meta:{changes:Number(sqlite.prepare(sql).run(...values).changes)}}}
 });
 const db={prepare:sql=>wrap(sql),async batch(statements){
   sqlite.exec('BEGIN IMMEDIATE');
   try{
     const rows=statements.map(x=>x.perform());
     sqlite.exec('COMMIT');
     return rows;
   }catch(e){sqlite.exec('ROLLBACK');throw e;}
 }};
 return {sqlite,env:{AUTH_DB:db},count:table=>sqlite.prepare('SELECT count(*) AS c FROM '+table).get().c};
}
test('fresh paid webhook atomically records one order, event and lifetime grant',async()=>{
 const f=fixture();
 const result=await settleLivePaidOrder(f.env,order,opts);
 assert.deepEqual(result,{decision:'settled',granted:true});
 for(const table of ['commerce_live_orders','commerce_live_webhook_events','pro_licenses'])
   assert.equal(f.count(table),1);
 assert.equal(f.sqlite.prepare('SELECT status FROM commerce_live_intents').get().status,'paid');
 assert.equal(f.sqlite.prepare('SELECT purchase_ref FROM pro_licenses').get().purchase_ref,'lslive:12345');
 const replay=await settleLivePaidOrder(f.env,order,opts);
 assert.deepEqual(replay,{decision:'already-settled',granted:false});
 assert.equal(f.count('pro_licenses'),1);
 f.sqlite.close();
});
test('wrong amount, store, variant or currency cannot create a paid grant',async()=>{
 const f=fixture();
 for(const patch of [{amountCents:1},{storeId:'46'},{variantId:'780'},{currency:'EUR'}]){
   const result=await settleLivePaidOrder(f.env,{...order,...patch},opts);
   assert.equal(result.decision,'manual-review');
 }
 assert.equal(f.count('commerce_live_orders'),0);
 assert.equal(f.count('pro_licenses'),0);
 f.sqlite.close();
});
test('inactive checkout intent and preexisting complimentary license fail closed',async()=>{
 const f=fixture();
 f.sqlite.exec("UPDATE commerce_live_intents SET status='cancelled'");
 assert.equal((await settleLivePaidOrder(f.env,order,opts)).decision,'manual-review');
 f.sqlite.exec("UPDATE commerce_live_intents SET status='started'");
 f.sqlite.prepare(`INSERT INTO pro_licenses
 (id,user_id,status,issued_at,max_devices,provider,purchase_ref)
 VALUES (?,?,'active',?,10,?,?)`).run('complimentary-1',user,99,'complimentary','gift-1');
 assert.equal((await settleLivePaidOrder(f.env,order,opts)).decision,'manual-review');
 assert.equal(f.count('commerce_live_orders'),0);
 assert.equal(f.count('pro_licenses'),1);
 f.sqlite.close();
});
test('transaction rolls back when webhook event hash collides',async()=>{
 const f=fixture();
 f.sqlite.prepare(`INSERT INTO commerce_live_webhook_events
 (body_sha256,provider_order_id,event_name,processed_at)
 VALUES (?,?,'order_created',?)`).run(opts.bodySha256,'older-order',100);
 const result=await settleLivePaidOrder(f.env,order,opts);
 assert.equal(result.decision,'retryable-error');
 assert.equal(f.count('commerce_live_orders'),0);
 assert.equal(f.count('pro_licenses'),0);
 assert.equal(f.count('commerce_live_webhook_events'),1);
 assert.equal(f.sqlite.prepare('SELECT status FROM commerce_live_intents').get().status,'started');
 f.sqlite.close();
});
test('transaction failure after a grant rolls everything back and retry succeeds',async()=>{
 const f=fixture();
 const actual=f.env.AUTH_DB.batch;
 f.env.AUTH_DB.batch=async statements=>{
   const original=statements[3].perform;
   statements[3].perform=()=>{throw Error('simulated storage failure')};
   try{return await actual(statements)}finally{statements[3].perform=original}
 };
 const fail=await settleLivePaidOrder(f.env,order,opts);
 assert.equal(fail.decision,'retryable-error');
 assert.equal(f.count('pro_licenses'),0);
 assert.equal(f.count('commerce_live_orders'),0);
 f.env.AUTH_DB.batch=actual;
 assert.equal((await settleLivePaidOrder(f.env,order,opts)).decision,'settled');
 assert.equal(f.count('pro_licenses'),1);
 f.sqlite.close();
});

test('provider purchase time, not webhook arrival, determines checkout expiry',async()=>{
 const f=fixture();
 assert.equal((await settleLivePaidOrder(f.env,{...order,paidAtSecs:301},opts)).decision,'manual-review');
 assert.equal((await settleLivePaidOrder(f.env,{...order,paidAtSecs:99},opts)).decision,'manual-review');
 assert.equal((await settleLivePaidOrder(f.env,{...order,paidAtSecs:null},opts)).decision,'manual-review');
 assert.equal(f.count('commerce_live_orders'),0);
 assert.equal(f.count('pro_licenses'),0);
 assert.equal((await settleLivePaidOrder(f.env,{...order,paidAtSecs:300},{...opts,now:9999})).decision,'settled');
 assert.equal(f.count('pro_licenses'),1);
 f.sqlite.close();
});

import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {DatabaseSync} from 'node:sqlite';
import {reconcileLiveRefund} from '../src/lemon-live-refund.js';
import {settleLivePaidOrder} from '../src/lemon-live-settlement.js';
const base=new URL('../',import.meta.url);
const user='63a4cf69-678f-4788-a61d-8401cc309b72';
const intent='b64bfb57-8b55-46a4-a6e6-d26c9c9781cc';
const purchase={provider:'lemonsqueezy',event:'order_created',status:'paid',
 orderId:'12345',accountId:user,intentId:intent,storeId:'45',variantId:'789',
 amountCents:4900,currency:'USD',paidAtSecs:150,requiresPurchaseIntentVerification:true,
 entitlementMutationAllowed:false};
const refund={...purchase,event:'order_refunded',status:'refunded'};
const opts={bodySha256:'b'.repeat(64),now:250};
function fixture(){
 const sqlite=new DatabaseSync(':memory:');
 sqlite.exec('PRAGMA foreign_keys=ON');
 for(const file of ['0001_accounts.sql','0002_pro_licenses.sql','0006_lemon_live_ledger.sql'])
  sqlite.exec(readFileSync(new URL('migrations/'+file,base),'utf8'));
 sqlite.prepare('INSERT INTO auth_users(id,created_at) VALUES (?,?)').run(user,1);
 sqlite.prepare(`INSERT INTO commerce_live_intents
  (id,user_id,store_id,variant_id,amount_cents,currency,created_at,expires_at,status)
  VALUES (?,?,?,?,?,?,?,?,'started')`).run(intent,user,'45','789',4900,'USD',100,300);
 const wrap=(sql,values=[])=>({
  bind(...args){return wrap(sql,args)},
  async first(){return sqlite.prepare(sql).get(...values)||null},
  perform(){return {meta:{changes:Number(sqlite.prepare(sql).run(...values).changes)}}}
 });
 const db={prepare:sql=>wrap(sql),async batch(statements){
   sqlite.exec('BEGIN IMMEDIATE');
   try{const result=statements.map(x=>x.perform());sqlite.exec('COMMIT');return result}
   catch(error){sqlite.exec('ROLLBACK');throw error}
 }};
 const count=name=>sqlite.prepare('SELECT count(*) AS n FROM '+name).get().n;
 const status=()=>sqlite.prepare('SELECT status FROM commerce_live_orders').get()?.status;
 return {sqlite,env:{AUTH_DB:db},count,status};
}
const paidOpts={bodySha256:'a'.repeat(64),now:200,licenseId:'license-1'};
test('full refund updates only order ledger, not lifetime entitlement',async()=>{
 const f=fixture();
 assert.equal((await settleLivePaidOrder(f.env,purchase,paidOpts)).decision,'settled');
 const result=await reconcileLiveRefund(f.env,refund,opts);
 assert.equal(result.decision,'recorded-for-review');
 assert.equal(result.entitlementChanged,false);
 assert.equal(f.status(),'refunded');
 assert.equal(f.count('pro_licenses'),1);
 assert.equal(f.sqlite.prepare('SELECT status FROM pro_licenses').get().status,'active');
 assert.equal(f.count('commerce_live_webhook_events'),2);
 const again=await reconcileLiveRefund(f.env,refund,opts);
 assert.equal(again.decision,'already-recorded');
 assert.equal(f.count('commerce_live_webhook_events'),2);
 f.sqlite.close();
});
test('refund before paid inserts durable tombstone and prevents a late grant',async()=>{
 const f=fixture();
 assert.equal((await reconcileLiveRefund(f.env,refund,opts)).decision,'recorded-for-review');
 assert.equal(f.status(),'refunded');
 assert.equal(f.sqlite.prepare('SELECT status FROM commerce_live_intents').get().status,'refunded');
 assert.equal((await settleLivePaidOrder(f.env,purchase,paidOpts)).decision,'manual-review');
 assert.equal(f.count('pro_licenses'),0);
 assert.equal(f.count('commerce_live_orders'),1);
 f.sqlite.close();
});
test('partial followed by full is monotonic; delayed partial cannot undo full',async()=>{
 const f=fixture();
 await settleLivePaidOrder(f.env,purchase,paidOpts);
 const partial={...refund,status:'partially_refunded'};
 assert.equal((await reconcileLiveRefund(f.env,partial,opts)).decision,'recorded-for-review');
 assert.equal(f.status(),'partially_refunded');
 assert.equal((await reconcileLiveRefund(f.env,refund,{...opts,bodySha256:'c'.repeat(64),now:260})).decision,'recorded-for-review');
 assert.equal(f.status(),'refunded');
 assert.equal((await reconcileLiveRefund(f.env,partial,{...opts,bodySha256:'d'.repeat(64),now:270})).decision,'recorded-for-review');
 assert.equal(f.status(),'refunded');
 assert.equal(f.count('pro_licenses'),1);
 f.sqlite.close();
});
test('wrong account, intent, store, amount and currency fail without any write',async()=>{
 const f=fixture();
 for(const patch of [{accountId:'e3e3e3e3-e3e3-43e3-a3e3-e3e3e3e3e3e3'},
  {intentId:'a2a2a2a2-a2a2-42a2-a2a2-a2a2a2a2a2a2'},
  {storeId:'10'},{variantId:'10'},{amountCents:12},{currency:'EUR'}]){
   assert.equal((await reconcileLiveRefund(f.env,{...refund,...patch},opts)).decision,'manual-review');
 }
 assert.equal(f.count('commerce_live_orders'),0);
 assert.equal(f.count('commerce_live_webhook_events'),0);
 assert.equal(f.count('pro_licenses'),0);
 f.sqlite.close();
});
test('conflicting provider order mapping cannot be overwritten',async()=>{
 const f=fixture();
 f.sqlite.prepare(`INSERT INTO commerce_live_orders
 (provider_order_id,intent_id,user_id,amount_cents,currency,status,created_at,updated_at)
 VALUES (?,?,?,?,?,'paid',?,?)`).run('12345','different-intent',user,4900,'USD',150,150);
 assert.equal((await reconcileLiveRefund(f.env,refund,opts)).decision,'manual-review');
 assert.equal(f.status(),'paid');
 assert.equal(f.count('commerce_live_webhook_events'),0);
 f.sqlite.close();
});
test('event collision rolls back refund and never alters license',async()=>{
 const f=fixture();
 await settleLivePaidOrder(f.env,purchase,paidOpts);
 f.sqlite.prepare(`INSERT INTO commerce_live_webhook_events
 (body_sha256,provider_order_id,event_name,processed_at)
 VALUES (?,?,'order_refunded',?)`).run(opts.bodySha256,'unrelated',210);
 assert.equal((await reconcileLiveRefund(f.env,refund,opts)).decision,'manual-review');
 assert.equal(f.status(),'paid');
 assert.equal(f.count('pro_licenses'),1);
 f.sqlite.close();
});
test('mid-batch failure rolls back refund and retry succeeds',async()=>{
 const f=fixture();
 await settleLivePaidOrder(f.env,purchase,paidOpts);
 const original=f.env.AUTH_DB.batch;
 f.env.AUTH_DB.batch=async statements=>{
  const last=statements[2].perform;
  statements[2].perform=()=>{throw Error('storage failure')};
  try{return await original(statements)}finally{statements[2].perform=last}
 };
 assert.equal((await reconcileLiveRefund(f.env,refund,opts)).decision,'retryable-error');
 assert.equal(f.status(),'paid');
 assert.equal(f.count('commerce_live_webhook_events'),1);
 f.env.AUTH_DB.batch=original;
 assert.equal((await reconcileLiveRefund(f.env,refund,opts)).decision,'recorded-for-review');
 assert.equal(f.status(),'refunded');
 assert.equal(f.count('pro_licenses'),1);
 f.sqlite.close();
});

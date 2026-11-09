import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {readFileSync} from 'node:fs';
import {webcrypto} from 'node:crypto';
import {createLiveCheckoutIntent} from '../src/lemon-live-intents.js';
globalThis.crypto ||= webcrypto;
const user='63a4cf69-678f-4788-a61d-8401cc309b72';
const id='b64bfb57-8b55-46a4-a6e6-d26c9c9781cc';
const opts={intentId:id,now:100,ttlSeconds:1800};
const fixture=()=>{
 const db=new DatabaseSync(':memory:');
 db.exec('PRAGMA foreign_keys=ON');
 for(const file of ['0001_accounts.sql','0006_lemon_live_ledger.sql'])
  db.exec(readFileSync(new URL('../migrations/'+file,import.meta.url),'utf8'));
 db.prepare('INSERT INTO auth_users(id,created_at) VALUES (?,?)').run(user,1);
 const wrap=(sql,params=[])=>({bind(...values){return wrap(sql,values)},
  async run(){return {meta:{changes:Number(db.prepare(sql).run(...params).changes)}}}});
 return {db,env:{AUTH_DB:{prepare:sql=>wrap(sql)},LS_LIVE_CHECKOUT_ENABLED:true,
  LS_LIVE_STORE_ID:'45',LS_LIVE_VARIANT_ID:'789',LS_LIVE_PRICE_CENTS:4900,LS_LIVE_CURRENCY:'USD'}};
};
test('trusted account creates bounded live checkout intent with immutable merchant price',async()=>{
 const f=fixture();
 const r=await createLiveCheckoutIntent(f.env,{kind:'web',id:user},opts);
 assert.deepEqual(r,{decision:'created',intentId:id,expiresAt:1900});
 const row=f.db.prepare('SELECT * FROM commerce_live_intents').get();
 assert.equal(row.user_id,user);
 assert.equal(row.store_id,'45');
 assert.equal(row.amount_cents,4900);
 assert.equal(row.currency,'USD');
 assert.equal(row.status,'started');
 assert.equal(row.expires_at,1900);
 f.db.close();
});
test('live checkout is default-off and rejects unsigned and missing accounts',async()=>{
 const f=fixture();
 for(const patch of [{LS_LIVE_CHECKOUT_ENABLED:false},{LS_LIVE_PRICE_CENTS:null},{LS_LIVE_VARIANT_ID:''}]){
  const env={...f.env,...patch};
  assert.equal((await createLiveCheckoutIntent(env,{kind:'web',id:user},opts)).decision,'not-created');
 }
 assert.equal((await createLiveCheckoutIntent(f.env,{kind:'desktop',id:user},opts)).decision,'not-created');
 assert.equal((await createLiveCheckoutIntent(f.env,{kind:'web',id:'e3e3e3e3-e3e3-43e3-a3e3-e3e3e3e3e3e3'},opts)).decision,'not-created');
 assert.equal(f.db.prepare('SELECT COUNT(*) AS c FROM commerce_live_intents').get().c,0);
 f.db.close();
});
test('invalid TTL, non-UUID IDs and duplicate intent insertion fail closed',async()=>{
 const f=fixture();
 for(const bad of [{ttlSeconds:30},{ttlSeconds:3601},{intentId:'bad'},{now:0}]){
  assert.equal((await createLiveCheckoutIntent(f.env,{kind:'web',id:user},{...opts,...bad})).decision,'not-created');
 }
 assert.equal((await createLiveCheckoutIntent(f.env,{kind:'web',id:user},opts)).decision,'created');
 assert.equal((await createLiveCheckoutIntent(f.env,{kind:'web',id:user},opts)).decision,'not-created');
 assert.equal(f.db.prepare('SELECT COUNT(*) AS c FROM commerce_live_intents').get().c,1);
 f.db.close();
});

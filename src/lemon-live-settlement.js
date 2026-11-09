/* Unrouted production-order settlement primitive. NEVER call before verified
 * signed-webhook preflight, merchant approval and explicit live-route gating.
 * D1.batch runs all statements in one transaction; unique constraints make
 * duplicate/replayed events retryable without minting another Pro grant.
 */
import {planLiveFulfillment} from './lemon-live-fulfillment-plan.js';
const digits=s=>/^[1-9][0-9]{0,14}$/.test(String(s??''));
const hash=s=>typeof s==='string'&&/^[0-9a-f]{64}$/i.test(s);
const fail=(reason,decision='manual-review')=>({decision,reason,granted:false});

export async function settleLivePaidOrder(env,order,{bodySha256,now=Math.floor(Date.now()/1000),
  licenseId=crypto.randomUUID()}={}){
 if(!env?.AUTH_DB||!order||order.event!=='order_created'||order.status!=='paid'
    ||order.provider!=='lemonsqueezy'||order.entitlementMutationAllowed!==false
    ||order.requiresPurchaseIntentVerification!==true||!digits(order.orderId)
    ||!digits(order.storeId)||!digits(order.variantId)||!hash(bodySha256)
    ||!Number.isSafeInteger(order.amountCents)||order.amountCents<0
    ||typeof order.currency!=='string'||!/^[A-Z]{3}$/.test(order.currency))
   return fail('Unverified or incomplete production order');
 const db=env.AUTH_DB;
 const existingOrder=await db.prepare(
   'SELECT provider_order_id AS order_id,intent_id,user_id,status FROM commerce_live_orders WHERE provider_order_id=?'
 ).bind(order.orderId).first();
 const intent=await db.prepare(
   'SELECT id,user_id,store_id,variant_id,amount_cents,currency,created_at,expires_at,status,\'live\' AS mode FROM commerce_live_intents WHERE id=?'
 ).bind(order.intentId).first();
 const existingLicense=await db.prepare(
   'SELECT id,user_id,status,provider,purchase_ref FROM pro_licenses WHERE user_id=?'
 ).bind(order.accountId).first();
 const plan=planLiveFulfillment(order,{intent,existingOrder,existingLicense});
 if(plan.decision==='idempotent-paid-replay')
   return {decision:'already-settled',granted:false};
 if(plan.decision!=='eligible-for-atomic-grant-review')
   return fail(plan.reason||plan.note||'Order requires manual reconciliation');
 if(String(intent.store_id)!==String(order.storeId)
    ||String(intent.variant_id)!==String(order.variantId)
    ||intent.amount_cents!==order.amountCents||intent.currency!==order.currency
    ||!Number.isSafeInteger(intent.expires_at)||intent.expires_at<=intent.created_at)
   return fail('Order does not match owner-created checkout price, currency or variant');
 if(!Number.isSafeInteger(now)||now<=0)return fail('Invalid settlement timestamp');
 // The guarded scalar subquery returns NULL if the intent was concurrently
 // changed between the preflight read and this transaction. NOT NULL aborts
 // the entire batch, including the grant; no partial event receipt is saved.
 const statements=[
   db.prepare(`INSERT INTO commerce_live_orders
     (provider_order_id,intent_id,user_id,amount_cents,currency,status,created_at,updated_at)
     VALUES (?,?,?,(SELECT amount_cents FROM commerce_live_intents
       WHERE id=? AND user_id=? AND status='started' AND store_id=? AND variant_id=?
         AND amount_cents=? AND currency=?),?,'paid',?,?)`)
    .bind(order.orderId,order.intentId,order.accountId,order.intentId,order.accountId,
      String(order.storeId),String(order.variantId),order.amountCents,order.currency,
      order.currency,now,now),
   db.prepare(`INSERT INTO pro_licenses
     (id,user_id,status,issued_at,max_devices,provider,purchase_ref)
     VALUES (?,?,'active',?,10,'lemonsqueezy',?)`)
    .bind(licenseId,order.accountId,now,'lslive:'+order.orderId),
   db.prepare(`UPDATE commerce_live_intents SET status='paid'
     WHERE id=? AND user_id=? AND status='started'`)
    .bind(order.intentId,order.accountId),
   db.prepare(`INSERT INTO commerce_live_webhook_events
     (body_sha256,provider_order_id,event_name,processed_at)
     VALUES (?,?,'order_created',?)`)
    .bind(bodySha256.toLowerCase(),order.orderId,now),
 ];
 try {
   const results=await db.batch(statements);
   if(!Array.isArray(results)||results.length!==4
      ||results.some(r=>r?.meta?.changes!==1))
     return fail('Settlement outcome requires reconciliation','retryable-error');
   return {decision:'settled',granted:true};
 }catch{
   // May be a simultaneous identical webhook or a database fault. A retry
   // must re-read the durable order before deciding it was settled.
   return fail('Atomic settlement was not committed; retry with verification','retryable-error');
 }
}

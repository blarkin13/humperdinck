/* Non-routed production refund reconciliation: signed event preflight MUST
 * happen before this function. Never revoke previously exported offline grants.
 * The purchase ledger is updated atomically with its event receipt; unexpected
 * or conflicting purchase identities fail closed without writing any record.
 */
const digits=s=>/^[1-9][0-9]{0,14}$/.test(String(s??''));
const uuid=s=>typeof s==='string'&&/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(s);
const sha=s=>typeof s==='string'&&/^[a-f0-9]{64}$/i.test(s);
const result=(decision,reason)=>({decision,reason,entitlementChanged:false});
export async function reconcileLiveRefund(env,order,{bodySha256,now=Math.floor(Date.now()/1000)}={}){
 if(!env?.AUTH_DB||order?.provider!=='lemonsqueezy'
   ||order.event!=='order_refunded'||!['refunded','partially_refunded'].includes(order.status)
   ||order.requiresPurchaseIntentVerification!==true||order.entitlementMutationAllowed!==false
   ||!digits(order.orderId)||!digits(order.storeId)||!digits(order.variantId)
   ||!uuid(order.accountId)||!uuid(order.intentId)||!sha(bodySha256)
   ||!Number.isSafeInteger(now)||now<=0
   ||!Number.isSafeInteger(order.amountCents)||order.amountCents<0
   ||typeof order.currency!=='string'||!/^[A-Z]{3}$/.test(order.currency))
   return result('manual-review','Unverified or invalid production refund');
 const db=env.AUTH_DB;
 const existing=await db.prepare(
   'SELECT provider_order_id,intent_id,user_id,amount_cents,currency,status FROM commerce_live_orders WHERE provider_order_id=?'
 ).bind(order.orderId).first();
 const intent=await db.prepare(
   'SELECT id,user_id,store_id,variant_id,amount_cents,currency,status FROM commerce_live_intents WHERE id=?'
 ).bind(order.intentId).first();
 if(!intent||intent.id!==order.intentId||intent.user_id!==order.accountId
   ||String(intent.store_id)!==String(order.storeId)
   ||String(intent.variant_id)!==String(order.variantId)
   ||intent.amount_cents!==order.amountCents||intent.currency!==order.currency)
   return result('manual-review','Refund has no matching owner-created live checkout intent');
 if(existing&&(existing.intent_id!==order.intentId||existing.user_id!==order.accountId
   ||existing.amount_cents!==order.amountCents||existing.currency!==order.currency
   ||existing.status==='disputed'))
   return result('manual-review','Refund conflicts with recorded purchase or dispute');
 const prior=await db.prepare(
   'SELECT body_sha256,provider_order_id,event_name FROM commerce_live_webhook_events WHERE body_sha256=?'
 ).bind(bodySha256.toLowerCase()).first();
 if(prior){
   return prior.provider_order_id===order.orderId&&prior.event_name==='order_refunded'
     ?result('already-recorded','Identical refund event already recorded')
     :result('manual-review','Webhook hash was previously attributed to another event');
 }
 // Do not downgrade a full refund to a partial refund, regardless of arrival order.
 const status=existing?.status==='refunded'?'refunded':order.status;
 const queries=[
   db.prepare(`INSERT INTO commerce_live_orders
      (provider_order_id,intent_id,user_id,amount_cents,currency,status,created_at,updated_at)
     VALUES (?,?,?,?,?,?,?,?)
     ON CONFLICT(provider_order_id) DO UPDATE SET
       status=CASE WHEN commerce_live_orders.status='refunded'
         THEN 'refunded' ELSE excluded.status END,
       updated_at=excluded.updated_at
     WHERE commerce_live_orders.intent_id=excluded.intent_id
       AND commerce_live_orders.user_id=excluded.user_id
       AND commerce_live_orders.amount_cents=excluded.amount_cents
       AND commerce_live_orders.currency=excluded.currency
       AND commerce_live_orders.status!='disputed'`)
    .bind(order.orderId,order.intentId,order.accountId,order.amountCents,
      order.currency,status,now,now),
   // If refund arrives before the paid event, disallow a subsequent paid grant.
   // Existing paid intent may remain paid; refund status is in the order ledger.
   db.prepare(`UPDATE commerce_live_intents
     SET status=CASE WHEN status='started' THEN 'refunded' ELSE status END
     WHERE id=? AND user_id=?`).bind(order.intentId,order.accountId),
   // Guard against any ownership/status conflict inside the transaction.
   // NULL provider_order_id violates NOT NULL and rolls back earlier writes.
   db.prepare(`INSERT INTO commerce_live_webhook_events
     (body_sha256,provider_order_id,event_name,processed_at)
     VALUES (?,(SELECT provider_order_id FROM commerce_live_orders
       WHERE provider_order_id=? AND intent_id=? AND user_id=?
         AND amount_cents=? AND currency=?
         AND status IN ('refunded','partially_refunded')), 'order_refunded', ?)`)
    .bind(bodySha256.toLowerCase(),order.orderId,order.intentId,order.accountId,
      order.amountCents,order.currency,now),
 ];
 try{
   const rows=await db.batch(queries);
   if(!Array.isArray(rows)||rows.length!==3||rows.some(x=>x?.meta?.changes!==1))
     return result('retryable-error','Refund ledger requires reconciliation');
   return result('recorded-for-review',existing?'Purchase refund recorded':'Refund recorded before paid event');
 }catch{
   // A unique-key conflict or database failure may mean another delivery won.
   // Caller must retry/re-read; never infer that a refund changed entitlements.
   return result('retryable-error','Atomic refund write failed; retry with verification');
 }
}

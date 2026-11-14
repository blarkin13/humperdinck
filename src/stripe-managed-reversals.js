/* Signed Stripe Managed Payments refund/dispute reconciliation.
 * Full refunds/disputes void the matching online Pro entitlement; historical
 * device records and previously exported offline certificate remain intact.
 * Never create a refund or automatically restore a disputed license.
 */
import {verifyStripeWebhook} from './stripe-managed-staging-webhook.js';
const enc=new TextEncoder();
const eventId=s=>typeof s==='string'&&/^evt_[A-Za-z0-9]+$/.test(s);
const paymentId=s=>typeof s==='string'&&/^pi_[A-Za-z0-9]+$/.test(s);
const digest=async raw=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',enc.encode(raw))),b=>b.toString(16).padStart(2,'0')).join('');
const evidence=new WeakSet();
const no=(decision,reason)=>({decision,reason,entitlementChanged:false});
export async function inspectStripeLiveReversal(raw,signature,env,{clock=Math.floor(Date.now()/1000)}={}){
 if(typeof env?.STRIPE_LIVE_WEBHOOK_SECRET!=='string'||
   !await verifyStripeWebhook(raw,signature,env.STRIPE_LIVE_WEBHOOK_SECRET,{clock}))
  return no('rejected','Invalid webhook signature');
 let e;try{e=JSON.parse(raw)}catch{return no('rejected','Invalid webhook JSON')}
 if(!eventId(e?.id)||e.livemode!==true||!Number.isSafeInteger(e.created)||e.created<=0)
  return no('rejected','Not a verified live Stripe event');
 const supported=['charge.refunded','charge.dispute.created','charge.dispute.updated','charge.dispute.closed'];
 if(!supported.includes(e.type))return no('ignored','Other signed event');
 const o=e.data?.object;
 const charge=e.type==='charge.refunded';
 if(!o||o.object!==(charge?'charge':'dispute')||
   !paymentId(o.payment_intent)||o.livemode!==true)
  return no('review','Refund/dispute without a known live payment intent');
 let status;
 if(charge){
  if(!Number.isSafeInteger(o.amount)||!Number.isSafeInteger(o.amount_refunded)||
    o.amount<0||o.amount_refunded<=0||o.amount_refunded>o.amount||
    o.currency!=='usd')
   return no('review','Invalid refund amount/currency');
  status=o.amount_refunded===o.amount?'refunded':'partially_refunded';
 }else{
  if(typeof o.id!=='string'||!/^dp_[A-Za-z0-9]+$/.test(o.id))
   return no('review','Invalid dispute reference');
  status='disputed'; // dispute resolution never automatically reactivates purchase
 }
 const item={decision:'verified-reversal',eventId:e.id,type:e.type,
  paymentIntentId:o.payment_intent,status,created:e.created,
  bodyHash:await digest(raw),entitlementChanged:false};
 evidence.add(item);
 return item;
}
export async function reconcileStripeLiveReversal(env,verified,{clock=Math.floor(Date.now()/1000)}={}){
 if(!env?.AUTH_DB||env.STRIPE_LIVE_STAGING_ENABLED!=='true'||
   !verified||!evidence.has(verified)||verified.decision!=='verified-reversal'||
   !Number.isSafeInteger(clock)||clock<=0)
  return no('rejected','Signed verified reversal required');
 const db=env.AUTH_DB;
 try{
  const order=await db.prepare(
   'SELECT stripe_session_id,stripe_payment_intent_id,intent_id,user_id,status FROM commerce_stripe_live_orders WHERE stripe_payment_intent_id=?'
  ).bind(verified.paymentIntentId).first();
  if(!order)return no('review','No paid Stripe order matches reversal');
  const previous=await db.prepare(
   'SELECT stripe_session_id,event_type FROM commerce_stripe_live_events WHERE stripe_event_id=?'
  ).bind(verified.eventId).first();
  if(previous)return previous.stripe_session_id===order.stripe_session_id&&previous.event_type===verified.type?
   no('already-recorded','Duplicate delivery'):no('review','Conflicting event ID');
  let status;
  if(order.status==='disputed')status='disputed';
  else if(order.status==='refunded')status='refunded'; // no downgrade
  else status=verified.status;
  const shouldVoid=status==='refunded'||status==='disputed';
  const grant=shouldVoid?await db.prepare(
   "SELECT id FROM pro_licenses WHERE user_id=? AND provider='stripe-managed' AND purchase_ref=? AND status='active'"
  ).bind(order.user_id,'stripe:'+order.stripe_session_id).first():null;
  const actions=[
   db.prepare(
    "UPDATE commerce_stripe_live_orders SET status=?,updated_at=? WHERE stripe_session_id=? AND stripe_payment_intent_id=? AND status IN ('paid','partially_refunded','refunded','disputed')"
   ).bind(status,clock,order.stripe_session_id,verified.paymentIntentId),
   ...(grant?[db.prepare(
    "UPDATE pro_licenses SET status='void' WHERE id=? AND provider='stripe-managed' AND status='active'"
   ).bind(grant.id)]:[]),
   db.prepare(
    'INSERT INTO commerce_stripe_live_events(stripe_event_id,stripe_session_id,event_type,body_sha256,processed_at) VALUES (?,?,?,?,?)'
   ).bind(verified.eventId,order.stripe_session_id,verified.type,verified.bodyHash,clock)
  ];
  const result=await db.batch(actions);
  if(!Array.isArray(result)||result.length!==actions.length||result.some(x=>x?.meta?.changes!==1))
   return no('retryable-error','Reversal receipt requires reconciliation');
  return {decision:'recorded-for-review',reason:grant?
   'Matching online Pro entitlement void; offline certificates require manual review':
   'Order evidence updated; no active matching grant',entitlementChanged:!!grant};
 }catch{return no('retryable-error','Atomic reversal transaction failed');}
}

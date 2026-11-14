/* Test-mode Stripe refund webhook records against a matching sandbox purchase.
 * Does not make refund API calls. Revoke only disposable test grant without
 * registered devices; offline certificates cannot be remotely revoked.
 */
import {verifyStripeWebhook} from './stripe-managed-staging-webhook.js';
const RE=/^evt_[A-Za-z0-9]+$/,PI=/^pi_[A-Za-z0-9]+$/;
const enc=new TextEncoder();
const authenticated=new WeakSet();
const digest=async raw=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',enc.encode(raw))),x=>x.toString(16).padStart(2,'0')).join('');
const fail=(decision,reason)=>({decision,reason,licenseChanged:false});
export async function inspectStripeTestRefund(raw,signature,env,{clock=Math.floor(Date.now()/1000)}={}){
 if(typeof env?.STRIPE_WEBHOOK_SECRET!=='string'||
    !await verifyStripeWebhook(raw,signature,env.STRIPE_WEBHOOK_SECRET,{clock}))
  return fail('rejected','Invalid Stripe webhook signature');
 let event;try{event=JSON.parse(raw)}catch{return fail('rejected','Invalid event body')}
 if(!RE.test(event?.id||'')||event.livemode!==false||event.type!=='charge.refunded')
  return fail('ignored','Not a test-mode charge.refunded event');
 const obj=event.data?.object;
 if(obj?.object!=='charge'||obj.livemode!==false||!PI.test(obj.payment_intent||'')||
    !Number.isSafeInteger(obj.amount)||!Number.isSafeInteger(obj.amount_refunded)||
    obj.amount<=0||obj.amount_refunded<=0||obj.amount_refunded>obj.amount||obj.currency!=='usd')
  return fail('rejected','Invalid charge reversal');
 const result={decision:'verified-test-refund',id:event.id,paymentIntentId:obj.payment_intent,
  status:obj.amount_refunded===obj.amount?'refunded':'partially_refunded',
  bodyHash:await digest(raw),licenseChanged:false};
 authenticated.add(result);return result;
}
export async function reconcileStripeTestRefund(env,refund,{clock=Math.floor(Date.now()/1000)}={}){
 if(!env?.AUTH_DB||env.STRIPE_STAGING_ENABLED!=='true'||
    !refund||!authenticated.has(refund)||refund.decision!=='verified-test-refund'||
    !Number.isSafeInteger(clock)||clock<=0)return fail('rejected','Verified test refund required');
 try{
  const db=env.AUTH_DB;
  const order=await db.prepare(
   'SELECT stripe_session_id,user_id,status FROM commerce_stripe_orders WHERE stripe_payment_intent_id=?'
  ).bind(refund.paymentIntentId).first();
  if(!order)return fail('review','Refund has no matching test purchase');
  const exists=await db.prepare('SELECT stripe_session_id FROM commerce_stripe_webhook_events WHERE stripe_event_id=?')
   .bind(refund.id).first();
  if(exists)return exists.stripe_session_id===order.stripe_session_id?
   fail('already-recorded','Duplicate refund'):fail('review','Conflicting Stripe event ID');
  const status=order.status==='refunded'?'refunded':order.status==='disputed'?'disputed':refund.status;
  const license=await db.prepare(
   "SELECT id FROM pro_licenses WHERE user_id=? AND provider='stripe-managed-test' AND purchase_ref=? AND status='active'"
  ).bind(order.user_id,'stripe-test:'+order.stripe_session_id).first();
  const devices=license?await db.prepare('SELECT COUNT(*) AS n FROM pro_devices WHERE license_id=?').bind(license.id).first():null;
  const canVoid=status==='refunded'&&license&&Number(devices?.n||0)===0;
  const ops=[
   db.prepare("UPDATE commerce_stripe_orders SET status=?,updated_at=? WHERE stripe_session_id=? AND status IN ('paid','partially_refunded','refunded','disputed')")
    .bind(status,clock,order.stripe_session_id),
   ...(canVoid?[db.prepare("UPDATE pro_licenses SET status='void' WHERE id=? AND provider='stripe-managed-test' AND status='active'")
    .bind(license.id)]:[]),
   db.prepare('INSERT INTO commerce_stripe_webhook_events(stripe_event_id,stripe_session_id,body_sha256,event_type,processed_at) VALUES (?,?,?,?,?)')
    .bind(refund.id,order.stripe_session_id,refund.bodyHash,'charge.refunded',clock)
  ];
  const done=await db.batch(ops);
  if(!Array.isArray(done)||done.some(x=>x?.meta?.changes!==1))
   return fail('reconcile','Sandbox refund requires reconciliation');
  return {decision:'recorded',status,licenseChanged:!!canVoid,
   requiresOfflineReview:!!(status==='refunded'&&license&&!canVoid)};
 }catch{return fail('retryable-error','Refund transaction failed');}
}

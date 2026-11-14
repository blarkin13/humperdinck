/* Prepared Stripe Managed Payments LIVE backend.
 * NOT imported by the Worker and not publicly routed. Public routes remain 503.
 * Production activation requires isolated acceptance and an intentional release PR.
 */
import {verifyStripeWebhook} from './stripe-managed-staging-webhook.js';

const API='https://api.stripe.com/v1';
const VERSION='2026-09-30.endive';
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const PRICE=/^price_[A-Za-z0-9]{8,}$/;
const PRODUCT=/^prod_[A-Za-z0-9]{8,}$/;
const SID=/^cs_live_[A-Za-z0-9_]+$/;
const EVENT=/^evt_[A-Za-z0-9]+$/;
const PI=/^pi_[A-Za-z0-9]+$/;
const enc=new TextEncoder();
const verifiedPayments=new WeakSet();
const deny=reason=>({decision:'blocked',reason,granted:false});
const hex=buf=>Array.from(new Uint8Array(buf),b=>b.toString(16).padStart(2,'0')).join('');
const config=env=>env?.AUTH_DB&&env.STRIPE_LIVE_STAGING_ENABLED==='true'&&
 typeof env.STRIPE_LIVE_SECRET_KEY==='string'&&/^(?:sk|rk)_live_/.test(env.STRIPE_LIVE_SECRET_KEY)&&
 PRICE.test(env.STRIPE_LIVE_PRICE_ID||'')&&PRODUCT.test(env.STRIPE_LIVE_PRODUCT_ID||'');
async function stripeApi(env,fetcher,path,method='GET',values=null,idempotency=null){
 const form=new URLSearchParams();
 for(const [k,v] of Object.entries(values||{}))form.set(k,String(v));
 const response=await fetcher(API+path,{
  method,headers:{Authorization:'Bearer '+env.STRIPE_LIVE_SECRET_KEY,
   'Stripe-Version':VERSION,...(values?{'Content-Type':'application/x-www-form-urlencoded'}:{}),
   ...(idempotency?{'Idempotency-Key':idempotency}:{})},
  ...(values?{body:form.toString()}:{})
 });
 if(!response.ok)throw new Error('Stripe API unavailable or declined');
 return response.json();
}
export async function prepareStripeLiveCheckout(env,user,{
 fetcher=fetch,clock=()=>Math.floor(Date.now()/1000),intentId=crypto.randomUUID()
}={}){
 if(!config(env)||user?.kind!=='web'||!UUID.test(user.id)||!UUID.test(intentId))
  return deny('Authenticated live checkout is not staged');
 const now=clock();
 if(!Number.isSafeInteger(now)||now<=0)return deny('Invalid clock');
 try{
  const price=await stripeApi(env,fetcher,'/prices/'+encodeURIComponent(env.STRIPE_LIVE_PRICE_ID));
  if(!price?.active||price.livemode!==true||price.type!=='one_time'||price.recurring||
     price.unit_amount!==4900||price.currency!=='usd'||price.product!==env.STRIPE_LIVE_PRODUCT_ID)
   return deny('Configured Stripe product must be the $49.00 one-time live price');
  const written=await env.AUTH_DB.prepare(
   "INSERT INTO commerce_stripe_live_intents(id,user_id,price_id,amount_cents,currency,status,created_at,expires_at) SELECT ?,?, ?,4900,'USD','started',?,? WHERE EXISTS (SELECT 1 FROM auth_users WHERE id=?) AND NOT EXISTS (SELECT 1 FROM pro_licenses WHERE user_id=? AND status='active')"
  ).bind(intentId,user.id,env.STRIPE_LIVE_PRICE_ID,now,now+1800,user.id,user.id).run();
  if(written?.meta?.changes!==1)return deny('Account unavailable or already has Pro');
  const result=await stripeApi(env,fetcher,'/checkout/sessions','POST',{
   mode:'payment','line_items[0][price]':env.STRIPE_LIVE_PRICE_ID,
   'line_items[0][quantity]':1,'managed_payments[enabled]':'true',
   client_reference_id:intentId,'metadata[intent_id]':intentId,
   success_url:'https://humperdinck.studio/account/?stripe=return',
   cancel_url:'https://humperdinck.studio/account/?stripe=cancel',
   expires_at:now+1800
  },'humperdinck-stripe-live-'+intentId);
  const u=new URL(result.url||'https://invalid.invalid');
  if(!SID.test(result.id||'')||result.livemode!==true||
     result.mode!=='payment'||result.managed_payments?.enabled!==true||
     u.protocol!=='https:'||u.hostname!=='checkout.stripe.com')
   return deny('Unrecognized Stripe live Checkout Session');
  const updated=await env.AUTH_DB.prepare(
   "UPDATE commerce_stripe_live_intents SET stripe_session_id=? WHERE id=? AND user_id=? AND status='started' AND stripe_session_id IS NULL"
  ).bind(result.id,intentId,user.id).run();
  if(updated?.meta?.changes!==1)return deny('Could not bind Stripe session to the signed-in account');
  return {decision:'prepared-live-session',checkoutUrl:u.toString(),sessionId:result.id,intentId};
 }catch{return deny('Live checkout could not be prepared; no purchase was recorded');}
}
export async function inspectStripeLiveWebhook(raw,signature,env,{clock=Math.floor(Date.now()/1000)}={}){
 if(typeof env?.STRIPE_LIVE_WEBHOOK_SECRET!=='string'||
    !await verifyStripeWebhook(raw,signature,env.STRIPE_LIVE_WEBHOOK_SECRET,{clock}))
  return deny('Invalid Stripe webhook signature');
 let e;try{e=JSON.parse(raw);}catch{return deny('Invalid JSON');}
 if(!EVENT.test(e?.id||'')||e.livemode!==true)return deny('Not a signed live Stripe event');
 if(!['checkout.session.completed','checkout.session.async_payment_succeeded'].includes(e.type))
  return {decision:'other-signed-event',eventType:e.type,granted:false};
 const s=e.data?.object;
 if(!SID.test(s?.id||'')||s.object!=='checkout.session'||s.livemode!==true||
    s.mode!=='payment'||s.managed_payments?.enabled!==true||
    !UUID.test(s.client_reference_id||'')||s.metadata?.intent_id!==s.client_reference_id||
    s.currency!=='usd'||s.amount_subtotal!==4900||
    !Number.isSafeInteger(s.amount_total)||s.amount_total<4900||
    !PI.test(s.payment_intent||''))
  return deny('Incorrect checkout, merchant-of-record mode, or $49.00 subtotal');
 if(s.payment_status!=='paid')return {decision:'unpaid',granted:false};
 if(!Number.isSafeInteger(e.created)||e.created<=0)return deny('Invalid event time');
 const verified={decision:'verified-live-payment',eventId:e.id,eventType:e.type,
  sessionId:s.id,paymentIntentId:s.payment_intent,intentId:s.client_reference_id,
  paidAt:e.created,bodyHash:hex(await crypto.subtle.digest('SHA-256',enc.encode(raw))),granted:false};
 verifiedPayments.add(verified);
 return verified;
}
export async function settleStripeLivePayment(env,payment,{
 clock=Math.floor(Date.now()/1000),licenseId=crypto.randomUUID()
}={}){
 if(!config(env)||!payment||!verifiedPayments.has(payment)||payment.decision!=='verified-live-payment'||
   !EVENT.test(payment.eventId)||!SID.test(payment.sessionId)||
   !PI.test(payment.paymentIntentId)||!UUID.test(payment.intentId)||
   !/^[0-9a-f]{64}$/.test(payment.bodyHash)||!UUID.test(licenseId)||
   !Number.isSafeInteger(clock)||clock<=0)return deny('Settlement is not verified or staged');
 const db=env.AUTH_DB;
 try{
  const previous=await db.prepare(
   'SELECT stripe_session_id,intent_id FROM commerce_stripe_live_orders WHERE stripe_session_id=?'
  ).bind(payment.sessionId).first();
  if(previous)return previous.intent_id===payment.intentId?
   {decision:'already-settled',granted:false}:deny('Session ownership conflict');
  const intent=await db.prepare(
   'SELECT id,user_id,stripe_session_id,price_id,amount_cents,currency,status,created_at,expires_at FROM commerce_stripe_live_intents WHERE id=?'
  ).bind(payment.intentId).first();
  if(!intent||intent.stripe_session_id!==payment.sessionId||intent.status!=='started'||
     intent.price_id!==env.STRIPE_LIVE_PRICE_ID||intent.amount_cents!==4900||
     intent.currency!=='USD'||payment.paidAt<intent.created_at)
   return deny('Payment has no matching $49 owner-created live intent');
  const existing=await db.prepare(
   "SELECT id,user_id,status FROM pro_licenses WHERE user_id=? AND status='active' LIMIT 1"
  ).bind(intent.user_id).first();
  // Archived void/refunded licenses remain intact and do not block repurchase.
  const preserve=!!existing;
  const ops=[
   db.prepare(
    "INSERT INTO commerce_stripe_live_orders(stripe_session_id,stripe_payment_intent_id,stripe_event_id,intent_id,user_id,amount_cents,currency,status,paid_at,updated_at) SELECT ?,?,?,id,user_id,4900,'USD','paid',?,? FROM commerce_stripe_live_intents WHERE id=? AND stripe_session_id=? AND status='started' AND price_id=? AND amount_cents=4900 AND currency='USD'"
   ).bind(payment.sessionId,payment.paymentIntentId,payment.eventId,payment.paidAt,clock,
    payment.intentId,payment.sessionId,env.STRIPE_LIVE_PRICE_ID),
   ...(!preserve?[db.prepare(
    "INSERT INTO pro_licenses(id,user_id,status,issued_at,max_devices,provider,purchase_ref) VALUES (?,?,'active',?,10,'stripe-managed',?)"
   ).bind(licenseId,intent.user_id,clock,'stripe:'+payment.sessionId)]:[]),
   db.prepare("UPDATE commerce_stripe_live_intents SET status='paid' WHERE id=? AND stripe_session_id=? AND status='started'")
    .bind(payment.intentId,payment.sessionId),
   db.prepare(
    'INSERT INTO commerce_stripe_live_events(stripe_event_id,stripe_session_id,event_type,body_sha256,processed_at) VALUES (?,?,?,?,?)'
   ).bind(payment.eventId,payment.sessionId,payment.eventType,payment.bodyHash,clock)
  ];
  const outcome=await db.batch(ops);
  if(!Array.isArray(outcome)||outcome.length!==ops.length||
     outcome.some(r=>r?.meta?.changes!==1))
   return {decision:'reconcile',reason:'Settlement outcome uncertain',granted:false};
  return {decision:preserve?'recorded-existing-Pro':'settled-live-Pro',granted:!preserve};
 }catch{return {decision:'retryable-error',reason:'Atomic payment settlement needs reconciliation',granted:false};}
}

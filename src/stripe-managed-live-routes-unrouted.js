/* Prepared LIVE Stripe Managed Payments HTTP bridge.
 * UNROUTED: Worker production /api/commerce/stripe/* is still permanently
 * intercepted by the code-level 503 release interlock.
 * NEVER import/mount before separate live rollout acceptance.
 */
import {prepareStripeLiveCheckout,inspectStripeLiveWebhook,settleStripeLivePayment} from './stripe-managed-live-prelaunch.js';
import {inspectStripeLiveReversal,reconcileStripeLiveReversal} from './stripe-managed-reversals.js';
const reply=(data,status=200)=>new Response(JSON.stringify(data),{status,headers:{
 'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store',
 'X-Content-Type-Options':'nosniff','Referrer-Policy':'no-referrer'}});
const ready=env=>env?.STRIPE_LIVE_STAGING_ENABLED==='true'&&env.STRIPE_LIVE_HTTP_ENABLED==='true'&&
 env.AUTH_DB&&/^(?:rk|sk)_live_/.test(env.STRIPE_LIVE_SECRET_KEY||'')&&
 typeof env.STRIPE_LIVE_WEBHOOK_SECRET==='string';
async function throttle(env,userId){
 const tick=Math.floor(Date.now()/600000);
 const digest=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',
  new TextEncoder().encode('stripe-live-checkout:'+userId+':'+tick))),b=>b.toString(16).padStart(2,'0')).join('');
 const r=await env.AUTH_DB.prepare(
  'INSERT INTO auth_rate(bucket,created_at) SELECT ?,unixepoch() WHERE (SELECT COUNT(*) FROM auth_rate WHERE bucket=?)<3'
 ).bind(digest,digest).run();
 return r.meta?.changes===1;
}
export async function handleStripeLiveUnrouted(request,env,{session}={}){
 if(!ready(env))return reply({error:'Production Stripe integration is disabled'},503);
 const path=new URL(request.url).pathname;
 if(path==='/api/commerce/stripe/webhook'){
  if(request.method!=='POST')return reply({error:'Method not allowed'},405);
  if(Number(request.headers.get('Content-Length')||0)>1048576)return reply({error:'Payload too large'},413);
  const raw=await request.text();
  if(raw.length>1048576)return reply({error:'Payload too large'},413);
  const signature=request.headers.get('Stripe-Signature')||'';
  const paid=await inspectStripeLiveWebhook(raw,signature,env);
  if(paid.decision==='verified-live-payment'){
   const settled=await settleStripeLivePayment(env,paid);
   return ['already-settled','recorded-existing-Pro','settled-live-Pro'].includes(settled.decision)?
    reply({received:true}):reply({error:'Payment requires reconciliation'},503);
  }
  const reversal=await inspectStripeLiveReversal(raw,signature,env);
  if(reversal.decision==='verified-reversal'){
   const settled=await reconcileStripeLiveReversal(env,reversal);
   return ['already-recorded','recorded-for-review'].includes(settled.decision)?
    reply({received:true}):reply({error:'Reversal requires reconciliation'},503);
  }
  if(paid.decision==='blocked'||reversal.decision==='rejected')
   return reply({error:'Invalid or unacceptable Stripe event'},400);
  return reply({received:true,ignored:true});
 }
 if(typeof session!=='function')return reply({error:'Account session unavailable'},503);
 const user=await session(request,env);
 if(!user||user.kind!=='web')return reply({error:'Sign in to buy Pro'},401);
 if(path==='/api/commerce/stripe/checkout'&&request.method==='POST'){
  if(request.headers.get('Origin')!==new URL(request.url).origin)
   return reply({error:'Invalid request origin'},403);
  if(Number(request.headers.get('Content-Length')||0)>0)
   return reply({error:'No checkout parameters accepted'},400);
  if(!await throttle(env,user.id))return reply({error:'Too many attempts'},429);
  const checkout=await prepareStripeLiveCheckout(env,user);
  return checkout.decision==='prepared-live-session'?
   reply({checkout_url:checkout.checkoutUrl}):
   reply({error:checkout.reason||'Checkout unavailable'},503);
 }
 if(path==='/api/commerce/stripe/status'&&request.method==='GET'){
  const data=await env.AUTH_DB.prepare(
   'SELECT i.id,i.status,i.stripe_session_id,o.status AS purchase_status FROM commerce_stripe_live_intents i LEFT JOIN commerce_stripe_live_orders o ON o.intent_id=i.id WHERE i.user_id=? ORDER BY i.created_at DESC LIMIT 10'
  ).bind(user.id).all();
  return reply({orders:data.results||[]});
 }
 return reply({error:'Not found'},404);
}

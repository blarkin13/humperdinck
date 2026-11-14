/* Explicitly disabled-by-default Stripe TEST-only HTTP endpoints.
 * Unlike live payment paths, these routes only use sk_test_/rk_test_ keys,
 * are restricted to named OAuth test accounts, and are not public checkout.
 * No production Stripe key or live event is accepted by these modules.
 */
import {stageManagedCheckout} from './stripe-managed-staging-checkout.js';
import {inspectStripeManagedEvent,settleStripeTestPayment} from './stripe-managed-staging-webhook.js';
import {inspectStripeTestRefund,reconcileStripeTestRefund} from './stripe-managed-sandbox-refund.js';
const json=(body,status=200)=>new Response(JSON.stringify(body),{status,headers:{
 'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store',
 'X-Content-Type-Options':'nosniff','Referrer-Policy':'no-referrer'}});
const allowed=(email,env)=>{
 const list=(env.STRIPE_TEST_GRANT_EMAILS||'').split(',')
  .map(x=>x.trim().toLowerCase()).filter(Boolean);
 return typeof email==='string'&&list.includes(email.toLowerCase());
};
const enabled=env=>env.STRIPE_SANDBOX_HTTP_ENABLED==='true'&&
 env.STRIPE_STAGING_ENABLED==='true'&&env.AUTH_DB&&
 /^(?:rk|sk)_test_/.test(env.STRIPE_SECRET_KEY||'');
async function throttle(env,userId){
 // Restricted to three checkout attempts per ten minutes per signed-in tester.
 const current=Math.floor(Date.now()/600000);
 const raw=userId+':'+current+':stripe-sandbox';
 const digest=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(raw))),x=>x.toString(16).padStart(2,'0')).join('');
 const result=await env.AUTH_DB.prepare(
  'INSERT INTO auth_rate(bucket,created_at) SELECT ?,unixepoch() WHERE (SELECT COUNT(*) FROM auth_rate WHERE bucket=?)<3'
 ).bind(digest,digest).run();
 return result?.meta?.changes===1;
}
export async function handleStripeSandbox(request,env,{session}={}){
 if(!enabled(env))return json({error:'Stripe sandbox is disabled'},503);
 const path=new URL(request.url).pathname;
 if(!path.startsWith('/api/commerce/sandbox/'))return json({error:'Not found'},404);
 if(path==='/api/commerce/sandbox/webhook'){
  if(request.method!=='POST')return json({error:'Method not allowed'},405);
  if(typeof env.STRIPE_WEBHOOK_SECRET!=='string')return json({error:'Webhook unavailable'},503);
  if(Number(request.headers.get('Content-Length')||0)>1048576)return json({error:'Payload too large'},413);
  let raw;try{raw=await request.text()}catch{return json({error:'Invalid body'},400)}
  if(raw.length>1048576)return json({error:'Payload too large'},413);
  const signature=request.headers.get('Stripe-Signature')||'';
  const paid=await inspectStripeManagedEvent(raw,signature,env.STRIPE_WEBHOOK_SECRET);
  if(paid.decision==='verified-test-payment'){
   const result=await settleStripeTestPayment(env,paid);
   if(['settled-test-ledger','settled-test-grant','already-recorded'].includes(result.decision))
    return json({received:true});
   return json({error:'Purchase reconciliation required'},503);
  }
  const refund=await inspectStripeTestRefund(raw,signature,env);
  if(refund.decision==='verified-test-refund'){
   const result=await reconcileStripeTestRefund(env,refund);
   if(['recorded','already-recorded'].includes(result.decision))return json({received:true});
   return json({error:'Refund reconciliation required'},503);
  }
  if(paid.decision==='rejected'||refund.decision==='rejected')
   return json({error:'Stripe signature or event invalid'},400);
  return json({received:true,ignored:true});
 }
 if(typeof session!=='function')return json({error:'Account unavailable'},503);
 const user=await session(request,env);
 if(!user||user.kind!=='web')return json({error:'Sign in to your test account'},401);
 if(!allowed(user.email,env))return json({error:'Sandbox is restricted to approved test accounts'},403);
 if(path==='/api/commerce/sandbox/status'&&request.method==='GET'){
  const rows=await env.AUTH_DB.prepare(
   "SELECT i.id,i.status,i.created_at,i.stripe_session_id,o.status AS purchase_status FROM commerce_stripe_intents i LEFT JOIN commerce_stripe_orders o ON o.intent_id=i.id WHERE i.user_id=? ORDER BY i.created_at DESC LIMIT 10"
  ).bind(user.id).all();
  return json({mode:'test',purchases:rows.results||[]});
 }
 if(path==='/api/commerce/sandbox/checkout'&&request.method==='POST'){
  if(request.headers.get('Origin')!==new URL(request.url).origin)
   return json({error:'Invalid request origin'},403);
  if(Number(request.headers.get('Content-Length')||0)>0)return json({error:'No input expected'},400);
  if(!await throttle(env,user.id))return json({error:'Too many checkout attempts'},429);
  const result=await stageManagedCheckout(env,user);
  if(result.decision!=='prepared')return json({error:result.reason},503);
  return json({checkout_url:result.checkoutUrl,mode:'test',intent_id:result.intentId});
 }
 return json({error:'Not found'},404);
}

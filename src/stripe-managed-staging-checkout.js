/* Stripe Managed Payments staging connector. NOT imported into public Worker.
 * Test mode only; production routing, secrets, migrations and issuance require
 * a separate reviewed release. No customer inputs set price or payment mode.
 */
const API='https://api.stripe.com/v1';
const VERSION='2026-09-30.endive';
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const PRICE=/^price_[A-Za-z0-9]{8,}$/;
const SESSION=/^cs_test_[A-Za-z0-9_]+$/;
const NOW=()=>Math.floor(Date.now()/1000);
const failed=reason=>({decision:'blocked',reason});
const validConfig=env=>env?.AUTH_DB &&
 env.STRIPE_STAGING_ENABLED==='true' &&
 typeof env.STRIPE_SECRET_KEY==='string' && /^(?:sk|rk)_test_/.test(env.STRIPE_SECRET_KEY) &&
 PRICE.test(env.STRIPE_PRICE_ID||'');
function form(values){
 const p=new URLSearchParams();
 for(const [k,v] of Object.entries(values))p.set(k,String(v));
 return p;
}
async function stripeFetch(fetcher,env,path,method='GET',body=null,idempotency=null){
 const response=await fetcher(API+path,{
  method,headers:{Authorization:'Bearer '+env.STRIPE_SECRET_KEY,
   'Stripe-Version':VERSION,...(body?{'Content-Type':'application/x-www-form-urlencoded'}:{}),
   ...(idempotency?{'Idempotency-Key':idempotency}:{})},
  ...(body?{body:form(body).toString()}:{})
 });
 if(!response.ok)throw new Error('Stripe API rejected the request');
 return response.json();
}
export async function stageManagedCheckout(env,user,{fetcher=fetch,clock=NOW,intentId=crypto.randomUUID()}={}){
 if(!validConfig(env)||user?.kind!=='web'||!UUID.test(user.id)||!UUID.test(intentId))
  return failed('Staging checkout not configured for an authenticated web account');
 const now=clock();
 if(!Number.isSafeInteger(now)||now<=0)return failed('Invalid clock');
 try{
  // Verifies the Dashboard price rather than trusting a displayed product name.
  const price=await stripeFetch(fetcher,env,'/prices/'+encodeURIComponent(env.STRIPE_PRICE_ID));
  if(!price?.active||price.livemode!==false||price.currency!=='usd'||
     price.unit_amount!==4900||price.recurring||price.type!=='one_time')
    return failed('Expected active $49.00 USD one-time test price');
  // Keep at least 30 minutes of Stripe-side validity after API/network latency.
  const row=await env.AUTH_DB.prepare(
    "INSERT INTO commerce_stripe_intents (id,user_id,price_id,amount_cents,currency,mode,status,created_at,expires_at) SELECT ?,?, ?,4900,'USD','test','started',?,? WHERE EXISTS (SELECT 1 FROM auth_users WHERE id=?) AND NOT EXISTS (SELECT 1 FROM pro_licenses WHERE user_id=? AND status='active')"
  ).bind(intentId,user.id,env.STRIPE_PRICE_ID,now,now+2700,user.id,user.id).run();
  if(row.meta?.changes!==1)return failed('Account unavailable or already has Pro');
  const session=await stripeFetch(fetcher,env,'/checkout/sessions','POST',{
   mode:'payment','line_items[0][price]':env.STRIPE_PRICE_ID,
   'line_items[0][quantity]':1,'managed_payments[enabled]':'true',
   client_reference_id:intentId,
   'metadata[intent_id]':intentId,
   success_url:'https://humperdinck.studio/account/?stripe=return',
   cancel_url:'https://humperdinck.studio/account/?stripe=cancel',
   expires_at:now+2700
  },'humperdinck-stripe-test-'+intentId);
  const checkoutUrl=new URL(session.url||'https://invalid.invalid/');
  if(!SESSION.test(session.id||'')||session.livemode!==false||
     session.mode!=='payment'||session.managed_payments?.enabled!==true||
     checkoutUrl.protocol!=='https:'||checkoutUrl.hostname!=='checkout.stripe.com')
    return failed('Stripe returned an unexpected Checkout Session');
  const updated=await env.AUTH_DB.prepare(
    "UPDATE commerce_stripe_intents SET stripe_session_id=? WHERE id=? AND user_id=? AND status='started' AND stripe_session_id IS NULL"
  ).bind(session.id,intentId,user.id).run();
  if(updated.meta?.changes!==1)return failed('Unable to bind checkout to account');
  return {decision:'prepared',checkoutUrl:checkoutUrl.toString(),intentId,sessionId:session.id};
 }catch{return failed('Checkout preparation failed; no Pro entitlement issued');}
}
export const stripeManagedStagingConfigValid=validConfig;

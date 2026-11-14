/* Stripe staging webhook and atomic ledger. No public Worker route imports this.
 * Test-mode events only. Signature MUST be verified over the original raw body.
 * Test grants are independently allowlisted and never represent a paid sale.
 */
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const SID=/^cs_test_[A-Za-z0-9_]+$/;
const EVENT=/^evt_[A-Za-z0-9]+$/;
const HEX=/^[a-f0-9]{64}$/i;
const enc=new TextEncoder();
const deny=reason=>({decision:'rejected',reason,granted:false});
const hex=buf=>Array.from(new Uint8Array(buf),b=>b.toString(16).padStart(2,'0')).join('');
const same=(a,b)=>{
 if(a.length!==b.length)return false;
 let diff=0;for(let i=0;i<a.length;i++)diff|=a.charCodeAt(i)^b.charCodeAt(i);
 return diff===0;
};
export async function verifyStripeWebhook(raw,header,secret,{clock=Math.floor(Date.now()/1000)}={}){
 if(typeof raw!=='string'||raw.length>1048576||typeof header!=='string'||
    typeof secret!=='string'||!secret.startsWith('whsec_')||
    !Number.isSafeInteger(clock)||clock<=0)return false;
 const parts=header.split(',').map(x=>x.trim());
 const stamp=parts.find(x=>/^t=\d+$/.test(x));
 const signatures=parts.filter(x=>/^v1=[a-fA-F0-9]{64}$/.test(x)).map(x=>x.slice(3).toLowerCase());
 if(!stamp||!signatures.length)return false;
 const t=Number(stamp.slice(2));
 if(!Number.isSafeInteger(t)||Math.abs(clock-t)>300)return false;
 const key=await crypto.subtle.importKey('raw',enc.encode(secret),{name:'HMAC',hash:'SHA-256'},false,['sign']);
 const expected=hex(await crypto.subtle.sign('HMAC',key,enc.encode(t+'.'+raw)));
 return signatures.some(sig=>same(sig,expected));
}
export async function inspectStripeManagedEvent(raw,header,secret,{clock=Math.floor(Date.now()/1000)}={}){
 if(!await verifyStripeWebhook(raw,header,secret,{clock}))return deny('Invalid Stripe signature');
 let event;
 try{event=JSON.parse(raw);}catch{return deny('Invalid event JSON');}
 if(!EVENT.test(event?.id||'')||event.livemode!==false||
    !['checkout.session.completed','checkout.session.async_payment_succeeded'].includes(event.type))
  return {decision:'ignored',reason:'Unsupported event or non-test mode',granted:false};
 const s=event.data?.object;
 if(!SID.test(s?.id||'')||s.object!=='checkout.session'||s.mode!=='payment'||
    s.livemode!==false||s.managed_payments?.enabled!==true||
    !UUID.test(s.client_reference_id||'')||
    s.metadata?.intent_id!==s.client_reference_id||
    s.currency!=='usd'||s.amount_subtotal!==4900||
    !Number.isSafeInteger(s.amount_total)||s.amount_total<4900)
  return deny('Session is not an eligible $49 Managed Payments purchase');
 if(s.payment_status!=='paid')return {decision:'ignored-unpaid',granted:false};
 if(!Number.isSafeInteger(event.created)||event.created<=0)return deny('Invalid event time');
 const bodyHash=hex(await crypto.subtle.digest('SHA-256',enc.encode(raw)));
 return {decision:'verified-test-payment',eventId:event.id,eventType:event.type,
  sessionId:s.id,intentId:s.client_reference_id,paymentIntentId:typeof s.payment_intent==='string'?s.payment_intent:null,
  paidAt:event.created,bodyHash,granted:false};
}
export async function settleStripeTestPayment(env,verified,{clock=Math.floor(Date.now()/1000),licenseId=crypto.randomUUID()}={}){
 if(!env?.AUTH_DB||env.STRIPE_STAGING_ENABLED!=='true'||
   verified?.decision!=='verified-test-payment'||!EVENT.test(verified.eventId)||
   !SID.test(verified.sessionId)||!UUID.test(verified.intentId)||
   !HEX.test(verified.bodyHash)||!UUID.test(licenseId)||
   !Number.isSafeInteger(clock)||clock<=0)return deny('Unverified or unavailable staged settlement');
 const db=env.AUTH_DB;
 try{
  const prior=await db.prepare('SELECT stripe_session_id,intent_id FROM commerce_stripe_orders WHERE stripe_session_id=?')
   .bind(verified.sessionId).first();
  if(prior)return prior.intent_id===verified.intentId?
   {decision:'already-recorded',granted:false}:deny('Conflicting Stripe session ownership');
  const intent=await db.prepare(
   "SELECT id,user_id,stripe_session_id,price_id,amount_cents,currency,mode,status,created_at,expires_at FROM commerce_stripe_intents WHERE id=?"
  ).bind(verified.intentId).first();
  if(!intent||intent.stripe_session_id!==verified.sessionId||intent.status!=='started'||
     intent.mode!=='test'||intent.amount_cents!==4900||intent.currency!=='USD'||
     intent.price_id!==env.STRIPE_PRICE_ID||intent.created_at>verified.paidAt)
   return deny('Stripe event does not match the owner-created checkout intent');
  const account=await db.prepare('SELECT email FROM auth_users WHERE id=?').bind(intent.user_id).first();
  if(!account)return deny('Authenticated account no longer exists');
  const previous=await db.prepare(
   "SELECT id,status FROM pro_licenses WHERE user_id=? AND status='active' LIMIT 1"
  ).bind(intent.user_id).first();
  // Test grants ONLY to an exact, configured owner test-email allowlist.
  const allow=(env.STRIPE_TEST_GRANT_EMAILS||'').split(',').map(x=>x.trim().toLowerCase());
  const mayGrant=env.STRIPE_TEST_GRANTS_ENABLED==='true' &&
    allow.includes((account.email||'').toLowerCase()) && !previous;
  // Archived refunded/void grants do not prevent a new verified purchase.
  const ops=[
   db.prepare("INSERT INTO commerce_stripe_orders (stripe_session_id,stripe_payment_intent_id,stripe_event_id,intent_id,user_id,amount_cents,currency,status,paid_at,updated_at) SELECT ?,?,?,id,user_id,4900,'USD','paid',?,? FROM commerce_stripe_intents WHERE id=? AND stripe_session_id=? AND status='started' AND mode='test' AND amount_cents=4900 AND currency='USD'")
    .bind(verified.sessionId,verified.paymentIntentId,verified.eventId,verified.paidAt,clock,verified.intentId,verified.sessionId),
   ...(mayGrant?[db.prepare("INSERT INTO pro_licenses(id,user_id,status,issued_at,max_devices,provider,purchase_ref) VALUES (?,?,'active',?,10,'stripe-managed-test',?)")
    .bind(licenseId,intent.user_id,clock,'stripe-test:'+verified.sessionId)]:[]),
   db.prepare("UPDATE commerce_stripe_intents SET status='paid' WHERE id=? AND stripe_session_id=? AND status='started'")
    .bind(verified.intentId,verified.sessionId),
   db.prepare("INSERT INTO commerce_stripe_webhook_events(stripe_event_id,stripe_session_id,body_sha256,event_type,processed_at) VALUES (?,?,?,?,?)")
    .bind(verified.eventId,verified.sessionId,verified.bodyHash,verified.eventType,clock)
  ];
  const results=await db.batch(ops);
  if(!Array.isArray(results)||results.length!==ops.length||
     results.some(r=>r?.meta?.changes!==1))
   return {decision:'reconcile',reason:'Settlement result uncertain',granted:false};
  return {decision:mayGrant?'settled-test-grant':'settled-test-ledger',granted:mayGrant};
 }catch{
  // A concurrent delivery could win; re-read before retrying. Never guess a grant.
  return {decision:'retryable-error',reason:'Atomic settlement did not complete',granted:false};
 }
}

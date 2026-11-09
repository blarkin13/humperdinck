/* Non-routed live checkout-intent creator.
 * Only trusted, authenticated web-account callers and operator-configured
 * store/variant/price may create an intent; never trust client-supplied price.
 * No Lemon Squeezy API call or live checkout is enabled by this module.
 */
const uuid=s=>typeof s==='string'&&/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(s);
const positiveId=s=>/^[1-9][0-9]{0,14}$/.test(String(s??''));
export async function createLiveCheckoutIntent(env,user,{
 now=Math.floor(Date.now()/1000),intentId=crypto.randomUUID(),ttlSeconds=1800
}={}){
 const invalid={decision:'not-created',reason:'Live checkout intent unavailable'};
 if(!env?.AUTH_DB||user?.kind!=='web'||!uuid(user.id)
   ||env.LS_LIVE_CHECKOUT_ENABLED!==true
   ||!positiveId(env.LS_LIVE_STORE_ID)||!positiveId(env.LS_LIVE_VARIANT_ID)
   ||!Number.isSafeInteger(env.LS_LIVE_PRICE_CENTS)||env.LS_LIVE_PRICE_CENTS<=0
   ||typeof env.LS_LIVE_CURRENCY!=='string'||!/^[A-Z]{3}$/.test(env.LS_LIVE_CURRENCY)
   ||!Number.isSafeInteger(now)||now<=0||!uuid(intentId)
   ||!Number.isSafeInteger(ttlSeconds)||ttlSeconds<60||ttlSeconds>3600)
   return invalid;
 const expiresAt=now+ttlSeconds;
 if(!Number.isSafeInteger(expiresAt))return invalid;
 try{
   const row=await env.AUTH_DB.prepare(
     "INSERT INTO commerce_live_intents (id,user_id,store_id,variant_id,amount_cents,currency,created_at,expires_at,status) SELECT ?,?,?,?,?,?,?,?,'started' WHERE EXISTS (SELECT 1 FROM auth_users WHERE id=?)"
   ).bind(intentId,user.id,String(env.LS_LIVE_STORE_ID),String(env.LS_LIVE_VARIANT_ID),
      env.LS_LIVE_PRICE_CENTS,env.LS_LIVE_CURRENCY,now,expiresAt,user.id).run();
   return row?.meta?.changes===1
     ?{decision:'created',intentId,expiresAt}
     :{decision:'not-created',reason:'Authenticated account unavailable'};
 }catch{return {decision:'not-created',reason:'Checkout intent could not be stored'};}
}

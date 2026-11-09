/* Public production-commerce release interlock.
 * There is deliberately NO live checkout/webhook/fulfillment route yet.
 * Environment variables, API keys or a D1 migration must not activate one.
 * Changing this code requires a separate reviewed launch PR and rollout QA.
 */
export const LIVE_COMMERCE_CODE_APPROVED=false;
const reservedPrefixes=['/api/commerce/live','/api/commerce/production'];
const reservedExact=new Set(['/api/commerce/checkout','/api/commerce/webhook']);
export function isReservedProductionCommercePath(path){
 return typeof path==='string'&&(
  reservedExact.has(path)||
  reservedPrefixes.some(prefix=>path===prefix||path.startsWith(prefix+'/'))
 );
}
export function handleUnreleasedProductionCommerce(request){
 // Intentionally ignore env, payment flags, cookies, signatures, payloads
 // and all request methods. No account/session/database/provider lookup.
 return new Response(JSON.stringify({
   error:'Production payments are not available',
   live_checkout_available:false,
   live_fulfillment_available:false
 }),{status:503,headers:{
   'Content-Type':'application/json; charset=utf-8',
   'Cache-Control':'no-store',
   'X-Content-Type-Options':'nosniff'
 }});
}

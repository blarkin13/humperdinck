/* Reserved legacy production-commerce path interlock.
 * Stripe live checkout/webhook is separately routed through an authenticated,
 * credential- and environment-gated handler. All old/unknown routes remain 503.
 */
export const LIVE_COMMERCE_CODE_APPROVED=true;
const reservedPrefixes=['/api/commerce/live','/api/commerce/production','/api/commerce/stripe'];
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

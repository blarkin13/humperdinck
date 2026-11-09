/* NON-ROUTED production webhook adapter.
 * Launch is *not* authorized by these helpers; Worker blocks all live URLs.
 * Source review, independent merchant QA and runtime OFF-by-default gates
 * must precede any future HTTP integration.
 */
import {inspectSignedLiveWebhook} from './lemon-live-preflight.js';
import {settleLivePaidOrder} from './lemon-live-settlement.js';
import {reconcileLiveRefund} from './lemon-live-refund.js';

const deny=(reason='Production webhook staging is disabled')=>({
 decision:'disabled',reason,granted:false
});

export async function inspectLivePaymentDelivery(env,{raw,signature,eventHeader}={}){
 if(!env||typeof env.LS_LIVE_WEBHOOK_SECRET!=='string'
   ||env.LS_LIVE_WEBHOOK_SECRET.length<16
   ||!env.LS_LIVE_STORE_ID||!env.LS_LIVE_VARIANT_ID
   ||typeof signature!=='string'||typeof eventHeader!=='string'
   ||!(raw instanceof Uint8Array))return null;
 const order=await inspectSignedLiveWebhook({
   raw,signature,secret:env.LS_LIVE_WEBHOOK_SECRET,
   storeId:env.LS_LIVE_STORE_ID,variantId:env.LS_LIVE_VARIANT_ID,
   eventHeader
 });
 if(!order)return null;
 const digest=await crypto.subtle.digest('SHA-256',raw);
 const bodySha256=Array.from(new Uint8Array(digest),b=>b.toString(16).padStart(2,'0')).join('');
 return {order,bodySha256};
}

/* Only callable by a future separately-reviewed server adapter. An
 * authenticated customer, a webhook signature, or generic LS_LIVE_* flags
 * alone can NEVER authorize enabling the staged settlement.
 */
export async function processLivePaymentInStaging(env,delivery,{
 operatorReleaseApproved=false,now=Math.floor(Date.now()/1000)
}={}){
 if(operatorReleaseApproved!==true
   ||env?.LS_LIVE_STAGING_PROCESSOR_ENABLED!==true
   ||env?.LS_LIVE_SETTLEMENT_ENABLED!==true
   ||!env?.AUTH_DB)return deny();
 const verified=await inspectLivePaymentDelivery(env,delivery);
 if(!verified)return {decision:'rejected',reason:'Invalid live payment signature or order',granted:false};
 const {order,bodySha256}=verified;
 try{
   if(order.event==='order_created')
     return await settleLivePaidOrder(env,order,{bodySha256,now});
   if(order.event==='order_refunded')
     return await reconcileLiveRefund(env,order,{bodySha256,now});
 }catch{
   return {decision:'retryable-error',reason:'Staged processing failed',granted:false};
 }
 return {decision:'rejected',reason:'Unrecognized event',granted:false};
}

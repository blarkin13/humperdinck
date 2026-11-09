/* Production Lemon Squeezy order preflight ONLY.
 * This module is deliberately NOT routed, not deployed as a live webhook,
 * and cannot mutate Pro entitlement or payment tables.
 * Operator must approve merchant, order and refund policy before wiring it.
 */
import {verifySignature} from './lemon-test-commerce.js';

const positiveId=s=>/^[1-9][0-9]{0,14}$/.test(String(s??''));
const uuid=s=>typeof s==='string'&&/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(s);

export function inspectLiveOrder(payload,{storeId,variantId}={}){
 if(!positiveId(storeId)||!positiveId(variantId))return null;
 const event=payload?.meta?.event_name;
 const item=payload?.data?.attributes?.first_order_item;
 const a=payload?.data?.attributes;
 const custom=payload?.meta?.custom_data;
 if(payload?.data?.type!=='orders'||!positiveId(payload.data.id)
   ||!['order_created','order_refunded'].includes(event)
   ||a?.test_mode!==false||item?.test_mode!==false
   ||String(a.store_id)!==String(storeId)
   ||String(item?.variant_id)!==String(variantId)
   ||!uuid(custom?.account_id)||!uuid(custom?.intent_id)
   ||typeof a.currency!=='string'||!/^[A-Z]{3}$/.test(a.currency)
   ||!Number.isSafeInteger(a.total)||a.total<0)return null;
 if(event==='order_created'&&(a.status!=='paid'||a.refunded===true))return null;
 // Distinguish partial and full refunds and leave final customer outcomes
 // for an explicit legal/merchant policy. Do not revoke offline grants here.
 if(event==='order_refunded'&&a.refunded!==true&&a.status!=='partially_refunded')return null;
 return {
  provider:'lemonsqueezy',orderId:String(payload.data.id),event,
  accountId:custom.account_id,intentId:custom.intent_id,
  currency:a.currency,amountCents:a.total,storeId:String(a.store_id),variantId:String(item.variant_id),
  status:event==='order_created'?'paid':a.refunded===true?'refunded':'partially_refunded',
  requiresPurchaseIntentVerification:true,
  entitlementMutationAllowed:false,
 };
}
export async function inspectSignedLiveWebhook({raw,signature,secret,storeId,variantId,eventHeader}){
 if(!(raw instanceof Uint8Array)||raw.byteLength===0||raw.byteLength>100000)return null;
 if(!await verifySignature(raw,signature,secret))return null;
 let data;
 try{data=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(raw))}catch{return null}
 const order=inspectLiveOrder(data,{storeId,variantId});
 if(!order||order.event!==eventHeader)return null;
 return order;
}

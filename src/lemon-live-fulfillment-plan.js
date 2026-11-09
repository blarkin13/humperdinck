/* Reviewed-live-fulfillment decision planner, not a public API.
 * Inputs come ONLY from a verified signed live webhook and authoritative
 * database records. Deliberately does not modify D1 or mint certificates.
 * Production SQL, receipt reconciliation and owner approval are pending.
 */

const uuid=s=>typeof s==='string'&&/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(s);
export function planLiveFulfillment(order,{intent,existingOrder,existingLicense}={}){
 const blocked=reason=>({decision:'manual-review',reason,mutateEntitlement:false});
 if(!order||order.provider!=='lemonsqueezy'||!order.requiresPurchaseIntentVerification||
     order.entitlementMutationAllowed!==false||!uuid(order.accountId)||!uuid(order.intentId))
   return blocked('Order did not pass independent signed-webhook preflight');
 if(!intent||intent.id!==order.intentId||intent.user_id!==order.accountId
     ||intent.mode!=='live'||intent.status==='cancelled'||!intent.created_at)
   return blocked('Missing or mismatched owner-created live checkout intent');
 if(existingOrder&&(existingOrder.order_id!==order.orderId||
                     existingOrder.user_id!==order.accountId||
                     existingOrder.intent_id!==order.intentId))
   return blocked('Provider order conflicts with an existing account or checkout intent');
 if(order.event==='order_refunded'){
   // An already downloaded lifetime/offline grant cannot be technically
   // revoked. Refund/chargeback workflow requires owner-reviewed policy.
   return existingOrder?
    blocked('Refund requires manual purchase and offline-certificate policy review'):
    blocked('Refund arrived before a validated original paid order');
 }
 if(order.event!=='order_created'||order.status!=='paid')
   return blocked('Unrecognized or unpaid live order');
 if(existingOrder){
   if(existingOrder.status==='paid')return {decision:'idempotent-paid-replay',mutateEntitlement:false};
   return blocked('Previously refunded or disputed order cannot silently regrant Pro');
 }
 // A newly paid order may only advance an active checkout intent. Closed,
 // expired, refunded or otherwise unknown intent states require review.
 // Expiry is intentionally not evaluated against webhook arrival time:
 // a valid provider webhook may be delayed after a timely checkout.
 if(intent.status!=='started')
   return blocked('Checkout intent is not in an issuable state');
 if(existingLicense){
   if(existingLicense.user_id!==order.accountId)return blocked('Existing license ownership conflict');
   if(existingLicense.status==='active'){
    return {decision:'preserve-existing-active-license',mutateEntitlement:false,
      note:'Complimentary or earlier paid license stays intact; reconcile additional purchase separately'};
   }
   return blocked('Previously refunded or void license requires manual resolution');
 }
 return {decision:'eligible-for-atomic-grant-review',
   mutateEntitlement:false,
   requirements:['Use a single D1 transaction for intent/order/entitlement.',
     'Verify store and variant, captured payment and account mapping again.',
     'Enforce idempotent provider order ID and unique account license.',
     'Confirm owner approval and reconcile real refunds before permitting grant.']};
}

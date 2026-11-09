/* Internal-only, operator-reviewed dispute reconciliation.
 * No Lemon Squeezy dispute webhook is documented. This MUST NOT be routed or
 * called with customer-supplied fields. An authorized operator must verify
 * the provider case directly in merchant dashboard/support before calling.
 * Neither this ledger nor order status changes any Pro entitlement.
 */
const caseId=s=>typeof s==='string'&&/^[A-Za-z0-9][A-Za-z0-9_.:-]{2,119}$/.test(s);
const numericId=s=>/^[1-9][0-9]{0,14}$/.test(String(s??''));
const small=s=>typeof s==='string'&&s.length>=3&&s.length<=120&&/^[A-Za-z0-9_.:@/-]+$/.test(s);
const reply=(decision,reason)=>({decision,reason,entitlementChanged:false});

export async function reconcileVerifiedLiveDispute(env,input,{now=Math.floor(Date.now()/1000)}={}){
 const {providerCaseId,orderId,status,evidenceSource,evidenceReference,operatorId,observedAt,verifiedByOperator}=input||{};
 if(!env?.AUTH_DB||verifiedByOperator!==true
   ||!caseId(providerCaseId)||!numericId(orderId)
   ||!['open','won','lost'].includes(status)
   ||!['merchant_dashboard','merchant_support'].includes(evidenceSource)
   ||!small(evidenceReference)||!small(operatorId)
   ||!Number.isSafeInteger(observedAt)||observedAt<=0
   ||!Number.isSafeInteger(now)||now<=0)
   return reply('manual-review','Missing operator-verified merchant evidence');
 const db=env.AUTH_DB;
 const order=await db.prepare(
   'SELECT provider_order_id,status FROM commerce_live_orders WHERE provider_order_id=?'
 ).bind(String(orderId)).first();
 if(!order)return reply('manual-review','No verified live purchase for this dispute');
 const previous=await db.prepare(
   'SELECT provider_case_id,provider_order_id,status,evidence_source,evidence_reference,operator_id,observed_at FROM commerce_live_disputes WHERE provider_case_id=?'
 ).bind(providerCaseId).first();
 if(previous){
   if(previous.provider_order_id!==String(orderId))
     return reply('manual-review','Dispute case belongs to a different purchase');
   if(observedAt<previous.observed_at)
     return reply('stale','Older provider observation cannot overwrite dispute status');
   if(observedAt===previous.observed_at){
     if(status===previous.status&&evidenceSource===previous.evidence_source
       &&evidenceReference===previous.evidence_reference)
       return reply('already-recorded','Identical dispute evidence previously recorded');
     return reply('manual-review','Conflicting dispute evidence at the same timestamp');
   }
   if(previous.status!=='open')
     return reply('manual-review','Closed dispute cannot be reopened automatically');
   if(status==='open'&&previous.status!=='open')
     return reply('manual-review','Invalid dispute transition');
 }else if(status!=='open'){
   return reply('manual-review','Cannot resolve a dispute without its verified open case');
 }
 const queries=[
   db.prepare(`INSERT INTO commerce_live_disputes
     (provider_case_id,provider_order_id,status,evidence_source,evidence_reference,
       operator_id,observed_at,created_at,updated_at)
     VALUES (?,?,?,?,?,?,?,?,?)
     ON CONFLICT(provider_case_id) DO UPDATE SET
       status=excluded.status,evidence_source=excluded.evidence_source,
       evidence_reference=excluded.evidence_reference,operator_id=excluded.operator_id,
       observed_at=excluded.observed_at,updated_at=excluded.updated_at
     WHERE commerce_live_disputes.provider_order_id=excluded.provider_order_id
       AND commerce_live_disputes.status='open'
       AND excluded.observed_at>commerce_live_disputes.observed_at`)
     .bind(providerCaseId,String(orderId),status,evidenceSource,evidenceReference,
       operatorId,observedAt,now,now),
   db.prepare(`INSERT INTO commerce_live_dispute_events
      (provider_case_id,status,observed_at)
      VALUES (?,(SELECT status FROM commerce_live_disputes
         WHERE provider_case_id=? AND provider_order_id=? AND observed_at=?),?)`)
     .bind(providerCaseId,providerCaseId,String(orderId),observedAt,observedAt),
 ];
 // A dispute is not a refund. Once recorded as disputed, late payment/refund
 // messages must not silently reopen fulfillment. Won cases still require
 // separate owner-reviewed policy before changing that payment state.
 if(status==='open'&&order.status!=='refunded'){
   queries.push(db.prepare(`UPDATE commerce_live_orders SET status='disputed',updated_at=?
     WHERE provider_order_id=? AND status IN ('paid','partially_refunded','disputed')`)
     .bind(now,String(orderId)));
 }
 try{
   const rows=await db.batch(queries);
   if(!Array.isArray(rows)||rows.length!==queries.length||rows.some(x=>x?.meta?.changes!==1))
     return reply('retryable-error','Dispute ledger needs reconciliation');
   return reply('recorded-for-review','Merchant dispute evidence recorded; license unchanged');
 }catch{
   return reply('retryable-error','Atomic dispute record failed; retry with merchant verification');
 }
}

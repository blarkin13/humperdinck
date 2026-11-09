/* Internal-only commerce operations reporting. NEVER add a public route.
 * Aggregates order/refund/dispute state without buyer emails, payment details,
 * webhook bodies, signed certificates, or secret values.
 */
const STATUSES=['paid','partially_refunded','refunded','disputed'];
export async function summarizeLiveCommerceForOperator(env,{operatorVerified=false}={}){
 if(operatorVerified!==true||env?.LS_LIVE_OPERATIONS_REVIEW_ENABLED!==true
    ||!env.AUTH_DB)
  return {decision:'disabled',reason:'Operator review gate not enabled'};
 try{
  const [orders,disputes,events]=await Promise.all([
   env.AUTH_DB.prepare('SELECT status,COUNT(*) AS count FROM commerce_live_orders GROUP BY status').all(),
   env.AUTH_DB.prepare('SELECT status,COUNT(*) AS count FROM commerce_live_disputes GROUP BY status').all(),
   env.AUTH_DB.prepare('SELECT event_name,COUNT(*) AS count FROM commerce_live_webhook_events GROUP BY event_name').all()
  ]);
  const counts=Object.fromEntries(STATUSES.map(s=>[s,0]));
  for(const row of orders.results||[]){
   if(!STATUSES.includes(row.status)||!Number.isSafeInteger(row.count)||row.count<0)
    return {decision:'unavailable',reason:'Unexpected live order state'};
   counts[row.status]=row.count;
  }
  const disputeCounts={open:0,won:0,lost:0};
  for(const row of disputes.results||[]){
   if(!(row.status in disputeCounts)||!Number.isSafeInteger(row.count)||row.count<0)
    return {decision:'unavailable',reason:'Unexpected dispute state'};
   disputeCounts[row.status]=row.count;
  }
  const receipts={order_created:0,order_refunded:0};
  for(const row of events.results||[]){
   if(!(row.event_name in receipts)||!Number.isSafeInteger(row.count)||row.count<0)
    return {decision:'unavailable',reason:'Unexpected webhook receipt state'};
   receipts[row.event_name]=row.count;
  }
  return {decision:'read-only-summary',orders:counts,disputes:disputeCounts,receipts,
   requires_policy_review:counts.partially_refunded+counts.refunded+counts.disputed+disputeCounts.open,
   note:'Counts only; refund/chargeback policy and individual merchant evidence require manual verification.'};
 }catch{return {decision:'unavailable',reason:'Live operations ledger is not ready'};}
}

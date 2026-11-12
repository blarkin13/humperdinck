/* NON-ROUTED, DEFAULT-DISABLED operator deletion executor.
 * Never expose this function as a public endpoint. A privacy review request
 * does not authorize this operation. Call only after separately verified
 * identity, fresh customer final consent, owner-approved policy and retention.
 * D1.batch is transactional; a failed audit MUST roll back account deletion.
 */
import {inspectAccountDeletionForReview} from './account-deletion-preflight.js';
const uuid=s=>typeof s==='string'&&/^[a-f0-9]{8}-[a-f0-9]{4}-[1-8][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i.test(s);
const blocked=reason=>({decision:'blocked',deleted:false,reason});
const deletedCount=r=>Number(r?.meta?.changes||0);
export async function performReviewedAccountDeletion(env,userId,{
 requestId='',operatorId='',policyVersion='',operatorVerified=false,
 retentionApproved=false,customerFinalConsentVerified=false,
 proForfeitureAcknowledged=false,offlineCertificateAcknowledged=false,
 merchantRetentionVerified=false,dryRun=true
}={}){
 // Production execution requires an independent, explicit environment gate,
 // but dry-run review can proceed with no destructive capability enabled.
 if(!uuid(userId)||!uuid(requestId)||typeof operatorId!=='string'||
   !/^[a-zA-Z0-9_-]{3,80}$/.test(operatorId)||typeof policyVersion!=='string'||
   !/^[a-zA-Z0-9._-]{3,80}$/.test(policyVersion)||
   operatorVerified!==true||retentionApproved!==true||
   customerFinalConsentVerified!==true||proForfeitureAcknowledged!==true||
   offlineCertificateAcknowledged!==true||merchantRetentionVerified!==true)
  return blocked('Explicit verified customer and operator acceptance are required');
 if(!env?.AUTH_DB)return blocked('Database unavailable');
 const review=await inspectAccountDeletionForReview(env,userId,{
  operatorVerified:true,retentionApproved:true,approvedPolicyVersion:policyVersion
 });
 if(review.decision!=='operator-review-required')return {...review,deleted:false};
 try{
  const pending=await env.AUTH_DB.prepare(
   "SELECT id FROM auth_privacy_requests WHERE id=? AND user_id=? AND kind='deletion' AND status='pending'"
  ).bind(requestId,userId).first();
  if(!pending)return blocked('Exact pending deletion review request not found');
  if(dryRun!==false)return {
   decision:'dry-run-only',deleted:false,customerId:userId,
   requestId,onlineProWouldBeForfeited:review.hasOnlinePro,
   merchantRecordsRetained:review.commerceRecordsToRetain,
   offlineCertificateWarning:review.offlineCertificateWarning
  };
  if(env.ACCOUNT_DELETION_EXECUTION_ENABLED!=='true')
   return blocked('Production account deletion is disabled');
  // Re-check all holds and linked data inside the SAME transaction. If another
  // action creates an unsettled purchase or beta report, no deletion occurs.
  const deletionSql=`DELETE FROM auth_users WHERE id=?
    AND EXISTS (SELECT 1 FROM auth_privacy_requests
      WHERE id=? AND user_id=? AND kind='deletion' AND status='pending')
    AND NOT EXISTS (SELECT 1 FROM auth_deletion_holds WHERE user_id=? AND released_at IS NULL)
    AND NOT EXISTS (SELECT 1 FROM commerce_live_intents WHERE user_id=? AND status='started')
    AND NOT EXISTS (SELECT 1 FROM commerce_live_disputes d
      JOIN commerce_live_orders o ON o.provider_order_id=d.provider_order_id
      WHERE o.user_id=? AND d.status='open')
    AND NOT EXISTS (SELECT 1 FROM beta_invitations WHERE accepted_user_id=?)
    AND NOT EXISTS (SELECT 1 FROM beta_pro_grants WHERE user_id=?)
    AND NOT EXISTS (SELECT 1 FROM beta_reports WHERE user_id=?)`;
  // SQL changes() proves the immediately preceding DELETE affected exactly
  // one row. If not, NOT NULL on operator_id fails and D1.batch rolls back.
  // The audit has no user FK, so it survives account cascade deletion.
  const auditSql=`INSERT INTO auth_deletion_audit
    (request_id,user_id,policy_version,operator_id,completed_at,
     online_pro_forfeiture_acknowledged,offline_certificate_limitation_acknowledged)
    VALUES (?,?,?,CASE WHEN changes()=1 THEN ? ELSE NULL END,?,1,1)`;
  const statements=[
   env.AUTH_DB.prepare(deletionSql).bind(userId,requestId,userId,userId,
     userId,userId,userId,userId,userId),
   env.AUTH_DB.prepare(auditSql).bind(requestId,userId,policyVersion,operatorId,
     Math.floor(Date.now()/1000))
  ];
  const result=await env.AUTH_DB.batch(statements);
  if(deletedCount(result?.[0])!==1||deletedCount(result?.[1])!==1)
   return blocked('Deletion outcome could not be verified; reconcile database and audit');
  return {decision:'deleted',deleted:true,requestId,
   merchantRecordsRetained:review.commerceRecordsToRetain,
   offlineCertificateWarning:review.offlineCertificateWarning};
 }catch{
  // Do not reveal SQL details or any customer information.
  return blocked('Deletion did not complete. Verify transaction rollback and audit before retrying');
 }
}

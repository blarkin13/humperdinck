/* NON-ROUTED account deletion preflight. This is never a delete command.
 * A customer privacy review request is not consent to irreversible deletion.
 * An operator must separately verify identity, consent, retention policy,
 * open disputes, recovery consequences and lifetime offline certificates.
 */
const uuid=s=>typeof s==='string'&&/^[a-f0-9]{8}-[a-f0-9]{4}-[1-8][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i.test(s);
export async function inspectAccountDeletionForReview(env,userId,{
 operatorVerified=false,approvedPolicyVersion='',retentionApproved=false
}={}){
 const block=(reason)=>({decision:'blocked',mayDelete:false,reason});
 if(operatorVerified!==true||retentionApproved!==true||
   typeof approvedPolicyVersion!=='string'||approvedPolicyVersion.length<3)
  return block('Operator approval and commerce retention policy are required');
 if(!env?.AUTH_DB||!uuid(userId))return block('Invalid account scope');
 try{
  const [user,license,pending,orders,disputes,inflight,betaInvites,betaGrants,betaReports]=await Promise.all([
   env.AUTH_DB.prepare('SELECT id FROM auth_users WHERE id=?').bind(userId).first(),
   env.AUTH_DB.prepare('SELECT id,status FROM pro_licenses WHERE user_id=?').bind(userId).first(),
   env.AUTH_DB.prepare("SELECT id FROM auth_privacy_requests WHERE user_id=? AND kind='deletion' AND status='pending'").bind(userId).first(),
   env.AUTH_DB.prepare('SELECT COUNT(*) AS n FROM commerce_live_orders WHERE user_id=?').bind(userId).first(),
   env.AUTH_DB.prepare("SELECT COUNT(*) AS n FROM commerce_live_disputes WHERE provider_order_id IN (SELECT provider_order_id FROM commerce_live_orders WHERE user_id=?) AND status='open'").bind(userId).first(),
   env.AUTH_DB.prepare("SELECT COUNT(*) AS n FROM commerce_live_intents WHERE user_id=? AND status='started'").bind(userId).first(),
   env.AUTH_DB.prepare('SELECT COUNT(*) AS n FROM beta_invitations WHERE accepted_user_id=?').bind(userId).first(),
   env.AUTH_DB.prepare('SELECT COUNT(*) AS n FROM beta_pro_grants WHERE user_id=?').bind(userId).first(),
   env.AUTH_DB.prepare('SELECT COUNT(*) AS n FROM beta_reports WHERE user_id=?').bind(userId).first()
  ]);
  if(!user)return block('Account not found');
  if(!pending)return block('No authenticated deletion review request exists');
  if((disputes?.n||0)>0)return block('Open merchant dispute requires review before account deletion');
  if(Number(inflight?.n||0)>0)return block('Unsettled checkout intent requires review before deletion');
  if(Number(betaInvites?.n||0)+Number(betaGrants?.n||0)+Number(betaReports?.n||0)>0)
   return block('Linked beta records and screenshot objects require reviewed cleanup before deletion');
  return {
   decision:'operator-review-required',mayDelete:false,approvedPolicyVersion,
   hasOnlinePro:license?.status==='active',
   commerceRecordsToRetain:orders?.n||0,
   reason:'Identity/consent and legal retention must be independently verified. No account data has been deleted.',
   offlineCertificateWarning:'Previously exported perpetual offline certificates may continue to work.'
  };
 }catch{return block('Required deletion/commerce tables are not ready');}
}

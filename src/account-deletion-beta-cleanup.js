/* NON-ROUTED operator beta cleanup required before intentional account deletion.
 * R2 is not part of D1 transactions: failed R2 deletion stops SQL cleanup,
 * but objects already deleted may remain gone. Retry is safe and idempotent.
 * No public endpoint or automatic execution.
 */
const validUuid=s=>typeof s==='string'&&/^[a-f0-9]{8}-[a-f0-9]{4}-[1-8][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i.test(s);
const fail=reason=>({status:'blocked',reason,cleaned:false});
export async function prepareAccountBetaDataForDeletion(env,userId,{
 requestId='',policyVersion='',operatorVerified=false,retentionApproved=false,
 customerFinalConsentVerified=false,dryRun=true
}={}){
 if(!validUuid(userId)||!validUuid(requestId)||!operatorVerified||!retentionApproved||
  !customerFinalConsentVerified||!(/^[a-zA-Z0-9._-]{3,80}$/.test(policyVersion))||
  !env?.AUTH_DB)return fail('Verified deletion authorization required');
 const timestamp=Math.floor(Date.now()/1000);
 try{
  const [pending,proof,holds,disputes,intents]=await Promise.all([
   env.AUTH_DB.prepare("SELECT id FROM auth_privacy_requests WHERE id=? AND user_id=? AND kind='deletion' AND status='pending'").bind(requestId,userId).first(),
   env.AUTH_DB.prepare('SELECT request_id FROM auth_deletion_confirmations WHERE request_id=? AND user_id=? AND policy_version=? AND expires_at>?').bind(requestId,userId,policyVersion,timestamp).first(),
   env.AUTH_DB.prepare('SELECT COUNT(*) AS n FROM auth_deletion_holds WHERE user_id=? AND released_at IS NULL').bind(userId).first(),
   env.AUTH_DB.prepare("SELECT COUNT(*) AS n FROM commerce_live_disputes WHERE provider_order_id IN (SELECT provider_order_id FROM commerce_live_orders WHERE user_id=?) AND status='open'").bind(userId).first(),
   env.AUTH_DB.prepare("SELECT COUNT(*) AS n FROM commerce_live_intents WHERE user_id=? AND status='started'").bind(userId).first()
  ]);
  if(!pending||!proof)return fail('Fresh independent customer consent required');
  if(Number(holds?.n||0)>0||Number(disputes?.n||0)>0||Number(intents?.n||0)>0)
   return fail('Preservation hold, dispute or unsettled checkout');
  const images=await env.AUTH_DB.prepare(
   'SELECT object_key FROM beta_screenshots WHERE report_id IN (SELECT id FROM beta_reports WHERE user_id=?) LIMIT 501'
  ).bind(userId).all();
  if((images.results||[]).length>500)return fail('Beta screenshot cleanup batch exceeds safe limit');
  const count=(images.results||[]).length;
  if(dryRun!==false)return {status:'dry-run',cleaned:false,screenshotCount:count};
  if(env.ACCOUNT_DELETION_BETA_CLEANUP_ENABLED!=='true')
   return fail('Beta cleanup remains disabled');
  if(count&&!env.BETA_SCREENSHOTS)return fail('Private screenshots bucket unavailable');
  for(const item of images.results||[]){
   if(typeof item.object_key!=='string'||!item.object_key)return fail('Invalid screenshot object key');
   await env.BETA_SCREENSHOTS.delete(item.object_key);
  }
  // D1.batch is atomic; if it fails after R2 deletions, rerun safely.
  const queries=[
   'DELETE FROM beta_screenshots WHERE report_id IN (SELECT id FROM beta_reports WHERE user_id=?)',
   'DELETE FROM beta_reports WHERE user_id=?',
   'DELETE FROM beta_pro_grants WHERE user_id=?',
   'DELETE FROM beta_invitations WHERE accepted_user_id=?'
  ].map(sql=>env.AUTH_DB.prepare(sql).bind(userId));
  await env.AUTH_DB.batch(queries);
  return {status:'cleaned',cleaned:true,screenshotCount:count};
 }catch{return fail('Beta cleanup failed; recheck R2/D1 reconciliation before retry');}
}

/* Data portability and privacy-request intake. No automatic deletion of
 * accounts or Pro purchases: owner-approved forfeiture and retention policy
 * are required before any destructive workflow is separately enabled.
 * No identity tokens, recovery code hashes, secrets or card data in exports.
 */
import {limitedJson} from './limited-json.js';
const response=(data,status=200)=>new Response(JSON.stringify(data),{
 status,headers:{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store',
 'X-Content-Type-Options':'nosniff','Content-Disposition':'attachment; filename="humperdinck-account-export.json"'}});
const error=(status,message)=>response({error:message},status);
const when=()=>Math.floor(Date.now()/1000);
export async function handleAccountPrivacy(request,env,{user,sameOrigin}){
 const url=new URL(request.url), path=url.pathname;
 if(!user||user.kind!=='web')return error(403,'Use your signed-in web account for privacy requests');
 if(path==='/api/account/privacy/export'&&request.method==='GET'){
  const [account,identity,license]=await Promise.all([
   env.AUTH_DB.prepare('SELECT id,display_name,email,created_at FROM auth_users WHERE id=?').bind(user.id).first(),
   env.AUTH_DB.prepare('SELECT provider,created_at FROM auth_identities WHERE user_id=? ORDER BY provider').bind(user.id).all(),
   env.AUTH_DB.prepare('SELECT id,status,issued_at,max_devices,provider,purchase_ref FROM pro_licenses WHERE user_id=?').bind(user.id).first()
  ]);
  if(!account)return error(404,'Account not found');
  const [devices,requests]=await Promise.all([
   license?env.AUTH_DB.prepare('SELECT installation_id,label,activated_at,last_seen_at,deactivated_at FROM pro_devices WHERE license_id=?').bind(license.id).all():Promise.resolve({results:[]}),
   env.AUTH_DB.prepare('SELECT id,kind,status,created_at,completed_at FROM auth_privacy_requests WHERE user_id=? ORDER BY created_at DESC LIMIT 25').bind(user.id).all()
  ]);
  // Export is deliberately sparse: only actual owner records, no bearer sessions
  // or authentication credentials. Lifetime certificate remains portable offline.
  return response({format:'humperdinck-account-data-export-v1',generated_at:when(),
   account,identities:identity.results||[],pro_license:license||null,
   registered_devices:devices.results||[],privacy_requests:requests.results||[],
   note:'Payment receipts and transaction records held by the merchant of record are not included. Contact privacy@humperdinck.studio for assisted access or deletion.'});
 }
 if(path==='/api/account/privacy/requests'&&request.method==='POST'){
  if(!sameOrigin(request))return error(403,'Invalid request origin');
  const data=await limitedJson(request,4096);
  if(!['access','deletion','correction'].includes(data.kind)
      ||data.confirmation!=='REQUEST PRIVACY REVIEW')
   return error(422,'Confirm the kind of privacy request explicitly');
  // A deletion REVIEW is not deletion consent. Still explicitly disclose
  // the potential consequence before even accepting the request; automated
  // user/license removal remains disabled pending owner/legal sign-off.
  if(data.kind==='deletion'&&(
    data.forfeitureAcknowledgment!=='I UNDERSTAND ACCOUNT DELETION MAY FORFEIT PRO'
    ||data.offlineCertificateAcknowledged!==true))
   return error(422,'Acknowledge possible loss of online Pro access, recovery and the limitations of offline certificates');
  // Do NOT delete the user, pro_licenses, purchase refs or payment data here.
  // Store a support queue item; user identity is verified by the web session.
  const existing=await env.AUTH_DB.prepare(
   "SELECT id,status FROM auth_privacy_requests WHERE user_id=? AND kind=? AND status='pending'"
  ).bind(user.id,data.kind).first();
  if(existing)return response({request_id:existing.id,status:'pending',duplicate:true});
  const id=crypto.randomUUID();
  const inserted=await env.AUTH_DB.prepare(
   "INSERT OR IGNORE INTO auth_privacy_requests (id,user_id,kind,status,created_at) VALUES (?,?,?,'pending',?)"
  ).bind(id,user.id,data.kind,when()).run();
  if(inserted.meta?.changes!==1){
   const another=await env.AUTH_DB.prepare(
    "SELECT id,status FROM auth_privacy_requests WHERE user_id=? AND kind=? AND status='pending'"
   ).bind(user.id,data.kind).first();
   return another?response({request_id:another.id,status:'pending',duplicate:true}):
      error(503,'Privacy request could not be queued');
  }
  return response({request_id:id,status:'pending',message:'Request recorded for verified manual review only. No deletion or license change has occurred. If deletion is later approved, online Pro activation and account recovery may be forfeited; previously exported offline certificates may continue to work.'},202);
 }
 return error(404,'Unknown account privacy route');
}

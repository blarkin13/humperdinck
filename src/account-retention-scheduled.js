/* Scheduled cleanup for already-expired short-lived auth records only.
 * This never removes customer accounts, Pro purchases, live commerce,
 * audit records, privacy requests, support cases or local recordings.
 * Explicitly disabled until owner-approved rollout and schema checks.
 */
const now=()=>Math.floor(Date.now()/1000);
const DAY=86400;
const targets=[
 {name:'sessions',sql:'DELETE FROM auth_sessions WHERE token_hash IN (SELECT token_hash FROM auth_sessions WHERE expires_at<? LIMIT 500)',lag:7*DAY},
 {name:'oauth',sql:'DELETE FROM auth_flows WHERE state_hash IN (SELECT state_hash FROM auth_flows WHERE expires_at<? LIMIT 500)',lag:DAY},
 {name:'device_challenges',sql:'DELETE FROM auth_device_flows WHERE id IN (SELECT id FROM auth_device_flows WHERE expires_at<? LIMIT 500)',lag:DAY},
 {name:'link_intents',sql:'DELETE FROM auth_link_intents WHERE state_hash IN (SELECT state_hash FROM auth_link_intents WHERE expires_at<? LIMIT 500)',lag:DAY},
 {name:'rate_limits',sql:'DELETE FROM auth_rate WHERE rowid IN (SELECT rowid FROM auth_rate WHERE created_at<? LIMIT 500)',lag:7*DAY},
 {name:'deletion_confirmations',sql:'DELETE FROM auth_deletion_confirmations WHERE request_id IN (SELECT request_id FROM auth_deletion_confirmations WHERE expires_at<? LIMIT 500)',lag:DAY}
];
export async function runScheduledAuthRetention(env,{execute=false,clock=now()}={}){
 if(!env?.AUTH_DB)return {status:'disabled',reason:'database_unavailable'};
 if(env.ACCOUNT_RETENTION_CLEANUP_ENABLED!=='true'||execute!==true)
  return {status:'disabled',reason:'feature_gate_off'};
 if(!Number.isSafeInteger(clock)||clock<DAY)return {status:'blocked',reason:'invalid_clock'};
 const changes={};
 try{
  for(const target of targets){
   const before=clock-target.lag;
   const result=await env.AUTH_DB.prepare(target.sql).bind(before).run();
   changes[target.name]=Number(result?.meta?.changes||0);
  }
 }catch{
  // Fail closed; never swallow partial progress as a complete retention run.
  return {status:'error',completed:changes,error:'retention_schema_or_execution_failure'};
 }
 return {status:'complete',changes};
}

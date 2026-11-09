/* Voice Exchange publication safety rules.
 *
 * PRE-LAUNCH FOUNDATION: not connected to a public upload endpoint.
 * This module does NOT verify a real speaker, signatures, recordings, age or
 * legal rights. The caller must supply trusted server-side evidence. Never
 * accept a browser-supplied "verification passed" flag as proof of consent.
 */
export const EXCHANGE_STATES=Object.freeze([
  'private','pending','quarantined','approved','published','delisted','removed'
]);

export function validateUploadManifest(data){
  if(!data||typeof data!=='object'||Array.isArray(data))
    return {ok:false,error:'Invalid voice submission'};
  const allowed=new Set(['voice_package','preview_file','display_name','category','license_choice',
    'speaker_rights_attested','signed_consent_attested','adult_attested','policy_version']);
  if(Object.keys(data).some(k=>!allowed.has(k)))
    return {ok:false,error:'Submission contains extra or disallowed fields'};
  if(data.voice_package!=='voice-package.json'||data.preview_file!=='preview.wav')
    return {ok:false,error:'Only the reusable voice package and generated preview may be submitted'};
  if(typeof data.display_name!=='string'||data.display_name.trim().length<2||
    data.display_name.length>80||/[<>\u0000-\u001f]/.test(data.display_name))
    return {ok:false,error:'Invalid public voice name'};
  if(typeof data.category!=='string'||data.category.length>40||
    !/^[a-z0-9 -]+$/i.test(data.category))
    return {ok:false,error:'Invalid category'};
  if(!['personal-commercial-no-redistribution'].includes(data.license_choice))
    return {ok:false,error:'An explicit supported voice license choice is required'};
  if(data.speaker_rights_attested!==true||data.signed_consent_attested!==true||
    data.adult_attested!==true||typeof data.policy_version!=='string'||
    !/^voice-policy-v[1-9][0-9]*$/.test(data.policy_version))
    return {ok:false,error:'Missing consent, adult or rights attestation'};
  return {ok:true,manifest:{
    voice_package:data.voice_package,preview_file:data.preview_file,
    display_name:data.display_name.trim(),category:data.category,
    license_choice:data.license_choice,policy_version:data.policy_version
  }};
}

// All evidence MUST be created and persisted by the trusted service.
// "Speaker similarity" and read-aloud matching alone can be spoofed.
export function publicationDecision(submission,evidence){
  if(!submission||submission.state!=='pending')return {allowed:false,reason:'Not pending review'};
  if(!evidence||evidence.source!=='trusted-review-service')
    return {allowed:false,reason:'Missing trusted evidence'};
  if(evidence.consent_status!=='verified-recorded'||evidence.live_prompt_matched!==true||
     evidence.speaker_consistency_passed!==true||evidence.rights_review!=='passed')
    return {allowed:false,reason:'Unverified consent or rights'};
  if(evidence.age_gate_passed!==true||evidence.malware_scan!=='clean'||
     evidence.content_scan!=='passed')
    return {allowed:false,reason:'Safety review incomplete'};
  if(evidence.active_report_count>0||evidence.withdrawal_requested===true)
    return {allowed:false,reason:'Report or withdrawal blocks publishing'};
  if(evidence.risk_classification!=='low')
    return {allowed:false,reason:'Quarantine for independent review'};
  return {allowed:true,state:'approved',reason:'All required trusted checks passed'};
}

export function reportVoice(submission,{reportId,reportedAt}){
  if(!submission||!['approved','published','quarantined'].includes(submission.state))
    return {ok:false,error:'Voice is not reportable in this state'};
  if(typeof reportId!=='string'||!/^report_[a-z0-9-]{12,80}$/i.test(reportId)||
     !Number.isSafeInteger(reportedAt)||reportedAt<=0)
    return {ok:false,error:'Invalid moderation report'};
  return {ok:true,state:'quarantined',downloads_enabled:false,
    previous_state:submission.state,report_id:reportId,reported_at:reportedAt};
}

export function withdrawVoice(submission,{requestedAt}){
  if(!submission||!EXCHANGE_STATES.includes(submission.state)||
    !Number.isSafeInteger(requestedAt)||requestedAt<=0)
    return {ok:false,error:'Invalid withdrawal request'};
  return {ok:true,state:'delisted',downloads_enabled:false,
    withdrawn_at:requestedAt,offline_copies_remain_unrecoverable:true};
}

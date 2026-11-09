import test from 'node:test';
import assert from 'node:assert/strict';
import {validateUploadManifest,publicationDecision,reportVoice,withdrawVoice} from '../src/voice-exchange-policy.js';

const manifest={voice_package:'voice-package.json',preview_file:'preview.wav',display_name:'Voice 1',
 category:'narration',license_choice:'personal-commercial-no-redistribution',
 speaker_rights_attested:true,signed_consent_attested:true,adult_attested:true,policy_version:'voice-policy-v1'};
const evidence={source:'trusted-review-service',consent_status:'verified-recorded',
 live_prompt_matched:true,speaker_consistency_passed:true,rights_review:'passed',
 age_gate_passed:true,malware_scan:'clean',content_scan:'passed',
 active_report_count:0,withdrawal_requested:false,risk_classification:'low'};

test('only explicit voice package and preview may be submitted',()=>{
 assert.equal(validateUploadManifest(manifest).ok,true);
 for(const key of ['original_audio','source_recording','project_files','script_text','client_verification']){
   assert.equal(validateUploadManifest({...manifest,[key]:'secret'}).ok,false);
 }
 assert.equal(validateUploadManifest({...manifest,signed_consent_attested:false}).ok,false);
 assert.equal(validateUploadManifest({...manifest,adult_attested:false}).ok,false);
});

test('publish requires trusted verification; no self-attested bypass',()=>{
 assert.equal(publicationDecision({state:'pending'},null).allowed,false);
 assert.equal(publicationDecision({state:'pending'},{...evidence,source:'client'}).allowed,false);
 assert.equal(publicationDecision({state:'pending'},{...evidence,live_prompt_matched:false}).allowed,false);
 assert.equal(publicationDecision({state:'pending'},{...evidence,risk_classification:'high'}).allowed,false);
 assert.equal(publicationDecision({state:'pending'},{...evidence,active_report_count:1}).allowed,false);
 assert.equal(publicationDecision({state:'pending'},evidence).allowed,true);
 assert.equal(publicationDecision({state:'published'},evidence).allowed,false);
});

test('reports and withdrawal disable future downloads immediately',()=>{
 const reported=reportVoice({state:'published'},{reportId:'report_abcd1234567890',reportedAt:1794180000});
 assert.equal(reported.ok,true);
 assert.equal(reported.downloads_enabled,false);
 assert.equal(reported.state,'quarantined');
 const withdrawn=withdrawVoice({state:'published'},{requestedAt:1794180000});
 assert.equal(withdrawn.ok,true);
 assert.equal(withdrawn.downloads_enabled,false);
 assert.equal(withdrawn.offline_copies_remain_unrecoverable,true);
});

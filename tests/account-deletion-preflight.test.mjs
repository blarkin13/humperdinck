import test from 'node:test';
import assert from 'node:assert/strict';
import {inspectAccountDeletionForReview} from '../src/account-deletion-preflight.js';
const uid='63a4cf69-678f-4788-a61d-8401cc309b72';
function fixture({pending=true,openDisputes=0,unsettledIntents=0,betaInvites=0,betaGrants=0,betaReports=0}={}){
 let writes=0,reads=0;
 const env={AUTH_DB:{prepare(sql){reads++;
  return {bind(id){assert.equal(id,uid);return {async first(){
   if(sql.includes('FROM auth_users'))return {id:uid};
   if(sql.includes('FROM pro_licenses'))return {id:'license1',status:'active'};
   if(sql.includes('FROM auth_privacy_requests'))return pending?{id:'review1'}:null;
   if(sql.includes('FROM commerce_live_disputes'))return {n:openDisputes};
   if(sql.includes('FROM commerce_live_orders'))return {n:2};
   if(sql.includes('FROM commerce_live_intents'))return {n:unsettledIntents};
   if(sql.includes('FROM beta_invitations'))return {n:betaInvites};
   if(sql.includes('FROM beta_pro_grants'))return {n:betaGrants};
   if(sql.includes('FROM beta_reports'))return {n:betaReports};
   throw Error('Unexpected query');
  }}}};
 }}};
 return {env,usage:()=>({writes,reads})};
}
const opts={operatorVerified:true,retentionApproved:true,approvedPolicyVersion:'review-draft-v1'};
test('account deletion preflight defaults to blocked without any data read or write',async()=>{
 const f=fixture();
 for(const args of [{},{operatorVerified:true},{operatorVerified:true,retentionApproved:true}]){
  const result=await inspectAccountDeletionForReview(f.env,uid,args);
  assert.equal(result.mayDelete,false);
  assert.equal(result.decision,'blocked');
 }
 assert.deepEqual(f.usage(),{writes:0,reads:0});
});
test('pending request alone never authorizes deletion; returns operator-only non-PII plan',async()=>{
 const f=fixture();
 const result=await inspectAccountDeletionForReview(f.env,uid,opts);
 assert.equal(result.decision,'operator-review-required');
 assert.equal(result.mayDelete,false);
 assert.equal(result.hasOnlinePro,true);
 assert.equal(result.commerceRecordsToRetain,2);
 assert.match(result.offlineCertificateWarning,/may continue to work/);
 assert.equal(f.usage().writes,0);
});
test('missing authenticated request and unresolved dispute block deletion',async()=>{
 for(const setup of [{pending:false},{openDisputes:1}]){
  const f=fixture(setup);
  const result=await inspectAccountDeletionForReview(f.env,uid,opts);
  assert.equal(result.decision,'blocked');
  assert.equal(result.mayDelete,false);
  assert.equal(f.usage().writes,0);
 }
});
test('unapplied live ledger blocks review; invalid account scope is refused',async()=>{
 const f=fixture();
 assert.equal((await inspectAccountDeletionForReview(f.env,'not-a-uuid',opts)).decision,'blocked');
 const env={AUTH_DB:{prepare(){throw Error('table not yet migrated')}}};
 assert.equal((await inspectAccountDeletionForReview(env,uid,opts)).decision,'blocked');
});

test('active checkout and linked beta records block deletion until reviewed',async()=>{
 for(const setup of [
  {unsettledIntents:1},{betaInvites:1},{betaGrants:1},{betaReports:1}
 ]){
  const f=fixture(setup);
  const result=await inspectAccountDeletionForReview(f.env,uid,opts);
  assert.equal(result.decision,'blocked');
  assert.equal(result.mayDelete,false);
  assert.equal(f.usage().writes,0);
 }
});

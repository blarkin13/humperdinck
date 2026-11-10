import test from 'node:test';
import assert from 'node:assert/strict';
import {handleOwnerAnalytics,readGithubDownloads,readSiteEvents} from '../src/owner-analytics.js';

const req=(days='7',method='GET')=>new Request('https://humperdinck.studio/api/account/dashboard/analytics?days='+days,{method});
const user={id:'owner-uuid',kind:'web'};
const config={ANALYTICS_OWNER_ACCOUNT_ID:'owner-uuid',CF_ANALYTICS_ACCOUNT_ID:'a'.repeat(32),CF_ANALYTICS_READ_TOKEN:'not-a-real-token'};
const github=[{tag_name:'v0.1.27',draft:false,prerelease:false,assets:[
 {name:'Humperdinck-win.exe',download_count:11},
 {name:'Humperdinck-mac.dmg',download_count:5},
 {name:'Humperdinck-linux.deb',download_count:3},
 {name:'SHA256SUMS',download_count:99}]},
 {tag_name:'voices',assets:[{name:'voice-pack.exe',download_count:101}]}];
const fakeFetch=async (url,options)=>{
 if(String(url).includes('api.cloudflare.com')){
  assert.match(options.body,/INTERVAL '7' DAY/);
  assert.match(options.headers.Authorization,/Bearer not-a-real-token/);
  return Response.json({data:[{type:'page_view',platform:'website',total:31},{type:'download_click',platform:'windows',total:4},{type:'download_click',platform:'macos',total:2}]});
 }
 return Response.json(github);
};

test('owner auth rejects unsigned anonymous, other accounts and desktop access',async()=>{
 for(const identity of [undefined,{id:'other',kind:'web'},{id:'owner-uuid',kind:'desktop'}]){
  const result=await handleOwnerAnalytics(req(),config,{user:identity,fetcher:()=>{throw Error('must not fetch')}});
  assert.equal(result.status,identity?404:401);
  assert.equal(result.headers.get('Cache-Control'),'no-store');
 }
 const missing=await handleOwnerAnalytics(req(),{}, {user,fetcher:()=>{throw Error('must not fetch')}});
 assert.equal(missing.status,404);
});
test('range validation and method restrictions',async()=>{
 for(const value of ['0','2','365','NaN','7%20OR%201','-1']){
  const result=await handleOwnerAnalytics(req(value),config,{user,fetcher:()=>{throw Error('must not fetch')}});
  assert.equal(result.status,400);
 }
 assert.equal((await handleOwnerAnalytics(req('7','POST'),config,{user})).status,405);
});
test('owner sees independently labeled live event and cumulative download counts',async()=>{
 const result=await handleOwnerAnalytics(req(),config,{user,fetcher:fakeFetch});
 assert.equal(result.status,200);
 const data=await result.json();
 assert.equal(data.events.page_views,31);
 assert.equal(data.events.download_clicks.windows,4);
 assert.equal(data.github.counts.windows,11);
 assert.equal(data.github.counts.macos,5);
 assert.equal(data.github.counts.linux,3);
 assert.match(data.notes.unique_visitors,/not unique users/);
 assert.match(data.github.scope,/all time/);
});
test('missing Cloudflare credentials do not get converted to fabricated zero traffic',async()=>{
 const result=await handleOwnerAnalytics(req(),{ANALYTICS_OWNER_ACCOUNT_ID:user.id},{user,fetcher:fakeFetch});
 const data=await result.json();
 assert.equal(data.events.available,false);
 assert.equal(data.github.available,true);
 assert.equal(data.events.page_views,undefined);
});
test('GitHub errors are visible rather than zero downloads',async()=>{
 const result=await readGithubDownloads(async()=>new Response('not found',{status:404}));
 assert.equal(result.available,false);
 assert.equal(result.counts,undefined);
});
test('Cloudflare parser ignores malicious negative or non-numeric datapoints',async()=>{
 const data=await readSiteEvents(config,7,async()=>Response.json({data:[
  {type:'page_view',platform:'website',total:5},
  {type:'page_view',platform:'website',total:-2},
  {type:'download_click',platform:'windows',total:'oops'}]}));
 assert.equal(data.page_views,5);
 assert.equal(data.download_clicks.windows,0);
});
test('GitHub token is sent when configured and rate limits are explained',async()=>{
 let auth=null;
 const result=await readGithubDownloads(async(url,init)=>{auth=init.headers.Authorization;return new Response('limit',{status:403})},{GITHUB_DOWNLOADS_TOKEN:'t'});
 assert.equal(auth,'Bearer t');
 assert.match(result.reason,/HTTP 403, rate limited/);
});

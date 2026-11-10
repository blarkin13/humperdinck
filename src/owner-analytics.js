// Private owner-only aggregate analytics; no visitor identifiers or scripts.
const json=(data,status=200)=>new Response(JSON.stringify(data),{status,headers:{
 'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store',
 'X-Content-Type-Options':'nosniff','Referrer-Policy':'no-referrer'}});
const platforms=['windows','macos','linux'];
const daysAllowed=new Set([1,7,30]);
const isOwner=(user,env)=>Boolean(user&&user.kind==='web'&&env.ANALYTICS_OWNER_ACCOUNT_ID
 && user.id===env.ANALYTICS_OWNER_ACCOUNT_ID);
function summarizeEvents(rows){
 const result={page_views:0,download_clicks:{windows:0,macos:0,linux:0},served:{windows:0,macos:0,linux:0}};
 for(const row of rows){
  const type=String(row.type||''),platform=String(row.platform||''),n=Number(row.total);
  if(!Number.isFinite(n)||n<0)continue;
  if(type==='page_view')result.page_views+=n;
  if(platforms.includes(platform)){
   if(type==='download_click')result.download_clicks[platform]+=n;
   if(type==='download_served')result.served[platform]+=n;
  }
 }
 return result;
}
export async function readSiteEvents(env,days,fetcher=fetch){
 if(!env.CF_ANALYTICS_ACCOUNT_ID||!env.CF_ANALYTICS_READ_TOKEN)return {available:false,reason:'Cloudflare Analytics Engine read access is not configured'};
 if(!/^[a-f0-9]{32}$/.test(env.CF_ANALYTICS_ACCOUNT_ID))return {available:false,reason:'Invalid Cloudflare analytics account configuration'};
 // The Analytics Engine SQL API is distinct from the new general Analytics SQL API.
 const sql=`SELECT blob1 AS type, blob2 AS platform, SUM(double1) AS total FROM humperdinck_site_events WHERE timestamp >= NOW() - INTERVAL '${days}' DAY GROUP BY blob1, blob2 FORMAT JSON`;
 try{
  const response=await fetcher(`https://api.cloudflare.com/client/v4/accounts/${env.CF_ANALYTICS_ACCOUNT_ID}/analytics_engine/sql`,{
   method:'POST',headers:{Authorization:`Bearer ${env.CF_ANALYTICS_READ_TOKEN}`,'Content-Type':'text/plain'},
   body:sql,signal:AbortSignal.timeout(6000)});
  if(!response.ok)return {available:false,reason:'Cloudflare analytics query failed'};
  const data=await response.json();
  if(!Array.isArray(data.data))return {available:false,reason:'Cloudflare analytics response unavailable'};
  return {available:true,...summarizeEvents(data.data)};
 }catch{return {available:false,reason:'Cloudflare analytics temporarily unavailable'};}
}
export async function readGithubDownloads(fetcher=fetch,env={}){
 try{
  const url='https://api.github.com/repos/blarkin13/humperdinck-downloads/releases?per_page=100';
  // Unauthenticated GitHub API calls share a per-IP limit, and Cloudflare's
  // outbound IPs are shared, so an optional read-only token avoids 403s.
  const headers={Accept:'application/vnd.github+json','User-Agent':'Humperdinck-Owner-Analytics'};
  if(env.GITHUB_DOWNLOADS_TOKEN)headers.Authorization=`Bearer ${env.GITHUB_DOWNLOADS_TOKEN}`;
  const response=await fetcher(url,{headers,signal:AbortSignal.timeout(6000)});
  if(!response.ok)return {available:false,reason:`GitHub release counts are unavailable (HTTP ${response.status}${response.status===403||response.status===429?', rate limited; set GITHUB_DOWNLOADS_TOKEN':''})`};
  const releases=await response.json();
  if(!Array.isArray(releases))return {available:false,reason:'Invalid GitHub release data'};
  const counts={windows:0,macos:0,linux:0},assets=[];
  for(const release of releases){
   if(release.draft||release.prerelease||release.tag_name==='voices')continue;
   for(const item of release.assets||[]){
    const name=String(item.name||'');
    const platform=/\.exe$/i.test(name)?'windows':/\.dmg$/i.test(name)?'macos':/\.(deb|rpm|appimage)$/i.test(name)?'linux':null;
    if(!platform)continue;
    const count=Number(item.download_count);
    if(!Number.isSafeInteger(count)||count<0)continue;
    counts[platform]+=count;
    assets.push({name,platform,version:String(release.tag_name||''),count});
   }
  }
  return {available:true,counts,assets:assets.slice(0,40),scope:'Published GitHub release assets, first 100 releases, all time'};
 }catch{return {available:false,reason:'GitHub downloads temporarily unavailable'};}
}
export async function handleOwnerAnalytics(request,env,{user,fetcher=fetch}={}){
 if(request.method!=='GET')return json({error:'Method not allowed'},405);
 if(!user)return json({error:'Sign in required'},401);
 if(!isOwner(user,env))return json({error:'Not found'},404);
 const url=new URL(request.url);
 const days=Number(url.searchParams.get('days')||7);
 if(!daysAllowed.has(days)||!/^([137]|30)$/.test(String(url.searchParams.get('days')||7)))
  return json({error:'Invalid range'},400);
 const [events,github]=await Promise.all([readSiteEvents(env,days,fetcher),readGithubDownloads(fetcher,env)]);
 return json({days,events,github,notes:{
  unique_visitors:'Use Cloudflare Web Analytics for unique visitor estimates; anonymous page_view events are not unique users.',
  downloads:'GitHub release asset counters are cumulative; website button clicks do not establish completed downloads.',
  installation:'No installation-level tracking or personal voice data is collected.'}});
}

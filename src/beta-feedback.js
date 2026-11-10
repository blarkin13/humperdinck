// Private beta feedback. Feature-gated by BETA_FEEDBACK_ENABLED=1; no anonymous uploads.
// No third-party analytics, public image URLs, email dumps, or speaker recordings.
const j=(data,status=200)=>new Response(JSON.stringify(data),{status,headers:{
 'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store',
 'X-Content-Type-Options':'nosniff','Referrer-Policy':'no-referrer'}});
const fail=(status,error)=>j({error},status);
const now=()=>Math.floor(Date.now()/1000);
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const CATEGORIES=new Set(['bug','idea','experience']);
const PLATFORMS=new Set(['windows','macos','linux','browser','other']);
const STATUS=new Set(['open','investigating','fixed','closed']);
const AREAS=new Set(['installer','account','models','voices','narration','video','export','accessibility','other']);
const PNG=[137,80,78,71,13,10,26,10];
const MAX_IMAGE=2*1024*1024;
const headers={'Cache-Control':'no-store','X-Content-Type-Options':'nosniff',
 'Content-Security-Policy':"default-src 'none'; sandbox",'Referrer-Policy':'no-referrer'};
const owner=(user,env)=>Boolean(user&&user.kind==='web'&&env.ANALYTICS_OWNER_ACCOUNT_ID&&user.id===env.ANALYTICS_OWNER_ACCOUNT_ID);
const sameOrigin=request=>request.headers.get('Origin')===new URL(request.url).origin;
function clean(value,max=2000){return typeof value==='string'?value.trim().slice(0,max):'';}
async function bounded(request,limit){
 const reader=request.body?.getReader();
 if(!reader)throw new Error('Missing body');
 let total=0;const chunks=[];
 try{
  while(true){const {done,value}=await reader.read();if(done)break;
   total+=value.byteLength;
   if(total>limit){await reader.cancel();throw new Error('Body too large');}
   chunks.push(value);
  }
 }finally{reader.releaseLock();}
 const all=new Uint8Array(total);let offset=0;
 for(const chunk of chunks){all.set(chunk,offset);offset+=chunk.byteLength;}
 return all;
}
async function jsonBody(request,max=10000){
 const bytes=await bounded(request,max);
 return JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(bytes));
}
async function rowFor(db,id,user,isOwner){
 return db.prepare('SELECT id, user_id, category, platform, area, summary, details, status, created_at, updated_at FROM beta_reports WHERE id=? AND (user_id=? OR ?=1)')
 .bind(id,user.id,isOwner?1:0).first();
}
function publicRow(row){return {id:row.id,category:row.category,platform:row.platform,area:row.area,
 summary:row.summary,details:row.details,status:row.status,created_at:row.created_at,updated_at:row.updated_at};}
async function receivePNG(request){
 const length=Number(request.headers.get('Content-Length')||0);
 if(length>MAX_IMAGE)return {error:'Screenshot must be 2 MB or less'};
 if(request.headers.get('Content-Type')?.split(';')[0].trim()!=='image/png')return {error:'Only PNG screenshots are allowed'};
 let bytes;
 try{bytes=await bounded(request,MAX_IMAGE);}catch{return {error:'Screenshot must be 2 MB or less'};}
 const valid=bytes.length>=32&&PNG.every((n,i)=>bytes[i]===n);
 // PNG signature, IHDR type, positive bounded pixel dimensions and final IEND chunk.
 const type=bytes.length>=24&&new TextDecoder().decode(bytes.slice(12,16))==='IHDR';
 const view=new DataView(bytes.buffer,bytes.byteOffset,bytes.byteLength);
 const width=bytes.length>=24?view.getUint32(16):0,height=bytes.length>=24?view.getUint32(20):0;
 const end=bytes.length>=12&&new TextDecoder().decode(bytes.slice(-8,-4))==='IEND';
 if(!valid||!type||!width||!height||width>8000||height>8000||!end)
  return {error:'The file is not a supported PNG screenshot'};
 return {bytes,width,height};
}

export async function handleBetaFeedback(request,env,{session}={}){
 if(env.BETA_FEEDBACK_ENABLED!=='1')return fail(404,'Beta feedback is not enabled');
 if(!env.AUTH_DB||!env.BETA_SCREENSHOTS||typeof session!=='function')
  return fail(503,'Feedback storage is not configured');
 const path=new URL(request.url).pathname;
 const user=await session(request,env);
 if(!user||user.kind!=='web')return fail(401,'Sign in to submit beta feedback');
 const isOwner=owner(user,env);
 if(!['GET','POST','PATCH','DELETE'].includes(request.method))return fail(405,'Method not allowed');
 if(request.method!=='GET'&&!sameOrigin(request))return fail(403,'Invalid request origin');
 try{
  if(path==='/api/beta/reports'&&request.method==='POST'){
   const data=await jsonBody(request);
   if(!data||typeof data!=='object'||Array.isArray(data))return fail(400,'Invalid feedback');
   const category=clean(data.category,25),platform=clean(data.platform,25),area=clean(data.area,40);
   const summary=clean(data.summary,120),details=clean(data.details,2500);
   if(!CATEGORIES.has(category)||!PLATFORMS.has(platform)||!AREAS.has(area)
      ||summary.length<5||summary.length>120||details.length<10||details.length>2500
      ||data.privacyConfirmed!==true)return fail(400,'Complete the required fields and privacy confirmation');
   // Atomic limit of 5 reports per user/hour and 50 total, avoiding race-prone SELECT then INSERT.
   const id=crypto.randomUUID(),timestamp=now();
   const result=await env.AUTH_DB.prepare(
    'INSERT INTO beta_reports (id,user_id,category,platform,area,summary,details,status,created_at,updated_at) '+
    'SELECT ?,?,?,?,?,?,?,\'open\',?,? WHERE '+
    '(SELECT COUNT(*) FROM beta_reports WHERE user_id=? AND created_at>?)<5 AND '+
    '(SELECT COUNT(*) FROM beta_reports WHERE user_id=?)<50'
   ).bind(id,user.id,category,platform,area,summary,details,timestamp,timestamp,
     user.id,timestamp-3600,user.id).run();
   if(result.meta?.changes!==1)return fail(429,'Submission limit reached');
   return j({id,status:'open'},201);
  }
  if(path==='/api/beta/reports'&&request.method==='GET'){
   const rows=await env.AUTH_DB.prepare(
    'SELECT id,user_id,category,platform,area,summary,details,status,created_at,updated_at '+
    'FROM beta_reports WHERE user_id=? OR ?=1 ORDER BY created_at DESC LIMIT 100'
   ).bind(user.id,isOwner?1:0).all();
   return j({reports:(rows.results||[]).map(publicRow),isOwner});
  }
  const match=path.match(/^\/api\/beta\/reports\/([0-9a-f-]{36})(?:\/(screenshots)(?:\/([0-9a-f-]{36}))?)?$/i);
  if(!match||!UUID.test(match[1]))return fail(404,'Not found');
  const id=match[1],kind=match[2],imageId=match[3];
  const report=await rowFor(env.AUTH_DB,id,user,isOwner);
  if(!report)return fail(404,'Not found');
  if(!kind&&request.method==='GET'){
   const images=await env.AUTH_DB.prepare(
    'SELECT id,created_at,width,height FROM beta_screenshots WHERE report_id=? ORDER BY created_at ASC'
   ).bind(id).all();
   return j({report:publicRow(report),screenshots:images.results||[],isOwner});
  }
  if(!kind&&request.method==='DELETE'){
   // The submitter may remove their own report; the reviewer can also honor deletion.
   const imgs=await env.AUTH_DB.prepare('SELECT object_key FROM beta_screenshots WHERE report_id=?')
     .bind(id).all();
   for(const img of imgs.results||[])await env.BETA_SCREENSHOTS.delete(img.object_key);
   await env.AUTH_DB.prepare('DELETE FROM beta_screenshots WHERE report_id=?').bind(id).run();
   await env.AUTH_DB.prepare('DELETE FROM beta_reports WHERE id=?').bind(id).run();
   return j({deleted:true});
  }
  if(!kind&&request.method==='PATCH'&&isOwner){
   const data=await jsonBody(request,512),status=clean(data?.status,25);
   if(!STATUS.has(status))return fail(400,'Invalid status');
   await env.AUTH_DB.prepare('UPDATE beta_reports SET status=?,updated_at=? WHERE id=?')
    .bind(status,now(),id).run();
   return j({id,status});
  }
  if(kind==='screenshots'&&imageId&&request.method==='GET'&&UUID.test(imageId)){
   const picture=await env.AUTH_DB.prepare(
    'SELECT object_key FROM beta_screenshots WHERE id=? AND report_id=?'
   ).bind(imageId,id).first();
   if(!picture)return fail(404,'Screenshot not found');
   const object=await env.BETA_SCREENSHOTS.get(picture.object_key);
   if(!object)return fail(404,'Screenshot not found');
   return new Response(object.body,{status:200,headers:{...headers,'Content-Type':'image/png',
    'Content-Disposition':'inline; filename="beta-screenshot.png"'}});
  }
  if(kind==='screenshots'&&!imageId&&request.method==='POST'&&report.user_id===user.id){
   const image=await receivePNG(request);
   if(image.error)return fail(400,image.error);
   // All reports and screenshot IDs are random. Never use original filenames in object keys.
   const imageId=crypto.randomUUID(),key='beta/'+id+'/'+imageId+'.png';
   const result=await env.AUTH_DB.prepare(
    'INSERT INTO beta_screenshots (id,report_id,object_key,width,height,created_at) '+
    'SELECT ?,?,?,?,?,? WHERE (SELECT COUNT(*) FROM beta_screenshots WHERE report_id=?)<3'
   ).bind(imageId,id,key,image.width,image.height,now(),id).run();
   if(result.meta?.changes!==1)return fail(409,'Maximum three screenshots per report');
   try{await env.BETA_SCREENSHOTS.put(key,image.bytes,{httpMetadata:{contentType:'image/png'}});}
   catch{
    await env.AUTH_DB.prepare('DELETE FROM beta_screenshots WHERE id=?').bind(imageId).run();
    return fail(503,'Screenshot could not be stored');
   }
   return j({id:imageId},201);
  }
  return fail(405,'Not allowed');
 }catch(error){
  if(error instanceof SyntaxError||error.message==='Body too large'||error.message==='Missing body')
   return fail(400,'Invalid or oversized request');
  // No user-controlled text, filenames, SQL values or object keys in logs.
  return fail(503,'Feedback temporarily unavailable');
 }
}

export async function purgeOldBetaFeedback(env,{cutoff=now()-90*86400,limit=50}={}){
 // Scheduled purge is gated and bounded, so it never touches other D1 or R2 records.
 if(env.BETA_FEEDBACK_ENABLED!=='1'||!env.AUTH_DB||!env.BETA_SCREENSHOTS)
  return {deleted:0,skipped:true};
 const stale=await env.AUTH_DB.prepare(
   'SELECT id FROM beta_reports WHERE created_at<? ORDER BY created_at ASC LIMIT ?'
 ).bind(cutoff,Math.min(50,Math.max(1,limit))).all();
 let deleted=0;
 for(const report of stale.results||[]){
  const imgs=await env.AUTH_DB.prepare('SELECT object_key FROM beta_screenshots WHERE report_id=?')
    .bind(report.id).all();
  for(const img of imgs.results||[])await env.BETA_SCREENSHOTS.delete(img.object_key);
  await env.AUTH_DB.prepare('DELETE FROM beta_screenshots WHERE report_id=?').bind(report.id).run();
  const result=await env.AUTH_DB.prepare('DELETE FROM beta_reports WHERE id=? AND created_at<?')
    .bind(report.id,cutoff).run();
  if(result.meta?.changes===1)deleted++;
 }
 return {deleted,skipped:false};
}

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
// PNG files may contain comments, profile metadata, location text or other identifiers.
// Parse chunk framing and CRCs; retain only image-critical chunks, discarding all ancillary
// metadata. Never use the original upload's bytes or filename for private storage.
const PNG_CRC_TABLE=Uint32Array.from({length:256},(_,n)=>{
 let crc=n;for(let i=0;i<8;i++)crc=(crc&1)?(0xedb88320^(crc>>>1)):(crc>>>1);
 return crc>>>0;
});
function pngCRC(bytes,start,end){
 let crc=0xffffffff;
 for(let i=start;i<end;i++)crc=PNG_CRC_TABLE[(crc^bytes[i])&255]^(crc>>>8);
 return (crc^0xffffffff)>>>0;
}
function sanitizedPNG(bytes){
 if(bytes.length<45||!PNG.every((n,i)=>bytes[i]===n))throw Error('PNG signature');
 const view=new DataView(bytes.buffer,bytes.byteOffset,bytes.byteLength);
 const keep=[bytes.subarray(0,8)];let at=8,width=0,height=0,seenIHDR=false,seenIDAT=false,seenIEND=false;
 let idatDone=false,seenPLTE=false,seenTRNS=false,colorType=0,bitDepth=0;
 while(at<bytes.length){
  if(at+12>bytes.length)throw Error('Truncated PNG chunk');
  const len=view.getUint32(at),end=at+12+len;
  if(len>MAX_IMAGE||end>bytes.length)throw Error('Invalid PNG chunk length');
  const tag=String.fromCharCode(...bytes.subarray(at+4,at+8));
  if(!/^[A-Za-z]{4}$/.test(tag))throw Error('Invalid PNG chunk type');
  if(pngCRC(bytes,at+4,at+8+len)!==view.getUint32(at+8+len))throw Error('PNG checksum failure');
  const payload=at+8;
  if(!seenIHDR){
   if(tag!=='IHDR'||len!==13)throw Error('PNG must start with IHDR');
   width=view.getUint32(payload);height=view.getUint32(payload+4);
   bitDepth=bytes[payload+8];colorType=bytes[payload+9];
   const compatible=({0:[1,2,4,8,16],2:[8,16],3:[1,2,4,8],4:[8,16],6:[8,16]})[colorType];
   if(!width||!height||width>4096||height>4096||!compatible?.includes(bitDepth)
      ||bytes[payload+10]!==0||bytes[payload+11]!==0||bytes[payload+12]>1)
    throw Error('Unsupported PNG image dimensions or color');
   seenIHDR=true;keep.push(bytes.subarray(at,end));
  }else if(tag==='PLTE'){
   if(seenIDAT||seenPLTE||len%3!==0||len===0||len>768)throw Error('Invalid PNG palette');
   seenPLTE=true;keep.push(bytes.subarray(at,end));
  }else if(tag==='tRNS'){
   if(seenIDAT||seenTRNS||![0,2,3].includes(colorType))throw Error('Invalid PNG transparency');
   seenTRNS=true;keep.push(bytes.subarray(at,end));
  }else if(tag==='IDAT'){
   if(idatDone)throw Error('Separated PNG image chunks');
   seenIDAT=true;keep.push(bytes.subarray(at,end));
  }else if(tag==='IEND'){
   if(!seenIDAT||len!==0||end!==bytes.length)throw Error('Invalid PNG end');
   seenIEND=true;keep.push(bytes.subarray(at,end));
  }else if(tag[0]===tag[0].toUpperCase()){
   // Reject unknown critical features; ancillary metadata is discarded.
   throw Error('Unsupported critical PNG chunk');
  }
  if(tag!=='IDAT'&&seenIDAT)idatDone=true;
  at=end;
 }
 if(!seenIEND||(colorType===3&&!seenPLTE))throw Error('Incomplete PNG');
 const total=keep.reduce((n,c)=>n+c.byteLength,0),output=new Uint8Array(total);
 let offset=0;for(const chunk of keep){output.set(chunk,offset);offset+=chunk.byteLength;}
 return {bytes:output,width,height};
}
async function receivePNG(request){
 const length=Number(request.headers.get('Content-Length')||0);
 if(length>MAX_IMAGE)return {error:'Screenshot must be 2 MB or less'};
 if(request.headers.get('Content-Type')?.split(';')[0].trim()!=='image/png')
  return {error:'Only PNG screenshots are allowed'};
 let bytes;
 try{bytes=await bounded(request,MAX_IMAGE);}catch{return {error:'Screenshot must be 2 MB or less'};}
 try{return sanitizedPNG(bytes);}catch{return {error:'Invalid or unsupported PNG screenshot'};}
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
  // Invitation-only beta license grants: only the verified owner, never an
  // anonymous signup or a GitHub issue, can approve a 30-day trial.
  if(path==='/api/beta/admin/grants'){
   if(!isOwner||env.BETA_PRO_ENABLED!=='1')return fail(404,'Not found');
   if(request.method==='GET'){
    const rows=await env.AUTH_DB.prepare(
     'SELECT u.email, g.id, g.issued_at, g.expires_at, g.revoked_at '+
     'FROM beta_pro_grants g JOIN auth_users u ON u.id=g.user_id '+
     'ORDER BY g.created_at DESC LIMIT 100').all();
    return j({grants:rows.results||[]});
   }
   if(request.method==='POST'){
    const data=await jsonBody(request,512);
    const email=typeof data?.email==='string'?data.email.trim().toLowerCase():'';
    if(email.length>320||!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))
     return fail(400,'Enter an existing tester account email');
    const tester=await env.AUTH_DB.prepare(
     "SELECT u.id FROM auth_users u JOIN auth_identities i ON i.user_id=u.id "+
     "WHERE lower(u.email)=? AND i.provider='google' LIMIT 1").bind(email).first();
    if(!tester)return fail(404,'Tester must sign in with Google first');
    const issued=now(),expires=issued+30*86400,id=crypto.randomUUID();
    const row=await env.AUTH_DB.prepare(
     'INSERT INTO beta_pro_grants(id,user_id,issued_at,expires_at,revoked_at,created_at) '+
     'SELECT ?,?,?,?,?,? WHERE NOT EXISTS ('+
     'SELECT 1 FROM beta_pro_grants WHERE user_id=? AND revoked_at IS NULL AND expires_at>?)'
    ).bind(id,tester.id,issued,expires,null,issued,tester.id,issued).run();
    if(row.meta?.changes!==1)return fail(409,'Tester already has active beta Pro access');
    return j({id,issued_at:issued,expires_at:expires,temporary:true},201);
   }
   return fail(405,'Method not allowed');
  }
  const grantRevoke=path.match(/^\/api\/beta\/admin\/grants\/([0-9a-f-]{36})\/revoke$/i);
  if(grantRevoke){
   if(!isOwner||env.BETA_PRO_ENABLED!=='1')return fail(404,'Not found');
   if(request.method!=='POST'||!UUID.test(grantRevoke[1]))return fail(405,'Method not allowed');
   const result=await env.AUTH_DB.prepare(
    'UPDATE beta_pro_grants SET revoked_at=? WHERE id=? AND revoked_at IS NULL'
   ).bind(now(),grantRevoke[1]).run();
   if(result.meta?.changes!==1)return fail(404,'Grant not found or already revoked');
   return j({revoked:true,warning:'Issued offline beta certificates remain usable until their signed expiry'});
  }
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
 if(!env.AUTH_DB||!env.BETA_SCREENSHOTS)
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

// Unlike paid licenses, beta entitlements have no purchase/receipt record to retain.
// Retain their minimal grant/revocation metadata for 90 days after expiration.
export async function purgeOldBetaGrants(env,{cutoff=now()-90*86400}={}){
 if(!env.AUTH_DB)return {deleted:0,skipped:true};
 const result=await env.AUTH_DB.prepare(
  'DELETE FROM beta_pro_grants WHERE expires_at<? AND (revoked_at IS NULL OR revoked_at<?)'
 ).bind(cutoff,cutoff).run();
 return {deleted:result.meta?.changes||0,skipped:false};
}

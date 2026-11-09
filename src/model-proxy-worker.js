import {recordAnalyticsEvent, handleAnalyticsEvent} from './site-analytics.js';
import {handleAccount,accountSession} from './account-auth.js';
import {handleLemonTest} from './lemon-test-commerce.js';
import {isReservedProductionCommercePath,handleUnreleasedProductionCommerce} from './live-commerce-release-gate.js';
import {publicRelease} from './public-releases.js';
import {handleNativeModel,ROUTE as NATIVE_MODEL_ROUTE} from './native-model-mirror.js';
// Model files only: browser synthesis remains local; this Worker performs no inference.
// Restrict paths to the single public model to prevent an arbitrary URL proxy.
const PREFIX='/model/onnx-community/Kokoro-82M-v1.0-ONNX/resolve/main/';
const UPSTREAM='https://huggingface.co/onnx-community/Kokoro-82M-v1.0-ONNX/resolve/main/';
const safeFile=(path)=>path.length>0&&path.length<240&&path.split('/').every(part=>/^[a-zA-Z0-9._-]+$/.test(part)&&part!=='.'&&part!=='..');
export default {
 async fetch(request,env,ctx){
  const url=new URL(request.url);
  // Deny-first: no environment flag, secret, checkout callback or static fallback
  // can accidentally expose a live production-commerce endpoint.
  if(isReservedProductionCommercePath(url.pathname))return handleUnreleasedProductionCommerce(request);
  if(url.pathname.startsWith('/api/account/'))return handleAccount(request,env);
  if(url.pathname.startsWith('/api/commerce/test/'))return handleLemonTest(request,env,{session:accountSession});
  if(url.pathname==='/analytics/event')return handleAnalyticsEvent(request,env);
  if(url.pathname.startsWith(NATIVE_MODEL_ROUTE))return handleNativeModel(request,env,ctx);
  if(url.pathname==='/downloads.json'||url.pathname==='/updates/latest.json'){
    return publicRelease(request,env);
  }
  if(url.pathname==='/voices/latest.json'||url.pathname==='/voices/pack.zip'||url.pathname==='/voices/catalog.json'||/^\/voices\/catalog-[0-9a-f]{32}\.wav$/.test(url.pathname)){
   // Built-In Humperdinck Voices: only these two files of the public downloads
   // repository's `voices` release, never an arbitrary URL.
   if(!['GET','HEAD'].includes(request.method))return new Response('Method not allowed',{status:405});
   const name=url.pathname.slice('/voices/'.length);
   const upstream=await fetch('https://github.com/blarkin13/humperdinck-downloads/releases/download/voices/'+name,
    {redirect:'follow',cf:{cacheTtl:300,cacheEverything:true}});
   if(!upstream.ok)return new Response('Built-in voices have not been published',{status:404,headers:{'Cache-Control':'no-store'}});
   return new Response(request.method==='HEAD'?null:upstream.body,{status:200,headers:{
    'Content-Type':name.endsWith('.json')?'application/json; charset=utf-8':name.endsWith('.wav')?'audio/wav':'application/zip',
    'Cache-Control':'public, max-age=300','X-Content-Type-Options':'nosniff'}});
  }
  if(url.pathname.startsWith('/downloads/')){
   // Static installers live in a private Cloudflare R2 bucket, streamed through
   // Humperdinck's own domain. No GitHub redirect or Worker bundle upload.
   if(!['GET','HEAD'].includes(request.method))return new Response('Method not allowed',{status:405});
   const name=url.pathname.slice('/downloads/'.length);
   if(!/^[a-zA-Z0-9][a-zA-Z0-9._-]{1,180}\\.(?:exe|dmg|deb)$/.test(name))return new Response('Invalid installer path',{status:400});
   if(!env.INSTALLER_BUCKET)return new Response('Installers have not been published',{status:503,headers:{'Cache-Control':'no-store'}});
   const file=await env.INSTALLER_BUCKET.get(name);
   if(!file)return new Response('Installer not found',{status:404,headers:{'Cache-Control':'no-store'}});
   const headers=new Headers();
   headers.set('Content-Type',name.endsWith('.exe')?'application/vnd.microsoft.portable-executable':name.endsWith('.dmg')?'application/x-apple-diskimage':'application/vnd.debian.binary-package');
   headers.set('Content-Disposition','attachment; filename="'+name+'"');
   headers.set('Content-Length',String(file.size));
   headers.set('Cache-Control','public, max-age=3600');
   headers.set('ETag',file.httpEtag);
   if(request.method==='GET')recordAnalyticsEvent(env,'download_served',name.endsWith('.exe')?'windows':name.endsWith('.dmg')?'macos':'linux','r2');
   return new Response(request.method==='HEAD'?null:file.body,{status:200,headers});
  }
  if(!url.pathname.startsWith(PREFIX))return env.ASSETS.fetch(request);
  const file=url.pathname.slice(PREFIX.length);
  if(!safeFile(file)||!['GET','HEAD'].includes(request.method))return new Response('Invalid model request',{status:400});
  // No arbitrary query parameters, credentials, or user-controlled upstream hosts.
  const upstream=new URL(file,UPSTREAM);
  const cacheKey=new Request(new URL(url.pathname,url.origin).href,{method:'GET'});
  const cache=caches.default;
  if(request.method==='GET'){
   const hit=await cache.match(cacheKey);
   if(hit)return hit;
  }
  try{
   const response=await fetch(upstream.href,{
    method:request.method,
    redirect:'follow',
    headers:{'User-Agent':'Humperdinck-Model-Proxy/1.0'}
   });
   if(!response.ok){
    return new Response('Model upstream returned HTTP '+response.status,{
     status:response.status>=400&&response.status<500?response.status:502,
     headers:{'Cache-Control':'no-store','Content-Type':'text/plain; charset=utf-8'}
    });
   }
   const headers=new Headers();
   headers.set('Content-Type',response.headers.get('Content-Type')|| (file.endsWith('.onnx')?'application/octet-stream':'application/json'));
   headers.set('Cache-Control','public, max-age=86400');
   const length=response.headers.get('Content-Length');
   if(length)headers.set('Content-Length',length);
   // No Access-Control-Allow-Origin required: the browser fetches this endpoint same-origin.
   const result=new Response(request.method==='HEAD'?null:response.body,{status:200,headers});
   if(request.method==='GET')ctx.waitUntil(cache.put(cacheKey,result.clone()).catch(()=>{}));
   return result;
  }catch(error){
   return new Response('Model upstream could not be reached',{status:502,headers:{'Cache-Control':'no-store','Content-Type':'text/plain; charset=utf-8'}});
  }
 }
};

/* Humperdinck-hosted copies of the desktop Kokoro model files (R2 bucket
 * humperdinck-models). Fixed allowlist only; never an arbitrary key.
 * Wrangler uploads at most 300 MiB per object, so the 310 MiB model is
 * stored as ordered parts and streamed back as one file. The desktop app
 * verifies the complete file's pinned SHA-256 before using it.
 */
const PREFIX='kokoro/model-files-v1.1/';
export const FILES={
 'kokoro-v1.0.onnx':{size:325505369,parts:['kokoro-v1.0.onnx.part-aa','kokoro-v1.0.onnx.part-ab']},
 'voices-v1.0.bin':{size:28214398,parts:['voices-v1.0.bin']},
};
export const ROUTE='/native-models/kokoro/';

export async function handleNativeModel(request,env,ctx){
 if(!['GET','HEAD'].includes(request.method))return new Response('Method not allowed',{status:405});
 const name=new URL(request.url).pathname.slice(ROUTE.length);
 const entry=Object.hasOwn(FILES,name)?FILES[name]:null;
 if(!entry)return new Response('Unknown model file',{status:404,headers:{'Cache-Control':'no-store'}});
 if(!env.MODEL_BUCKET)return new Response('Model mirror is not configured',{status:503,headers:{'Cache-Control':'no-store'}});
 const headers=new Headers({'Content-Type':'application/octet-stream','Content-Length':String(entry.size),
  'Cache-Control':'public, max-age=86400','X-Content-Type-Options':'nosniff'});
 if(request.method==='HEAD')return new Response(null,{status:200,headers});
 // Open every part before answering so a missing part is a clean 503, not a truncated 200.
 const objects=[];
 for(const key of entry.parts){
  const object=await env.MODEL_BUCKET.get(PREFIX+key);
  if(!object)return new Response('Model mirror is incomplete',{status:503,headers:{'Cache-Control':'no-store'}});
  objects.push(object);
 }
 if(objects.reduce((n,o)=>n+o.size,0)!==entry.size)
  return new Response('Model mirror size mismatch',{status:503,headers:{'Cache-Control':'no-store'}});
 if(objects.length===1)return new Response(objects[0].body,{status:200,headers});
 // FixedLengthStream keeps Content-Length; waitUntil keeps the copy running
 // after the response is returned (without it the stream was cut at ~128 MB).
 const {readable,writable}=typeof FixedLengthStream==='function'?new FixedLengthStream(entry.size):new TransformStream();
 const pump=(async()=>{
  try{
   for(const object of objects)await object.body.pipeTo(writable,{preventClose:true});
   await writable.close();
  }catch(error){await writable.abort(error).catch(()=>{})}
 })();
 ctx?.waitUntil?.(pump);
 return new Response(readable,{status:200,headers});
}

/* Bounded JSON parsing for all security-sensitive account and license routes.
 * Content-Length is untrusted/optional, so enforce the cap while reading.
 * A missing or invalid body yields an empty object for existing route validators.
 */
export async function limitedJson(request,maxBytes=4096){
 const type=request.headers.get('Content-Type')||'';
 if(!/^application\/json(?:\s*;\s*charset\s*=\s*utf-8)?\s*$/i.test(type))return {};
 const advertised=Number(request.headers.get('Content-Length'));
 if(Number.isFinite(advertised)&&advertised>maxBytes)return {};
 const reader=request.body?.getReader();
 if(!reader)return {};
 let count=0;
 const chunks=[];
 try{
  while(true){
   const {done,value}=await reader.read();
   if(done)break;
   if(!(value instanceof Uint8Array))return {};
   count+=value.byteLength;
   if(count>maxBytes){
    await reader.cancel().catch(()=>{});
    return {};
   }
   chunks.push(value);
  }
  const data=new Uint8Array(count);
  let offset=0;
  for(const chunk of chunks){data.set(chunk,offset);offset+=chunk.length}
  const parsed=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(data));
  return parsed&&typeof parsed==='object'&&!Array.isArray(parsed)?parsed:{};
 }catch{return {}}
 finally{try{reader.releaseLock()}catch{}}
}

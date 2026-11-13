/* Bounded MIME text extraction for the private support inbox.
 * Text-only preview: HTML is never executed, remote images are never loaded.
 * The untouched MIME is separately retained in private R2 for downloads.
 */
const MAX_PREVIEW=20000;
const LATIN='latin1';
const decoder=(charset)=>{try{return new TextDecoder(charset||'utf-8',{fatal:false});}catch{return new TextDecoder('utf-8')}};
const oneLine=s=>String(s||'').replace(/[\r\n\u0000-\u001f\u007f]+/g,' ').trim();
function splitHeader(raw){
 const match=/\r?\n\r?\n/.exec(raw);
 return match?{headers:raw.slice(0,match.index),body:raw.slice(match.index+match[0].length)}:{headers:'',body:raw};
}
function headers(text){
 const values=new Map();let last='';
 for(const line of text.split(/\r?\n/)){
  if(/^[ \t]/.test(line)&&last){values.set(last,(values.get(last)||'')+' '+line.trim());continue;}
  const idx=line.indexOf(':');if(idx<1)continue;
  last=line.slice(0,idx).toLowerCase().trim();values.set(last,line.slice(idx+1).trim());
 }
 return values;
}
function transferDecode(value,encoding,charset){
 let bytes;
 try{
  if(encoding==='base64'){
   const binary=atob(value.replace(/\s/g,''));
   bytes=Uint8Array.from(binary,c=>c.charCodeAt(0));
  }else if(encoding==='quoted-printable'){
   const raw=value.replace(/=\r?\n/g,'');const buf=[];
   for(let i=0;i<raw.length;i++){
    if(raw[i]==='='&&/^[0-9a-fA-F]{2}$/.test(raw.slice(i+1,i+3))){
     buf.push(parseInt(raw.slice(i+1,i+3),16));i+=2;
    }else buf.push(raw.charCodeAt(i)&255);
   }
   bytes=new Uint8Array(buf);
  }else bytes=Uint8Array.from(value,c=>c.charCodeAt(0)&255);
  return decoder(charset).decode(bytes);
 }catch{return '[Message preview unavailable; open the original email in Gmail.]';}
}
function escapeHtmlBody(s){
 return s.replace(/<\s*(script|style|head|svg|iframe)\b[^>]*>[\s\S]*?<\s*\/\s*\1\s*>/gi,' ')
  .replace(/<\s*br\s*\/?\s*>/gi,'\n').replace(/<\s*\/(p|div|li)\s*>/gi,'\n')
  .replace(/<[^>]*>/g,' ').replace(/&(?:nbsp|amp|lt|gt|quot|#39|#x27);/gi,x=>({'&nbsp;':' ','&amp;':'&','&lt;':'<','&gt;':'>','&quot;':'"','&#39;':"'",'&#x27;':"'"}[x.toLowerCase()]||x));
}
function extract(raw,depth=0){
 if(depth>4)return '';
 const part=splitHeader(raw),h=headers(part.headers);
 const type=(h.get('content-type')||'text/plain'),kind=type.split(';')[0].trim().toLowerCase();
 const boundary=type.match(/boundary\s*=\s*(?:"([^"]+)"|([^;\s]+))/i)?.slice(1).find(Boolean);
 if(kind.startsWith('multipart/')&&boundary&&boundary.length<160){
  const delimiter='--'+boundary;
  const children=part.body.split(delimiter).slice(1).filter(x=>!x.startsWith('--'));
  let html='';
  for(const child of children.slice(0,30)){
   const partText=extract(child.replace(/^\r?\n/,''),depth+1);
   if(partText&&partText!=='[html-only]')return partText;
   if(partText==='[html-only]')html=partText;
  }
  return html||'';
 }
 const disposition=(h.get('content-disposition')||'').toLowerCase();
 if(disposition.includes('attachment')||/\bname\s*=/.test(type))return '';
 if(kind!=='text/plain'&&kind!=='text/html')return '';
 const charset=type.match(/charset\s*=\s*"?([^;"\s]+)/i)?.[1]||'utf-8';
 const decoded=transferDecode(part.body,(h.get('content-transfer-encoding')||'').toLowerCase(),charset);
 return kind==='text/html'?escapeHtmlBody(decoded):decoded;
}
export function mimeText(bytes){
 if(!(bytes instanceof Uint8Array))throw TypeError('Expected MIME byte array');
 const raw=new TextDecoder(LATIN).decode(bytes);
 const value=extract(raw);
 return (value||'[No plain-text preview. Download the original email to view attachments.]')
  .replace(/\r\n/g,'\n').replace(/\u0000/g,'').slice(0,MAX_PREVIEW);
}
export const safeMailHeader=oneLine;

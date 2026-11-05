// Shared section editing helpers for local and browser Narration Studio.
// The 500-character limit is applied per section (Unicode code points).
export const SECTION_LIMIT=500;
let nextSectionId=1000;
export const makeSection=(text='',voice_key='')=>({id:++nextSectionId,text,voice_key});
const length=text=>Array.from(text).length;
export function splitNarration(text,max=SECTION_LIMIT){
 const remaining=Array.from(text||'');
 const parts=[];
 while(remaining.length>max){
  // Prefer complete sentences, then newlines, then word boundaries.
  const window=remaining.slice(0,max).join('');
  let cut=0;
  const lookback=Math.floor(max*.55);
  for(const pattern of [/[.!?][\u201d\u2019"'\)]*\s+/gu,/\n+/gu,/\s+/gu]){
   for(const match of window.matchAll(pattern)){
    const end=Array.from(window.slice(0,match.index+match[0].length)).length;
    if(end>=lookback&&end<=max)cut=end;
   }
   if(cut)break;
  }
  if(!cut)cut=max;
  const part=remaining.splice(0,cut).join('').trim();
  if(part)parts.push(part);
 }
 const tail=remaining.join('').trim();
 if(tail)parts.push(tail);
 return parts.length?parts:[''];
}
export function replaceSectionText(blocks,id,text,max=SECTION_LIMIT){
 const at=blocks.findIndex(b=>b.id===id);
 if(at<0)return blocks;
 const parts=length(text)>max?splitNarration(text,max):[text];
 const current=blocks[at];
 const changes=[{...current,text:parts[0]},...parts.slice(1).map(part=>makeSection(part,current.voice_key))];
 return [...blocks.slice(0,at),...changes,...blocks.slice(at+1)];
}
export function insertSection(blocks,index){
 // Insert after index, inheriting the speaker of the preceding section.
 const previous=blocks[index];
 return [...blocks.slice(0,index+1),makeSection('',previous?.voice_key||''),...blocks.slice(index+1)];
}

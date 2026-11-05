// Shared section editing helpers for local and browser Narration Studio.
// The 500-character limit is applied per section (Unicode code points).
export const SECTION_LIMIT=500;
let nextSectionId=1000;
export const makeSection=(text='',voice_key='')=>({id:++nextSectionId,text,voice_key,delay_after:0.3});
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

/**
 * Assign a speaker to one section. Sections created by a previous paste with no
 * speaker inherit it until the next explicitly assigned section. Never override
 * speakers already chosen for later dialogue.
 */
export function assignSectionSpeaker(blocks,id,voice_key){
 const index=blocks.findIndex(b=>b.id===id);
 if(index<0)return blocks;
 return blocks.map((block,i)=>{
  if(i===index)return {...block,voice_key};
  if(i>index&&blocks.slice(index+1,i+1).every(b=>!b.voice_key))return {...block,voice_key};
  return block;
 });
}

/** Reorder a section by stable ID, retaining its text, narrator and pause. */
export function moveSection(blocks,fromId,toId){
 const from=blocks.findIndex(b=>b.id===fromId);
 const to=blocks.findIndex(b=>b.id===toId);
 if(from<0||to<0||from===to)return blocks;
 const updated=[...blocks];
 const [moved]=updated.splice(from,1);
 updated.splice(to,0,moved);
 return updated;
}
export function sectionDelay(seconds){
 const value=Number(seconds);
 return Number.isFinite(value)?Math.min(30,Math.max(0,value)):0.3;
}

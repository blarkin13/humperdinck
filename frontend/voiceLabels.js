// Built-In and gallery Humperdinck voices are all American English. Sarah is
// the only female-presenting one; new voices can carry their own fields.
const FEMALE=new Set(['sarah']);
export function humperdinckVoiceLabel(voice){
 const name=String(voice?.name||voice?.filename||'').replace(/\.[a-z0-9]+$/i,'').trim().toLowerCase();
 const gender=voice?.gender||(FEMALE.has(name)?'female':'male');
 return (voice?.accent||'American English')+' · '+gender;
}

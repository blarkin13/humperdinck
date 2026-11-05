// Offline, transparent sound-cue suggestions. Never insert without user approval.
// Suggestions match storytelling terms to sounds already in the user's local library.
const THEMES=[
 {words:['storm','thunder','lightning','rumble'],sounds:['thunder','storm','lightning','rain']},
 {words:['rain','downpour','drizzle'],sounds:['rain','shower','storm','weather']},
 {words:['ocean','sea','ship','sail','wave','shore','harbor'],sounds:['ocean','wave','sea','water','ship','boat']},
 {words:['footstep','walk','steps','approach','running','ran','boots'],sounds:['step','foot','walking','boots','running']},
 {words:['door','knock','entered','opened','slam','creak'],sounds:['door','knock','creak','slam']},
 {words:['horse','gallop','hoof'],sounds:['horse','hoof','gallop']},
 {words:['fire','flame','burn','crackle'],sounds:['fire','crackle','flame']},
 {words:['sword','battle','fight','blade','clash'],sounds:['sword','metal','clash','battle']},
 {words:['wind','breeze','gust'],sounds:['wind','breeze','gust']},
 {words:['forest','birds','trees','jungle'],sounds:['forest','bird','nature','jungle']},
 {words:['crowd','applause','cheer','audience'],sounds:['crowd','applause','cheer','people']},
 {words:['clock','ticking','midnight','hour'],sounds:['clock','tick','chime']},
 {words:['explosion','blast','bomb','boom'],sounds:['explosion','blast','boom']},
 {words:['laugh','laughter','giggle'],sounds:['laugh','giggle','crowd']},
 {words:['cry','scream','screamed','shriek'],sounds:['scream','cry','shriek']},
];
const matched=(text,word)=>new RegExp('\\b'+word+'\\b','i').test(text);

export function suggestSoundEffects(text,library,max=3){
 const narration=String(text||'');
 if(!narration.trim()||!Array.isArray(library)||!library.length)return [];
 const results=[];
 for(const theme of THEMES){
  if(!theme.words.some(word=>matched(narration,word)))continue;
  const options=library.filter(sound=>{
   const haystack=((sound.name||'')+' '+(sound.category||'')).toLowerCase();
   return theme.sounds.some(word=>haystack.includes(word));
  });
  const best=options.sort((a,b)=>{
   const score=entry=>theme.sounds.reduce((n,word)=>n+(entry.name||'').toLowerCase().includes(word)?n+1:n,0);
   return score(b)-score(a);
  })[0];
  if(best&&!results.some(item=>item.id===best.id)){
   results.push({...best,reason:theme.words.filter(word=>matched(narration,word)).slice(0,2).join(', ')});
  }
  if(results.length>=max)break;
 }
 return results;
}

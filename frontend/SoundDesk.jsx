import React,{useEffect,useRef} from 'react';

// The sound desk evens out voices and shapes their tone. It is baked in when
// narration is generated or a video is exported; useDeskPreview lets the same
// settings be heard live on <audio> elements before that.
// Seven EQ bands, matching backend/audio_fx.py: a low shelf, five peaks, a high shelf.
export const BANDS=[[60,'60','Rumble'],[150,'150','Bass'],[400,'400','Body'],[1000,'1k','Mid'],[2500,'2.5k','Presence'],[6000,'6k','Clarity'],[12000,'12k','Air']];
const FLAT=[0,0,0,0,0,0,0];
export const DEFAULT_DESK={enabled:true,preset:'natural',level_match:true,cleanup:true,eq:FLAT,compress:'off'};
export const PRESETS={
 natural:{label:'Natural',eq:FLAT,compress:'off'},
 warm:{label:'Warm',eq:[2,3,1,0,-1,-2,-3],compress:'gentle'},
 bright:{label:'Bright',eq:[-1,-1,0,1,2,3,3],compress:'gentle'},
 podcast:{label:'Podcast',eq:[1,2,0,-1,2,2,1],compress:'gentle'},
 radio:{label:'Old radio',eq:[-12,-6,2,4,3,-4,-12],compress:'strong'},
 deep:{label:'Deep',eq:[4,5,2,0,-1,-1,-1],compress:'gentle'},
};
const COMPRESS=[['off','Off'],['gentle','Gentle'],['strong','Strong']];

// Desks saved before the 7-band EQ stored bass/presence/air (low/mid/high).
export function eqOf(desk){
 if(Array.isArray(desk?.eq)&&desk.eq.length===BANDS.length)return desk.eq.map(g=>Math.max(-12,Math.min(12,Number(g)||0)));
 const low=Number(desk?.low)||0,mid=Number(desk?.mid)||0,high=Number(desk?.high)||0;
 return [low,low,0,mid,mid,high,high];
}
export function deskSummary(desk){
 const d={...DEFAULT_DESK,...desk},eq=eqOf(d),p=PRESETS[d.preset];
 if(!d.enabled)return 'Bypassed';
 const custom=!p||p.eq.some((g,i)=>g!==eq[i])||p.compress!==d.compress;
 return [custom?'Custom EQ':p.label,d.level_match&&'Level match'].filter(Boolean).join(' · ');
}

// Route <audio>/<video> elements through Web Audio filters that mirror the desk.
// Section previews get only the desk's level match from the server; the
// live preview graph adds the tone, so it is not applied twice.
export function levelOnlyDesk(desk){
 const d={...DEFAULT_DESK,...desk};
 return {enabled:true,preset:d.preset,level_match:Boolean(d.enabled&&d.level_match),cleanup:false,eq:FLAT,compress:'off'};
}

export function useDeskPreview(desk){
 const graph=useRef(null);
 function build(){
  if(graph.current)return graph.current;
  const Ctx=window.AudioContext||window.webkitAudioContext;if(!Ctx)return null;
  const ctx=new Ctx(),hp=ctx.createBiquadFilter(),comp=ctx.createDynamicsCompressor(),out=ctx.createGain(),limit=ctx.createDynamicsCompressor();
  hp.type='highpass';
  const bands=BANDS.map(([freq],i)=>{const f=ctx.createBiquadFilter();f.type=i===0?'lowshelf':i===BANDS.length-1?'highshelf':'peaking';f.frequency.value=freq;if(f.type==='peaking')f.Q.value=1.2;return f});
  [hp,...bands,comp,out,limit].reduce((a,b)=>{a.connect(b);return b});limit.connect(ctx.destination);
  // A fast brick-wall stage so EQ boosts can never clip (clipping crackles).
  limit.threshold.value=-2;limit.knee.value=0;limit.ratio.value=20;limit.attack.value=.002;limit.release.value=.08;
  comp.knee.value=6;comp.attack.value=.01;comp.release.value=.15;
  graph.current={ctx,hp,bands,comp,out,sources:new WeakMap()};return graph.current;
 }
 function apply(g,d){
  d={...DEFAULT_DESK,...d};const on=d.enabled,t=g.ctx.currentTime,eq=eqOf(d);
  g.hp.frequency.setTargetAtTime(on&&d.cleanup?75:10,t,.02);
  g.bands.forEach((f,i)=>f.gain.setTargetAtTime(on?eq[i]:0,t,.02));
  const c=on?d.compress:'off';
  g.comp.threshold.setTargetAtTime(c==='strong'?-26:c==='gentle'?-20:0,t,.02);g.comp.ratio.setTargetAtTime(c==='strong'?4.5:c==='gentle'?2.5:1,t,.02);
  // Leave headroom for boosts instead of adding make-up gain.
  const boost=on?Math.max(0,...eq):0;
  g.out.gain.setTargetAtTime(Math.pow(10,-boost/2/20),t,.02);
 }
 useEffect(()=>{if(graph.current)apply(graph.current,desk)},[JSON.stringify(desk)]);
 useEffect(()=>()=>{graph.current?.ctx.close().catch(()=>{})},[]);
 // Connect an element once; gainDb is that element's own trim.
 return function connect(el,gainDb=0){
  if(!el)return;const g=build();if(!g)return;
  let s=g.sources.get(el);
  if(!s){try{const src=g.ctx.createMediaElementSource(el),gain=g.ctx.createGain();src.connect(gain);gain.connect(g.hp);s={gain};g.sources.set(el,s);apply(g,desk)}catch{return}}
  if(s.db!==gainDb){s.db=gainDb;s.gain.gain.setTargetAtTime(Math.pow(10,(gainDb||0)/20),g.ctx.currentTime,.02)}
  if(g.ctx.state==='suspended')g.ctx.resume().catch(()=>{});
 };
}

function DeskControls({d,set,onChange,note}){
 const eq=eqOf(d);
 const pick=key=>{const p=PRESETS[key];set({preset:key,eq:[...p.eq],compress:p.compress,enabled:true})};
 const setBand=(i,g)=>{const next=[...eq];next[i]=g;set({eq:next})};
 return <div className="sound-desk-body">
  <div className="sound-desk-row">
   <label className="sound-desk-switch"><input type="checkbox" checked={d.enabled} onChange={e=>set({enabled:e.target.checked})}/> Desk on</label>
   <button type="button" className="link sound-desk-reset" onClick={()=>onChange({...DEFAULT_DESK})}>Reset</button>
  </div>
  <div className="sound-desk-presets" role="radiogroup" aria-label="Tone preset">
   {Object.entries(PRESETS).map(([k,p])=><button type="button" key={k} role="radio" aria-checked={d.preset===k} className={d.preset===k?'on':''} onClick={()=>pick(k)}>{p.label}</button>)}
  </div>
  <div className="sound-desk-eq" role="group" aria-label="Seven-band equaliser">
   {BANDS.map(([freq,short,name],i)=><label key={freq} className="sound-desk-band" title={`${name} · ${short} Hz. Double-click to reset.`}>
    <span className="sound-desk-db">{eq[i]>0?'+':''}{eq[i]}</span>
    <input type="range" min="-12" max="12" step="1" value={eq[i]} aria-label={`${name} ${short} hertz`} onChange={e=>setBand(i,Number(e.target.value))} onDoubleClick={()=>setBand(i,0)}/>
    <span className="sound-desk-hz">{short}</span>
    <span className="sound-desk-name">{name}</span>
   </label>)}
  </div>
  <div className="sound-desk-side">
   <label className="sound-desk-check"><input type="checkbox" checked={d.level_match} onChange={e=>set({level_match:e.target.checked})}/><span><strong>Level match</strong><small>Every voice part comes out equally loud</small></span></label>
   <label className="sound-desk-check"><input type="checkbox" checked={d.cleanup} onChange={e=>set({cleanup:e.target.checked})}/><span><strong>Clean up rumble</strong><small>Removes low hum and boom</small></span></label>
   <div className="sound-desk-compress"><span>Even out loud and quiet words</span>
    <div className="vs-seg" role="radiogroup" aria-label="Compression">{COMPRESS.map(([k,l])=><button type="button" key={k} role="radio" aria-checked={d.compress===k} className={d.compress===k?'on':''} onClick={()=>set({compress:k})}>{l}</button>)}</div>
   </div>
  </div>
  {note&&<p className="hint">{note}</p>}
 </div>;
}

// `embedded` renders the controls only (inside another panel), with no
// collapsible header.
export default function SoundDesk({desk,onChange,open,onToggle,note,embedded}){
 const d={...DEFAULT_DESK,...desk};
 const set=patch=>onChange({...d,...patch});
 if(embedded)return <div className={'sound-desk embedded'+(d.enabled?'':' bypassed')}><DeskControls d={d} set={set} onChange={onChange} note={note}/></div>;
 return <div className={'sound-desk'+(open?' open':'')+(d.enabled?'':' bypassed')}>
  <button type="button" className="sound-desk-head" aria-expanded={open} onClick={onToggle}>
   <i className="fa-solid fa-sliders" aria-hidden="true"/><strong>Sound desk</strong><span className="sound-desk-summary">{deskSummary(d)}</span>
   <i className={'fa-solid fa-chevron-'+(open?'up':'down')+' sound-desk-chevron'} aria-hidden="true"/>
  </button>
  {open&&<DeskControls d={d} set={set} onChange={onChange} note={note}/>}
 </div>;
}

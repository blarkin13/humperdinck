import React,{useEffect,useRef,useState} from 'react';

// The sound desk evens out voices and shapes their tone. It is baked in when
// narration is generated or a video is exported; useDeskPreview lets the same
// settings be heard live on <audio> elements before that.
export const DEFAULT_DESK={enabled:true,preset:'natural',level_match:true,cleanup:true,low:0,mid:0,high:0,compress:'off'};
export const PRESETS={
 natural:{label:'Natural',low:0,mid:0,high:0,compress:'off'},
 warm:{label:'Warm',low:3,mid:-1,high:-2,compress:'gentle'},
 bright:{label:'Bright',low:-1,mid:1,high:4,compress:'gentle'},
 podcast:{label:'Podcast',low:2,mid:1,high:2,compress:'gentle'},
 radio:{label:'Old radio',low:-6,mid:4,high:1,compress:'strong'},
 deep:{label:'Deep',low:5,mid:-1,high:-1,compress:'gentle'},
};
const BANDS=[['low','Bass'],['mid','Presence'],['high','Air']];
const COMPRESS=[['off','Off'],['gentle','Gentle'],['strong','Strong']];

export function deskSummary(desk){
 const d={...DEFAULT_DESK,...desk};
 if(!d.enabled)return 'Bypassed';
 const custom=!PRESETS[d.preset]||BANDS.some(([k])=>PRESETS[d.preset][k]!==d[k])||PRESETS[d.preset].compress!==d.compress;
 return [custom?'Custom EQ':PRESETS[d.preset].label,d.level_match&&'Level match'].filter(Boolean).join(' · ');
}

// Route <audio>/<video> elements through Web Audio filters that mirror the desk.
export function useDeskPreview(desk){
 const graph=useRef(null);
 function build(){
  if(graph.current)return graph.current;
  const Ctx=window.AudioContext||window.webkitAudioContext;if(!Ctx)return null;
  const ctx=new Ctx(),hp=ctx.createBiquadFilter(),low=ctx.createBiquadFilter(),mid=ctx.createBiquadFilter(),high=ctx.createBiquadFilter(),comp=ctx.createDynamicsCompressor(),out=ctx.createGain(),limit=ctx.createDynamicsCompressor();
  hp.type='highpass';low.type='lowshelf';low.frequency.value=150;mid.type='peaking';mid.frequency.value=1800;mid.Q.value=1;high.type='highshelf';high.frequency.value=5500;
  hp.connect(low);low.connect(mid);mid.connect(high);high.connect(comp);comp.connect(out);out.connect(limit);limit.connect(ctx.destination);
  // A fast brick-wall stage so EQ boosts can never clip (clipping crackles).
  limit.threshold.value=-2;limit.knee.value=0;limit.ratio.value=20;limit.attack.value=.002;limit.release.value=.08;
  comp.knee.value=6;comp.attack.value=.01;comp.release.value=.15;
  graph.current={ctx,hp,low,mid,high,comp,out,sources:new WeakMap()};return graph.current;
 }
 function apply(g,d){
  d={...DEFAULT_DESK,...d};const on=d.enabled,t=g.ctx.currentTime;
  g.hp.frequency.setTargetAtTime(on&&d.cleanup?75:10,t,.02);
  g.low.gain.setTargetAtTime(on?d.low:0,t,.02);g.mid.gain.setTargetAtTime(on?d.mid:0,t,.02);g.high.gain.setTargetAtTime(on?d.high:0,t,.02);
  const c=on?d.compress:'off';
  g.comp.threshold.setTargetAtTime(c==='strong'?-26:c==='gentle'?-20:0,t,.02);g.comp.ratio.setTargetAtTime(c==='strong'?4.5:c==='gentle'?2.5:1,t,.02);
  // Leave headroom for boosts instead of adding make-up gain.
  const boost=on?Math.max(0,d.low,d.mid,d.high):0;
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

export default function SoundDesk({desk,onChange,open,onToggle,note}){
 const d={...DEFAULT_DESK,...desk};
 const set=patch=>onChange({...d,...patch});
 const pick=key=>{const p=PRESETS[key];set({preset:key,low:p.low,mid:p.mid,high:p.high,compress:p.compress,enabled:true})};
 return <div className={'sound-desk'+(open?' open':'')+(d.enabled?'':' bypassed')}>
  <button type="button" className="sound-desk-head" aria-expanded={open} onClick={onToggle}>
   <i className="fa-solid fa-sliders" aria-hidden="true"/><strong>Sound desk</strong><span className="sound-desk-summary">{deskSummary(d)}</span>
   <i className={'fa-solid fa-chevron-'+(open?'up':'down')+' sound-desk-chevron'} aria-hidden="true"/>
  </button>
  {open&&<div className="sound-desk-body">
   <div className="sound-desk-row">
    <label className="sound-desk-switch"><input type="checkbox" checked={d.enabled} onChange={e=>set({enabled:e.target.checked})}/> Desk on</label>
    <div className="sound-desk-presets" role="radiogroup" aria-label="Tone preset">
     {Object.entries(PRESETS).map(([k,p])=><button type="button" key={k} role="radio" aria-checked={d.preset===k} className={d.preset===k?'on':''} onClick={()=>pick(k)}>{p.label}</button>)}
    </div>
   </div>
   <div className="sound-desk-grid">
    <div className="sound-desk-eq" aria-label="Equaliser">
     {BANDS.map(([k,label])=><label key={k} className="sound-desk-band">
      <span className="sound-desk-db">{d[k]>0?'+':''}{d[k]} dB</span>
      <input type="range" min="-12" max="12" step="1" value={d[k]} aria-label={label} onChange={e=>set({[k]:Number(e.target.value)})} onDoubleClick={()=>set({[k]:0})}/>
      <span>{label}</span>
     </label>)}
    </div>
    <div className="sound-desk-side">
     <label className="sound-desk-check"><input type="checkbox" checked={d.level_match} onChange={e=>set({level_match:e.target.checked})}/><span><strong>Level match</strong><small>Every voice part comes out equally loud</small></span></label>
     <label className="sound-desk-check"><input type="checkbox" checked={d.cleanup} onChange={e=>set({cleanup:e.target.checked})}/><span><strong>Clean up rumble</strong><small>Removes low hum and boom</small></span></label>
     <div className="sound-desk-compress"><span>Even out loud and quiet words</span>
      <div className="vs-seg" role="radiogroup" aria-label="Compression">{COMPRESS.map(([k,l])=><button type="button" key={k} role="radio" aria-checked={d.compress===k} className={d.compress===k?'on':''} onClick={()=>set({compress:k})}>{l}</button>)}</div>
     </div>
     <button type="button" className="link sound-desk-reset" onClick={()=>onChange({...DEFAULT_DESK})}>Reset desk</button>
    </div>
   </div>
   {note&&<p className="hint">{note}</p>}
  </div>}
 </div>;
}

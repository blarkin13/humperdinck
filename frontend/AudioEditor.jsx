import React,{useEffect,useRef,useState} from 'react';

const blank={fade_in:0,fade_out:0,gain_db:0,speed:1,normalize:false,denoise:false,highpass:false,compress:false,trim_silence:false};
const fmt=t=>t.toFixed(2)+'s';

// Waveform editor: drag across the waveform to select, preview, then render a new file on the server.
// `source` is "output:<id>", "upload:<id>" or "sample:<id>"; edits never overwrite unless "Replace" is chosen.
export default function AudioEditor({src,source,onSaved,allowReplace,saveLabel='Save as new file'}){
 const canvas=useRef(null),ctx=useRef(null),player=useRef(null),drag=useRef(null);
 const [buffer,setBuffer]=useState(null),[sel,setSel]=useState(null),[opts,setOpts]=useState(blank),[busy,setBusy]=useState(false),[msg,setMsg]=useState(''),[head,setHead]=useState(0);
 useEffect(()=>{let live=true;setBuffer(null);setSel(null);
  (async()=>{try{const data=await (await fetch(src)).arrayBuffer();ctx.current=ctx.current||new AudioContext();const b=await ctx.current.decodeAudioData(data);if(live)setBuffer(b)}catch(e){if(live)setMsg('Could not load audio: '+e.message)}})();
  return()=>{live=false}},[src]);
 useEffect(()=>{draw()},[buffer,sel,head]);
 function draw(){const c=canvas.current;if(!c||!buffer)return;const w=c.width=c.clientWidth*devicePixelRatio,h=c.height=120*devicePixelRatio,g=c.getContext('2d'),d=buffer.getChannelData(0),step=Math.ceil(d.length/w);
  g.clearRect(0,0,w,h);if(sel){g.fillStyle='rgba(53,183,189,.22)';g.fillRect(sel[0]/buffer.duration*w,0,(sel[1]-sel[0])/buffer.duration*w,h)}
  g.fillStyle='#5fd0cc';for(let x=0;x<w;x++){let lo=1,hi=-1;for(let i=x*step;i<Math.min((x+1)*step,d.length);i++){const v=d[i];if(v<lo)lo=v;if(v>hi)hi=v}g.fillRect(x,(1-hi)*h/2,1,Math.max(1,(hi-lo)*h/2))}
  g.fillStyle='#fff';g.fillRect(head/buffer.duration*w,0,2,h)}
 const at=e=>{const r=canvas.current.getBoundingClientRect();return Math.max(0,Math.min(1,(e.clientX-r.left)/r.width))*buffer.duration};
 function down(e){if(!buffer)return;drag.current=at(e);setSel(null);setHead(drag.current)}
 function move(e){if(drag.current==null)return;const t=at(e);setSel([Math.min(drag.current,t),Math.max(drag.current,t)])}
 function up(){drag.current=null;setSel(s=>s&&s[1]-s[0]<0.05?null:s)}
 function play(){stop();const s=ctx.current.createBufferSource();s.buffer=buffer;s.connect(ctx.current.destination);const [a,b]=sel||[head,buffer.duration];s.start(0,a,b-a);const t0=ctx.current.currentTime;
  const tick=()=>{if(player.current!==s)return;const t=a+ctx.current.currentTime-t0;setHead(Math.min(t,b));if(t<b)requestAnimationFrame(tick)};player.current=s;s.onended=()=>{if(player.current===s)player.current=null};requestAnimationFrame(tick)}
 function stop(){if(player.current){const p=player.current;player.current=null;p.stop()}}
 const set=(k,v)=>setOpts(o=>({...o,[k]:v}));
 async function save(mode){setBusy(true);setMsg('Rendering...');
  try{const body={...opts,source,save_as:mode,start:sel?sel[0]:0,end:sel?sel[1]:null};const r=await fetch('/api/audio/edit',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});const j=await r.json();if(!r.ok)throw Error(typeof j.detail==='string'?j.detail:JSON.stringify(j.detail));
   setMsg(mode==='replace'?'Recording replaced.':'Saved.');setOpts(blank);setSel(null);onSaved&&onSaved(j)}catch(e){setMsg('Edit failed: '+e.message)}finally{setBusy(false)}}
 const toggles=[['trim_silence','Trim silence'],['highpass','Remove rumble'],['denoise','Reduce noise'],['compress','Even out levels'],['normalize','Normalize loudness']];
 return <div className="editor">
  <div className="editor-head"><strong>Audio editor</strong><small>{buffer?(sel?`Selection ${fmt(sel[0])} – ${fmt(sel[1])} (${fmt(sel[1]-sel[0])})`:`Length ${fmt(buffer.duration)} · drag on the waveform to select a range`):'Loading waveform...'}</small></div>
  <canvas ref={canvas} className="waveform" onMouseDown={down} onMouseMove={move} onMouseUp={up} onMouseLeave={up}/>
  <div className="actions tight"><button onClick={play} disabled={!buffer}>▶ Play{sel?' selection':''}</button><button onClick={stop}>■ Stop</button>{sel&&<button onClick={()=>setSel(null)}>Clear selection</button>}</div>
  <div className="editor-grid">
   <label>Fade in <span>{opts.fade_in}s</span><input type="range" min="0" max="3" step="0.1" value={opts.fade_in} onChange={e=>set('fade_in',+e.target.value)}/></label>
   <label>Fade out <span>{opts.fade_out}s</span><input type="range" min="0" max="3" step="0.1" value={opts.fade_out} onChange={e=>set('fade_out',+e.target.value)}/></label>
   <label>Gain <span>{opts.gain_db>0?'+':''}{opts.gain_db} dB</span><input type="range" min="-12" max="12" step="0.5" value={opts.gain_db} onChange={e=>set('gain_db',+e.target.value)}/></label>
   <label>Speed <span>{opts.speed.toFixed(2)}×</span><input type="range" min="0.75" max="1.5" step="0.05" value={opts.speed} onChange={e=>set('speed',+e.target.value)}/></label>
  </div>
  <div className="chips">{toggles.map(([k,l])=><label key={k} className="check"><input type="checkbox" checked={opts[k]} onChange={e=>set(k,e.target.checked)}/> {l}</label>)}</div>
  <p className="hint">{sel?'Only the selected range is kept. ':''}Edits create a new file; the original is kept unless you replace it.</p>
  <div className="actions tight"><button className="primary" disabled={busy||!buffer} onClick={()=>save('new')}>{saveLabel}</button>{allowReplace&&<button disabled={busy||!buffer} onClick={()=>confirm('Replace the original recording? This cannot be undone.')&&save('replace')}>Replace original</button>}<button disabled={busy} onClick={()=>{setOpts(blank);setSel(null)}}>Reset</button></div>
  {msg&&<small>{msg}</small>}
 </div>;
}

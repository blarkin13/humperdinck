import React,{useState} from 'react';
import VoiceGrid from './VoiceGrid.jsx';
import ThemePicker from './ThemePicker.jsx';
import './PublicStudio.css';

// Public presentation of the same UI, without connecting visitor actions to the
// private FastAPI server. No model download, synthesis, upload or account writes.
// Publicly available Kokoro-generated reference samples, hosted by Hangry Labs.
// These are recorded examples, not speech generated from visitor-entered text.
// Source and attribution: https://github.com/hangry-labs/kokoroTTS/tree/main/examples
const sampleHost='https://raw.githubusercontent.com/hangry-labs/kokoroTTS/main/examples/';
const sampleUrl=voice=>sampleHost+'kokorotts-'+voice+'.mp3';

const presetVoices=[
 ['af_heart','Heart','American English · female'],
 ['af_bella','Bella','American English · female'],
 ['af_nicole','Nicole','American English · female'],
 ['af_sarah','Sarah','American English · female'],
 ['am_adam','Adam','American English · male'],
 ['am_michael','Michael','American English · male'],
 ['am_onyx','Onyx','American English · male'],
 ['am_liam','Liam','American English · male'],
 ['bf_emma','Emma','British English · female'],
 ['bf_alice','Alice','British English · female'],
 ['bm_daniel','Daniel','British English · male'],
 ['bm_fable','Fable','British English · male']
];
const tabs=[['voices','Voice Library','fa-record-vinyl'],['creator','Voice Creator','fa-wand-magic-sparkles'],['narration','Narration Studio','fa-sliders'],['video','Video Studio','fa-film'],['models','Models','fa-microchip']];
const features=['Generate voice preview','Save voice','Upload reference audio','Generate narration','Render video','Install model','Download models'];
const download='/#download';

function DownloadGate({children,label='Available in the desktop app'}){
 return <div className="public-locked" aria-label={label}>
  <div className="public-locked-controls" aria-hidden="true">{children}</div>
  <div className="public-locked-overlay">
   <i className="fa-solid fa-lock" aria-hidden="true"/>
   <span>{label}</span>
   <a href={download}>Get the desktop app <i className="fa-solid fa-arrow-up-right-from-square" aria-hidden="true"/></a>
  </div>
 </div>;
}
function AvailableBadge(){return <span className="public-badge"><i className="fa-regular fa-eye" aria-hidden="true"/> BROWSER PREVIEW</span>}
const basicTraits=['Pitch','Rasp','Pace','Warmth','Age','Breathiness','Depth','Energy','Clarity','Expressiveness'];

export default function PublicStudio(){
 const [tab,setTab]=useState('voices');
 const [method,setMethod]=useState('controls');
 const [description,setDescription]=useState('');
 const [settings,setSettings]=useState(Object.fromEntries(basicTraits.map(x=>[x,50])));
 const [voiceName,setVoiceName]=useState('New voice');
 const [blocks,setBlocks]=useState([{id:1,text:'',voice:'af_heart'}]);
 const [exportFormat,setExportFormat]=useState('mp3');
 const [chosenVoice,setChosenVoice]=useState(null);
 const voices=presetVoices.map(([id,name,accent])=>({
  key:id,voiceKey:id,method:'preset',name,category:'Built-in · '+accent.split(' · ')[0],
  ready:true,status:'Sample available',summary:accent,
  traits:[accent],specs:[],sampleUrl:sampleUrl(id),onOpen:()=>setChosenVoice(id),
 }));
 const updateBlock=(id,k,value)=>setBlocks(previous=>previous.map(b=>b.id===id?{...b,[k]:value}:b));
 const selectedVoice=presetVoices.find(v=>v[0]===chosenVoice);
 return <main className="public-studio">
  <div className="public-banner"><i className="fa-solid fa-globe" aria-hidden="true"/> You're exploring the real Humperdinck interface. Voice generation, imports, saves and installs require the downloadable app.
   <a href={download}>Download information <i className="fa-solid fa-arrow-right" aria-hidden="true"/></a>
  </div>
  <header>
   <div className="brand">
    <img src="/studio/brand-modern.png" alt="" className="brand-mark brand-mark-modern"/>
    <img src="/studio/brand-mark.png" alt="" className="brand-mark brand-mark-vintage"/>
    <div><h1>Humperdinck</h1><small>A modern vintage recording studio</small></div>
   </div>
   <div className="header-actions"><AvailableBadge/><ThemePicker/><a className="public-return" href="/">Website <i className="fa-solid fa-arrow-up-right-from-square" aria-hidden="true"/></a></div>
  </header>
  <nav aria-label="Studio sections">{tabs.map(([id,label,icon])=><button type="button" key={id} className={tab===id?'active':''} onClick={()=>setTab(id)}><i className={'fa-solid '+icon} aria-hidden="true"/> {label}</button>)}</nav>
  {tab==='voices'&&<section>
   <div className="heading"><div><h2>Voice Library</h2><p>Play actual Kokoro voice samples here—no installation needed. To generate speech from your own text, install Humperdinck.</p></div><button className="primary" onClick={()=>setTab('creator')}><i className="fa-solid fa-plus" aria-hidden="true"/> New voice</button></div>
   {selectedVoice&&<div className="notice"><strong>{selectedVoice[1]}</strong> · {selectedVoice[2]} <span className="public-muted"> — Press Play on this voice's card to hear its Kokoro sample. Generating your own text requires the downloaded app.</span><button className="link" onClick={()=>setChosenVoice(null)}>Close</button></div>}
   <VoiceGrid items={voices} onCreate={()=>setTab('creator')} previewDisabled/>
   <p className="public-muted">Voice samples are externally hosted examples from <a href="https://github.com/hangry-labs/kokoroTTS/tree/main/examples" target="_blank" rel="noopener noreferrer">Hangry Labs KokoroTTS</a>. Playback needs an internet connection. Sample text is fixed; custom text-to-speech remains desktop-only.</p>
  </section>}
  {tab==='creator'&&<section>
   <div className="heading"><div><h2>Voice Creator</h2><p>Explore the voice designer. The sliders and text inputs work here; producing or saving audio needs the desktop app.</p></div><span className="tag">Design a voice</span></div>
   <div className="panel"><h3>Your voice</h3><div className="field"><label htmlFor="voice-name">Name</label><input id="voice-name" value={voiceName} onChange={e=>setVoiceName(e.target.value)} placeholder="New voice"/></div>
    <label htmlFor="method">Creation method</label><div className="toggle"><button className={method==='controls'?'active':''} onClick={()=>setMethod('controls')}>Sliders</button><button className={method==='prompt'?'active':''} onClick={()=>setMethod('prompt')}>Describe it</button><button disabled title="Requires desktop app">Upload audio <i className="fa-solid fa-lock" aria-hidden="true"/></button></div>
    {method==='controls'&&<div className="slider-grid">{basicTraits.map(k=><div key={k}><label htmlFor={'trait-'+k}>{k} <span>{settings[k]}</span></label><input id={'trait-'+k} type="range" min="0" max="100" value={settings[k]} onChange={e=>setSettings(old=>({...old,[k]:+e.target.value}))}/><div className="range-ends"><small>Low</small><small>High</small></div></div>)}</div>}
    <label htmlFor="voice-description">Voice description</label><textarea id="voice-description" value={description} onChange={e=>setDescription(e.target.value)} placeholder="An adult narrator with a warm, clear delivery..."/>
    <div className="actions"><button className="primary" disabled title="Requires the desktop app"><i className="fa-solid fa-lock" aria-hidden="true"/> Generate preview</button><button disabled title="Requires the desktop app">Save voice</button></div>
    <p className="public-muted"><i className="fa-solid fa-lock" aria-hidden="true"/> Audio generation, uploads and saving are available only after installing Humperdinck.</p>
   </div>
  </section>}
  {tab==='narration'&&<section>
   <div className="heading"><div><h2>Narration Studio</h2><p>Build a multi-voice script with the same controls as the desktop studio. Rendering audio needs installed models.</p></div><span className="tag">Single or multi-voice</span></div>
   {blocks.map((b,index)=><div className="script-block" key={b.id}><div className="block-head"><strong>Part {index+1}</strong><select aria-label={'Voice for part '+(index+1)} value={b.voice} onChange={e=>updateBlock(b.id,'voice',e.target.value)}>{presetVoices.map(v=><option value={v[0]} key={v[0]}>{v[1]} · {v[2]}</option>)}</select>{blocks.length>1&&<button onClick={()=>setBlocks(old=>old.filter(x=>x.id!==b.id))}>Remove</button>}</div><textarea aria-label={'Narration text part '+(index+1)} placeholder="Paste or type narration here..." value={b.text} onChange={e=>updateBlock(b.id,'text',e.target.value)}/></div>)}
   <div className="actions"><button onClick={()=>setBlocks(old=>[...old,{id:Date.now(),text:'',voice:old[old.length-1]?.voice||'af_heart'}])}>+ Add another voice / part</button><label className="inline">Export <select value={exportFormat} onChange={e=>setExportFormat(e.target.value)}><option value="mp3">MP3</option><option value="wav">WAV</option></select></label><button className="primary" disabled><i className="fa-solid fa-lock" aria-hidden="true"/> Generate Audio</button></div><p className="public-muted">The script is only in this browser session and is not uploaded or saved.</p>
  </section>}
  {tab==='video'&&<section><h2>Video Studio</h2><p>Use locally generated narration to create video voiceovers in the desktop application.</p>
   <div className="panel"><h3>Upload your video</h3><DownloadGate><div className="dropzone"><strong>Drop a video</strong><small>MP4, MOV, MKV or WEBM</small><span className="dropzone-cta">Drag a file here or click to browse</span></div></DownloadGate></div>
   <div className="panel"><h3>Narration track</h3><label>Start narration at (seconds)</label><input type="number" value="0" disabled/><label className="check"><input type="checkbox" disabled/> Mix with original video audio</label><button className="primary" disabled><i className="fa-solid fa-lock" aria-hidden="true"/> Render Video</button></div>
  </section>}
  {tab==='models'&&<section><div className="heading"><div><h2>Models</h2><p>Manage local AI models in the desktop app. Online visitors cannot install AI engines to Cloudflare.</p></div><span className="tag">Local models</span></div>
   {[['Kokoro ONNX','Fast built-in voice narration','CPU friendly voice presets'],['Piper','Lightweight voice presets','Individual voices installed locally'],['Qwen3-TTS','Voice design and cloning','Model weights and compatible hardware required']].map(([name,description,note])=><div className="panel" key={name}><div className="engine-head"><strong>{name}</strong><small>{description}</small><button disabled><i className="fa-solid fa-lock" aria-hidden="true"/> Install / Download</button></div><p className="public-muted">{note}</p></div>)}
  </section>}
  <div className="public-bottom-cta"><div><strong>Ready to make audio?</strong><p>The desktop app unlocks voice generation, audio upload, saving, model downloads, and rendering.</p></div><a href={download}>Get Humperdinck <i className="fa-solid fa-arrow-right" aria-hidden="true"/></a></div>
 </main>;
}

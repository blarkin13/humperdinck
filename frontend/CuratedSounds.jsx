import React,{useEffect,useRef,useState} from 'react';
import {useNotifications} from './Notifications.jsx';

/** A source-aware catalog. Do not show download links as playable audio. */
export default function CuratedSounds({api,onInstalled,expanded=false}){
 const {notify}=useNotifications();
 const [catalog,setCatalog]=useState([]),[loading,setLoading]=useState(true);
 const [working,setWorking]=useState('');
 const [target,setTarget]=useState(null);
 const chooser=useRef(null);
 async function refresh(){
  try{setCatalog(await api('sound-effects/curated'))}
  catch(err){notify(err.message,'error')}
  finally{setLoading(false)}
 }
 useEffect(()=>{refresh()},[]);
 async function installPublic(item){
  setWorking(item.slug);
  try{
   await api('sound-effects/curated/'+item.slug+'/install',{method:'POST'});
   notify('Installed '+item.name,'success');
   await refresh();await onInstalled?.();
  }catch(err){notify(err.message,'error')}
  finally{setWorking('')}
 }
 function selectFile(item){
  setTarget(item);chooser.current?.click();
 }
 async function importFile(file){
  if(!file||!target)return;
  setWorking(target.slug);
  const data=new FormData();data.append('file',file);
  try{
   await api('sound-effects/curated/'+target.slug+'/import',{method:'POST',body:data});
   notify('Imported '+target.name,'success');
   await refresh();await onInstalled?.();
  }catch(err){notify(err.message,'error')}
  finally{setWorking('');setTarget(null)}
 }
 const installed=catalog.filter(item=>item.installed).length;
 return <details className="curated-recordings" open={expanded?undefined:undefined} defaultOpen={expanded}>
  <summary><span><i className="fa-solid fa-leaf" aria-hidden="true"/> Real nature recordings · CC0 collection</span>
   <span className="curated-counter">{installed} / {catalog.length||10} installed <i className="fa-solid fa-chevron-down"/></span>
  </summary>
  <div className="curated-intro">
   <p>Ten selected genuine field recordings with verified CC0 sources. Original Freesound downloads require a free Freesound login; download from the source page, then import here. The Wikimedia water recording installs directly.</p>
   <input ref={chooser} hidden type="file" accept=".wav,.mp3,.flac,.m4a,.ogg,.aac,.webm" onChange={e=>{const file=e.target.files?.[0];e.target.value='';importFile(file)}}/>
  </div>
  <div className="curated-sound-list">
   {loading?<p className="hint">Loading verified source recordings…</p>:catalog.map(item=><div className="curated-sound-row" key={item.slug}>
    <div className="curated-sound-name"><strong>{item.name}</strong><small>{item.category} · {item.creator} · CC0</small></div>
    <div className="curated-sound-actions">
     <a href={item.source_url} target="_blank" rel="noopener noreferrer" title={'View source for '+item.name}>Source <i className="fa-solid fa-arrow-up-right-from-square"/></a>
     {item.installed?<span className="curated-installed"><i className="fa-solid fa-check"/> Installed</span>:
      <button type="button" disabled={!!working} onClick={()=>item.download_method==='direct'?installPublic(item):selectFile(item)}>
       <i className={'fa-solid '+(working===item.slug?'fa-spinner fa-spin':item.download_method==='direct'?'fa-download':'fa-file-import')}/>
       {working===item.slug?'Working…':item.download_method==='direct'?'Install':'Import file'}
      </button>}
    </div>
   </div>)}
  </div>
  <p className="curated-license">Recordings retain creator and source information. No synthetic sample replacements or lower-quality Freesound previews are bundled.</p>
 </details>;
}

import React,{useRef,useState} from 'react';

// Drop a file here or click to choose one. `accept` is a list like ".wav,.mp3".
export default function DropZone({accept,onFile,title,hint,disabled}){
 const input=useRef(null),[over,setOver]=useState(false);
 const allowed=accept.split(',').map(s=>s.trim().toLowerCase());
 function take(file){if(!file||disabled)return;const ext='.'+file.name.split('.').pop().toLowerCase();if(!allowed.includes(ext)){alert('Unsupported file type '+ext+'. Use '+allowed.join(', ').toUpperCase());return}onFile(file)}
 return <div role="button" tabIndex={0} className={'dropzone'+(over?' over':'')+(disabled?' disabled':'')}
  onClick={()=>!disabled&&input.current.click()} onKeyDown={e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();input.current.click()}}}
  onDragOver={e=>{e.preventDefault();setOver(true)}} onDragLeave={()=>setOver(false)}
  onDrop={e=>{e.preventDefault();setOver(false);take(e.dataTransfer.files[0])}}>
  <strong>{title}</strong><small>{hint}</small><span className="dropzone-cta">Drag a file here or click to browse</span>
  <input ref={input} type="file" accept={accept} hidden onChange={e=>{take(e.target.files[0]);e.target.value=''}}/>
 </div>;
}

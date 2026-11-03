import React,{useState} from 'react';

const LIMIT=6;

// Voice cards grouped by category, each group collapsed to LIMIT cards with a "Show more" toggle.
// items: [{key,name,category,subtitle,selected,onOpen,onDelete}]
export default function VoiceGrid({items}){
 const [open,setOpen]=useState({}),[query,setQuery]=useState('');
 const q=query.trim().toLowerCase();
 const shown=items.filter(v=>!q||v.name.toLowerCase().includes(q)||(v.category||'').toLowerCase().includes(q));
 const groups={};shown.forEach(v=>(groups[v.category||'Uncategorized']=groups[v.category||'Uncategorized']||[]).push(v));
 const names=Object.keys(groups).sort((a,b)=>a==='Uncategorized'?1:b==='Uncategorized'?-1:a.localeCompare(b));
 return <div className="library">
  {items.length>LIMIT&&<input className="search" placeholder="Search voices or categories" value={query} onChange={e=>setQuery(e.target.value)}/>}
  {!items.length&&<div className="notice">No voices yet. Create one below.</div>}
  {names.map(name=>{const list=groups[name],expanded=open[name]||!!q,visible=expanded?list:list.slice(0,LIMIT);
   return <div className="voice-group" key={name}>
    {names.length>1||name!=='Uncategorized'?<h4>{name} <small>{list.length}</small></h4>:null}
    <div className="voice-grid">{visible.map(v=><div key={v.key} className={'voice-card'+(v.selected?' selected':'')} role="button" tabIndex={0} onClick={v.onOpen} onKeyDown={e=>e.key==='Enter'&&v.onOpen()}>
     <button className="card-x" title={'Delete '+v.name} aria-label={'Delete '+v.name} onClick={e=>{e.stopPropagation();v.onDelete()}}>×</button>
     <strong>{v.name}</strong><small>{v.subtitle}</small></div>)}</div>
    {list.length>LIMIT&&!q&&<button className="link" onClick={()=>setOpen(o=>({...o,[name]:!expanded}))}>{expanded?'Show less':`Show ${list.length-LIMIT} more`}</button>}
   </div>})}
 </div>;
}

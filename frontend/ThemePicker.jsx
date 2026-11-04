import React,{useEffect,useState} from 'react';
import './themes.css';

const STORAGE_KEY='humperdinck-theme';
const THEMES=[
 {id:'vintage',name:'Vintage',subtitle:'Warm brass and midnight teal',icon:'fa-record-vinyl'},
 {id:'modern',name:'Modern',subtitle:'Airy, clean and understated',icon:'fa-layer-group'},
 {id:'ultra',name:'Ultra Modern',subtitle:'Pure black, white and graphite',icon:'fa-circle-half-stroke'},
];
const valid=new Set(THEMES.map(t=>t.id));

function initialTheme(){
 try {
  const stored=window.localStorage.getItem(STORAGE_KEY);
  return valid.has(stored)?stored:'vintage';
 }catch{return 'vintage'}
}
export default function ThemePicker(){
 const [theme,setTheme]=useState(initialTheme);
 const [open,setOpen]=useState(false);
 useEffect(()=>{
  document.documentElement.dataset.theme=theme;
  try{window.localStorage.setItem(STORAGE_KEY,theme)}catch{/* Preferences can be unavailable in private browsing. */}
 },[theme]);
 useEffect(()=>{
  if(!open)return;
  const onKey=e=>{if(e.key==='Escape')setOpen(false)};
  document.addEventListener('keydown',onKey);
  return ()=>document.removeEventListener('keydown',onKey);
 },[open]);
 const active=THEMES.find(t=>t.id===theme)||THEMES[0];
 return <div className="theme-picker">
  <button type="button" className="theme-trigger" aria-haspopup="true" aria-expanded={open}
   title="Change Humperdinck appearance" onClick={()=>setOpen(v=>!v)}>
   <i className="fa-solid fa-palette" aria-hidden="true"/>
   <span>{active.name}</span>
   <i className={'fa-solid '+(open?'fa-chevron-up':'fa-chevron-down')+' theme-chevron'} aria-hidden="true"/>
  </button>
  {open&&<div className="theme-popover" role="group" aria-label="Choose interface theme">
   <div className="theme-popover-heading">Studio appearance</div>
   <div className="theme-options">{THEMES.map(t=><button type="button" key={t.id}
    className={'theme-option '+(t.id===theme?'chosen':'')} aria-pressed={t.id===theme}
    onClick={()=>{setTheme(t.id);setOpen(false)}}>
    <span className={'theme-thumbnail theme-thumbnail-'+t.id} aria-hidden="true">
     <span className="theme-thumbnail-top"/><span className="theme-thumbnail-card"/><span className="theme-thumbnail-card second"/>
    </span>
    <span className="theme-option-text"><strong>{t.name}</strong><small>{t.subtitle}</small></span>
    {t.id===theme&&<i className="fa-solid fa-check theme-selected" aria-hidden="true"/>}
   </button>)}</div>
  </div>}
 </div>
}

import React,{useEffect,useState} from 'react';
import './themes.css';

const STORAGE_KEY='humperdinck-theme';
const MODE_KEY='humperdinck-color-mode';
const THEMES=[
 {id:'vintage',name:'Vintage',subtitle:'Warm brass and midnight teal',icon:'fa-record-vinyl'},
 {id:'modern',name:'Modern',subtitle:'Black, white and graphite',icon:'fa-circle-half-stroke'},
];
const valid=new Set(THEMES.map(t=>t.id));
const MODES=[{id:'dark',name:'Dark',icon:'fa-moon'},{id:'light',name:'Light',icon:'fa-sun'}];

function initialTheme(){
 try {
  const stored=window.localStorage.getItem(STORAGE_KEY);
  // Migrate installations using the former Ultra Modern theme.
  return stored==='ultra'?'modern':valid.has(stored)?stored:(import.meta.env.VITE_PUBLIC_STUDIO==='1'?'modern':'vintage');
 }catch{return import.meta.env.VITE_PUBLIC_STUDIO==='1'?'modern':'vintage'}
}
function initialMode(){
 try{return window.localStorage.getItem(MODE_KEY)==='light'?'light':'dark'}catch{return 'dark'}
}
export default function ThemePicker(){
 const [theme,setTheme]=useState(initialTheme);
 const [mode,setMode]=useState(initialMode);
 const [open,setOpen]=useState(false);
 useEffect(()=>{
  document.documentElement.dataset.theme=theme;
  document.documentElement.dataset.mode=mode;
  try{window.localStorage.setItem(STORAGE_KEY,theme);window.localStorage.setItem(MODE_KEY,mode)}catch{/* Preferences can be unavailable in private browsing. */}
 },[theme,mode]);
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
   <span>{active.name} · {mode==='light'?'Light':'Dark'}</span>
   <i className={'fa-solid '+(open?'fa-chevron-up':'fa-chevron-down')+' theme-chevron'} aria-hidden="true"/>
  </button>
  {open&&<div className="theme-popover" role="group" aria-label="Choose interface theme">
   <div className="theme-popover-heading">Studio appearance</div>
   <div className="theme-mode-options" role="group" aria-label="Color mode">{MODES.map(m=><button type="button" key={m.id} className={"theme-mode-option "+(mode===m.id?"chosen":"")} aria-pressed={mode===m.id} onClick={()=>setMode(m.id)}><i className={"fa-solid "+m.icon} aria-hidden="true"/>{m.name}</button>)}</div>
   <div className="theme-popover-subtitle">Theme style</div>
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

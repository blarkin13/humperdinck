import React,{createContext,useCallback,useContext,useEffect,useRef,useState} from 'react';
import './notifications.css';

const NotificationContext=createContext(null);
let nextId=1;

// Theme-aware transient messages and accessible confirmation/input dialogs.
// Destructive decisions use a dialog instead of an easy-to-miss toast.
export function NotificationProvider({children}){
 const [notices,setNotices]=useState([]);
 const [dialog,setDialog]=useState(null);
 const request=useRef(null);
 const timers=useRef(new Map());
 const notify=useCallback((message,type='info')=>{
  const id=nextId++;
  setNotices(previous=>[...previous.slice(-3),{id,message:String(message),type}]);
  const timer=setTimeout(()=>{
   setNotices(previous=>previous.filter(item=>item.id!==id));
   timers.current.delete(id);
  },type==='error'?7500:4500);
  timers.current.set(id,timer);
  return id;
 },[]);
 const dismiss=useCallback(id=>{
  clearTimeout(timers.current.get(id));
  timers.current.delete(id);
  setNotices(previous=>previous.filter(item=>item.id!==id));
 },[]);
 const ask=useCallback((message,{title='Please confirm',confirmLabel='Continue',danger=false,defaultValue=null}={})=>{
  if(request.current)return Promise.resolve(defaultValue===null?false:null);
  return new Promise(resolve=>{
   request.current=resolve;
   setDialog({title,message:String(message),confirmLabel,danger,defaultValue});
  });
 },[]);
 const finish=useCallback(value=>{
  request.current?.(value);
  request.current=null;
  setDialog(null);
 },[]);
 useEffect(()=>()=>{
  for(const timer of timers.current.values())clearTimeout(timer);
  timers.current.clear();
  request.current?.(false);
 },[]);
 useEffect(()=>{
  if(!dialog)return;
  const escape=e=>{if(e.key==='Escape'){e.preventDefault();finish(dialog.defaultValue===null?false:null)}};
  window.addEventListener('keydown',escape);
  return()=>window.removeEventListener('keydown',escape);
 },[dialog,finish]);
 const confirm=useCallback((message,options)=>ask(message,options),[ask]);
 const input=useCallback((message,initial='')=>ask(message,{title:'Name this voice',confirmLabel:'Save voice',defaultValue:initial}),[ask]);
 return <NotificationContext.Provider value={{notify,confirm,input}}>
  {children}
  <div className="toast-stack" role="region" aria-label="Notifications">
   {notices.map(n=><div className={'theme-toast toast-'+n.type} key={n.id} role={n.type==='error'?'alert':'status'}>
    <i className={'fa-solid '+(n.type==='error'?'fa-circle-exclamation':n.type==='success'?'fa-circle-check':'fa-circle-info')} aria-hidden="true"/>
    <span>{n.message}</span>
    <button type="button" onClick={()=>dismiss(n.id)} aria-label="Dismiss notification"><i className="fa-solid fa-xmark"/></button>
   </div>)}
  </div>
  {dialog&&<ConfirmDialog key={dialog.message} config={dialog} onDone={finish}/>}
 </NotificationContext.Provider>;
}
function ConfirmDialog({config,onDone}){
 const isInput=config.defaultValue!==null;
 const [value,setValue]=useState(config.defaultValue||'');
 const inputRef=useRef(null);
 const cancel=()=>onDone(isInput?null:false);
 useEffect(()=>{
  inputRef.current?.focus();
  const previous=document.activeElement;
  return()=>previous?.focus?.();
 },[]);
 function submit(e){e.preventDefault();onDone(isInput?value.trim():true)}
 return <div className="theme-dialog-overlay" onMouseDown={e=>{if(e.target===e.currentTarget)cancel()}}>
  <form className="theme-dialog" role="dialog" aria-modal="true" aria-labelledby="theme-dialog-heading" onSubmit={submit}>
   <h3 id="theme-dialog-heading">{config.title}</h3>
   <p>{config.message}</p>
   {isInput&&<input ref={inputRef} aria-label="Voice name" value={value} onChange={e=>setValue(e.target.value)} maxLength={120}/>}
   <div className="theme-dialog-actions">
    <button type="button" ref={!isInput?inputRef:undefined} onClick={cancel}>Cancel</button>
    <button className={config.danger?'danger':'primary'} type="submit" disabled={isInput&&!value.trim()}>{config.confirmLabel}</button>
   </div>
  </form>
 </div>;
}
export function useNotifications(){
 const context=useContext(NotificationContext);
 if(!context)throw new Error('Notifications must be used inside NotificationProvider');
 return context;
}

import {useEffect,useRef} from 'react';

const FOCUSABLE='a[href],button:not([disabled]),input:not([disabled]):not([type="hidden"]),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex="-1"])';

// Keyboard behaviour every modal dialog needs: focus moves into the dialog
// when it opens, Tab and Shift+Tab stay inside it, Escape can close it, and
// focus returns to whatever opened it when it closes.
export function useDialogFocus({onEscape=null,open=true}={}){
 const ref=useRef(null);
 const escape=useRef(onEscape);
 escape.current=onEscape;
 useEffect(()=>{
  const dialog=ref.current;
  if(!open||!dialog)return;
  const opener=document.activeElement;
  const items=()=>[...dialog.querySelectorAll(FOCUSABLE)].filter(el=>el.offsetParent!==null||el===document.activeElement);
  // Respect an autoFocus field inside the dialog; otherwise focus the first control.
  if(!dialog.contains(document.activeElement)){
   const first=items()[0];
   if(first)first.focus();else{dialog.tabIndex=-1;dialog.focus()}
  }
  const onKey=e=>{
   if(e.key==='Escape'&&escape.current){e.stopPropagation();escape.current();return}
   if(e.key!=='Tab')return;
   const list=items();
   if(!list.length){e.preventDefault();return}
   const first=list[0],last=list[list.length-1];
   if(e.shiftKey&&document.activeElement===first){e.preventDefault();last.focus()}
   else if(!e.shiftKey&&document.activeElement===last){e.preventDefault();first.focus()}
  };
  dialog.addEventListener('keydown',onKey);
  return ()=>{
   dialog.removeEventListener('keydown',onKey);
   if(opener&&typeof opener.focus==='function'&&document.contains(opener))opener.focus();
  };
 },[open]);
 return ref;
}

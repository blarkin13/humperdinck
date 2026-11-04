'use strict';
// Static website: actual Kokoro samples use browser-native audio elements.
// Account forms and hosted custom text-to-speech remain unavailable.
const year = document.getElementById('year');
if (year) year.textContent = String(new Date().getFullYear());

// Version endpoint is served with no-store. This makes stale or failed deployments observable.
fetch('/build.json',{cache:'no-store'}).then(r=>{if(!r.ok)throw Error('missing build');return r.json()}).then(v=>{const el=document.getElementById('build-revision');if(el)el.textContent='Build '+v.revision}).catch(()=>{const el=document.getElementById('build-revision');if(el)el.textContent='Build unavailable'});

'use strict';
// Static website: actual Kokoro samples use browser-native audio elements.
// Account forms and hosted custom text-to-speech remain unavailable.
const year = document.getElementById('year');
if (year) year.textContent = String(new Date().getFullYear());

// Version endpoint is served with no-store. This makes stale or failed deployments observable.
fetch('/build.json',{cache:'no-store'}).then(r=>{if(!r.ok)throw Error('missing build');return r.json()}).then(v=>{const el=document.getElementById('build-revision');if(el)el.textContent='Build '+v.revision}).catch(()=>{const el=document.getElementById('build-revision');if(el)el.textContent='Build unavailable'});

// Website-owned desktop download catalog. URLs point to published installer files,
// never to transient GitHub Actions artifacts. Missing files remain non-clickable.
const DOWNLOAD_FORMATS = {
  windows: /\.exe(?:\?.*)?$/i,
  macos: /\.dmg(?:\?.*)?$/i,
  linux: /\.deb(?:\?.*)?$/i
};
function publishedInstaller(entry, platform) {
  if (!entry || entry.published !== true || !entry.url || !entry.version) return false;
  try {
    const link = new URL(entry.url, window.location.origin);
    const firstParty = link.origin === window.location.origin &&
      /^\/downloads\/[a-zA-Z0-9._-]+$/.test(link.pathname);
    const officialRelease = link.origin === 'https://github.com' &&
      /^\/blarkin13\/humperdinck-downloads\/releases\/download\/v[0-9]+\.[0-9]+\.[0-9]+\/[a-zA-Z0-9._-]+$/.test(link.pathname);
    return link.protocol === 'https:' &&
      (firstParty || officialRelease) &&
      !link.search && !link.hash && DOWNLOAD_FORMATS[platform].test(link.pathname);
  } catch {return false}
}
fetch('/downloads.json', {cache:'no-store'}).then(r=>{
  if (!r.ok) throw Error('Download list unavailable');
  return r.json();
}).then(list=>{
  let available=0;
  for(const platform of Object.keys(DOWNLOAD_FORMATS)){
    const card=document.querySelector('[data-platform="'+platform+'"]');
    if(!card)continue;
    const entry=list[platform];
    if(!publishedInstaller(entry,platform))continue;
    const action=card.querySelector('[data-download-action]');
    const anchor=document.createElement('a');
    anchor.className='button button-primary download-action';
    anchor.href=entry.url;
    anchor.textContent='Download '+(platform==='windows'?'for Windows':platform==='macos'?'for macOS':'for Linux')+' ↓';
    anchor.setAttribute('aria-label', 'Download Humperdinck '+entry.version+' for '+platform);
    action.replaceWith(anchor);
    card.querySelector('[data-version]').textContent='Version '+entry.version+(entry.size ? ' · '+entry.size : '');
    available++;
  }
  const note=document.getElementById('download-notice');
  if(note&&available)note.textContent=available===3?'Installers are available for Windows, macOS and Linux. Unsigned builds may trigger an operating-system warning.':'Some installers are still in testing. Available platform downloads are shown above.';
}).catch(()=>{ /* Retain explicit unavailable labels until published. */ });

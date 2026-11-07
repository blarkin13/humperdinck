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


// Lightweight cinematic motion. All animation is optional and decorative.
(function initCinematicMotion(){
  const hero = document.querySelector('.hero');
  const root = document.documentElement;
  if (!hero || !window.matchMedia) return;
  const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
  if (prefersReducedMotion.matches) return;

  // Reveal content as it enters the viewport. Leave content visible if unsupported.
  if ('IntersectionObserver' in window) {
    const targets = document.querySelectorAll(
      '.section .section-kicker, .section h2, .section-title-row>p, ' +
      '.feature-card, .studio-copy>p, .studio-mock, .demo-panel, ' +
      '.download-card, .account-note h2'
    );
    const revealObserver = new IntersectionObserver(entries => {
      for (const entry of entries) {
        if (!entry.isIntersecting) continue;
        entry.target.classList.add('is-visible');
        revealObserver.unobserve(entry.target);
      }
    }, {rootMargin:'0px 0px -35px 0px',threshold:0.08});
    document.body.classList.add('has-motion');
    targets.forEach((el, i) => {
      el.classList.add('scroll-reveal');
      el.style.transitionDelay = Math.min(i % 3, 2) * 75 + 'ms';
      revealObserver.observe(el);
    });
  }

  let pointerX = 0;
  let pointerY = 0;
  let framePending = false;
  function updateMotion(){
    framePending = false;
    if (prefersReducedMotion.matches) return;
    const rect = hero.getBoundingClientRect();
    const scrolledHero = Math.max(0, Math.min(-rect.top, rect.height));
    const heroVisible = rect.bottom > 0 && rect.top < innerHeight;
    if (heroVisible) {
      const compact = matchMedia('(max-width: 800px)').matches;
      const multiplier = compact ? 0.7 : 1;
      hero.style.setProperty('--parallax-art-y', Math.round(scrolledHero * .15 * multiplier) + 'px');
      hero.style.setProperty('--parallax-glow-y', Math.round(scrolledHero * .075) + 'px');
      hero.style.setProperty('--parallax-title-y', Math.round(scrolledHero * .055 * multiplier) + 'px');
      hero.style.setProperty('--parallax-word-y', Math.round(scrolledHero * .18) + 'px');
      hero.style.setProperty('--pointer-art-x', Math.round(pointerX * 25) + 'px');
      hero.style.setProperty('--pointer-art-y', Math.round(pointerY * 18) + 'px');
    }
    const height = Math.max(1, root.scrollHeight - innerHeight);
    root.style.setProperty('--page-scroll-progress', (Math.min(100,Math.max(0,scrollY / height * 100))) + '%');
  }
  function scheduleMotion(){
    if (framePending) return;
    framePending = true;
    requestAnimationFrame(updateMotion);
  }
  addEventListener('scroll', scheduleMotion, {passive:true});
  addEventListener('resize', scheduleMotion, {passive:true});
  if (matchMedia('(pointer:fine)').matches) {
    hero.addEventListener('pointermove',event => {
      const rect = hero.getBoundingClientRect();
      pointerX = (event.clientX - (rect.left + rect.width / 2)) / (rect.width / 2);
      pointerY = (event.clientY - (rect.top + rect.height / 2)) / (rect.height / 2);
      scheduleMotion();
    }, {passive:true});
    hero.addEventListener('pointerleave',() => {
      pointerX = 0;
      pointerY = 0;
      scheduleMotion();
    });
    document.querySelectorAll('.feature-card').forEach(card => {
      card.addEventListener('pointermove',event => {
        const rect = card.getBoundingClientRect();
        card.style.setProperty('--spot-x',(event.clientX - rect.left)+'px');
        card.style.setProperty('--spot-y',(event.clientY - rect.top)+'px');
      }, {passive:true});
    });
  }
  scheduleMotion();
})();

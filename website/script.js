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

// Bidirectional kinetic typography: scroll position determines the motion,
// so scrolling back up restores every letter to its original position.
(function initKineticHero(){
  const hero = document.querySelector('.hero--kinetic');
  if (!hero || !window.matchMedia) return;
  const root = document.documentElement;
  const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');
  const finePointer = matchMedia('(pointer:fine)');
  const bars = document.querySelector('.kinetic-audio-pulse');
  let pointerX = 0;
  let lastScrollY = scrollY;
  let rafPending = false;
  let motionVisible = true;

  // Keep observing elements after their first appearance: re-entry from above
  // or below animates them again. No content is hidden if observers are absent.
  if ('IntersectionObserver' in window && !reducedMotion.matches) {
    const items = document.querySelectorAll(
      '.section .section-kicker, .section h2, .section-title-row>p, ' +
      '.feature-card, .studio-copy>p, .studio-mock, .demo-panel, ' +
      '.download-card, .account-note h2, ' +
      '.manifesto .manifesto-kicker, .manifesto .manifesto-part, .manifesto .manifesto-description'
    );
    const observer = new IntersectionObserver(entries => {
      for (const entry of entries) {
        entry.target.style.transitionDelay = entry.isIntersecting ?
          entry.target.dataset.revealDelay : '0ms';
        entry.target.classList.toggle('is-visible', entry.isIntersecting);
      }
    }, {rootMargin:'0px 0px -30px 0px',threshold:0.07});
    document.body.classList.add('has-motion');
    items.forEach((item,i) => {
      item.classList.add('scroll-reveal');
      item.dataset.revealDelay = String((i%3)*65) + 'ms';
      observer.observe(item);
    });
  }

  function paint(){
    rafPending = false;
    if (reducedMotion.matches) return;
    const y = window.scrollY;
    if (Math.abs(y-lastScrollY)>1) {
      document.body.dataset.scrollDirection = y<lastScrollY?'up':'down';
      lastScrollY = y;
    }
    const rect = hero.getBoundingClientRect();
    const isVisible = rect.bottom>0 && rect.top<innerHeight;
    if (isVisible) {
      const mobile = matchMedia('(max-width:560px)').matches;
      const scale = mobile ? 0.48 : 1;
      const progress = Math.max(0,Math.min(1,-rect.top/Math.max(1,rect.height*.72)));
      const px = (n)=>Math.round(n*10)/10 + 'px';
      hero.style.setProperty('--kinetic-line-one-x',px((16*progress+8*pointerX)*scale));
      hero.style.setProperty('--kinetic-line-two-x',px((-39*progress+5*pointerX)*scale));
      hero.style.setProperty('--kinetic-line-three-x',px((29*progress+4*pointerX)*scale));
      hero.style.setProperty('--kinetic-line-four-x',px((-55*progress+12*pointerX)*scale));
      hero.style.setProperty('--kinetic-echo-near',px(14*progress*scale));
      hero.style.setProperty('--kinetic-echo-far',px(42*progress*scale));
      hero.style.setProperty('--kinetic-rise',px(-17*progress*scale));
      hero.style.setProperty('--kinetic-wave-rise',px(48*progress*scale));
      hero.style.setProperty('--kinetic-wave-x',px((-24*progress+9*pointerX)*scale));
    }
    const pageHeight = Math.max(1,root.scrollHeight-innerHeight);
    root.style.setProperty('--page-scroll-progress',Math.min(100,Math.max(0,y/pageHeight*100))+'%');
  }
  function schedulePaint(){
    if (rafPending) return;
    rafPending = true;
    requestAnimationFrame(paint);
  }
  addEventListener('scroll',schedulePaint,{passive:true});
  addEventListener('resize',schedulePaint,{passive:true});

  if (finePointer.matches && !reducedMotion.matches) {
    hero.addEventListener('pointermove',event=>{
      const r=hero.getBoundingClientRect();
      pointerX=Math.max(-1,Math.min(1,(event.clientX-r.left-r.width/2)/(r.width/2)));
      schedulePaint();
    },{passive:true});
    hero.addEventListener('pointerleave',()=>{
      pointerX=0;
      schedulePaint();
    });
    document.querySelectorAll('.feature-card, .download-card').forEach(card=>{
      card.addEventListener('pointermove',event=>{
        const r=card.getBoundingClientRect();
        card.style.setProperty('--spot-x',(event.clientX-r.left)+'px');
        card.style.setProperty('--spot-y',(event.clientY-r.top)+'px');
      },{passive:true});
    });
  }
  if(bars && 'IntersectionObserver' in window){
    bars.classList.add('motion-observed');
    const setBarsActive=()=>{
      bars.classList.toggle('is-active',motionVisible && !document.hidden && !reducedMotion.matches);
    };
    const observer=new IntersectionObserver(entries=>{
      motionVisible=entries[0]?.isIntersecting??false;
      setBarsActive();
    },{threshold:0.05});
    observer.observe(bars);
    document.addEventListener('visibilitychange',setBarsActive);
  }
  schedulePaint();
})();


// A tap briefly plays the same decorative card motion as desktop hover.
// This does not intercept clicks, downloads, scrolling or native links.
(function initTouchCardMotion(){
  if (!window.PointerEvent || !window.matchMedia ||
      matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  const cards=document.querySelectorAll(
    '.feature-card, .studio-preview-card, .sample-item, .download-card'
  );
  cards.forEach(card=>{
    let pointerId=null;
    let startX=0,startY=0;
    let timeout=null;
    function clearMotion(){
      if(timeout!==null){clearTimeout(timeout);timeout=null;}
      card.classList.remove('is-touch-active');
    }
    card.addEventListener('pointerdown',e=>{
      if(e.pointerType!=='touch' && e.pointerType!=='pen') return;
      clearMotion();
      pointerId=e.pointerId;
      startX=e.clientX;startY=e.clientY;
      // The card never captures the pointer, so native scrolling is preserved.
      card.classList.add('is-touch-active');
    },{passive:true});
    card.addEventListener('pointermove',e=>{
      if(e.pointerId!==pointerId) return;
      if(Math.hypot(e.clientX-startX,e.clientY-startY)>12){
        pointerId=null;
        clearMotion();
      }
    },{passive:true});
    card.addEventListener('pointerup',e=>{
      if(e.pointerId!==pointerId) return;
      pointerId=null;
      if(timeout!==null)clearTimeout(timeout);
      // Keep the interaction visible after the finger lifts.
      timeout=setTimeout(clearMotion,1500);
    },{passive:true});
    card.addEventListener('pointercancel',()=>{
      pointerId=null;clearMotion();
    },{passive:true});
    addEventListener('scroll',()=>{
      if(pointerId!==null){pointerId=null;clearMotion();}
    },{passive:true});
    document.addEventListener('visibilitychange',()=>{
      if(document.hidden){pointerId=null;clearMotion();}
    });
  });
})();


// Section navigation: active link feedback and a compact mobile menu.
// Native anchor links continue to provide scrolling and browser history.
(function initSectionNavigation(){
  const menu=document.querySelector('.mobile-menu');
  const header=document.querySelector('.header');
  const navLinks=[...document.querySelectorAll(
    '.header .nav a[href^="#"], .mobile-menu-panel a[href^="#"]'
  )];
  if(!header || !navLinks.length)return;
  const sections=[
    'why-local','features','studio','voices','download','accounts'
  ].map(id=>document.getElementById(id)).filter(Boolean);
  let scheduled=false;
  function syncActiveSection(){
    scheduled=false;
    const threshold=header.getBoundingClientRect().height+45;
    let activeId=null;
    for(const section of sections){
      if(section.getBoundingClientRect().top<=threshold)activeId=section.id;
    }
    for(const link of navLinks){
      if(activeId && link.hash==='#'+activeId){
        link.setAttribute('aria-current','location');
      }else{
        link.removeAttribute('aria-current');
      }
    }
  }
  function onScroll(){
    if(scheduled)return;
    scheduled=true;requestAnimationFrame(syncActiveSection);
  }
  addEventListener('scroll',onScroll,{passive:true});
  addEventListener('resize',onScroll,{passive:true});
  syncActiveSection();

  if(!menu)return;
  menu.querySelectorAll('a').forEach(link=>{
    link.addEventListener('click',()=>{menu.open=false;});
  });
  document.addEventListener('pointerdown',event=>{
    if(menu.open && !menu.contains(event.target))menu.open=false;
  });
  document.addEventListener('keydown',event=>{
    if(event.key==='Escape' && menu.open){
      menu.open=false;
      menu.querySelector('summary')?.focus();
    }
  });
})();

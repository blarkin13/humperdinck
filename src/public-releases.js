// Public release metadata only. The source repository may be private.
// The public distribution repository contains no source code.
const REPO = 'blarkin13/humperdinck-downloads';
const API = 'https://api.github.com/repos/' + REPO + '/releases/latest';
const RELEASE_BASE = 'https://github.com/' + REPO + '/releases/download/';
const HEADERS = {'User-Agent':'Humperdinck-Download-Site/1.0','Accept':'application/vnd.github+json'};
const json = (body,status=200) => new Response(JSON.stringify(body),{
  status,headers:{'Content-Type':'application/json; charset=utf-8','Cache-Control':status===200?'public, max-age=300':'no-store','X-Content-Type-Options':'nosniff'}
});
export async function publicRelease(request,env){
  const path=new URL(request.url).pathname;
  if(!['GET','HEAD'].includes(request.method))return new Response('Method not allowed',{status:405});
  let release;
  try {
    const response=await fetch(API,{headers:HEADERS});
    if(!response.ok)throw Error('No published distribution release');
    release=await response.json();
  } catch {
    // Static fallback is deliberately unpublished; never show a fabricated download.
    if(path==='/downloads.json')return env.ASSETS.fetch(request);
    return json({error:'Signed update feed not yet published'},404);
  }
  const tag=release.tag_name||'';
  const version=/^v(\d+\.\d+\.\d+)$/.exec(tag)?.[1];
  if(!version||release.draft||release.prerelease){
    if(path==='/downloads.json')return env.ASSETS.fetch(request);
    return json({error:'No approved release'},404);
  }
  const assets=Array.isArray(release.assets)?release.assets:[];
  const assetFor=(name)=>assets.find(a=>a.name===name&&
    a.browser_download_url===RELEASE_BASE+tag+'/'+name&&a.state==='uploaded'&&a.size>0);
  if(path==='/downloads.json'){
    const entries=[
      ['windows','humperdinck-windows-x64-'+version+'.exe'],
      ['macos','humperdinck-macos-arm64-'+version+'.dmg'],
      ['linux','humperdinck-linux-x64-'+version+'.deb']
    ];
    const result={};
    for(const [platform,name] of entries){
      const file=assetFor(name);
      result[platform]=file?{
        published:true,version,url:file.browser_download_url,
        size:(file.size/1024/1024).toFixed(1)+' MB'
      }:{published:false,version:'',url:'',size:''};
    }
    return json(result);
  }
  if(path==='/updates/latest.json'){
    // A separate Tauri updater manifest must contain real signed artifacts and signatures.
    // Never treat an installer or SHA256 checksum as a signed update.
    const asset=assetFor('latest.json');
    if(!asset)return json({error:'No signed updater artifacts in this release'},404);
    try{
      const r=await fetch(asset.browser_download_url,{redirect:'follow'});
      if(!r.ok)return json({error:'Signed updater manifest unavailable'},502);
      const manifest=await r.json();
      if(manifest.version!==version||!manifest.platforms||typeof manifest.platforms!=='object')
        return json({error:'Invalid signed updater manifest'},502);
      return json(manifest);
    }catch{return json({error:'Signed updater manifest unavailable'},502)}
  }
  return null;
}

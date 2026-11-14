import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,existsSync} from 'node:fs';
import {resolve} from 'node:path';
const root=new URL('../',import.meta.url);
const read=p=>readFileSync(new URL(p,root),'utf8');
const fonts=[
 ['Inter','@fontsource/inter'],
 ['DM-Serif-Display','@fontsource/dm-serif-display'],
 ['Josefin-Sans','@fontsource/josefin-sans'],
 ['Space-Grotesk','@fontsource/space-grotesk']
];
test('all four bundled Fontsource families carry their own complete OFL notices',()=>{
 const pkg=JSON.parse(read('frontend/package.json'));
 const notices=read('website/THIRD_PARTY_NOTICES.txt');
 const licensePage=read('website/licenses/index.html');
 for(const [name,dependency] of fonts){
  assert.ok(pkg.dependencies[dependency],dependency+' must be an installed Fontsource dependency');
  const path='frontend/public/font-licenses/'+name+'-OFL.txt';
  const license=read(path);
  assert.match(license,/^Copyright /);
  assert.match(license,/SIL OPEN FONT LICENSE Version 1\.1/);
  assert.match(license,/PERMISSION & CONDITIONS/);
  assert.match(license,/DISCLAIMER/);
  assert.ok(license.length>4000,'full OFL text, not a reference-only stub: '+name);
  const url='/studio/font-licenses/'+name+'-OFL.txt';
  assert.ok(notices.includes(url),'missing '+name+' from master notices');
  assert.ok(licensePage.includes(url),'missing '+name+' from public licenses page');
 }
 assert.match(notices,/DM Serif Display/);
 assert.match(notices,/Josefin Sans/);
});
test('Vite copies the master notice into the desktop and hosted Studio distributions',()=>{
 const config=read('frontend/vite.config.js');
 assert.match(config,/generateBundle\(\)/);
 assert.match(config,/THIRD_PARTY_NOTICES\.txt/);
 assert.match(config,/website\/THIRD_PARTY_NOTICES\.txt/);
 const builder=read('scripts/build-public-studio.sh');
 assert.match(builder,/cp -R frontend\/dist\/\. website\/studio\//);
});
test('built desktop frontend and staged Studio actually contain same notices and four licenses',()=>{
 const required=['THIRD_PARTY_NOTICES.txt',...fonts.map(([n])=>'font-licenses/'+n+'-OFL.txt')];
 for(const name of required){
  const a='frontend/dist/'+name,b='website/studio/'+name;
  assert.ok(existsSync(new URL(a,root)),'missing desktop asset '+a);
  assert.ok(existsSync(new URL(b,root)),'missing browser asset '+b);
  const built=read(a),staged=read(b);
  assert.equal(staged,built,'studio asset differs from desktop: '+name);
  if(name==='THIRD_PARTY_NOTICES.txt')
   assert.equal(built,read('website/THIRD_PARTY_NOTICES.txt'),'notice must match master');
 }
});

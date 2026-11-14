import {defineConfig} from 'vite';
import {readFileSync} from 'node:fs';
let version='dev';try{version=JSON.parse(readFileSync(new URL('../desktop/src-tauri/tauri.conf.json',import.meta.url))).version||'dev'}catch{}
// Keep the same readable third-party notices alongside the bundled font files
// in both frontend/dist (Tauri installers) and website/studio (browser build).
const notices=()=>({name:'humperdinck-third-party-notices',generateBundle(){
 this.emitFile({type:'asset',fileName:'THIRD_PARTY_NOTICES.txt',source:readFileSync(new URL('../website/THIRD_PARTY_NOTICES.txt',import.meta.url))});
}});
export default defineConfig({plugins:[notices()],define:{__APP_VERSION__:JSON.stringify(version)},server:{proxy:{'/api':process.env.HUMPERDINCK_API||'http://127.0.0.1:8000'}}});

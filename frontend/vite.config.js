import {defineConfig} from 'vite';import {readFileSync} from 'node:fs';
let version='dev';try{version=JSON.parse(readFileSync(new URL('../desktop/src-tauri/tauri.conf.json',import.meta.url))).version||'dev'}catch{}
export default defineConfig({define:{__APP_VERSION__:JSON.stringify(version)},server:{proxy:{'/api':process.env.HUMPERDINCK_API||'http://127.0.0.1:8000'}}});

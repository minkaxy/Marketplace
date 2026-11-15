import fs from 'node:fs/promises';
import path from 'node:path';
const files={};
try { await fs.copyFile('node_modules/qrcode-generator/dist/qrcode.js','public/qr.js'); } catch(e) { if(e.code!=='ENOENT')throw e; await fs.access('public/qr.js'); }
for(const f of await fs.readdir('public'))files['/'+f]=await fs.readFile(path.join('public',f),'utf8');
files['/']=files['/index.html'];
const data=await fs.readFile('worker/data.mjs','utf8');
const api=(await fs.readFile('worker/index.mjs','utf8')).replace("import {defaults} from './data.mjs';",'');
await fs.mkdir('dist/server',{recursive:true});
await fs.writeFile('dist/server/index.js',`const ASSETS=${JSON.stringify(files)};\n${data.replaceAll('export const','const')}\n${api}`);
console.log('Built Worker with',Object.keys(files).length,'embedded assets.');

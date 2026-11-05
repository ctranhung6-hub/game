import {cp,mkdir,writeFile,rm} from 'node:fs/promises';
const raw=process.env.GAME_SERVER_URL;
if(!raw)throw Error('Thiếu GAME_SERVER_URL: thêm URL HTTPS máy chủ game vào Environment Variables của Vercel rồi Redeploy.');
const url=new URL(raw);
if(url.protocol!=='https:' || url.username || url.password)throw Error('GAME_SERVER_URL phải là URL HTTPS công khai của backend.');
url.protocol='wss:';url.pathname='/ws';url.search='';url.hash='';
await rm('dist',{recursive:true,force:true});await mkdir('dist',{recursive:true});await cp('public','dist',{recursive:true});
await writeFile('dist/play/config.js','export const WS_URL = '+JSON.stringify(url.href)+';\n');

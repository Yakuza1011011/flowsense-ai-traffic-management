import {spawn} from 'node:child_process';
const children=[spawn(process.execPath,['--import','tsx','scripts/local-server.mjs'],{stdio:'inherit'}),spawn(process.execPath,['node_modules/vite/bin/vite.js'],{stdio:'inherit'})];
for(const sig of ['SIGINT','SIGTERM'])process.on(sig,()=>{children.forEach(c=>c.kill());process.exit()});
children.forEach(c=>c.on('exit',code=>{if(code){children.forEach(x=>x.kill());process.exit(code)}}));

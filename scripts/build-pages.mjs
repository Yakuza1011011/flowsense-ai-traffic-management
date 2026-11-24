import {spawnSync} from 'node:child_process';
import {writeFileSync} from 'node:fs';
const checks=spawnSync(process.execPath,['node_modules/typescript/bin/tsc','--noEmit'],{stdio:'inherit'});
if(checks.status!==0)process.exit(checks.status||1);
const result=spawnSync(process.execPath,['node_modules/vite/bin/vite.js','build'],{stdio:'inherit',env:{...process.env,VITE_PAGES_BUILD:'true',VITE_BASE_PATH:'/flowsense-ai-traffic-management/',VITE_API_ORIGIN:'https://flowsense-ai-traffic-1124.hazygnome514.chatgpt.site'}});
if(result.status!==0)process.exit(result.status||1);
writeFileSync('dist/pages/.nojekyll','');

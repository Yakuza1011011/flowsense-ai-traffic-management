import {createServer} from 'node:http';
import {readFileSync,existsSync,mkdirSync} from 'node:fs';
import {resolve,extname} from 'node:path';
import {randomBytes} from 'node:crypto';
import {database} from './sqlite.mjs';
import {api} from '../server/api.ts';
if(existsSync('.env'))process.loadEnvFile('.env');
mkdirSync('.local',{recursive:true});
const env={DB:database('.local/flowsense.sqlite'),LOCAL_DEMO:'true',DEMO_PASSWORD:process.env.DEMO_PASSWORD||'FlowSense-demo-2026',SESSION_SECRET:randomBytes(32).toString('hex')};
const root=resolve('dist/client');
const server=createServer(async(req,res)=>{try{
 const port=process.env.PORT||8787,url=`http://${req.headers.host||`127.0.0.1:${port}`}${req.url}`;
 if(req.url.startsWith('/api/')){const chunks=[];let size=0;for await(const chunk of req){size+=chunk.length;if(size>2_000_000){res.writeHead(413);res.end('Request too large');return}chunks.push(chunk)}const request=new Request(url,{method:req.method,headers:req.headers,...(!['GET','HEAD'].includes(req.method)?{body:Buffer.concat(chunks)}:{})});const response=await api(request,env);res.writeHead(response.status,Object.fromEntries(response.headers));res.end(Buffer.from(await response.arrayBuffer()));return;}
 const candidate=resolve(root,'.'+decodeURIComponent(new URL(url).pathname));if(!candidate.startsWith(root+ '/')&&!candidate.startsWith(root+'\\')&&candidate!==root){res.writeHead(403);res.end();return}
 const file=existsSync(candidate)&&extname(candidate)?candidate:resolve(root,'index.html');
 if(!existsSync(file)){res.writeHead(503);res.end('Frontend is building. For development open http://127.0.0.1:5173');return}
 res.writeHead(200,{'Content-Type':({'.html':'text/html','.js':'text/javascript','.css':'text/css','.png':'image/png','.svg':'image/svg+xml'}[extname(file)]||'application/octet-stream')});res.end(readFileSync(file));
 }catch(e){console.error(e);res.writeHead(500);res.end('Local server error')}});
server.listen(Number(process.env.PORT||8787),'127.0.0.1',()=>console.log(`FlowSense local server: http://127.0.0.1:${process.env.PORT||8787}`));
for(const sig of ['SIGINT','SIGTERM'])process.on(sig,()=>server.close(()=>{env.DB.close();process.exit(0)}));

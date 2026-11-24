import Papa from 'papaparse';
import {roads,roadsForCity,defaults,upgradeSettings,synthetic,simulatePlan,type Observation,type Settings} from '../shared/traffic';
import {cities,getCity,searchCities} from '../shared/cities';
import {forecast,modelInfo} from './forecast';
export type DB={prepare:(sql:string)=>{bind:(...values:any[])=>any;first:()=>Promise<any>;all:()=>Promise<{results:any[]}>;run:()=>Promise<any>};batch:(statements:any[])=>Promise<any[]>};
export type Env={DB:DB;LOCAL_DEMO?:string;DEMO_PASSWORD?:string;SESSION_SECRET?:string;PUBLIC_ACCESS?:string;PUBLIC_ORIGIN?:string};
type User={id:string;email:string;role:string;anonymous?:boolean};
const json=(data:any,status=200,headers:Record<string,string>={})=>new Response(JSON.stringify(data),{status,headers:{'Content-Type':'application/json','Cache-Control':'no-store',...headers}});
class ApiError extends Error{constructor(public status:number,message:string){super(message)}}
function fail(s:number,m:string):never{throw new ApiError(s,m)}
async function body(req:Request){if(Number(req.headers.get('content-length')||0)>2_000_000)fail(413,'Request exceeds 2 MB.');const text=await req.text();if(text.length>2_000_000)fail(413,'Request exceeds 2 MB.');try{return JSON.parse(text)}catch{fail(400,'Invalid JSON body.')}}
const iso=()=>new Date().toISOString();
async function audit(env:Env,user:User,action:string,details:any,cityId='bengaluru'){await env.DB.prepare('INSERT INTO audit (id,user_id,action,details,created_at,city_id) VALUES (?,?,?,?,?,?)').bind(crypto.randomUUID(),user.id,action,JSON.stringify(details),iso(),cityId).run()}
function authorize(user:User,roles:string[]){if(!roles.includes(user.role))fail(403,'Your role does not permit this action.')}
async function sign(value:string,secret:string){const key=await crypto.subtle.importKey('raw',new TextEncoder().encode(secret),{name:'HMAC',hash:'SHA-256'},false,['sign']);return Array.from(new Uint8Array(await crypto.subtle.sign('HMAC',key,new TextEncoder().encode(value)))).map(b=>b.toString(16).padStart(2,'0')).join('')}
async function identity(req:Request,env:Env):Promise<User>{
 if(env.LOCAL_DEMO==='true'){
  const cookie=req.headers.get('cookie')?.match(/(?:^|; )fs_session=([^;]+)/)?.[1];
  if(!cookie)fail(401,'Sign in to your local demo account.');
  const [role,expiry,sig]=cookie.split('.');
  if(!['admin','operator','viewer'].includes(role)||Number(expiry)<Date.now()||sig!==await sign(`${role}.${expiry}`,env.SESSION_SECRET!))fail(401,'Session expired. Please sign in again.');
  return {id:`local-${role}`,email:`${role}@flowsense.local`,role};
 }
 const id=req.headers.get('oai-authenticated-user-id');
 if(env.PUBLIC_ACCESS==='true'&&(!id||req.headers.get('origin')===env.PUBLIC_ORIGIN))return {id:'public-visitor',email:'Public visitor',role:'viewer',anonymous:true};
 if(!id)fail(401,'Sign in with ChatGPT to access FlowSense.');
 const email=req.headers.get('oai-authenticated-user-email')||'Site member';
 // Atomic owner bootstrap: only the first platform-authenticated visitor is administrator.
 await env.DB.prepare("INSERT OR IGNORE INTO users (id,email,role,created_at) SELECT ?,?,CASE WHEN EXISTS(SELECT 1 FROM users) THEN 'viewer' ELSE 'admin' END,?").bind(id,email,iso()).run();
 return await env.DB.prepare('SELECT * FROM users WHERE id=?').bind(id).first();
}
export function validateRows(text:string):Observation[]{
 if(text.length>1_500_000)fail(413,'CSV exceeds 1.5 MB.');
 const parsed=Papa.parse<Record<string,string>>(text,{header:true,skipEmptyLines:'greedy',transformHeader:s=>s.trim().replace(/^\uFEFF/,'')});
 if(parsed.errors.length)fail(400,`CSV error: ${parsed.errors[0].message}`);
 const fields=['timestamp','road_segment_id','vehicle_count','average_speed_kmh','occupancy_percent','interval_minutes'];
 if(!fields.every(f=>parsed.meta.fields?.includes(f)))fail(400,`Required columns: ${fields.join(', ')}`);
 if(!parsed.data.length||parsed.data.length>5000)fail(400,'Upload between 1 and 5,000 rows.');
 return parsed.data.map((row,i)=>{
  const road=roads.find(r=>r.id===row.road_segment_id);const count=Number(row.vehicle_count),speed=Number(row.average_speed_kmh),occ=Number(row.occupancy_percent),interval=Number(row.interval_minutes),t=Date.parse(row.timestamp);
  if(fields.some(f=>!row[f]?.trim())||!road||!Number.isFinite(t)||!/(Z|[+-]\d{2}:\d{2})$/.test(row.timestamp)||t>Date.now()+60000||!Number.isInteger(count)||count<0||count>100000||!Number.isFinite(speed)||speed<0||speed>160||!Number.isFinite(occ)||occ<0||occ>100||!Number.isInteger(interval)||interval<1||interval>60)fail(400,`Row ${i+2}: invalid road, zoned timestamp, vehicle count, speed (0–160), occupancy (0–100), or interval (1–60).`);
  return {timestamp:new Date(t).toISOString(),road_segment_id:road!.id,vehicle_count:count,average_speed_kmh:speed,occupancy_percent:occ,interval_minutes:interval,source:'uploaded'};
 });
}
const insert=(env:Env,o:Observation)=>env.DB.prepare('INSERT OR IGNORE INTO observations VALUES (?,?,?,?,?,?,?)').bind(o.timestamp,o.road_segment_id,o.vehicle_count,o.average_speed_kmh,o.occupancy_percent,o.interval_minutes,o.source);
async function chunks(env:Env,stmts:any[]){for(let i=0;i<stmts.length;i+=80)await env.DB.batch(stmts.slice(i,i+80))}
async function seed(env:Env,user:User){
 const saved=await getSettings(env);
 await env.DB.prepare('INSERT OR REPLACE INTO settings VALUES (1,?)').bind(JSON.stringify(saved)).run();
 const existing=new Set((await env.DB.prepare('SELECT DISTINCT road_segment_id FROM observations').all()).results.map(r=>r.road_segment_id));
 const missing=roads.filter(road=>!existing.has(road.id));if(!missing.length)return;
 const end=Math.floor(Date.now()/900000)*900000,rows:Observation[]=[];
 for(let i=7*96;i>=0;i--)for(const road of missing)rows.push(synthetic(road,end-i*900000));
 const stmts=[];for(let i=0;i<rows.length;i+=80){const part=rows.slice(i,i+80);stmts.push(env.DB.prepare("INSERT OR IGNORE INTO observations SELECT json_extract(value,'$.timestamp'),json_extract(value,'$.road_segment_id'),json_extract(value,'$.vehicle_count'),json_extract(value,'$.average_speed_kmh'),json_extract(value,'$.occupancy_percent'),json_extract(value,'$.interval_minutes'),json_extract(value,'$.source') FROM json_each(?)").bind(JSON.stringify(part)));}
 await chunks(env,stmts);
 for(const city of cities.filter(city=>missing.some(r=>r.cityId===city.id))){
  const road=city.id==='bengaluru'?'old-airport':roadsForCity(city.id)[0].id;
  await env.DB.prepare('INSERT OR IGNORE INTO incidents VALUES (?,?,?,?,?,?,?,?)').bind(city.id==='bengaluru'?'demo-incident':`demo-${city.id}`,road,'Roadworks','Moderate',`Demonstration: lane maintenance in ${city.name}.`,'Open',new Date(end-45*60000).toISOString(),iso()).run();
  await audit(env,user,'seed',{city:city.id,observations:missing.filter(r=>r.cityId===city.id).length*673,source:'synthetic'},city.id);
 }
}
async function getSettings(env:Env):Promise<Settings>{const s=await env.DB.prepare('SELECT value FROM settings WHERE id=1').first();return s?upgradeSettings(JSON.parse(s.value)):defaults}
async function getPredictions(env:Env,settings:Settings,cityId:string){
 const selected=roadsForCity(cityId).filter(r=>settings.monitored.includes(r.id));if(!selected.length)return [];
 const obs=(await env.DB.prepare(`SELECT * FROM observations WHERE timestamp >= ? AND road_segment_id IN (${selected.map(()=>'?').join(',')}) ORDER BY timestamp`).bind(new Date(Date.now()-86400000).toISOString(),...selected.map(r=>r.id)).all()).results;
 return selected.flatMap(r=>{const hist=obs.filter((o:Observation)=>o.road_segment_id===r.id);return hist.length?[15,30,60].map(h=>forecast(hist,r,h,settings)):[]});
}
export async function api(req:Request,env:Env):Promise<Response>{
 const origin=req.headers.get('origin'),cross=!!origin&&origin!==new URL(req.url).origin;
 const allowed=env.PUBLIC_ACCESS==='true'&&origin===env.PUBLIC_ORIGIN;
 if(cross&&!allowed)return json({error:'This origin is not allowed.'},403);
 const response=req.method==='OPTIONS'?(allowed?new Response(null,{status:204}):json({error:'Preflight is not allowed.'},403)):await handleApi(req,env);
 if(allowed){response.headers.set('Access-Control-Allow-Origin',origin!);response.headers.set('Vary','Origin');response.headers.set('Access-Control-Allow-Methods','GET, POST, OPTIONS');response.headers.set('Access-Control-Allow-Headers','Content-Type');response.headers.set('Access-Control-Expose-Headers','Content-Disposition');response.headers.set('Access-Control-Max-Age','600')}
 return response;
}
async function handleApi(req:Request,env:Env):Promise<Response>{try{
 const url=new URL(req.url),path=url.pathname,method=req.method;
 if(path==='/api/health')return json({ok:true});
 if(!['GET','HEAD'].includes(method)){if(!req.headers.get('content-type')?.includes('application/json'))fail(415,'Use application/json.');}
 if(path==='/api/auth'&&method==='GET')return json({local:env.LOCAL_DEMO==='true',user:await identity(req,env)});
 if(path==='/api/login'&&method==='POST'){
  if(env.LOCAL_DEMO!=='true')fail(404,'Local demo login is disabled.');const b=await body(req);
  if(!env.DEMO_PASSWORD||b.password!==env.DEMO_PASSWORD||!['admin','operator','viewer'].includes(b.role))fail(401,'Incorrect demo credentials.');
  const value=`${b.role}.${Date.now()+8*3600000}`;return json({ok:true},200,{'Set-Cookie':`fs_session=${value}.${await sign(value,env.SESSION_SECRET!)}; HttpOnly; SameSite=Strict; Path=/; Max-Age=28800`});
 }
 if(path==='/api/auth-mode')return json({local:env.LOCAL_DEMO==='true',public:env.PUBLIC_ACCESS==='true'});
 const user=await identity(req,env);
 const cityId=url.searchParams.get('city')||'bengaluru',city=getCity(cityId);if(!city)fail(400,'Unknown city. Choose a supported Karnataka city.');
 const cityRoads=roadsForCity(cityId),cityIds=cityRoads.map(r=>r.id),citySlots=cityIds.map(()=>'?').join(',');
 if(path==='/api/cities'&&method==='GET')return json({cities:searchCities(url.searchParams.get('search')||'')});
 if(path==='/api/logout'&&method==='POST')return json({ok:true},200,{'Set-Cookie':'fs_session=; HttpOnly; SameSite=Strict; Path=/; Max-Age=0'});
 if(path==='/api/seed'&&method==='POST'){authorize(user,['admin']);await seed(env,user);return json({ok:true})}
 if(path==='/api/state'&&method==='GET'){
  const settings=await getSettings(env);const since=url.searchParams.get('since')||new Date(Date.now()-7*86400000).toISOString();if(!Number.isFinite(Date.parse(since)))fail(400,'Invalid date filter.');
  const [obs,incidents,alerts,plans,uploads,audits,users]=await Promise.all([
   env.DB.prepare(`SELECT * FROM observations WHERE timestamp>=? AND road_segment_id IN (${citySlots}) ORDER BY timestamp LIMIT 25000`).bind(since,...cityIds).all(),
   env.DB.prepare(`SELECT * FROM incidents WHERE road_segment_id IN (${citySlots}) ORDER BY created_at DESC`).bind(...cityIds).all(),
   env.DB.prepare(`SELECT * FROM alerts WHERE road_segment_id IN (${citySlots}) ORDER BY created_at DESC LIMIT 100`).bind(...cityIds).all(),
   env.DB.prepare(`SELECT * FROM signal_plans WHERE road_segment_id IN (${citySlots})`).bind(...cityIds).all(),
   user.anonymous?Promise.resolve({results:[]}):env.DB.prepare("SELECT * FROM uploads WHERE city_id=? OR (city_id IS NULL AND ?='bengaluru') ORDER BY created_at DESC LIMIT 20").bind(cityId,cityId).all(),
   user.anonymous?Promise.resolve({results:[]}):env.DB.prepare("SELECT * FROM audit WHERE city_id=? OR (city_id IS NULL AND ?='bengaluru') ORDER BY created_at DESC LIMIT 30").bind(cityId,cityId).all(),
   user.role==='admin'?env.DB.prepare('SELECT id,email,role FROM users').all():Promise.resolve({results:[]})]);
  return json({user,city,cities,settings,roads:cityRoads,observations:obs.results,incidents:incidents.results,alerts:alerts.results,plans:plans.results,uploads:uploads.results,audit:audits.results,users:users.results,predictions:await getPredictions(env,settings,cityId),model:{version:modelInfo.version,metrics:modelInfo.city_metrics?.[cityId]||modelInfo.metrics,features:modelInfo.features,split:modelInfo.split},server_time:iso()});
 }
 if(path==='/api/tick'&&method==='POST'){
  if(!user.anonymous)authorize(user,['admin','operator']);const settings=await getSettings(env),t=Math.floor(Date.now()/900000)*900000;
  const monitored=cityRoads.filter(r=>settings.monitored.includes(r.id));
  if(user.anonymous){
   const count=await env.DB.prepare(`SELECT COUNT(*) AS count FROM observations WHERE timestamp=? AND road_segment_id IN (${citySlots})`).bind(new Date(t).toISOString(),...cityIds).first();
   if(count.count>=monitored.length)return json({ok:true,observations:0,unchanged:true});
  }
  // Public visitors can advance only deterministic demo intervals, never supply traffic values.
  await chunks(env,monitored.flatMap(r=>Array.from({length:user.anonymous?4:1},(_,i)=>insert(env,synthetic(r,t-i*900000)))));
  const predictions=await getPredictions(env,settings,cityId);
  await chunks(env,predictions.map(p=>env.DB.prepare('INSERT OR REPLACE INTO predictions VALUES(?,?,?,?,?)').bind(p.road_segment_id,p.issued_at,p.horizon,p.speed,p.model_version)));
  if(settings.notifications)for(const p of predictions.filter(p=>p.horizon===30&&p.status==='Heavy')){
   const existing=await env.DB.prepare("SELECT id FROM alerts WHERE road_segment_id=? AND status!='Resolved' LIMIT 1").bind(p.road_segment_id).first();
   if(!existing)await env.DB.prepare('INSERT OR IGNORE INTO alerts VALUES(?,?,?,?,?,?)').bind(`${p.road_segment_id}-${p.issued_at}`,p.road_segment_id,`Heavy congestion forecast in 30 min · ${p.speed} km/h`,'Open',iso(),iso()).run();
  }return json({ok:true,observations:cityRoads.filter(r=>settings.monitored.includes(r.id)).length,predictions:predictions.length});
 }
 if(path==='/api/incidents'&&method==='POST'){
  authorize(user,['admin','operator']);const b=await body(req);
  if(!cityRoads.some(r=>r.id===b.road_segment_id)||!['Collision','Roadworks','Breakdown','Event','Other'].includes(b.type)||!['Low','Moderate','High'].includes(b.severity)||typeof b.description!=='string'||b.description.trim().length<5||b.description.length>1000)fail(400,'Choose a road, type and severity, and enter a description (5–1,000 characters).');
  const id=crypto.randomUUID();await env.DB.prepare('INSERT INTO incidents VALUES(?,?,?,?,?,?,?,?)').bind(id,b.road_segment_id,b.type,b.severity,b.description.trim(),'Open',iso(),iso()).run();await audit(env,user,'incident.created',{id,...b},cityId);return json({id},201);
 }
 if(/^\/api\/(incidents|alerts)\/[^/]+$/.test(path)&&method==='PATCH'){
  authorize(user,['admin','operator']);const [, ,table,id]=path.split('/'),b=await body(req);if(!['Open','Acknowledged','Resolved'].includes(b.status))fail(400,'Invalid status.');
  const current=await env.DB.prepare(`SELECT * FROM ${table} WHERE id=?`).bind(id).first();if(!current||!cityIds.includes(current.road_segment_id))fail(404,'Record not found in the selected city.');
  if(table==='incidents'&&b.description!==undefined&&(typeof b.description!=='string'||b.description.trim().length<5||b.description.length>1000))fail(400,'Description must contain 5–1,000 characters.');
  await env.DB.prepare(`UPDATE ${table} SET status=?,updated_at=?${table==='incidents'?',description=?':''} WHERE id=?`).bind(...(table==='incidents'?[b.status,iso(),b.description?.trim()??current.description,id]:[b.status,iso(),id])).run();await audit(env,user,`${table}.updated`,{id,from:current.status,to:b.status,description:b.description},cityId);return json({ok:true});
 }
 if(path==='/api/settings'&&method==='PUT'){
  authorize(user,['admin']);const b=await body(req);if(!Number.isFinite(b.moderate)||!Number.isFinite(b.heavy)||b.heavy<5||b.heavy>=b.moderate||b.moderate>95||![15,30,60,120].includes(b.refresh)||!Array.isArray(b.monitored)||!b.monitored.length||!b.monitored.every((id:string)=>roads.some(r=>r.id===id))||typeof b.notifications!=='boolean')fail(400,'Invalid thresholds, refresh interval, monitored roads or notifications.');
  if(typeof b.timezone!=='string')fail(400,'Invalid timezone.');b.catalogRoads=roads.map(r=>r.id);
  try{new Intl.DateTimeFormat('en',{timeZone:b.timezone}).format()}catch{fail(400,'Invalid timezone.')}
  await env.DB.prepare('INSERT OR REPLACE INTO settings VALUES(1,?)').bind(JSON.stringify(b)).run();await audit(env,user,'settings.updated',b,cityId);return json({ok:true});
 }
 if(path==='/api/signals'&&method==='POST'){
  authorize(user,['admin','operator']);const b=await body(req);if(!cityRoads.some(r=>r.id===b.road_segment_id)||!Number.isInteger(b.cycle)||b.cycle<60||b.cycle>180||!Number.isInteger(b.green)||b.green<10||b.green>b.cycle-20)fail(400,'Cycle must be 60–180 s, with at least 20 s for opposing traffic and clearance.');
  const obs=await env.DB.prepare('SELECT * FROM observations WHERE road_segment_id=? ORDER BY timestamp DESC LIMIT 1').bind(b.road_segment_id).first();if(!obs)fail(400,'No observations available.');
  const result={...b,before:simulatePlan(obs.vehicle_count*15/obs.interval_minutes,35,90),after:simulatePlan(obs.vehicle_count*15/obs.interval_minutes,b.green,b.cycle)};
  await env.DB.prepare('INSERT OR REPLACE INTO signal_plans VALUES(?,?,?)').bind(b.road_segment_id,JSON.stringify(result),iso()).run();await audit(env,user,'signal.simulated',result,cityId);return json(result);
 }
 if(path==='/api/uploads'&&method==='POST'){
  authorize(user,['admin','operator']);const b=await body(req);if(typeof b.csv!=='string'||typeof b.filename!=='string'||b.filename.length>200)fail(400,'Provide a CSV file.');const rows=validateRows(b.csv);if(rows.some(row=>!cityIds.includes(row.road_segment_id)))fail(400,`This upload contains roads outside ${city.name}. Select the matching city and upload one city at a time.`);let added=0;
  for(let i=0;i<rows.length;i+=80){const results=await env.DB.batch(rows.slice(i,i+80).map(o=>insert(env,o)));added+=results.reduce((n,r)=>n+(r.meta?.changes??0),0)}
  const duplicates=rows.length-added;await env.DB.prepare('INSERT INTO uploads (id,filename,row_count,duplicate_count,created_at,city_id) VALUES(?,?,?,?,?,?)').bind(crypto.randomUUID(),b.filename,added,duplicates,iso(),cityId).run();await audit(env,user,'csv.imported',{filename:b.filename,added,duplicates},cityId);return json({added,duplicates});
 }
 if(path==='/api/users'&&method==='PATCH'){
  authorize(user,['admin']);const b=await body(req);if(b.id===user.id)fail(400,'You cannot change your own administrator role.');if(!['admin','operator','viewer'].includes(b.role))fail(400,'Invalid role.');if(!await env.DB.prepare('SELECT id FROM users WHERE id=?').bind(b.id).first())fail(404,'User not found.');await env.DB.prepare('UPDATE users SET role=? WHERE id=?').bind(b.role,b.id).run();await audit(env,user,'user.role_changed',b,cityId);return json({ok:true});
 }
 if(path==='/api/export'&&method==='GET'){
  const type=url.searchParams.get('type')||'observations',road=url.searchParams.get('road')||'all',start=url.searchParams.get('start')||new Date(Date.now()-86400000).toISOString(),end=url.searchParams.get('end')||iso();
  if(!['observations','predictions'].includes(type)||!Number.isFinite(Date.parse(start))||!Number.isFinite(Date.parse(end))||start>end)fail(400,'Invalid export filters.');
  const requested=url.searchParams.get('roads')?.split(',')||cityIds,selected=road==='all'?requested:[road];if(!selected.length||!selected.every(id=>cityIds.includes(id)))fail(400,'Invalid road filter.');
  const field=type==='observations'?'timestamp':'issued_at',rows=(await env.DB.prepare(`SELECT * FROM ${type} WHERE ${field}>=? AND ${field}<=? AND road_segment_id IN (${selected.map(()=>'?').join(',')}) ORDER BY ${field}`).bind(start,end,...selected).all()).results;
  const fields=type==='observations'?['timestamp','road_segment_id','vehicle_count','average_speed_kmh','occupancy_percent','interval_minutes','source']:['road_segment_id','issued_at','horizon','speed','model_version'];
  return new Response(Papa.unparse({fields:[...fields,'city_id','city_name'],data:rows.map((r:any)=>[...fields.map(f=>r[f]),city.id,city.name])},{escapeFormulae:true}),{headers:{'Content-Type':'text/csv','Content-Disposition':`attachment; filename="flowsense-${cityId}-${type}.csv"`,'Cache-Control':'no-store'}});
 }
 fail(404,'Endpoint not found.');
 }catch(e){if(e instanceof ApiError)return json({error:e.message},e.status);console.error('API error',e);return json({error:'The server could not complete this request. Please try again.'},500)}}

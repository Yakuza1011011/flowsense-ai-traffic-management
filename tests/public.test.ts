import {test,before,after} from 'node:test';
import assert from 'node:assert/strict';
import {api,type Env} from '../server/api';
import {database} from '../scripts/sqlite.mjs';
import {defaults} from '../shared/traffic';
const db=database(),origin='https://yakuza1011011.github.io';
const env:Env={DB:db,PUBLIC_ACCESS:'true',PUBLIC_ORIGIN:origin};
function call(path:string,method='GET',body?:unknown,headers:Record<string,string>={}){return api(new Request(`https://flowsense.example/api${path}`,{method,headers:{...headers,...(body?{'Content-Type':'application/json'}:{})},body:body?JSON.stringify(body):undefined}),env)}
const owner={'oai-authenticated-user-id':'owner','oai-authenticated-user-email':'private-owner@example.test'};
before(async()=>{assert.equal((await call('/seed','POST',{},owner)).status,200)});
after(()=>db.close());
test('public visitors load city data without cookies or ChatGPT identity and see no private metadata',async()=>{
 const response=await call('/state?city=mysuru','GET',undefined,{Origin:origin});
 assert.equal(response.status,200);assert.equal(response.headers.get('Access-Control-Allow-Origin'),origin);
 const state=await response.json() as any;assert.equal(state.user.role,'viewer');assert.equal(state.user.anonymous,true);assert.equal(state.city.id,'mysuru');assert.ok(state.observations.length>4000);assert.equal(state.predictions.length,18);
 assert.deepEqual(state.users,[]);assert.deepEqual(state.uploads,[]);assert.deepEqual(state.audit,[]);
 assert.ok(!JSON.stringify(state).includes('private-owner@example.test'));
 assert.equal(db.prepare('SELECT COUNT(*) AS count FROM users').first().count,1);
 assert.equal((await call('/export?city=mysuru','GET',undefined,{Origin:origin})).status,200);
});
test('public visitors cannot mutate management records or impersonate an operator',async()=>{
 for(const [path,method,body] of [['/seed','POST',{}],['/settings','PUT',defaults],['/incidents','POST',{}],['/uploads','POST',{}],['/signals','POST',{}],['/users','PATCH',{}]] as const){
  const response=await call(path,method,body,{Origin:origin,...owner});assert.equal(response.status,403,path);assert.equal(response.headers.get('Access-Control-Allow-Origin'),origin);
 }
 const identity=await (await call('/auth','GET',undefined,{Origin:origin,...owner})).json() as any;assert.equal(identity.user.role,'viewer');
});
test('CORS permits only the configured Pages origin and preserves local authentication',async()=>{
 assert.equal((await call('/state','GET',undefined,{Origin:'https://untrusted.example'})).status,403);
 const preflight=await call('/tick','OPTIONS',undefined,{Origin:origin,'Access-Control-Request-Method':'POST','Access-Control-Request-Headers':'content-type'});
 assert.equal(preflight.status,204);assert.equal(preflight.headers.get('Access-Control-Allow-Origin'),origin);assert.equal(preflight.headers.get('Access-Control-Allow-Credentials'),null);
 assert.equal((await api(new Request('https://flowsense.example/api/state'),{DB:db})).status,401);
 assert.equal((await api(new Request('http://localhost/api/state'),{...env,LOCAL_DEMO:'true',SESSION_SECRET:'test'})).status,401);
});
test('anonymous refresh fills only deterministic demo intervals and is idempotent',async()=>{
 db.prepare("DELETE FROM observations WHERE road_segment_id LIKE 'mysuru-%'").run();
 assert.equal((await call('/tick?city=mysuru','POST',{average_speed_kmh:999,role:'admin'},{Origin:origin})).status,200);
 const state=await (await call('/state?city=mysuru')).json() as any;
 assert.equal(state.observations.length,24);assert.equal(state.predictions.length,18);assert.ok(state.observations.every((o:any)=>o.source==='synthetic'&&o.average_speed_kmh<160));
 const next=await (await call('/tick?city=mysuru','POST',{}, {Origin:origin})).json() as any;assert.equal(next.unchanged,true);
});

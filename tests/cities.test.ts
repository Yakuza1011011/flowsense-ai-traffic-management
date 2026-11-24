import {test,before,after} from 'node:test';
import assert from 'node:assert/strict';
import {api,type Env} from '../server/api';
import {database} from '../scripts/sqlite.mjs';
import {defaults,roads,roadsForCity} from '../shared/traffic';
import {cities,searchCities} from '../shared/cities';
const db=database(),env:Env={DB:db,LOCAL_DEMO:'true',DEMO_PASSWORD:'city-test-password',SESSION_SECRET:'city-test-secret'};
let cookie='';
async function call(path:string,method='GET',body?:any){return api(new Request(`http://localhost/api${path}`,{method,headers:{...(body?{'Content-Type':'application/json'}:{}),Cookie:cookie},body:body?JSON.stringify(body):undefined}),env)}
before(async()=>{const login=await call('/login','POST',{role:'admin',password:'city-test-password'});cookie=login.headers.get('set-cookie')!.split(';')[0];assert.equal((await call('/seed','POST',{})).status,200)});
after(()=>db.close());

test('city search covers eleven cities, aliases, Kannada and no-match queries',async()=>{
 assert.equal(cities.length,11);assert.equal(new Set(roads.map(r=>r.id)).size,72);
 for(const [query,id] of [['  mYsOrE ','mysuru'],['Mangalore','mangaluru'],['hubli dharwad','hubballi-dharwad'],['Dharwad','hubballi-dharwad'],['Belgaum','belagavi'],['Gulbarga','kalaburagi'],['Davangere','davanagere'],['Shimoga','shivamogga'],['Tumkur','tumakuru'],['Bellary','ballari'],['Bijapur','vijayapura'],['ಮೈಸೂರು','mysuru']])assert.equal(searchCities(query)[0]?.id,id);
 assert.deepEqual(searchCities('Atlantis'),[]);assert.equal(searchCities('').length,11);
 const response=await (await call('/cities?search=mysore')).json() as any;assert.equal(response.cities[0].id,'mysuru');assert.equal((await call('/state?city=unknown')).status,400);
});
test('every city has isolated persisted observations, forecasts and model evaluation',async()=>{
 for(const city of cities){
  assert.equal((await call(`/tick?city=${city.id}`,'POST',{})).status,200);
  const state=await (await call(`/state?city=${city.id}`)).json() as any;
  const ids=new Set(roadsForCity(city.id).map(r=>r.id));assert.equal(state.city.id,city.id);assert.equal(state.roads.length,ids.size);
  assert.ok(state.observations.length>ids.size*660);assert.ok(state.observations.every((o:any)=>ids.has(o.road_segment_id)));
  assert.equal(state.predictions.length,ids.size*3);assert.ok(state.predictions.every((p:any)=>ids.has(p.road_segment_id)&&p.model==='Random forest'));
  assert.ok(state.incidents.every((i:any)=>ids.has(i.road_segment_id)));assert.ok(state.alerts.every((a:any)=>ids.has(a.road_segment_id)));assert.equal(state.model.metrics.length,3);assert.ok(state.model.metrics.every((m:any)=>m.test_samples===ids.size*403));
  const csv=await (await call(`/export?city=${city.id}`)).text();assert.ok(csv.includes('city_id,city_name'));assert.ok(csv.includes(city.name));
  if(city.id!=='bengaluru')assert.ok(!csv.includes('mg-road'));
 }
});
test('city-scoped writes reject cross-city incidents, simulations, CSVs and exports',async()=>{
 const road='mysuru-central';
 assert.equal((await call('/incidents?city=mysuru','POST',{road_segment_id:'mg-road',type:'Roadworks',severity:'High',description:'Wrong city must be rejected'})).status,400);
 const result=await (await call('/incidents?city=mysuru','POST',{road_segment_id:road,type:'Roadworks',severity:'Low',description:'Mysuru-only demonstration incident'})).json() as any;
 assert.ok(result.id);assert.equal((await call(`/incidents/${result.id}?city=bengaluru`,'PATCH',{status:'Resolved'})).status,404);
 assert.equal((await call(`/incidents/${result.id}?city=mysuru`,'PATCH',{status:'Resolved'})).status,200);
 assert.equal((await call('/signals?city=mysuru','POST',{road_segment_id:'mg-road',cycle:90,green:40})).status,400);
 assert.equal((await call('/signals?city=mysuru','POST',{road_segment_id:road,cycle:90,green:40})).status,200);
 assert.equal((await call('/export?city=mysuru&road=mg-road')).status,400);
 const csv='timestamp,road_segment_id,vehicle_count,average_speed_kmh,occupancy_percent,interval_minutes\n2026-11-01T00:00:00Z,mysuru-central,90,30,40,15';
 assert.equal((await call('/uploads?city=bengaluru','POST',{filename:'mysuru.csv',csv})).status,400);
 const uploaded=await (await call('/uploads?city=mysuru','POST',{filename:'mysuru.csv',csv})).json() as any;assert.equal(uploaded.added,1);
 const mysuru=await (await call('/state?city=mysuru')).json() as any,bengaluru=await (await call('/state?city=bengaluru')).json() as any;
 assert.ok(mysuru.uploads.some((u:any)=>u.filename==='mysuru.csv'));assert.ok(!bengaluru.uploads.some((u:any)=>u.filename==='mysuru.csv'));
 assert.ok(mysuru.plans.some((p:any)=>p.road_segment_id===road));assert.ok(!bengaluru.plans.some((p:any)=>p.road_segment_id===road));
 assert.ok(mysuru.audit.some((a:any)=>a.action==='incident.created'&&a.city_id==='mysuru'));assert.ok(!bengaluru.audit.some((a:any)=>a.city_id==='mysuru'));
});
test('upgrading an existing Bengaluru workspace preserves records and monitoring choices',async()=>{
 const before=await db.prepare('SELECT COUNT(*) AS count FROM observations').first();
 const legacy={...defaults,monitored:roadsForCity('bengaluru').filter(r=>r.id!=='mg-road').map(r=>r.id)};delete legacy.catalogRoads;
 await db.prepare('UPDATE settings SET value=? WHERE id=1').bind(JSON.stringify(legacy)).run();
 await call('/seed','POST',{});const state=await (await call('/state?city=mysuru')).json() as any;
 assert.ok(!state.settings.monitored.includes('mg-road'));assert.ok(state.settings.monitored.includes('mysuru-central'));assert.equal(state.settings.catalogRoads.length,72);
 assert.equal((await db.prepare('SELECT COUNT(*) AS count FROM observations').first()).count,before.count);
 await call('/settings','PUT',defaults);
});

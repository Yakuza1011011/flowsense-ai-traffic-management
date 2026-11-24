import {mkdirSync,existsSync} from 'node:fs';
import {randomBytes} from 'node:crypto';
import {database} from './sqlite.mjs';
import {api} from '../server/api.ts';
import {cities} from '../shared/cities.ts';
if(existsSync('.env'))process.loadEnvFile('.env');
mkdirSync('.local',{recursive:true});
const db=database('.local/flowsense.sqlite');
const env={DB:db,LOCAL_DEMO:'true',DEMO_PASSWORD:randomBytes(24).toString('hex'),SESSION_SECRET:randomBytes(32).toString('hex')};
try{
 const login=await api(new Request('http://localhost/api/login',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({role:'admin',password:env.DEMO_PASSWORD})}),env);
 const cookie=login.headers.get('set-cookie').split(';')[0];
 for(const endpoint of ['seed',...cities.map(city=>`tick?city=${city.id}`)]){const response=await api(new Request(`http://localhost/api/${endpoint}`,{method:'POST',headers:{'Content-Type':'application/json',Cookie:cookie},body:'{}'}),env);if(!response.ok)throw Error(await response.text())}
 console.log('Local demonstration data seeded; current observations and forecasts saved.');
}finally{db.close()}

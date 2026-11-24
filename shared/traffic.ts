import {cities,getCity} from './cities';
export type Road={id:string;cityId:string;name:string;area:string;limit:number;length:number;points:[number,number][]};
const bengaluruRoads:Omit<Road,'cityId'>[]=[
{id:'mg-road',name:'MG Road',area:'Central',limit:50,length:2.4,points:[[12.9754,77.6001],[12.9759,77.6061],[12.9733,77.6122],[12.9728,77.6207]]},
{id:'cubbon-road',name:'Cubbon Road',area:'Central',limit:50,length:2.1,points:[[12.9800,77.5932],[12.9808,77.6021],[12.9792,77.6092],[12.9788,77.615]]},
{id:'residency-road',name:'Residency Road',area:'Central',limit:40,length:2.6,points:[[12.9673,77.5969],[12.9696,77.6018],[12.9706,77.6093],[12.9728,77.6149]]},
{id:'richmond-road',name:'Richmond Road',area:'Central',limit:40,length:2.9,points:[[12.9634,77.5966],[12.965,77.606],[12.9661,77.616],[12.9669,77.6227]]},
{id:'old-airport',name:'Old Airport Road',area:'East',limit:50,length:4.2,points:[[12.9601,77.639],[12.959,77.648],[12.9585,77.659],[12.957,77.671]]},
{id:'indiranagar',name:'100 Feet Road',area:'East',limit:40,length:3.3,points:[[12.9788,77.6407],[12.973,77.6414],[12.966,77.6416],[12.9593,77.6412]]},
{id:'koramangala',name:'80 Feet Road',area:'South',limit:40,length:2.8,points:[[12.9346,77.6155],[12.9336,77.6218],[12.9319,77.629],[12.931,77.636]]},
{id:'hosur-road',name:'Hosur Road',area:'South',limit:60,length:4.7,points:[[12.960,77.606],[12.950,77.611],[12.940,77.620],[12.929,77.634]]},
{id:'bellary-road',name:'Bellary Road',area:'North',limit:60,length:4.1,points:[[13.019,77.590],[13.010,77.589],[13.001,77.589],[12.991,77.588]]},
{id:'sankey-road',name:'Sankey Road',area:'North',limit:50,length:2.6,points:[[13.008,77.579],[13.000,77.581],[12.992,77.584],[12.986,77.587]]},
{id:'rajajinagar',name:'Chord Road',area:'West',limit:50,length:3.6,points:[[13.001,77.550],[12.991,77.551],[12.979,77.550],[12.969,77.550]]},
{id:'racecourse',name:'Race Course Road',area:'West',limit:40,length:2.0,points:[[12.984,77.571],[12.9845,77.579],[12.9834,77.585],[12.981,77.589]]}
];
// New-city overlays are explicitly schematic demo corridors, not surveyed roads.
const corridorProfiles=[
 {slug:'central',name:'Central corridor',area:'Central',limit:40,length:2.4,offsets:[[0,-.018],[.001,-.006],[0,.006],[.002,.018]]},
 {slug:'north',name:'North connector',area:'North',limit:50,length:3.1,offsets:[[.025,-.012],[.016,-.006],[.006,0],[-.004,.003]]},
 {slug:'east',name:'East corridor',area:'East',limit:50,length:2.8,offsets:[[.015,.01],[.006,.014],[-.004,.018],[-.014,.022]]},
 {slug:'south',name:'South connector',area:'South',limit:40,length:2.2,offsets:[[-.015,-.012],[-.014,0],[-.012,.011],[-.01,.019]]},
 {slug:'west',name:'West corridor',area:'West',limit:50,length:2.9,offsets:[[.018,-.022],[.008,-.018],[-.002,-.021],[-.012,-.018]]},
 {slug:'inner-link',name:'Inner-city link',area:'Central',limit:40,length:2.5,offsets:[[-.018,-.008],[-.006,-.003],[.004,.005],[.016,.011]]}
];
export const roads:Road[]=[...bengaluruRoads.map(road=>({...road,cityId:'bengaluru'})),...cities.slice(1).flatMap(city=>corridorProfiles.map((profile,i)=>{
 const center=city.anchors?.[i<3?0:1]||city.center;
 return {id:`${city.id}-${profile.slug}`,cityId:city.id,name:profile.name,area:profile.area,limit:profile.limit,length:profile.length,points:profile.offsets.map(([lat,lng])=>[+(center[0]+lat).toFixed(5),+(center[1]+lng).toFixed(5)] as [number,number])};
}))];
export const roadsForCity=(cityId:string)=>roads.filter(road=>road.cityId===cityId);
export type Observation={timestamp:string;road_segment_id:string;vehicle_count:number;average_speed_kmh:number;occupancy_percent:number;interval_minutes:number;source:string};
export type Settings={moderate:number;heavy:number;refresh:number;timezone:string;notifications:boolean;monitored:string[];catalogRoads?:string[]};
export const defaults:Settings={moderate:65,heavy:40,refresh:30,timezone:'Asia/Kolkata',notifications:true,monitored:roads.map(r=>r.id),catalogRoads:roads.map(r=>r.id)};
export function upgradeSettings(saved:Settings):Settings{const known=saved.catalogRoads||bengaluruRoads.map(r=>r.id);return {...saved,monitored:[...new Set([...saved.monitored,...roads.filter(r=>!known.includes(r.id)).map(r=>r.id)])],catalogRoads:roads.map(r=>r.id)}}
export function congestion(speed:number,limit:number,s:Settings=defaults){return speed/limit*100<s.heavy?'Heavy':speed/limit*100<s.moderate?'Moderate':'Free-flow';}
export const colors:Record<string,string>={'Free-flow':'#119c83',Moderate:'#e9a83c',Heavy:'#e36b5e'};
export function synthetic(road:Road,t:number):Observation{
 const city=getCity(road.cityId)!,i=roads.findIndex(r=>r.id===road.id),d=new Date(t+330*60000),hour=d.getUTCHours()+d.getUTCMinutes()/60-city.rushOffset;
 const rush=Math.exp(-(((hour-9)/1.8)**2))*.5+Math.exp(-(((hour-18)/2.2)**2))*.72;
 const wave=Math.sin(t/1800000+i*1.7)*.07,load=Math.min(.93,.13+(i%4)*.07+rush*city.trafficScale+wave);
 return {timestamp:new Date(t).toISOString(),road_segment_id:road.id,vehicle_count:Math.round(70+load*280),average_speed_kmh:+Math.max(5,road.limit*(1-load*.85)).toFixed(1),occupancy_percent:+(load*100).toFixed(1),interval_minutes:15,source:'synthetic'};
}
export function features(obs:Observation[],road:Road){const a=obs.at(-1)!;const d=new Date(Date.parse(a.timestamp)+330*60000),h=d.getUTCHours()+d.getUTCMinutes()/60;return [Math.sin(h/24*2*Math.PI),Math.cos(h/24*2*Math.PI),(d.getUTCDay()+6)%7,roads.findIndex(r=>r.id===road.id),a.average_speed_kmh,obs.at(-2)?.average_speed_kmh??a.average_speed_kmh,obs.at(-3)?.average_speed_kmh??a.average_speed_kmh,obs.slice(-4).reduce((s,o)=>s+o.average_speed_kmh,0)/Math.min(4,obs.length),a.vehicle_count,a.occupancy_percent];}
export function simulatePlan(volume:number,green:number,cycle:number){const capacity=1800*green/cycle,arrival=volume*4;const saturation=arrival/capacity;const delay=cycle*(1-green/cycle)**2/(2*Math.max(.15,1-Math.min(.95,saturation)*green/cycle));return {capacity:Math.round(capacity),delay:+delay.toFixed(1),queue:Math.round(arrival*delay/3600+Math.max(0,arrival-capacity)/4),saturation:+saturation.toFixed(2)};}
